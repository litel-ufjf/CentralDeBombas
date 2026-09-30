// ESP32 DevKit V1 + TB6612FNG — 6 bombas peristálticas com programação de experimentos.
// Mesmo protocolo manual do interface_TB (H, G, X, P, D, E) e, além dele:
//   T,<epoch_ms>                       acerta o relógio com o horário do computador
//   PB,<id>,<n>,<aF>,<p0F>,<aR>,<p0R>  começa a receber um programa de n instruções
//   PI,<id>,<i>,<op>,<salto>,<cmp>,<a>,<b>,<c>  instrução i do programa
//     operandos: número, @F (vazão), @T (tempo em s), @V (volume em mL) ou - (vazio)
//     H/C: cmp é > G(≥) < L(≤); "a" sozinho compara a vazão com a (PROG1), "a,b" compara a com b (PROG2)
//   PS,<id>,<inicio_epoch_ms>          executa (0 = agora) ou agenda para o horário
//   PP,<id>,<1|0>                      pausa (1) ou retoma (0)
//   PX,<id>                            para o programa da bomba
//   XM                                 desliga só as bombas fora de programa
// Respostas novas: T,<epoch_ms> e R,<id>,<estado>,<pc>,<n>,<tempo_s>,<inicio_ms>,<vazao>.
// O programa segue rodando se o computador desconectar; X (parar tudo) interrompe todos.

#include <math.h>
#include "esp_timer.h"
#include "programa.h"

const int PWM_FREQ = 5000;
const int PWM_RES = 12;
const int PWM_MAX = (1 << PWM_RES) - 1;  // 4095
const int MOTOR_COUNT = 6;
const unsigned long CMD_TIMEOUT_MS = 5000;
const unsigned long RUN_REPORT_MS = 500;
const int STEPS_PER_TICK = 64;

// STBY das pontes amarrado em 3,3 V (GPIO 4 é IN2 da M5 e 32 é IN1 da M2).
struct MotorPins {
  int pwm;
  int in1;
  int in2;
};

const MotorPins PINS[MOTOR_COUNT] = {
  {12, 14, 27},  // P01 — M1 (PWM, IN1, IN2)
  {21, 32, 16},  // P02 — M2
  {26, 25, 33},  // P03 — M3
  {13, 22, 23},  // P04 — M4
  {15, 2, 4},    // P05 — M5
  {19, 18, 5},   // P06 — M6
};

struct MotorState {
  bool enabled;
  bool forward;
  float pwmPercent;
};

MotorState motors[MOTOR_COUNT];
unsigned long lastCmdMs = 0;
bool timedOut = false;

// ---------- Relógio ----------

bool clockSynced = false;
int64_t epochOffsetMs = 0;  // epoch_ms - uptime_ms

int64_t uptimeMs() {
  return esp_timer_get_time() / 1000;
}

int64_t nowEpochMs() {
  return epochOffsetMs + uptimeMs();
}

// ---------- Programa ----------

const char STATE_CODE[] = {'E', 'L', 'K', 'W', 'U', 'P', 'D', 'S'};

Program programs[MOTOR_COUNT];
unsigned long lastRunReportMs = 0;

bool ownsMotor(int index) {
  ProgState s = programs[index].state;
  return s == PS_WAITING || s == PS_RUNNING || s == PS_PAUSED;
}

// ---------- Motores ----------

int dutyFromPercent(float percent) {
  if (percent <= 0) {
    return 0;
  }
  if (percent >= 100) {
    return PWM_MAX;
  }
  return (int)lroundf(percent * PWM_MAX / 100.0f);
}

void applyMotor(int index) {
  const MotorPins& pins = PINS[index];
  MotorState& motor = motors[index];
  int duty = (motor.enabled) ? dutyFromPercent(motor.pwmPercent) : 0;

  if (duty <= 0) {
    ledcWrite(pins.pwm, 0);
    digitalWrite(pins.in1, LOW);
    digitalWrite(pins.in2, LOW);
    return;
  }

  if (motor.forward) {
    digitalWrite(pins.in1, HIGH);
    digitalWrite(pins.in2, LOW);
  } else {
    digitalWrite(pins.in1, LOW);
    digitalWrite(pins.in2, HIGH);
  }
  ledcWrite(pins.pwm, duty);
}

