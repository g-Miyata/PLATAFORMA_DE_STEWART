#include <Arduino.h>

// ================== PINAGEM (ajuste se precisar) ==================
// ADC1 no S3: GPIO1..GPIO10 (ADC1_CH0..CH9)
const int FB_PINS[6] = {1, 2, 3, 4, 5, 6};  // feedback (0..3.3V)

// Seis saídas PWM em pinos distintos (evite 19/20 - USB)
const int PWM_PINS[6]  = {18, 8, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5}; // canais LEDC dedicados

// IN1/IN2 (direção) — ajuste conforme seu driver
struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {13, 14}, // Pistão 1
  {16, 17}, // Pistão 2
  {35, 36}, // Pistão 3
  {21, 38}, // Pistão 4
  {39, 37}, // Pistão 5
  {41, 42}  // Pistão 6
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

// ===== Filtro passa-baixa (IIR de 1ª ordem) no feedback =====
float fc_hz = 4.0f;                // frequência de corte (Hz) — ajustável via "fc="
bool  fb_init = false;             // inicialização do estado do filtro
float fbV_filt[6]  = {0,0,0,0,0,0};    // tensão filtrada
float fbPct_filt[6]= {0,0,0,0,0,0};    // % filtrado (0..100)

// Tempo
uint32_t last_ms = 0;

// Limites
const float MAX_PWM = 255.0f;      // pode aumentar até 255 se quiser
const float INT_LIM = 400.0f;

// CSV
bool csv_header_done = false;

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
  Serial.println(F("  fc=x.x      -> frequência de corte do filtro LPF (Hz)"));
  Serial.println(F("  h           -> ajuda"));
  Serial.println(F("Status inicial: sel=1, SP=0%, Kp=0.5, Ki=0.0, DB=0.5%, FC=4.0 Hz"));

  // Dica pro Excel: força separador de campo como ';'
  Serial.println(F("sep=;"));
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
        Serial.println(F("sel=1..6 | sp=NN | kp=x | ki=x | db=x | fc=x (Hz)"));
      } else if (cmd.startsWith("sel=") || cmd.startsWith("SEL=")) {
        int v = cmd.substring(4).toInt();
        if (v < 1) v = 1; if (v > 6) v = 6;
        selIdx = v - 1;
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
      } else if (cmd.startsWith("fc=") || cmd.startsWith("FC=")) {
        float v = fabs(cmd.substring(3).toFloat());
        // Limites razoáveis pro filtro
        fc_hz = clampf(v, 0.1f, 50.0f);
        Serial.printf("LPF fc=%.3f Hz\n", fc_hz);
      } else if (cmd.length() > 0) {
        Serial.println(F("Comando invalido. Use sel=, sp=, kp=, ki=, db=, fc= ou h"));
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

  // Medidas (brutas)
  int   fbRaw[6];
  float fbV_raw[6], fbPct_raw[6];
  for (int i = 0; i < 6; i++) {
    fbRaw[i]   = analogRead(FB_PINS[i]);          // 0..4095
    fbV_raw[i] = fbRaw[i] * 3.3f / 4095.0f;       // V
    fbPct_raw[i] = clampf((fbV_raw[i] / 3.3f) * 100.0f, 0.0f, 100.0f);
  }

  // Inicializa estado do filtro na primeira passada para evitar degrau
  if (!fb_init) {
    for (int i = 0; i < 6; i++) {
      fbV_filt[i]   = fbV_raw[i];
      fbPct_filt[i] = fbPct_raw[i];
    }
    fb_init = true;
  }

  // Aplica filtro passa-baixa de 1ª ordem: y += alpha*(x - y)
  // alpha = dt / (RC + dt), RC = 1/(2π fc)
  float RC = 1.0f / (2.0f * 3.14159265f * fc_hz);
  float alpha = dt / (RC + dt);
  // Segurança para dt muito pequeno
  alpha = clampf(alpha, 0.0f, 1.0f);

  for (int i = 0; i < 6; i++) {
    fbV_filt[i]   += alpha * (fbV_raw[i]   - fbV_filt[i]);
    fbPct_filt[i] += alpha * (fbPct_raw[i] - fbPct_filt[i]);
  }

  // Libera todos, exceto o selecionado (garantia)
  freeAllExcept(selIdx);

  // Controle apenas do pistão selecionado (usando feedback FILTRADO)
  {
    int i = selIdx;
    float erro = SP_pct[i] - fbPct_filt[i];

    if (fabs(erro) > deadband_pct) {
      // integra com anti-windup simples
      integ[i] += erro * dt;
      integ[i] = clampf(integ[i], -INT_LIM, INT_LIM);

      float u = Kp[i] * erro + Ki[i] * integ[i];

      if (u > 0) setDirAdvance(i); else setDirReturn(i);

      float pwmf = fabs(u);
      if (pwmf > MAX_PWM) pwmf = MAX_PWM;  // saturação

      uint8_t pwm = (uint8_t)roundf(pwmf);
      ledcWrite(PWM_CHANS[i], pwm);
    } else {
      setDirFree(i);
      ledcWrite(PWM_CHANS[i], 0);
    }
  }

  // ===== Telemetria (100 ms) — CSV amigável p/ Excel =====
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    // Cabeçalho CSV (somente 1x)
    if (!csv_header_done) {
      Serial.print(F("ms;SEL;DB_pct;FC_Hz;"));
      for (int i = 0; i < 6; i++) {
        Serial.printf("P%d_SP;P%d_FB_pct;P%d_V;P%d_PWM%s",
                      i+1, i+1, i+1, i+1, (i==5 ? "\n" : ";"));
      }
      csv_header_done = true;
    }

    // Linha de dados (usa valores FILTRADOS)
    Serial.printf("%lu;%d;%.3f;%.3f;", (unsigned long)now, selIdx+1, deadband_pct, fc_hz);
    for (int i = 0; i < 6; i++) {
      int duty = ledcRead(PWM_CHANS[i]);
      Serial.printf("%.3f;%.3f;%.3f;%d%s",
                    SP_pct[i], fbPct_filt[i], fbV_filt[i], duty, (i==5 ? "\n" : ";"));
    }
  }
}
