#include <Arduino.h>

// ================== PINAGEM ==================
const int FB_PINS[6]   = {1, 2, 3, 4, 5, 6};   // feedback (0..3.3V)
const int PWM_PINS[6]  = {18, 8, 9, 10, 11, 12};
const int PWM_CHANS[6] = {0, 1, 2, 3, 4, 5};

struct PistonIO { int in1; int in2; };
PistonIO pistons[6] = {
  {13, 14}, {16, 17}, {35, 36}, {21, 38}, {39, 37}, {41, 42}
};

// ================== PWM (LEDC) ==================
#define PWM_FREQ 20000
#define PWM_RES  8                    // 0..255
const float MAX_PWM = 255.0f;
uint8_t MIN_PWM = 0;                  // deixe 0 p/ identificação; depois pode usar 20

// ================== CONTROLE EM mm (por pistão) ==================
float Lmm[6]     = {250,250,250,250,250,250};  // curso útil (mm)
float SP_mm[6]   = {0,0,0,0,0,0};              // setpoint em mm (pode ser comum via spmm=)
float Kp_mm[6]   = {2,2,2,2,2,2};              // ponto de partida
float Ki_mm[6]   = {0,0,0,0,0,0};
float Kd_mm[6]   = {0,0,0,0,0,0};              // derivativo sobre a medição
float integ[6]   = {0,0,0,0,0,0};
float last_y_mm[6] = {0,0,0,0,0,0};            // memória p/ derivada
bool  y_init = false;
float deadband_mm = 0.2f;                      // histerese global (mm)

// ===== Feedforward (zona morta / viés) por pistão =====
float U0_adv[6] = {30,35,30,35,35,30};        // PWM para SUBIR (positivo)
float U0_ret[6] = {30,30,30,30,30,30};        // PWM para DESCER (negativo)

// ================== CALIBRAÇÃO (V0 / V100) ==================
float V0[6]   = {0.25,0.25,0.25,0.25,0.25,0.25};
float V100[6] = {3.3,3.3,3.3,3.3,3.3,3.3};
bool  hasCal[6] = {true,true,true,true,true,true};

// ===== Filtro passa-baixa (IIR 1ª ordem) =====
float fc_hz = 4.0f;                   // ajustável por "fc="
bool  fb_init = false;
float fbV_raw[6];
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
        // aplica a TODOS
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

      // ---- Filtro LPF (global) ----
      } else if (cmd.startsWith("fc=")) {
        float v = fabs(cmd.substring(3).toFloat());
        fc_hz = clampf(v, 0.1f, 50.0f);

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

  // Medidas brutas
  for (int i = 0; i < 6; i++) {
    int fbRaw = analogRead(FB_PINS[i]);          // 0..4095
    fbV_raw[i] = fbRaw * 3.3f / 4095.0f;
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

  // ===== Controle =====
  // Se estiver em modo manual, só o pistão selecionado é acionado manualmente;
  // os demais ficam livres e com PWM=0.
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
    // inicializa memória da derivada na primeira passada
    if (!y_init) {
      for (int k = 0; k < 6; k++) last_y_mm[k] = voltsToMM(k, fbV_filt[k]);
      y_init = true;
    }

    for (int i = 0; i < 6; i++) {
      float y_mm = voltsToMM(i, fbV_filt[i]);
      float e_mm = SP_mm[i] - y_mm;

      // derivada da medição (anti-kick)
      float ydot_mmps = (y_mm - last_y_mm[i]) / dt;
      last_y_mm[i] = y_mm;

      if (fabs(e_mm) > deadband_mm) {
        // integra se Ki > 0
        if (Ki_mm[i] != 0.0f) {
          integ[i] += e_mm * dt;
          // (opcional) anti-windup simples:
          integ[i] = clampf(integ[i], -10000.0f, 10000.0f);
        }

        // PID com derivada da saída
        float uPID = Kp_mm[i]*e_mm + Ki_mm[i]*integ[i] - Kd_mm[i]*ydot_mmps;

        // feedforward assimétrico
        float u_ff = (uPID >= 0.0f) ?  U0_adv[i] : -U0_ret[i];
        float u    = uPID + u_ff;

        // direção e PWM
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
      // SP comum mostrado como SP_mm[0] (se usar diferentes por pistão, adapte)
      SP_mm[0],
      y_out[0], y_out[1], y_out[2], y_out[3], y_out[4], y_out[5],
      last_pwm_cmd[0], last_pwm_cmd[1], last_pwm_cmd[2],
      last_pwm_cmd[3], last_pwm_cmd[4], last_pwm_cmd[5]
    );
  }
}
