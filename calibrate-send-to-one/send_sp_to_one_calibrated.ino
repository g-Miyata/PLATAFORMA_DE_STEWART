#include <Arduino.h>

// ================== PINAGEM ==================
const int FB_PINS[6] = {1, 2, 3, 4, 5, 6};      // feedback (0..3.3V)
const int PWM_PINS[6]  = {18, 8, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5};

struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {13, 14}, {16, 17}, {35, 36}, {21, 38}, {39, 37}, {41, 42}
};

// ================== PWM (LEDC) ==================
#define PWM_FREQ 20000
#define PWM_RES   8                   // 0..255
const float   MAX_PWM = 255.0f;
uint8_t MIN_PWM = 0;                  // deixe 0 p/ identificação; depois pode usar 20

// ================== CONTROLE EM mm ==================
int   selIdx = 0;                     // 0..5 (pistão selecionado)
float Lmm[6]   = {100,100,100,100,100,100};  // curso útil (mm) por pistão
float SP_mm[6] = {0,0,0,0,0,0};               // setpoint em mm
float Kp_mm[6] = {0.03,0.03,0.03,0.03,0.03,0.03}; // ponto de partida (p/ L=100mm)
float Ki_mm[6] = {0,0,0,0,0,0};
float integ[6] = {0,0,0,0,0,0};
float deadband_mm = 0.5f;             // histerese em mm (ajuste pelo comando dbmm=)

// ================== CALIBRAÇÃO (V0 / V100) ==================
float V0[6] = {0,0,0,0,0,0};          // tensão no 0% (offset)
float V100[6] = {3.3,3.3,3.3,3.3,3.3,3.3}; // tensão no 100% (span topo)
bool  hasCal[6] = {false,false,false,false,false,false};

// ===== Filtro passa-baixa (IIR 1ª ordem) =====
float fc_hz = 4.0f;                   // ajustável por "fc="
bool  fb_init = false;
float fbV_raw[6];
float fbV_filt[6]   = {0,0,0,0,0,0};

// ===== Modo manual =====
bool manual_retract = false;
bool manual_advance = false;
const uint8_t RETRACT_PWM = 60;       // PWM fixos p/ modos manuais
const uint8_t ADV_PWM     = 70;

// ===== CSV =====
bool csv_header_done = false;
float last_pwm_cmd[6] = {0,0,0,0,0,0};

uint32_t last_ms = 0;

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

float readMedianV(int pin, int N=31){
  N = constrain(N, 5, 63);
  float buf[64];
  for(int i=0;i<N;i++){
    int a = analogRead(pin);           // 0..4095
    buf[i] = a * 3.3f / 4095.0f;
    delayMicroseconds(500);
  }
  // ordenação simples (N pequeno)
  for(int i=0;i<N;i++) for(int j=i+1;j<N;j++) if(buf[j]<buf[i]){ float t=buf[i]; buf[i]=buf[j]; buf[j]=t; }
  return buf[N/2];
}

// Converte V (filtrado) -> posição em mm usando calibração
float voltsToMM(int i, float V){
  if (!hasCal[i]) {
    // fallback bruto (linear 0..3.3V) — melhor calibrar!
    float pct = clampf((V/3.3f)*100.0f, 0.0f, 100.0f);
    return (Lmm[i]/100.0f)*pct;
  }
  float span = V100[i] - V0[i];
  if (span < 1e-3f) span = 3.3f; // evita div/0
  float pct = (V - V0[i]) / span * 100.0f;
  pct = clampf(pct, 0.0f, 100.0f);
  return (Lmm[i]/100.0f) * pct;
}

String line;

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

  Serial.println(F("sep=;")); // dica p/ Excel
}

