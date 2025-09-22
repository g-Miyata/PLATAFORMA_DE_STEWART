#include <Arduino.h>

// ================== PINAGEM (ajuste se precisar) ==================
// ADC1 disponíveis no S3: GPIO1..GPIO10 (ADC1_CH0..CH9)
const int FB_PINS[6] = {1, 2, 3, 4, 5, 6};  // feedback analógico (0..3,3V)

// Seis saídas PWM em pinos distintos (evite 19/20 - USB)
const int PWM_PINS[6]  = {7, 8, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5}; // canais LEDC dedicados

// IN1/IN2 (direção) — ajuste conforme seu driver
struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {13, 14}, // Pistão 1
  {15, 16}, // Pistão 2
  {17, 18}, // Pistão 3
  {21, 38}, // Pistão 4
  {39, 40}, // Pistão 5
  {41, 42}  // Pistão 6
};

// ================== PWM (LEDC) ==================
#define PWM_FREQ 20000
#define PWM_RES   8   // 0..255

// ================== DUTY via SERIAL ==================
volatile uint8_t duty8 = 0; // 0..255 (porcentagem mapeada p/ 8 bits)

// Converte string p/ duty (aceita "42", "42%", "d=42")
bool parseDutyPercent(const String& s, uint8_t& out) {
  String t = s;
  t.trim();
  if (t.length() == 0) return false;
  if (t.startsWith("d=") || t.startsWith("D=")) t.remove(0, 2);
  t.replace("%", "");
  t.trim();
  if (t.length() == 0) return false;
  float p = t.toFloat();
  if (!isfinite(p)) return false;
  if (p < 0)   p = 0;
  if (p > 100) p = 100;
  out = (uint8_t) roundf(p * 255.0f / 100.0f);
  return true;
}

void setAllDirections(bool in1, bool in2) {
  for (int i = 0; i < 6; i++) {
    digitalWrite(pistons[i].in1, in1 ? HIGH : LOW);
    digitalWrite(pistons[i].in2, in2 ? HIGH : LOW);
  }
}

void applyDutyToAll(uint8_t d) {
  for (int i = 0; i < 6; i++) ledcWrite(PWM_CHANS[i], d);
}

// ================== setup/loop ==================
void setup() {
  Serial.begin(115200);
  while (!Serial) { /* USB CDC */ }

  // ADC
  analogReadResolution(12); // 0..4095
  for (int i = 0; i < 6; i++) {
    analogSetPinAttenuation(FB_PINS[i], ADC_11db); // ~0..3,3 V
  }

  // PWM — 6 canais independentes
  for (int i = 0; i < 6; i++) {
    ledcSetup(PWM_CHANS[i], PWM_FREQ, PWM_RES);
    ledcAttachPin(PWM_PINS[i], PWM_CHANS[i]);
  }
  applyDutyToAll(duty8);

  // Direções
  for (int i = 0; i < 6; i++) {
    pinMode(pistons[i].in1, OUTPUT);
    pinMode(pistons[i].in2, OUTPUT);
  }
  setAllDirections(false, false); // solto

  Serial.println(F("\n=== ESP32-S3 | 6 PWMs independentes ==="));
  Serial.println(F("Digite 0..100 (ou 'd=50', '75%') e ENTER para mudar o duty."));
  Serial.println(F("Comandos: f=avanco | t=retorno | b=travado | s=solto | h=ajuda"));
}

String line;

void loop() {
  // ---- Parser serial (linha a linha) ----
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String cmd = line; line = ""; cmd.trim();

      if (cmd.equalsIgnoreCase("h")) {
        Serial.println(F("Duty: 0..100, 'd=NN' ou 'NN%' (ex: 37, 50%, d=75)"));
        Serial.println(F("Direcao: f=avanco, t=retorno, b=travado, s=solto"));
      } else if (cmd.equalsIgnoreCase("f")) {
        setAllDirections(true, false);
        Serial.println(F("Avanco (IN1=1, IN2=0)"));
      } else if (cmd.equalsIgnoreCase("t")) {
        setAllDirections(false, true);
        Serial.println(F("Retorno (IN1=0, IN2=1)"));
      } else if (cmd.equalsIgnoreCase("b")) {
        setAllDirections(true, true);
        Serial.println(F("Travado (IN1=1, IN2=1)"));
      } else if (cmd.equalsIgnoreCase("s")) {
        setAllDirections(false, false);
        Serial.println(F("Solto (IN1=0, IN2=0)"));
      } else {
        uint8_t d;
        if (parseDutyPercent(cmd, d)) {
          duty8 = d;
          applyDutyToAll(duty8);
          float pct = (float)duty8 * 100.0f / 255.0f;
          Serial.print(F("Duty atualizado: "));
          Serial.print(pct, 1);
          Serial.print(F("% ("));
          Serial.print(duty8);
          Serial.println(F("/255)"));
        } else if (cmd.length() > 0) {
          Serial.println(F("Comando invalido. Use 0..100, 'd=NN', ou h/f/t/b/s."));
        }
      }
    } else {
      line += c;
      if (line.length() > 64) line.remove(0, line.length() - 64);
    }
  }

  // ---- Leitura dos 6 feedbacks ----
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    int   fbRaw[6];
    float fbV[6];
    for (int i = 0; i < 6; i++) {
      fbRaw[i] = analogRead(FB_PINS[i]);     // 0..4095
      fbV[i]   = fbRaw[i] * 3.3f / 4095.0f;  // Volts (aprox)
    }

    float pct = (float)duty8 * 100.0f / 255.0f;
    Serial.print(F("Duty: "));
    Serial.print(pct, 1);
    Serial.print(F("%)"));
    for (int i = 0; i < 6; i++) {
      Serial.print(F(" | FB"));
      Serial.print(i + 1);
      Serial.print(F(": "));
      Serial.print(fbRaw[i]);
      Serial.print(F(" ("));
      Serial.print(fbV[i], 2);
      Serial.print(F("V)"));
    }
    Serial.println();
  }
}
