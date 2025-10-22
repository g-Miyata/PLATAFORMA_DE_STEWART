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
int   selIdx = 0;                             // 0..5 (pistão selecionado)
float Lmm[6]   = {250,250,250,250,250,250};  // curso útil (mm) por pistão
float SP_mm[6] = {0,0,0,0,0,0};              // setpoint em mm (seguido pelo PI)
float Kp_mm[6] = {1.8236, 1.0333, 1.0152, 0.8223, 2.1822, 2.2680};
float Ki_mm[6] = {0,0,0,0,0,0};
float Kd_mm[6] = {0,0,0,0,0,0};
float integ[6] = {0,0,0,0,0,0};
float last_y_mm[6] = {0,0,0,0,0,0};           // memória da posição (p/ derivada)
bool  y_init = false;                          // flag de init da derivada
float deadband_mm = 0.2f;                      // histerese em mm (ajuste pelo comando dbmm=)

// ===== (zona morta / viés) =====
float U0_adv[6] = {30,45,30,35,35,30};      // PWM para SUBIR (positivo)
float U0_ret[6] = {30,35,30,30,30,30};      // PWM para DESCER (negativo)

// ================== CALIBRAÇÃO (V0 / V100) ==================
float V0[6] = {0.25,0.25,0.25,0.25,0.25,0.25};
float V100[6] = {3.3,3.3,3.3,3.3,3.3,3.3};
bool  hasCal[6] = {true,true,true,true,true,true};

// ===== Filtro passa-baixa (IIR 1ª ordem) =====
float fc_hz = 4.0f;                   // ajustável por "fc="
bool  fb_init = false;
float fbV_raw[6];
float fbV_filt[6]   = {0,0,0,0,0,0};

// ===== Modo manual =====
bool manual_retract = false;
bool manual_advance = false;
const uint8_t RETRACT_PWM = 80;       // PWM fixos p/ modos manuais
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

// ================== RAMPA EM DEGRAUS (pontos vermelhos) ==================
bool  rampActive = false;             // rampa do pistão selecionado
float rampStart_mm[6]  = {0,0,0,0,0,0};
float rampTarget_mm[6] = {0,0,0,0,0,0};
uint32_t rampT_total_ms = 0;
uint32_t rampTick_ms    = 50;         // intervalo entre micro-setpoints
uint32_t rampT0_ms      = 0;
int   rampSteps         = 0;
int   rampK             = 0;          // degrau atual (0..rampSteps)

String line;

// ================== SETUP ==================
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

