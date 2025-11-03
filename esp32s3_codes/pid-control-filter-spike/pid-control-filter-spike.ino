#include <Arduino.h>

// ================== PINAGEM ==================
const int FB_PINS[6]   = {1, 2, 3, 4, 5, 6};   // feedback (0..3.3V)
const int PWM_PINS[6]  = {8, 18, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5};

struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {16, 17}, {13, 14}, {35, 36}, {21, 38}, {39, 37}, {41, 42}
};

// ================== PWM (LEDC) ==================
#define PWM_FREQ 20000
#define PWM_RES  8                    // 0..255
const float MAX_PWM = 255.0f;
uint8_t MIN_PWM = 0;                  // deixe 0 p/ identificação; depois pode usar 20

// ================== CONTROLE EM mm (por pistão) ==================
float Lmm[6]       = {250,250,250,250,250,250};  // curso útil (mm)
float SP_mm[6]     = {10,10,10,10,10,10};        // setpoint em mm
float Kp_mm[6] = {5.1478, 5.0000, 5.2552, 5.0969, 5.4362, 5.1724};
float Ki_mm[6] = {0.8226, 0.4000, 0.6391, 1.5752, 1.3039, 0.8593};
float Kd_mm[6]     = {0,0,0,0,0,0};              // derivativo sobre a medição
float integ[6]     = {0,0,0,0,0,0};
float last_y_mm[6] = {0,0,0,0,0,0};              // memória p/ derivada
bool  y_init       = false;
float deadband_mm  = 0.2f;                        // histerese global (mm)

// ===== Feedforward (zona morta / viés) por pistão =====
float U0_adv[6] = {11,17,10.5,14,14.5,12.5};     // PWM para SUBIR (positivo)
float U0_ret[6] = {8,12,9.4,14.5,11.4,11.4};     // PWM para DESCER (negativo)

// ================== CALIBRAÇÃO (V0 / V100) ==================
float V0[6]     = {0.25,0.25,0.25,0.25,0.25,0.25};
float V100[6]   = {3.3,3.3,3.3,3.3,3.3,3.3};
bool  hasCal[6] = {true,true,true,true,true,true};

// ===== FILTRAGEM: MEDIANA-3 + LIMITADOR DE INCLINAÇÃO + MÉDIA MÓVEL =====
// Janela da média móvel (mude aqui para testar)
constexpr int MA_N = 5;
// Ativar média aparada (descarta min e max) quando houver amostras suficientes
constexpr bool USE_TRIMMED_MEAN = true;

// Limitador de inclinação (em Volts por ciclo de loop)
const float MAX_DV_V = 0.030f; // ~30 mV por iteração (ajuste conforme ruído/latência)

// Buffers da média móvel por pistão
float   fbV_buf[6][MA_N];         // últimas N amostras (em volts)
uint8_t fbV_idx[6]   = {0,0,0,0,0,0}; // posição circular
uint8_t fbV_count[6] = {0,0,0,0,0,0}; // quantas amostras válidas (<= N)
float   fbV_sum[6]   = {0,0,0,0,0,0}; // soma para média simples

// Estado do guardião anti-spike
float guard_lastV[6] = {0,0,0,0,0,0};
bool  guard_init = false;

// leitura bruta e filtrada (em volts)
float fbV_raw[6]  = {0,0,0,0,0,0};
float fbV_filt[6] = {0,0,0,0,0,0};

// ===== Modo manual (apenas 1 pistão) =====
int  selIdx = 0;                      // 0..5 (pistão selecionado)
bool manual_retract = false;
bool manual_advance = false;
const uint8_t RETRACT_PWM = 80;       // PWM fixos p/ modos manuais
const uint8_t ADV_PWM     = 70;

// ===== CSV =====
bool csv_header_done = false;
float last_pwm_cmd[6] = {0,0,0,0,0,0};

uint32_t last_ms = 0;
String line;

// ================== Helpers ==================
static inline float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void setDirAdvance(int i){ digitalWrite(pistons[i].in1, HIGH); digitalWrite(pistons[i].in2, LOW ); }
void setDirReturn (int i){ digitalWrite(pistons[i].in1, LOW );  digitalWrite(pistons[i].in2, HIGH); }
void setDirFree   (int i){ digitalWrite(pistons[i].in1, LOW );  digitalWrite(pistons[i].in2, LOW ); }

