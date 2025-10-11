#include <Arduino.h>

// ================== PINAGEM ==================
const int FB_PINS[6] = {1, 2, 3, 4, 5, 6};   // feedback (0..3.3V)
const int PWM_PINS[6]  = {18, 8, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5};

struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {13, 14}, {16, 17}, {35, 36}, {21, 38}, {39, 37}, {41, 42}
};

// ================== PWM (LEDC) ==================
#define PWM_FREQ 20000
#define PWM_RES   8   // 0..255

// ================== CONTROLE (um por vez) ==================
int   selIdx = 0;                  // 0..5 (pistão selecionado)
float SP_pct[6] = {0};             // setpoint por pistão (%)
float Kp[6]     = {2.0,2.0,2.0,2.0,2.0,2.0};
float Ki[6]     = {0,0,0,0,0,0};
float integ[6]  = {0,0,0,0,0,0};
float deadband_pct = 0.0f;

uint32_t last_ms = 0;

// Limites
const float   MAX_PWM = 255.0f;
const uint8_t MIN_PWM = 20;
const float   INT_LIM = 400.0f;

// ===== Filtro passa-baixa (IIR 1ª ordem) =====
float fc_hz = 4.0f;                // ajustável por "fc="
bool  fb_init = false;
float fbV_raw[6], fbPct_raw[6];
float fbV_filt[6]   = {0,0,0,0,0,0};
float fbPct_filt[6] = {0,0,0,0,0,0};

// ===== Modo manual de recuo =====
bool manual_retract = false;       // true => ignora PI e mantém recuo
const uint8_t RETRACT_PWM = 60;    // PWM fixo no recuo

// CSV
bool csv_header_done = false;

// ----- util -----
static inline float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void setDirAdvance(int i){ digitalWrite(pistons[i].in1, HIGH); digitalWrite(pistons[i].in2, LOW ); }
void setDirReturn (int i){ digitalWrite(pistons[i].in1, LOW );  digitalWrite(pistons[i].in2, HIGH); }
void setDirFree   (int i){ digitalWrite(pistons[i].in1, LOW );  digitalWrite(pistons[i].in2, LOW ); }

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

  // Apenas dica para Excel e cabeçalho serão enviados depois no loop
  Serial.println(F("sep=;"));
}

String line;

void loop() {
  // ===== Parser (sem ecos) =====
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String cmd = line; line = ""; cmd.trim();

      if (cmd.startsWith("sel=") || cmd.startsWith("SEL=")) {
        int v = cmd.substring(4).toInt();
        if (v < 1) v = 1; if (v > 6) v = 6;
        selIdx = v - 1;
        freeAllExcept(selIdx);
      } else if (cmd.startsWith("sp=") || cmd.startsWith("SP=")) {
        float v = cmd.substring(3).toFloat();
        v = clampf(v, 0.0f, 100.0f);
        SP_pct[selIdx] = v;
      } else if (cmd.startsWith("kp=") || cmd.startsWith("KP=")) {
        Kp[selIdx] = cmd.substring(3).toFloat();
      } else if (cmd.startsWith("ki=") || cmd.startsWith("KI=")) {
        Ki[selIdx] = cmd.substring(3).toFloat();
      } else if (cmd.startsWith("db=") || cmd.startsWith("DB=")) {
        deadband_pct = fabs(cmd.substring(3).toFloat());
      } else if (cmd.startsWith("fc=") || cmd.startsWith("FC=")) {
        float v = fabs(cmd.substring(3).toFloat());
        fc_hz = clampf(v, 0.1f, 50.0f);
      } else if (cmd.equalsIgnoreCase("R")) {
        manual_retract = true;
        freeAllExcept(selIdx);
      } else if (cmd.equalsIgnoreCase("ok")) {
        manual_retract = false;
        setDirFree(selIdx);
        ledcWrite(PWM_CHANS[selIdx], 0);
      }
      // (qualquer outro comando é ignorado silenciosamente)
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

  // Medidas brutas
  for (int i = 0; i < 6; i++) {
    int fbRaw = analogRead(FB_PINS[i]);          // 0..4095
    fbV_raw[i]   = fbRaw * 3.3f / 4095.0f;
    fbPct_raw[i] = clampf((fbV_raw[i] / 3.3f) * 100.0f, 0.0f, 100.0f);
  }

  // Init filtro 1ª vez
  if (!fb_init) {
    for (int i = 0; i < 6; i++) {
      fbV_filt[i]   = fbV_raw[i];
      fbPct_filt[i] = fbPct_raw[i];
    }
    fb_init = true;
  }

  // LPF: y += alpha*(x - y), alpha = dt/(RC+dt), RC=1/(2πfc)
  float RC = 1.0f / (2.0f * 3.14159265f * fc_hz);
  float alpha = dt / (RC + dt);
  if (alpha < 0.0f) alpha = 0.0f; if (alpha > 1.0f) alpha = 1.0f;

  for (int i = 0; i < 6; i++) {
    fbV_filt[i]   += alpha * (fbV_raw[i]   - fbV_filt[i]);
    fbPct_filt[i] += alpha * (fbPct_raw[i] - fbPct_filt[i]);
  }

  // Garante apenas o selecionado ativo
  freeAllExcept(selIdx);

  // ===== Recuo manual =====
  if (manual_retract) {
    int i = selIdx;
    setDirReturn(i);
    uint8_t pwm = RETRACT_PWM;
    if (pwm < MIN_PWM) pwm = MIN_PWM;
    if (pwm > MAX_PWM) pwm = (uint8_t)MAX_PWM;
    ledcWrite(PWM_CHANS[i], pwm);
  }
  // ===== Controle PI =====
  else {
    int i = selIdx;
    float erro = SP_pct[i] - fbPct_filt[i];

    if (fabs(erro) > deadband_pct) {
      integ[i] += erro * dt;
      integ[i]  = clampf(integ[i], -INT_LIM, INT_LIM);

      float u = Kp[i] * erro + Ki[i] * integ[i];
      if (u > 0) setDirAdvance(i); else setDirReturn(i);

      float pwmf = fabs(u);
      if (pwmf > MAX_PWM) pwmf = MAX_PWM;
      if (pwmf > 0.0f && pwmf < (float)MIN_PWM) pwmf = (float)MIN_PWM;

      uint8_t pwm = (uint8_t)roundf(pwmf);
      ledcWrite(PWM_CHANS[i], pwm);
    } else {
      setDirFree(i);
      ledcWrite(PWM_CHANS[i], 0);
    }
  }

  // ===== Telemetria mínima (100 ms): ms;SP;FB =====
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    if (!csv_header_done) {
      Serial.println(F("ms;SP;FB"));
      csv_header_done = true;
    }

    // Apenas do pistão selecionado (feedback filtrado)
    Serial.printf("%lu;%.3f;%.3f\n",
                  (unsigned long)now,
                  SP_pct[selIdx],
                  fbPct_filt[selIdx]);
  }
}
