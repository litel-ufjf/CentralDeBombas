#pragma once

#include <stdint.h>

const int MAX_INSTR = 128;

enum Op : uint8_t {
  OP_FLOW,   // F: define vazão a (mL/min)
  OP_INV,    // I: inverte o sentido
  OP_WAIT,   // W: espera a segundos
  OP_RAMP,   // R: rampa de a até b em c segundos
  OP_SINE,   // S: a ± b por um período de c segundos
  OP_STEP,   // D: a na primeira metade de c segundos, b na segunda
  OP_FOR,    // L: repete a vezes até o END em salto
  OP_WHILE,  // H: enquanto a (cmp) b, ou vazão (cmp) a se b estiver vazio
  OP_IF,     // C: se a (cmp) b, ou vazão (cmp) a se b estiver vazio
  OP_END,    // E: fecha o bloco aberto em salto
};

enum ProgState : uint8_t {
  PS_EMPTY,
  PS_LOADING,
  PS_READY,
  PS_WAITING,
  PS_RUNNING,
  PS_PAUSED,
  PS_DONE,
  PS_STOPPED,
};

struct Operand {
  char ref;  // 0 = número; 'F' vazão, 'T' tempo, 'V' volume; '-' vazio
  float value;
};

struct Instr {
  uint8_t op;
  char cmp;  // '>', 'G' (≥), '<' ou 'L' (≤)
  int16_t jump;
  Operand arg[3];
};

struct Calib {
  float a;
  float pwm0;
};

struct Program {
  ProgState state;
  int count;
  int received;
  bool loaded[MAX_INSTR];
  Instr code[MAX_INSTR];
  int32_t remaining[MAX_INSTR];
  Calib forwardCal;
  Calib reverseCal;
  int pc;
  bool active;
  double instrStartMs;
  float p[3];
  double runMs;
  double volumeMl;
  float flow;
  bool forward;
  int64_t startAtEpochMs;
  int64_t lastTickUs;
};