float readMedianV(int pin, int N=31){
  N = constrain(N, 5, 63);
  float buf[64];
  for(int i=0;i<N;i++){
    int a = analogRead(pin);           // 0..4095
    buf[i] = a * 3.3f / 4095.0f;
    delayMicroseconds(500);
  }
  for(int i=0;i<N;i++) for(int j=i+1;j<N;j++) if(buf[j]<buf[i]){ float t=buf[i]; buf[i]=buf[j]; buf[j]=t; }
  return buf[N/2];
}

// Mediana de 3 leituras rápidas em volts
inline float analogMedian3Volts(int pin) {
  int a = analogRead(pin);
  int b = analogRead(pin);
  int c = analogRead(pin);
  // ordena 3
  if (a > b) { int t=a; a=b; b=t; }
  if (b > c) { int t=b; b=c; c=t; }
  if (a > b) { int t=a; a=b; b=t; }
  int m = b; // mediana
  return m * 3.3f / 4095.0f;
}

// Limitador de inclinação em volts
inline float spike_guard(int i, float v) {
  if (!guard_init) {
    guard_lastV[i] = v;
    return v;
  }
  float dv = v - guard_lastV[i];
  if      (dv >  MAX_DV_V) v = guard_lastV[i] + MAX_DV_V;
  else if (dv < -MAX_DV_V) v = guard_lastV[i] - MAX_DV_V;
  guard_lastV[i] = v;
  return v;
}