void stopMotor(int index) {
  motors[index].enabled = false;
  motors[index].pwmPercent = 0;
  applyMotor(index);
}

void printState() {
  Serial.print('S');
  for (int i = 0; i < MOTOR_COUNT; i++) {
    Serial.print(',');
    Serial.print(i + 1);
    Serial.print(',');
    Serial.print(motors[i].enabled ? 1 : 0);
    Serial.print(',');
    Serial.print(motors[i].forward ? 'F' : 'R');
    Serial.print(',');
    Serial.print(motors[i].pwmPercent, 2);
  }
  Serial.println();
}

void printHello() {
  Serial.println("H,BOMBA,6,12,PROG1,PROG2");
}

void printError(const char* message) {
  Serial.print("ERR,");
  Serial.println(message);
}

void printClock() {
  char line[40];
  snprintf(line, sizeof(line), "T,%lld", clockSynced ? (long long)nowEpochMs() : 0LL);
  Serial.println(line);
}

void printReport(int index) {
  const Program& p = programs[index];
  char line[96];
  snprintf(line, sizeof(line), "R,%d,%c,%d,%d,%.1f,%lld,%.2f", index + 1,
           STATE_CODE[p.state], p.pc, p.count, p.runMs / 1000.0,
           (long long)p.startAtEpochMs, p.flow);
  Serial.println(line);
}

// ---------- Execução ----------

float pwmForFlow(const Program& p, float flow) {
  const Calib& cal = p.forward ? p.forwardCal : p.reverseCal;
  if (flow <= 0 || cal.a <= 0) {
    return 0;
  }
  float pwm = cal.pwm0 + flow / cal.a;
  return pwm > 100 ? 100 : pwm;
}

void applyProgram(int index) {
  Program& p = programs[index];
  float pwm = pwmForFlow(p, p.flow);
  motors[index].forward = p.forward;
  motors[index].pwmPercent = pwm;
  motors[index].enabled = pwm > 0;
  applyMotor(index);
}

void setProgramFlow(int index, float flow) {
  Program& p = programs[index];
  p.flow = flow > 0 ? flow : 0;
  applyProgram(index);
}

float evalOperand(const Program& p, const Operand& operand) {
  switch (operand.ref) {
    case 'F':
      return p.flow;
    case 'T':
      return (float)(p.runMs / 1000.0);
    case 'V':
      return (float)p.volumeMl;
    default:
      return operand.value;
  }
}

// Com um operando só (formato PROG1) compara a vazão atual; com dois, compara a com b.
bool conditionHolds(const Program& p, const Instr& in) {
  bool single = in.arg[1].ref == '-';
  float left = single ? p.flow : evalOperand(p, in.arg[0]);
  float right = evalOperand(p, single ? in.arg[0] : in.arg[1]);
  switch (in.cmp) {
    case 'G': return left >= right;
    case '<': return left < right;
    case 'L': return left <= right;
    default: return left > right;
  }
}

void finishProgram(int index, ProgState state) {
  Program& p = programs[index];
  p.state = state;
  p.flow = 0;
  p.active = false;
  stopMotor(index);
  printReport(index);
  printState();
}

void beginRun(int index) {
  Program& p = programs[index];
  p.state = PS_RUNNING;
  p.pc = 0;
  p.active = false;
  p.runMs = 0;
  p.volumeMl = 0;
  p.flow = 0;
  p.forward = true;
  p.lastTickUs = esp_timer_get_time();
  applyProgram(index);
  printReport(index);
}

