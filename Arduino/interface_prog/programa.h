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
  OP_ELSE,   // N: senão de um C; salto aponta para o E do bloco
  // Condição composta (pós-fixa), logo antes de um H/C com cmp '?'; no fluxo normal não fazem nada.
  OP_TEST,   // Q: empilha a (cmp) b
  OP_AND,    // &: e
  OP_OR,     // |: ou
  OP_XOR,    // ^: ou exclusivo
  OP_NOT,    // ~: não
};

const int MAX_COND_STACK = 8;

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
  char ref;  // 0 = número; 'F' vazão, 'T' tempo, 'V' volume, 'D' sentido (1 direto, 0 reverso); '-' vazio
  float value;
};

struct Instr {
  uint8_t op;
  char cmp;  // '>', 'G' (≥), '<', 'L' (≤), '=', '!' (≠) ou '?' (condição composta: a = nº de instruções antes)
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
