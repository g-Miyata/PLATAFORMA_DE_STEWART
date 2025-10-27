#include <Arduino.h>

// ================== PINAGEM (ajuste se precisar) ==================
// ADC1 no S3: GPIO1..GPIO10 (ADC1_CH0..CH9)
const int FB_PINS[6] = {1, 2, 3, 4, 5, 6};  // feedback analógico (0..3,3V)

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

// ================== CONTROLE ==================
float SP_pct = 0.0f;            // setpoint em %
float Kp = 1.0f;                // ganho proporcional (ajuste)
float Ki = 0.0f;                // ganho integral (ajuste)
float deadband_pct = 0.0f;      // banda morta em % (solta ao redor do SP)
float integ[6] = {0,0,0,0,0,0}; // acumulador integral por pistão
uint32_t last_ms = 0;

// Limites
const float MAX_PWM = 255.0f;
const float INT_LIM = 400.0f;   // anti-windup p/ integral

// CSV
bool csv_header_done = false;

// Utilidades
static inline float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void setDirAdvance(int i) { digitalWrite(pistons[i].in1, HIGH); digitalWrite(pistons[i].in2, LOW);  }
void setDirReturn (int i) { digitalWrite(pistons[i].in1, LOW ); digitalWrite(pistons[i].in2, HIGH); }
void setDirFree   (int i) { digitalWrite(pistons[i].in1, LOW ); digitalWrite(pistons[i].in2, LOW ); }

void setup() {
  Serial.begin(115200);
  while (!Serial) {}

  // ADC
  analogReadResolution(12); // 0..4095
  for (int i = 0; i < 6; i++) analogSetPinAttenuation(FB_PINS[i], ADC_11db);

  // PWM — 6 canais independentes
  for (int i = 0; i < 6; i++) {
    ledcSetup(PWM_CHANS[i], PWM_FREQ, PWM_RES);
    ledcAttachPin(PWM_PINS[i], PWM_CHANS[i]);
    ledcWrite(PWM_CHANS[i], 0);
  }

  // Direções
  for (int i = 0; i < 6; i++) {
    pinMode(pistons[i].in1, OUTPUT);
    pinMode(pistons[i].in2, OUTPUT);
    setDirFree(i);
  }

  last_ms = millis();

  Serial.println(F("\n=== ESP32-S3 | 6 PWMs independentes | Controle PI ==="));
  Serial.println(F("Comandos:"));
  Serial.println(F("  sp=NN       -> setpoint em % (0..100)"));
  Serial.println(F("  kp=x.x      -> ganho proporcional"));
  Serial.println(F("  ki=x.x      -> ganho integral (por segundo)"));
  Serial.println(F("  db=x.x      -> deadband em %"));
  Serial.println(F("  h           -> ajuda"));

  // Dica pro Excel: usa ; como separador de campos
  Serial.println(F("sep=;"));
}

String line;

void loop() {
  // ====== Parser de comandos ======
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String cmd = line; line = ""; cmd.trim();

      if (cmd.equalsIgnoreCase("h")) {
        Serial.println(F("sp=NN, kp=x.x, ki=x.x, db=x.x"));
      } else if (cmd.startsWith("sp=") || cmd.startsWith("SP=")) {
        float v = cmd.substring(3).toFloat();
        SP_pct = clampf(v, 0.0f, 100.0f);
        Serial.printf("SP=%.2f%%\n", SP_pct);
      } else if (cmd.startsWith("kp=") || cmd.startsWith("KP=")) {
        Kp = cmd.substring(3).toFloat();
        Serial.printf("Kp=%.4f\n", Kp);
      } else if (cmd.startsWith("ki=") || cmd.startsWith("KI=")) {
        Ki = cmd.substring(3).toFloat();
        Serial.printf("Ki=%.4f (1/s)\n", Ki);
      } else if (cmd.startsWith("db=") || cmd.startsWith("DB=")) {
        deadband_pct = fabs(cmd.substring(3).toFloat());
        Serial.printf("deadband=%.3f%%\n", deadband_pct);
      } else if (cmd.length() > 0) {
        Serial.println(F("Comando invalido. Use sp=, kp=, ki=, db= ou h"));
      }
    } else {
      line += c;
      if (line.length() > 64) line.remove(0, line.length() - 64);
    }
  }

  // ====== Controle em tempo discreto ======
  uint32_t now = millis();
  float dt = (now - last_ms) / 1000.0f; // segundos
  if (dt <= 0) dt = 1e-3f;
  last_ms = now;

  // Medidas
  int   fbRaw[6];
  float fbV[6], fbPct[6];

  for (int i = 0; i < 6; i++) {
    fbRaw[i] = analogRead(FB_PINS[i]);          // 0..4095
    fbV[i]   = fbRaw[i] * 3.3f / 4095.0f;       // Volts
    fbPct[i] = clampf((fbV[i] / 3.3f) * 100.0f, 0.0f, 100.0f);
  }

  // Controle por pistão
  for (int i = 0; i < 6; i++) {
    float erro = SP_pct - fbPct[i];

    // Deadband -> solta e zera PWM
    if (fabs(erro) <= deadband_pct) {
      setDirFree(i);
      ledcWrite(PWM_CHANS[i], 0);
      continue;
    }

    // Integração com anti-windup
    integ[i] += erro * dt;
    integ[i] = clampf(integ[i], -INT_LIM, INT_LIM);

    // Ação de controle (PI)
    float u = Kp * erro + Ki * integ[i];

    // Direção e módulo
    if (u > 0) {
      setDirAdvance(i);
    } else {
      setDirReturn(i);
    }

    float pwmf = fabs(u);

    // Saturação de velocidade máxima
    if (pwmf > MAX_PWM) pwmf = MAX_PWM;

    uint8_t pwm = (uint8_t) roundf(pwmf);
    ledcWrite(PWM_CHANS[i], pwm);
  }

  // ====== Telemetria (100 ms) ======
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    // Cabeçalho CSV (somente 1x)
    if (!csv_header_done) {
      Serial.print(F("ms;SP_pct;"));
      for (int i = 0; i < 6; i++) {
        Serial.printf("FB%d_pct;FB%d_V;PWM%d%s",
                      i+1, i+1, i+1, (i==5 ? "\n" : ";"));
      }
      csv_header_done = true;
    }

    // Linha de dados
    Serial.printf("%lu;%.3f;", (unsigned long)now, SP_pct);
    for (int i = 0; i < 6; i++) {
      int duty = ledcRead(PWM_CHANS[i]);
      Serial.printf("%.3f;%.3f;%d%s",
                    fbPct[i], fbV[i], duty, (i==5 ? "\n" : ";"));
    }
  }
}