// Instruções com duração: na entrada guardam os operandos e o início; devolvem true ao terminar.
bool timedStep(Program& p, int index, const Instr& in) {
  if (!p.active) {
    p.active = true;
    p.instrStartMs = p.runMs;
    for (int k = 0; k < 3; k++) {
      p.p[k] = evalOperand(p, in.arg[k]);
    }
  }
  double elapsedMs = p.runMs - p.instrStartMs;

  switch (in.op) {
    case OP_WAIT:
      if (elapsedMs >= p.p[0] * 1000.0) {
        p.active = false;
        return true;
      }
      return false;

    case OP_RAMP: {
      double durMs = p.p[2] * 1000.0;
      if (durMs <= 0 || elapsedMs >= durMs) {
        setProgramFlow(index, p.p[1]);
        p.active = false;
        return true;
      }
      setProgramFlow(index, p.p[0] + (p.p[1] - p.p[0]) * (float)(elapsedMs / durMs));
      return false;
    }

    case OP_SINE: {
      double durMs = p.p[2] * 1000.0;
      if (durMs <= 0 || elapsedMs >= durMs) {
        setProgramFlow(index, p.p[0]);
        p.active = false;
        return true;
      }
      setProgramFlow(index, p.p[0] + p.p[1] * (float)sin(2.0 * M_PI * elapsedMs / durMs));
      return false;
    }

    case OP_STEP: {
      double durMs = p.p[2] * 1000.0;
      if (durMs <= 0 || elapsedMs >= durMs) {
        setProgramFlow(index, p.p[1]);
        p.active = false;
        return true;
      }
      setProgramFlow(index, elapsedMs < durMs / 2 ? p.p[0] : p.p[1]);
      return false;
    }
  }
  p.active = false;
  return true;
}

void stepProgram(int index) {
  Program& p = programs[index];
  for (int budget = 0; budget < STEPS_PER_TICK; budget++) {
    if (p.pc < 0 || p.pc >= p.count) {
      finishProgram(index, PS_DONE);
      return;
    }
    const Instr& in = p.code[p.pc];
    switch (in.op) {
      case OP_FLOW:
        setProgramFlow(index, evalOperand(p, in.arg[0]));
        p.pc++;
        break;

      case OP_INV:
        p.forward = !p.forward;
        applyProgram(index);
        p.pc++;
        break;

      case OP_WAIT:
      case OP_RAMP:
      case OP_SINE:
      case OP_STEP:
        if (!timedStep(p, index, in)) {
          return;
        }
        p.pc++;
        break;

      case OP_FOR: {
        long times = lroundf(evalOperand(p, in.arg[0]));
        p.remaining[p.pc] = times > 0 ? times : 0;
        p.pc = p.remaining[p.pc] > 0 ? p.pc + 1 : in.jump + 1;
        break;
      }

      case OP_WHILE:
      case OP_IF:
        p.pc = conditionHolds(p, in) ? p.pc + 1 : in.jump + 1;
        break;

      case OP_END: {
        const Instr& open = p.code[in.jump];
        if (open.op == OP_FOR) {
          p.remaining[in.jump]--;
          p.pc = p.remaining[in.jump] > 0 ? in.jump + 1 : p.pc + 1;
        } else if (open.op == OP_WHILE) {
          p.pc = in.jump;
        } else {
          p.pc++;
        }
        break;
      }

      default:
        p.pc++;
        break;
    }
  }
}

void tickProgram(int index) {
  Program& p = programs[index];
  if (p.state == PS_WAITING) {
    if (!clockSynced || nowEpochMs() < p.startAtEpochMs) {
      return;
    }
    beginRun(index);
  }
  if (p.state != PS_RUNNING) {
    return;
  }
  int64_t nowUs = esp_timer_get_time();
  double dtMs = (nowUs - p.lastTickUs) / 1000.0;
  p.lastTickUs = nowUs;
  p.volumeMl += p.flow * dtMs / 60000.0;
  p.runMs += dtMs;
  stepProgram(index);
}

bool anyRunning() {
  for (int i = 0; i < MOTOR_COUNT; i++) {
    if (programs[i].state == PS_RUNNING) {
      return true;
    }
  }
  return false;
}

// ---------- Comandos ----------

