#include <Arduino.h>

// ================== PINAGEM (ajuste se precisar) ==================
// ADC1 no S3: GPIO1..GPIO10 (ADC1_CH0..CH9)
const int FB_PINS[6] = {1, 2, 3, 4, 5, 6};  // feedback (0..3.3V)

// Seis PWMs em pinos distintos (evite 19/20 - USB)
const int PWM_PINS[6]  = {7, 8, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5}; // LEDC canais distintos

// IN1/IN2 (direção) — ajuste conforme seu driver
struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {13, 14}, // P1
  {15, 16}, // P2
  {17, 18}, // P3
  {21, 38}, // P4
  {39, 40}, // P5
  {41, 42}  // P6
};

// ================== PWM (LEDC) ==================
#define PWM_FREQ 20000
#define PWM_RES   8   // 0..255

// ================== CONTROLE (um por vez) ==================
int   selIdx = 0;                  // pistão selecionado: 0..5 (1..6 na interface)
float SP_pct[6] = {0};             // setpoint por pistão (%)
float Kp[6]     = {0.5,0.5,0.5,0.5,0.5,0.5};
float Ki[6]     = {0.0,0.0,0.0,0.0,0.0,0.0};
float integ[6]  = {0,0,0,0,0,0};
float deadband_pct = 0.5f;         // comum

uint32_t last_ms = 0;

// Limites
const float MAX_PWM = 255.0f;
const float INT_LIM = 400.0f;

// Utilidades
static inline float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void setDirAdvance(int i){ digitalWrite(pistons[i].in1, HIGH); digitalWrite(pistons[i].in2, LOW ); }
void setDirReturn (int i){ digitalWrite(pistons[i].in1, LOW ); digitalWrite(pistons[i].in2, HIGH); }
void setDirFree   (int i){ digitalWrite(pistons[i].in1, LOW ); digitalWrite(pistons[i].in2, LOW ); }

void freeAllExcept(int keep){
  for(int i=0;i<6;i++){
    if(i==keep) continue;
    setDirFree(i);
    ledcWrite(PWM_CHANS[i], 0);
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) {}

  // ADC
  analogReadResolution(12);
  for (int i = 0; i < 6; i++) analogSetPinAttenuation(FB_PINS[i], ADC_11db);

  // PWM
  for (int i = 0; i < 6; i++) {
    ledcSetup(PWM_CHANS[i], PWM_FREQ, PWM_RES);
    ledcAttachPin(PWM_PINS[i], PWM_CHANS[i]);
    ledcWrite(PWM_CHANS[i], 0);
  }

  // Direção
  for (int i = 0; i < 6; i++) {
    pinMode(pistons[i].in1, OUTPUT);
    pinMode(pistons[i].in2, OUTPUT);
    setDirFree(i);
  }

  last_ms = millis();

  Serial.println(F("\n=== ESP32-S3 | Controle PI — 1 pistão por vez ==="));
  Serial.println(F("Comandos:"));
  Serial.println(F("  sel=N       -> seleciona pistão 1..6"));
  Serial.println(F("  sp=NN       -> setpoint (%) do pistão selecionado"));
  Serial.println(F("  kp=x.x      -> Kp do pistão selecionado"));
  Serial.println(F("  ki=x.x      -> Ki do pistão selecionado (1/s)"));
  Serial.println(F("  db=x.x      -> deadband (%) (global)"));
  Serial.println(F("  h           -> ajuda"));
  Serial.println(F("Status inicial: sel=1, SP=0%, Kp=0.5, Ki=0.0, DB=0.5%"));
}

String line;

void loop() {
  // ===== Parser =====
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String cmd = line; line = ""; cmd.trim();

      if (cmd.equalsIgnoreCase("h")) {
        Serial.println(F("sel=1..6 | sp=NN | kp=x | ki=x | db=x (deadband global)"));
      } else if (cmd.startsWith("sel=") || cmd.startsWith("SEL=")) {
        int v = cmd.substring(4).toInt();
        if (v < 1) v = 1; if (v > 6) v = 6;
        selIdx = v - 1;
        // solta todos os outros
        freeAllExcept(selIdx);
        Serial.printf("Selecionado: P%d\n", v);
      } else if (cmd.startsWith("sp=") || cmd.startsWith("SP=")) {
        float v = cmd.substring(3).toFloat();
        v = clampf(v, 0.0f, 100.0f);
        SP_pct[selIdx] = v;
        Serial.printf("P%d SP=%.2f%%\n", selIdx+1, SP_pct[selIdx]);
      } else if (cmd.startsWith("kp=") || cmd.startsWith("KP=")) {
        float v = cmd.substring(3).toFloat();
        Kp[selIdx] = v;
        Serial.printf("P%d Kp=%.4f\n", selIdx+1, Kp[selIdx]);
      } else if (cmd.startsWith("ki=") || cmd.startsWith("KI=")) {
        float v = cmd.substring(3).toFloat();
        Ki[selIdx] = v;
        Serial.printf("P%d Ki=%.4f\n", selIdx+1, Ki[selIdx]);
      } else if (cmd.startsWith("db=") || cmd.startsWith("DB=")) {
        float v = fabs(cmd.substring(3).toFloat());
        deadband_pct = v;
        Serial.printf("deadband=%.3f%%\n", deadband_pct);
      } else if (cmd.length() > 0) {
        Serial.println(F("Comando invalido. Use sel=, sp=, kp=, ki=, db= ou h"));
      }
    } else {
      line += c;
      if (line.length() > 64) line.remove(0, line.length() - 64);
    }
  }

  // ===== Laço de controle =====
  uint32_t now = millis();
  float dt = (now - last_ms) / 1000.0f;
  if (dt <= 0) dt = 1e-3f;
  last_ms = now;

  // Medidas
  int   fbRaw[6];
  float fbV[6], fbPct[6];
  for (int i = 0; i < 6; i++) {
    fbRaw[i] = analogRead(FB_PINS[i]);          // 0..4095
    fbV[i]   = fbRaw[i] * 3.3f / 4095.0f;       // V
    fbPct[i] = clampf((fbV[i] / 3.3f) * 100.0f, 0.0f, 100.0f);
  }

  // Libera todos, exceto o selecionado (garantia)
  freeAllExcept(selIdx);

  // Controle apenas do pistão selecionado
  {
    int i = selIdx;
    float erro = SP_pct[i] - fbPct[i];

    if (fabs(erro) > deadband_pct) {
      // integra com anti-windup simples
      integ[i] += erro * dt;
      integ[i] = clampf(integ[i], -INT_LIM, INT_LIM);

      float u = Kp[i] * erro + Ki[i] * integ[i];

      if (u > 0) setDirAdvance(i); else setDirReturn(i);

      float pwmf = fabs(u);
      if (pwmf > MAX_PWM) pwmf = MAX_PWM;  // saturação 0..255

      uint8_t pwm = (uint8_t)roundf(pwmf);
      ledcWrite(PWM_CHANS[i], pwm);
    } else {
      setDirFree(i);
      ledcWrite(PWM_CHANS[i], 0);
    }
  }

  // Telemetria (100 ms)
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();
    Serial.printf("SEL=P%d | DB=%.2f%% | ", selIdx+1, deadband_pct);
    for (int i = 0; i < 6; i++) {
      int duty = ledcRead(PWM_CHANS[i]);
      Serial.printf("P%d SP=%.1f%% FB=%.1f%% PWM=%d%s  ",
        i+1, SP_pct[i], fbPct[i], duty, (i==selIdx?"*":""));
    }
    Serial.println();
  }
}