// Atualiza buffer e retorna saída do filtro (média móvel ou média aparada)
inline float ma_update(int idx, float sampleV) {
  if (fbV_count[idx] < MA_N) {
    fbV_buf[idx][fbV_idx[idx]] = sampleV;
    fbV_sum[idx] += sampleV;
    fbV_count[idx]++;
    fbV_idx[idx] = (fbV_idx[idx] + 1) % MA_N;
  } else {
    uint8_t p = fbV_idx[idx];
    float old = fbV_buf[idx][p];
    fbV_buf[idx][p] = sampleV;
    fbV_sum[idx] += (sampleV - old);
    fbV_idx[idx] = (p + 1) % MA_N;
  }

  // Saída (trimmed mean ou média simples)
  int valid = fbV_count[idx];
  if (valid < 1) valid = 1;

  if (USE_TRIMMED_MEAN && valid >= 3) {
    // percorre apenas posições válidas
    int limit = (fbV_count[idx] < MA_N) ? fbV_count[idx] : MA_N;
    float s = 0.0f, vmin =  1e9f, vmax = -1e9f;
    for (int k = 0; k < limit; ++k) {
      float v = fbV_buf[idx][k];
      s += v;
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
    if (limit > 2) return (s - vmin - vmax) / (float)(limit - 2);
    // fallback (caso raro)
  }
  return fbV_sum[idx] / (float)fbV_count[idx];
}

// Converte V (filtrado) -> posição em mm usando calibração
float voltsToMM(int i, float V){
  if (!hasCal[i]) {
    float pct = clampf((V/3.3f)*100.0f, 0.0f, 100.0f);
    return (Lmm[i]/100.0f)*pct;
  }
  float span = V100[i] - V0[i];
  if (span < 1e-3f) span = 3.3f; // evita div/0
  float pct = (V - V0[i]) / span * 100.0f;
  pct = clampf(pct, 0.0f, 100.0f);
  return (Lmm[i]/100.0f) * pct;
}

// ================== Setup ==================
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

// ================== Comandos auxiliares ==================
static void apply_setpoint_all(float v_mm){
  for(int i=0;i<6;i++){
    float v = clampf(v_mm, 0.0f, Lmm[i]);
    SP_mm[i] = v;
  }
}

static void apply_gain_all(float *arr, float v){
  for(int i=0;i<6;i++) arr[i] = v;
}

static void apply_feedforward_all(float *arr, float v_abs){
  v_abs = fabs(v_abs);
  for(int i=0;i<6;i++) arr[i] = v_abs;
}

// ================== Loop ==================
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

      // ---- Setpoints ----
      } else if (cmd.startsWith("spmm=")) {
        float v = cmd.substring(5).toFloat();
        apply_setpoint_all(v);

      } else if (cmd.startsWith("spmm1=") || cmd.startsWith("spmm2=") || cmd.startsWith("spmm3=") ||
                 cmd.startsWith("spmm4=") || cmd.startsWith("spmm5=") || cmd.startsWith("spmm6=")) {
        int idx = cmd.charAt(4) - '1'; // '1'..'6' -> 0..5
        float v = cmd.substring(6).toFloat();
        v = clampf(v, 0.0f, Lmm[idx]);
        SP_mm[idx] = v;

      // ---- Ganhos por pistão (selecionado) ----
      } else if (cmd.startsWith("kpmm=")) {
        Kp_mm[selIdx] = cmd.substring(5).toFloat();

      } else if (cmd.startsWith("kimm=")) {
        Ki_mm[selIdx] = cmd.substring(5).toFloat();

      } else if (cmd.startsWith("kdmm=")) {
        Kd_mm[selIdx] = cmd.substring(5).toFloat();

      // ---- Ganhos para TODOS ----
      } else if (cmd.startsWith("kpall=")) {
        apply_gain_all(Kp_mm, cmd.substring(6).toFloat());

      } else if (cmd.startsWith("kiall=")) {
        apply_gain_all(Ki_mm, cmd.substring(6).toFloat());

      } else if (cmd.startsWith("kdall=")) {
        apply_gain_all(Kd_mm, cmd.substring(6).toFloat());

      // ---- Deadband global ----
      } else if (cmd.startsWith("dbmm=")) {
        deadband_mm = fabs(cmd.substring(5).toFloat());

      // ---- Curso Lmm do selecionado ----
      } else if (cmd.startsWith("lmm=")) {
        float v = fabs(cmd.substring(4).toFloat());
        if (v > 1e-3f) Lmm[selIdx] = v;

      // ---- (LEGADO) fc= ignorado: filtro agora é média móvel + guardiões ----
      } else if (cmd.startsWith("fc=")) {
        Serial.println(F("INFO: fc= ignorado (usando mediana-3 + guardiao de inclinacao + media movel)."));

      // ---- PWM mínimo ----
      } else if (cmd.startsWith("minpwm=")) {
        int v = cmd.substring(7).toInt();
        MIN_PWM = (uint8_t)constrain(v, 0, 255);

      // ---- Calibrações ----
      } else if (cmd.equalsIgnoreCase("zero")) {
        float v = readMedianV(FB_PINS[selIdx], 31);
        V0[selIdx] = v; hasCal[selIdx] = true;
        Serial.printf("OK ZERO[%d]=%.4f V\n", selIdx+1, v);

      } else if (cmd.startsWith("cal=")) {
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

      // ---- Feedforward do selecionado + para TODOS ----
      } else if (cmd.startsWith("u0a=")) {
        U0_adv[selIdx] = fabs(cmd.substring(4).toFloat());
        Serial.printf("OK U0_adv[%d]=%.1f\n", selIdx+1, U0_adv[selIdx]);

      } else if (cmd.startsWith("u0r=")) {
        U0_ret[selIdx] = fabs(cmd.substring(4).toFloat());
        Serial.printf("OK U0_ret[%d]=%.1f\n", selIdx+1, U0_ret[selIdx]);

      } else if (cmd.startsWith("u0aall=")) {
        apply_feedforward_all(U0_adv, cmd.substring(7).toFloat());
        Serial.println("OK U0_adv para todos");

      } else if (cmd.startsWith("u0rall=")) {
        apply_feedforward_all(U0_ret, cmd.substring(7).toFloat());
        Serial.println("OK U0_ret para todos");

      // ---- Modo manual (só no pistão selecionado) ----
      } else if (cmd.equalsIgnoreCase("R")) {
        manual_retract = true; manual_advance = false;

      } else if (cmd.equalsIgnoreCase("A")) {
        manual_advance = true; manual_retract = false;

      } else if (cmd.equalsIgnoreCase("ok")) {
        manual_retract = false; manual_advance = false;
        setDirFree(selIdx); ledcWrite(PWM_CHANS[selIdx], 0);
      }

    } else {
      line += c;
      if (line.length() > 96) line.remove(0, line.length() - 96);
    }
  }

  // ===== Laço de controle =====
  uint32_t now = millis();
  float dt = (now - last_ms) / 1000.0f;
  if (dt <= 0) dt = 1e-3f;
  last_ms = now;

  // Medidas + anti-spike + média móvel
  for (int i = 0; i < 6; i++) {
    float volts = analogMedian3Volts(FB_PINS[i]); // 1) mediana de 3
    volts = spike_guard(i, volts);                // 2) limitador de inclinação
    fbV_raw[i]  = volts;
    fbV_filt[i] = ma_update(i, volts);           // 3) média móvel (trimmed opcional)
  }
  guard_init = true;

  // ---- inicializa memória da derivada na primeira passada da malha fechada ----
  if (!y_init && !manual_retract && !manual_advance) {
    for (int k = 0; k < 6; k++) last_y_mm[k] = voltsToMM(k, fbV_filt[k]);
    y_init = true;
  }

  // ===== Controle =====
  if (manual_retract || manual_advance) {
    for (int i = 0; i < 6; i++) {
      if (i == selIdx) {
        if (manual_retract) {
          setDirReturn(i);
          uint8_t pwm = constrain(RETRACT_PWM, 0, (int)MAX_PWM);
          ledcWrite(PWM_CHANS[i], pwm);
          last_pwm_cmd[i] = pwm;
        } else { // manual_advance
          setDirAdvance(i);
          uint8_t pwm = constrain(ADV_PWM, 0, (int)MAX_PWM);
          ledcWrite(PWM_CHANS[i], pwm);
          last_pwm_cmd[i] = pwm;
        }
      } else {
        setDirFree(i);
        ledcWrite(PWM_CHANS[i], 0);
        last_pwm_cmd[i] = 0;
      }
    }

  } else {
    // ---- Malha fechada para TODOS os pistões ----
    for (int i = 0; i < 6; i++) {
      float y_mm = voltsToMM(i, fbV_filt[i]);
      float e_mm = SP_mm[i] - y_mm;

      // derivada da medição (anti-kick)
      float ydot_mmps = (y_mm - last_y_mm[i]) / dt;
      last_y_mm[i] = y_mm;

      if (fabs(e_mm) > deadband_mm) {
        if (Ki_mm[i] != 0.0f) {
          integ[i] += e_mm * dt;
          integ[i] = clampf(integ[i], -10000.0f, 10000.0f);
        }

        float uPID = Kp_mm[i]*e_mm + Ki_mm[i]*integ[i] - Kd_mm[i]*ydot_mmps;

        // feedforward assimétrico
        float u_ff = (uPID >= 0.0f) ?  U0_adv[i] : -U0_ret[i];
        float u    = uPID + u_ff;

        if (u >= 0) setDirAdvance(i); else setDirReturn(i);

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
  }

  // ===== Telemetria (100 ms): ms;SP_mm;Y1..Y6;PWM1..PWM6 =====
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    if (!csv_header_done) {
      Serial.println(F("ms;SP_mm;Y1;Y2;Y3;Y4;Y5;Y6;PWM1;PWM2;PWM3;PWM4;PWM5;PWM6"));
      csv_header_done = true;
    }

    float y_out[6];
    for (int i = 0; i < 6; i++) y_out[i] = voltsToMM(i, fbV_filt[i]);

    Serial.printf("%lu;%.3f;%.3f;%.3f;%.3f;%.3f;%.3f;%.3f;%.0f;%.0f;%.0f;%.0f;%.0f;%.0f\n",
      (unsigned long)now,
      SP_mm[0],
      y_out[0], y_out[1], y_out[2], y_out[3], y_out[4], y_out[5],
      last_pwm_cmd[0], last_pwm_cmd[1], last_pwm_cmd[2],
      last_pwm_cmd[3], last_pwm_cmd[4], last_pwm_cmd[5]
    );
  }
}