bool parseId(const char* token, int& id) {
  if (token == nullptr || *token == 0) {
    return false;
  }
  int value = atoi(token);
  if (value < 1 || value > MOTOR_COUNT) {
    return false;
  }
  id = value;
  return true;
}

bool parseOperand(const char* token, Operand& out) {
  if (token == nullptr) {
    return false;
  }
  out.ref = 0;
  out.value = 0;
  if (token[0] == '-' && token[1] == 0) {
    out.ref = '-';
    return true;
  }
  if (token[0] == '@') {
    if (token[1] != 'F' && token[1] != 'T' && token[1] != 'V') {
      return false;
    }
    out.ref = token[1];
    return true;
  }
  out.value = atof(token);
  return true;
}

int opFromCode(char code) {
  switch (code) {
    case 'F': return OP_FLOW;
    case 'I': return OP_INV;
    case 'W': return OP_WAIT;
    case 'R': return OP_RAMP;
    case 'S': return OP_SINE;
    case 'D': return OP_STEP;
    case 'L': return OP_FOR;
    case 'H': return OP_WHILE;
    case 'C': return OP_IF;
    case 'E': return OP_END;
  }
  return -1;
}

bool programIsValid(const Program& p) {
  if (p.count <= 0 || p.received != p.count) {
    return false;
  }
  for (int i = 0; i < p.count; i++) {
    const Instr& in = p.code[i];
    bool opener = in.op == OP_FOR || in.op == OP_WHILE || in.op == OP_IF;
    if (opener || in.op == OP_END) {
      if (in.jump < 0 || in.jump >= p.count) {
        return false;
      }
      const Instr& pair = p.code[in.jump];
      if (opener && (pair.op != OP_END || pair.jump != i)) {
        return false;
      }
    }
  }
  return true;
}

void handleProgramBegin() {
  int id;
  if (!parseId(strtok(nullptr, ","), id)) {
    printError("id");
    return;
  }
  Program& p = programs[id - 1];
  if (ownsMotor(id - 1)) {
    printError("ocupada");
    return;
  }
  char* countTok = strtok(nullptr, ",");
  int count = countTok ? atoi(countTok) : 0;
  if (count <= 0 || count > MAX_INSTR) {
    printError("tamanho");
    return;
  }
  float values[4];
  for (int k = 0; k < 4; k++) {
    char* tok = strtok(nullptr, ",");
    if (tok == nullptr) {
      printError("calib");
      return;
    }
    values[k] = atof(tok);
  }
  p.state = PS_LOADING;
  p.count = count;
  p.received = 0;
  memset(p.loaded, 0, sizeof(p.loaded));
  p.forwardCal = {values[0], values[1]};
  p.reverseCal = {values[2], values[3]};
  p.pc = 0;
  p.runMs = 0;
  p.flow = 0;
  p.startAtEpochMs = 0;
  printReport(id - 1);
}

void handleProgramInstr() {
  int id;
  if (!parseId(strtok(nullptr, ","), id)) {
    printError("id");
    return;
  }
  Program& p = programs[id - 1];
  if (p.state != PS_LOADING) {
    printError("sem_programa");
    return;
  }
  char* idxTok = strtok(nullptr, ",");
  char* opTok = strtok(nullptr, ",");
  char* jumpTok = strtok(nullptr, ",");
  char* cmpTok = strtok(nullptr, ",");
  if (idxTok == nullptr || opTok == nullptr || jumpTok == nullptr || cmpTok == nullptr) {
    printError("instr");
    return;
  }
  int index = atoi(idxTok);
  int op = opFromCode(opTok[0]);
  if (index < 0 || index >= p.count || op < 0) {
    printError("instr");
    return;
  }
  Instr in;
  in.op = (uint8_t)op;
  in.jump = (int16_t)atoi(jumpTok);
  in.cmp = cmpTok[0];
  for (int k = 0; k < 3; k++) {
    if (!parseOperand(strtok(nullptr, ","), in.arg[k])) {
      printError("operando");
      return;
    }
  }
  p.code[index] = in;
  if (!p.loaded[index]) {
    p.loaded[index] = true;
    p.received++;
  }
  if (p.received == p.count) {
    p.state = PS_READY;
    printReport(id - 1);
  }
}