// ================== LOOP ==================
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
        // mantém compatibilidade: degrau direto (instantâneo)
        float v = cmd.substring(5).toFloat();
        v = clampf(v, 0.0f, Lmm[selIdx]);
        SP_mm[selIdx] = v;
        rampActive = false; // cancela rampa se tiver

      } else if (cmd.startsWith("rampmm=")) {
        // formato: rampmm=SPfinal_mm,Ttotal_ms[,Tick_ms]
        String args = cmd.substring(7);
        int c1 = args.indexOf(',');
        int c2 = (c1 >= 0) ? args.indexOf(',', c1+1) : -1;
        if (c1 < 0) {
          Serial.println("ERR rampmm: use rampmm=SP_mm,T_ms[,tick_ms]");
        } else {
          float spf = args.substring(0, c1).toFloat();
          spf = clampf(spf, 0.0f, Lmm[selIdx]);

          uint32_t Ttot = (uint32_t) fabs(args.substring(c1+1, (c2<0?args.length():c2)).toFloat());
          if (Ttot < 10) Ttot = 10;

          uint32_t Ttick = (c2 >= 0) ? (uint32_t) fabs(args.substring(c2+1).toFloat()) : rampTick_ms;
          if (Ttick < 5) Ttick = 5;

          // posição atual como ponto inicial (usa filtro se já inicializado)
          float y_now;
          if (fb_init) y_now = voltsToMM(selIdx, fbV_filt[selIdx]);
          else         y_now = voltsToMM(selIdx, readMedianV(FB_PINS[selIdx], 31));

          rampStart_mm[selIdx]  = y_now;
          rampTarget_mm[selIdx] = spf;

          rampT_total_ms = Ttot;
          rampTick_ms    = Ttick;
          rampSteps      = (int)ceil((double)Ttot / (double)Ttick);
          if (rampSteps < 1) rampSteps = 1;
          rampK          = 0;
          rampT0_ms      = millis();
          rampActive     = true;

          // inicializa SP no ponto inicial
          SP_mm[selIdx]  = rampStart_mm[selIdx];

          Serial.printf("OK RAMP[%d]: start=%.3f -> target=%.3f | steps=%d | tick=%ums | total=%ums\n",
            selIdx+1, rampStart_mm[selIdx], rampTarget_mm[selIdx], rampSteps, rampTick_ms, rampT_total_ms);
        }

      } else if (cmd.equalsIgnoreCase("ramppause")) {
        rampActive = false;
        Serial.println("OK RAMP: pausada");

      } else if (cmd.startsWith("kpmm=")) {
        Kp_mm[selIdx] = cmd.substring(5).toFloat();

      } else if (cmd.startsWith("kimm=")) {
        Ki_mm[selIdx] = cmd.substring(5).toFloat();

      } else if (cmd.startsWith("kdmm=")) {
        Kd_mm[selIdx] = cmd.substring(5).toFloat();

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

      // ---- feedforward ----
      } else if (cmd.startsWith("u0a=")) {
        U0_adv[selIdx] = fabs(cmd.substring(4).toFloat());
        Serial.printf("OK U0_adv[%d]=%.1f\n", selIdx+1, U0_adv[selIdx]);

      } else if (cmd.startsWith("u0r=")) {
        U0_ret[selIdx] = fabs(cmd.substring(4).toFloat());
        Serial.printf("OK U0_ret[%d]=%.1f\n", selIdx+1, U0_ret[selIdx]);

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

  // ===== Atualiza rampa (micro-setpoints) do pistão selecionado =====
  if (rampActive) {
    uint32_t tnow = millis();
    uint32_t elapsed = tnow - rampT0_ms;
    int k = (int)(elapsed / rampTick_ms);
    if (k > rampSteps) k = rampSteps;

    if (k != rampK) {
      rampK = k;
      float frac = (float)rampK / (float)rampSteps;   // 0..1
      float delta = rampTarget_mm[selIdx] - rampStart_mm[selIdx];
      SP_mm[selIdx] = rampStart_mm[selIdx] + frac * delta;
    }

    if (rampK >= rampSteps) {
      SP_mm[selIdx] = rampTarget_mm[selIdx];
      rampActive = false;
      Serial.printf("OK RAMP[%d]: concluida. SP=%.3f mm\n", selIdx+1, SP_mm[selIdx]);
    }
  }

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
    // --------- Controle P(+I + D na medição) em mm + feedforward assimétrico ---------
    float y_mm = voltsToMM(i, fbV_filt[i]);
    float e_mm = SP_mm[i] - y_mm;

    // inicializa memória de derivada na primeira passada
    if (!y_init) {
      for (int k = 0; k < 6; k++) last_y_mm[k] = voltsToMM(k, fbV_filt[k]);
      y_init = true;
    }

    // velocidade (derivada da medição) — evita derivative kick
    float ydot_mmps = (y_mm - last_y_mm[i]) / dt;
    last_y_mm[i] = y_mm;

    if (fabs(e_mm) > deadband_mm) {
      // integra (use Ki>0 se quiser eliminar erro estacionário)
      integ[i] += e_mm * dt;

      // P + I + D(medição)
      float uPID = Kp_mm[i]*e_mm + Ki_mm[i]*integ[i] - Kd_mm[i]*ydot_mmps;

      // feedforward: só ajuda no sentido correspondente
      float u_ff = (uPID >= 0.0f) ?  U0_adv[i] : -U0_ret[i];
      float u    = uPID + u_ff;

      // define direção pelo sinal e aplica PWM
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

  // ===== Telemetria (100 ms): ms;SP_mm;Y_mm;PWM =====
  static uint32_t t0 = 0;
  if (millis() - t0 >= 100) {
    t0 = millis();

    if (!csv_header_done) {
      Serial.println(F("ms;SP_mm;Y_mm;PWM"));
      csv_header_done = true;
    }

    float pwmf_out = last_pwm_cmd[selIdx];
    float y_mm_out = voltsToMM(selIdx, fbV_filt[selIdx]);
    Serial.printf("%lu;%.3f;%.3f;%.0f;%.3f\n",
      (unsigned long)now,
      SP_mm[selIdx],
      y_mm_out,
      last_pwm_cmd[selIdx],
      pwmf_out);
  }
}