void loop() {
  // ===== Parser =====
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      String cmd = line; line = ""; cmd.trim();

      if (cmd.startsWith("sel=")) {
        int v = cmd.substring(4).toInt();
        if (v < 1) v = 1; if (v > 6) v = 6;
        selIdx = v - 1;
        freeAllExcept(selIdx);

      } else if (cmd.startsWith("spmm=")) {
        float v = cmd.substring(5).toFloat();
        v = clampf(v, 0.0f, Lmm[selIdx]);
        SP_mm[selIdx] = v;

      } else if (cmd.startsWith("kpmm=")) {
        Kp_mm[selIdx] = cmd.substring(5).toFloat();

      } else if (cmd.startsWith("kimm=")) {
        Ki_mm[selIdx] = cmd.substring(5).toFloat();

      } else if (cmd.startsWith("dbmm=")) {
        deadband_mm = fabs(cmd.substring(5).toFloat());

      } else if (cmd.startsWith("lmm=")) {
        float v = fabs(cmd.substring(4).toFloat());
        if (v > 1e-3f) Lmm[selIdx] = v;

      } else if (cmd.startsWith("fc=")) {
        float v = fabs(cmd.substring(3).toFloat());
        fc_hz = clampf(v, 0.1f, 50.0f);

      } else if (cmd.startsWith("minpwm=")) {
        int v = cmd.substring(7).toInt();
        MIN_PWM = (uint8_t)constrain(v, 0, 255);

      } else if (cmd.equalsIgnoreCase("zero")) {
        float v = readMedianV(FB_PINS[selIdx], 31);
        V0[selIdx] = v; hasCal[selIdx] = true;
        Serial.printf("OK ZERO[%d]=%.4f V\n", selIdx+1, v);

      } else if (cmd.startsWith("cal=")) {
        // cal=V0,V100  (ex.: cal=0.205,2.985)
        int comma = cmd.indexOf(',');
        if (comma > 0) {
          float v0   = cmd.substring(4, comma).toFloat();
          float v100 = cmd.substring(comma+1).toFloat();
          if (v100 > v0 + 0.02f) {
            V0[selIdx] = v0; V100[selIdx] = v100; hasCal[selIdx] = true;
            Serial.printf("OK CAL[%d]=V0=%.4f V, V100=%.4f V\n", selIdx+1, v0, v100);
          } else {
            Serial.println("ERR CAL span pequeno");
          }
        }

      } else if (cmd.equalsIgnoreCase("mark100")) {
        float v = readMedianV(FB_PINS[selIdx], 31);
        V100[selIdx] = v; hasCal[selIdx] = true;
        Serial.printf("OK V100[%d]=%.4f V\n", selIdx+1, v);

      } else if (cmd.equalsIgnoreCase("v?")) {
        float v = readMedianV(FB_PINS[selIdx], 31);
        float ymm = voltsToMM(selIdx, v);
        Serial.printf("V[%d]=%.4f V | Y=%.3f mm\n", selIdx+1, v, ymm);

      } else if (cmd.equalsIgnoreCase("R")) {
        manual_retract = true; manual_advance = false;
        freeAllExcept(selIdx);

      } else if (cmd.equalsIgnoreCase("A")) {
        manual_advance = true; manual_retract = false;
        freeAllExcept(selIdx);

      } else if (cmd.equalsIgnoreCase("ok")) {
        manual_retract = false; manual_advance = false;
        setDirFree(selIdx); ledcWrite(PWM_CHANS[selIdx], 0);
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

  // Medidas brutas
  for (int i = 0; i < 6; i++) {
    int fbRaw = analogRead(FB_PINS[i]);          // 0..4095
    fbV_raw[i]   = fbRaw * 3.3f / 4095.0f;
  }

  // Init filtro 1ª vez
  if (!fb_init) {
    for (int i = 0; i < 6; i++) fbV_filt[i] = fbV_raw[i];
    fb_init = true;
  }

  // LPF: y += alpha*(x - y), alpha = dt/(RC+dt), RC=1/(2πfc)
  float RC = 1.0f / (2.0f * 3.14159265f * fc_hz);
  float alpha = dt / (RC + dt);
  alpha = clampf(alpha, 0.0f, 1.0f);

  for (int i = 0; i < 6; i++) fbV_filt[i] += alpha * (fbV_raw[i] - fbV_filt[i]);

  // Garante apenas o selecionado ativo
  freeAllExcept(selIdx);

  // ===== Ação de saída (manual/controle) =====
  int i = selIdx;

  if (manual_retract) {
    setDirReturn(i);
    uint8_t pwm = constrain(RETRACT_PWM, 0, (int)MAX_PWM);
    ledcWrite(PWM_CHANS[i], pwm);
    last_pwm_cmd[i] = pwm;

  } else if (manual_advance) {
    setDirAdvance(i);
    uint8_t pwm = constrain(ADV_PWM, 0, (int)MAX_PWM);
    ledcWrite(PWM_CHANS[i], pwm);
    last_pwm_cmd[i] = pwm;

  } else {
    // Controle PI em mm
    float y_mm = voltsToMM(i, fbV_filt[i]);
    float e_mm = SP_mm[i] - y_mm;

    if (fabs(e_mm) > deadband_mm) {
      integ[i] += e_mm * dt;

      float u = Kp_mm[i]*e_mm + Ki_mm[i]*integ[i];  // sinal
      if (u > 0) setDirAdvance(i); else setDirReturn(i);

      float pwmf = fabs(u);
      if (pwmf > MAX_PWM) pwmf = MAX_PWM;
      if (pwmf > 0.0f && pwmf < (float)MIN_PWM) pwmf = (float)MIN_PWM;

      uint8_t pwm = (uint8_t)roundf(pwmf);
      ledcWrite(PWM_CHANS[i], pwm);
      last_pwm_cmd[i] = pwm;

    } else {
      setDirFree(i);
      ledcWrite(PWM_CHANS[i], 0);
      last_pwm_cmd[i] = 0;
    }
  }

  // ===== Telemetria (100 ms): ms;SP_mm;Y_mm;PWM =====
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    if (!csv_header_done) {
      Serial.println(F("ms;SP_mm;Y_mm;PWM"));
      csv_header_done = true;
    }

    float y_mm_out = voltsToMM(selIdx, fbV_filt[selIdx]);
    Serial.printf("%lu;%.3f;%.3f;%.0f\n",
                  (unsigned long)now,
                  SP_mm[selIdx],
                  y_mm_out,
                  last_pwm_cmd[selIdx]);
  }
}