void handleProgramStart() {
  int id;
  if (!parseId(strtok(nullptr, ","), id)) {
    printError("id");
    return;
  }
  Program& p = programs[id - 1];
  bool hasCode = p.state == PS_READY || p.state == PS_DONE || p.state == PS_STOPPED;
  if (!hasCode || !programIsValid(p)) {
    printError("incompleto");
    return;
  }
  char* startTok = strtok(nullptr, ",");
  long long startAt = startTok ? atoll(startTok) : 0;
  if (startAt > 0 && !clockSynced) {
    printError("relogio");
    return;
  }
  p.startAtEpochMs = startAt;
  if (startAt > 0 && nowEpochMs() < startAt) {
    p.state = PS_WAITING;
    p.pc = 0;
    p.runMs = 0;
    p.flow = 0;
    stopMotor(id - 1);
    printReport(id - 1);
    printState();
    return;
  }
  beginRun(id - 1);
  printState();
}

void handleProgramPause() {
  int id;
  if (!parseId(strtok(nullptr, ","), id)) {
    printError("id");
    return;
  }
  Program& p = programs[id - 1];
  char* tok = strtok(nullptr, ",");
  bool pause = tok == nullptr || atoi(tok) != 0;
  if (pause && p.state == PS_RUNNING) {
    p.state = PS_PAUSED;
    motors[id - 1].enabled = false;
    applyMotor(id - 1);
  } else if (!pause && p.state == PS_PAUSED) {
    p.state = PS_RUNNING;
    p.lastTickUs = esp_timer_get_time();
    applyProgram(id - 1);
  } else {
    printError("estado");
    return;
  }
  printReport(id - 1);
  printState();
}

void handleProgramStop() {
  int id;
  if (!parseId(strtok(nullptr, ","), id)) {
    printError("id");
    return;
  }
  Program& p = programs[id - 1];
  if (p.state == PS_LOADING) {
    p.state = PS_EMPTY;
    printReport(id - 1);
    return;
  }
  if (!ownsMotor(id - 1)) {
    printReport(id - 1);
    return;
  }
  finishProgram(id - 1, PS_STOPPED);
}

void handleClock() {
  char* tok = strtok(nullptr, ",");
  long long epoch = tok ? atoll(tok) : 0;
  if (epoch <= 0) {
    printError("relogio");
    return;
  }
  epochOffsetMs = (int64_t)epoch - uptimeMs();
  clockSynced = true;
  printClock();
}

void stopManual() {
  for (int i = 0; i < MOTOR_COUNT; i++) {
    if (!ownsMotor(i)) {
      stopMotor(i);
    }
  }
}

void stopEverything() {
  for (int i = 0; i < MOTOR_COUNT; i++) {
    if (ownsMotor(i)) {
      programs[i].state = PS_STOPPED;
      programs[i].flow = 0;
      programs[i].active = false;
      printReport(i);
    }
    stopMotor(i);
  }
}

bool manualAllowed(int id) {
  if (ownsMotor(id - 1)) {
    printError("prog");
    return false;
  }
  return true;
}

void handleLine(char* line) {
  lastCmdMs = millis();
  timedOut = false;

  char* command = strtok(line, ",");
  if (command == nullptr || command[0] == 0) {
    return;
  }

  if (strcmp(command, "H") == 0) {
    printHello();
    return;
  }

  if (strcmp(command, "G") == 0) {
    printState();
    for (int i = 0; i < MOTOR_COUNT; i++) {
      if (programs[i].state != PS_EMPTY) {
        printReport(i);
      }
    }
    return;
  }

  if (strcmp(command, "X") == 0) {
    stopEverything();
    printState();
    return;
  }

  if (strcmp(command, "XM") == 0) {
    stopManual();
    printState();
    return;
  }

  if (strcmp(command, "T") == 0) {
    handleClock();
    return;
  }

  if (strcmp(command, "PB") == 0) {
    handleProgramBegin();
    return;
  }

  if (strcmp(command, "PI") == 0) {
    handleProgramInstr();
    return;
  }

  if (strcmp(command, "PS") == 0) {
    handleProgramStart();
    return;
  }

  if (strcmp(command, "PP") == 0) {
    handleProgramPause();
    return;
  }

  if (strcmp(command, "PX") == 0) {
    handleProgramStop();
    return;
  }

  if (strcmp(command, "P") == 0) {
    int id;
    if (!parseId(strtok(nullptr, ","), id)) {
      printError("id");
      return;
    }
    if (!manualAllowed(id)) {
      return;
    }
    char* pctToken = strtok(nullptr, ",");
    if (pctToken == nullptr) {
      printError("pwm");
      return;
    }
    float pct = atof(pctToken);
    if (pct < 0) {
      pct = 0;
    }
    if (pct > 100) {
      pct = 100;
    }
    motors[id - 1].pwmPercent = pct;
    applyMotor(id - 1);
    printState();
    return;
  }

  if (strcmp(command, "D") == 0) {
    int id;
    if (!parseId(strtok(nullptr, ","), id)) {
      printError("id");
      return;
    }
    if (!manualAllowed(id)) {
      return;
    }
    char* dirToken = strtok(nullptr, ",");
    if (dirToken == nullptr || (dirToken[0] != 'F' && dirToken[0] != 'R')) {
      printError("dir");
      return;
    }
    motors[id - 1].forward = dirToken[0] == 'F';
    applyMotor(id - 1);
    printState();
    return;
  }

  if (strcmp(command, "E") == 0) {
    int id;
    if (!parseId(strtok(nullptr, ","), id)) {
      printError("id");
      return;
    }
    if (!manualAllowed(id)) {
      return;
    }
    char* enToken = strtok(nullptr, ",");
    if (enToken == nullptr) {
      printError("en");
      return;
    }
    motors[id - 1].enabled = atoi(enToken) != 0;
    applyMotor(id - 1);
    printState();
    return;
  }

  printError("cmd");
}

void setup() {
  Serial.setRxBufferSize(2048);
  Serial.begin(115200);
  unsigned long started = millis();
  while (!Serial && (millis() - started) < 2000) {
    delay(10);
  }
  delay(200);

  for (int i = 0; i < MOTOR_COUNT; i++) {
    pinMode(PINS[i].in1, OUTPUT);
    pinMode(PINS[i].in2, OUTPUT);
    digitalWrite(PINS[i].in1, LOW);
    digitalWrite(PINS[i].in2, LOW);
    ledcAttach(PINS[i].pwm, PWM_FREQ, PWM_RES);
    ledcWrite(PINS[i].pwm, 0);
    motors[i].enabled = false;
    motors[i].forward = true;
    motors[i].pwmPercent = 0;
    programs[i].state = PS_EMPTY;
    programs[i].count = 0;
  }

  lastCmdMs = millis();
  printHello();
}

void loop() {
  static char buffer[128];
  static size_t length = 0;

  while (Serial.available() > 0) {
    char incoming = (char)Serial.read();
    if (incoming == '\r') {
      continue;
    }
    if (incoming == '\n') {
      buffer[length] = 0;
      if (length > 0) {
        handleLine(buffer);
      }
      length = 0;
      continue;
    }
    if (length + 1 < sizeof(buffer)) {
      buffer[length++] = incoming;
    } else {
      length = 0;
      printError("len");
    }
  }

  for (int i = 0; i < MOTOR_COUNT; i++) {
    tickProgram(i);
  }

  if (anyRunning() && millis() - lastRunReportMs >= RUN_REPORT_MS) {
    lastRunReportMs = millis();
    printState();
  }

  if (!timedOut && (millis() - lastCmdMs) > CMD_TIMEOUT_MS) {
    timedOut = true;
    stopManual();
    printState();
  }
}
