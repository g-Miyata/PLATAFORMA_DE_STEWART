#include <WiFi.h>
#include <esp_now.h>
#include <Wire.h>
#include "SparkFun_BNO08x_Arduino_Library.h"

BNO08x imu;

// ==================================================
// Estruturas de dados trocadas via ESP-NOW
// ==================================================

// Comandos que VÊM do S3 (recalibração, etc.)
typedef struct {
  float roll;
  float pitch;
  float yaw;
  bool  recalibra;  // campo p/ pedir recalibração
} CommandData;

// Telemetria que VAI para o S3 (Euler + Quaternions)
typedef struct {
  float roll;   // já com offset (zerado)
  float pitch;  // já com offset
  float yaw;    // já com offset
  float qw;     // quaternion bruto
  float qx;
  float qy;
  float qz;
  bool  recalibra;  // sempre false aqui, só pra manter layout simples
} TelemetryData;

TelemetryData ori;     // o que enviamos
CommandData   recebido; // o que recebemos

// ==================================================
// MAC do receptor (ESP32-S3)
// ==================================================
uint8_t receiverMac[] = {0x34, 0xCD, 0xB0, 0x33, 0xA6, 0xF8};

// ==================================================
// Envio periódico (~20 Hz)
// ==================================================
unsigned long lastSend = 0;
const unsigned long sendIntervalMs = 50; 

// ==================================================
// Offsets para "zerar" orientação por software
// ==================================================
float offsetRoll  = 0.0f;
float offsetPitch = 0.0f;
float offsetYaw   = 0.0f;
bool  temOffset   = false;

// Flag para indicar pedido de recalibração recebido via ESP-NOW
volatile bool pedidoRecalibra = false;

// ==================================================
// Callback de recepção — recebe comandos do S3
// ==================================================
void onDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
  // Continua compatível com o struct antigo do S3:
  if (len == sizeof(CommandData)) {
    memcpy(&recebido, incomingData, sizeof(recebido));

    if (recebido.recalibra) {
      Serial.println(">> Comando de recalibração recebido!");
      // Apenas marca a intenção; o offset será atualizado no loop
      pedidoRecalibra = true;
    }
  } else {
    Serial.print(">> Pacote recebido com tamanho inesperado: ");
    Serial.println(len);
  }
}

// ==================================================
// Inicializa o BNO08x
// ==================================================
void setupBNO() {
  Wire.begin(21, 22);        // I2C (ajuste se seus pinos forem outros)
  Wire.setClock(400000);     // 400kHz

  Serial.println("Inicializando BNO08x...");
  
  // Endereço padrão (0x4B). Se o seu for 0x4A, troque aqui.
  if (!imu.begin(BNO08x_DEFAULT_ADDRESS, Wire)) {
    Serial.println(F("BNO08x não detectado. Verifique as conexões!"));
    while (true) delay(1000);
  }

  Serial.println(F("BNO08x conectado!"));

  // Habilita Rotation Vector (quaternions) a cada 50ms (~20Hz)
  if (!imu.enableRotationVector(50)) {
    Serial.println("Erro ao habilitar Rotation Vector!");
  }

  Serial.println(F("BNO08x configurado! Aguarde estabilização..."));
  delay(1000);
}

// ==================================================
// Inicializa o ESP-NOW (envio + recepção)
// ==================================================
void setupEspNow() {
  WiFi.mode(WIFI_STA);
  delay(200);

  Serial.print("MAC do transmissor: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("Erro ao iniciar ESP-NOW");
    while (true) delay(1000);
  }

  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, receiverMac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Erro ao adicionar peer");
    while (true) delay(1000);
  }

  // callback de recepção
  esp_now_register_recv_cb(onDataRecv);

  Serial.println("ESP-NOW pronto. Enviando orientação (Euler + quat)...");
}

// ==================================================
// Converte quaternion para Euler (Roll, Pitch, Yaw)
// ==================================================
void quaternionToEuler(float qw, float qx, float qy, float qz, 
                       float &roll, float &pitch, float &yaw) {
  // Roll (X-axis rotation)
  float sinr_cosp = 2.0f * (qw * qx + qy * qz);
  float cosr_cosp = 1.0f - 2.0f * (qx * qx + qy * qy);
  roll = atan2(sinr_cosp, cosr_cosp) * 180.0f / PI;

  // Pitch (Y-axis rotation)
  float sinp = 2.0f * (qw * qy - qz * qx);
  if (fabs(sinp) >= 1.0f)
    pitch = copysign(90.0f, sinp); // saturado em ±90°
  else
    pitch = asin(sinp) * 180.0f / PI;

  // Yaw (Z-axis rotation)
  float siny_cosp = 2.0f * (qw * qz + qx * qy);
  float cosy_cosp = 1.0f - 2.0f * (qy * qy + qz * qz);
  yaw = atan2(siny_cosp, cosy_cosp) * 180.0f / PI;
}

// ==================================================
// Setup
// ==================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  setupBNO();
  setupEspNow();
}

// ==================================================
// Loop principal
// ==================================================
void loop() {
  // Atualiza a flag de recalibração (evita condição de corrida)
  static bool pedidoLocal = false;
  if (pedidoRecalibra) {
    noInterrupts();
    pedidoLocal = true;
    pedidoRecalibra = false;
    interrupts();
  }

  // Verifica se há novos dados do sensor
  if (imu.getSensorEvent()) {
    unsigned long now = millis();
    
    // Obtém quaternions do sensor (ordem da SparkFun: i, j, k, real)
    float quatI    = imu.getQuatI();
    float quatJ    = imu.getQuatJ();
    float quatK    = imu.getQuatK();
    float quatReal = imu.getQuatReal();

    // Converte para ângulos Euler "brutos"
    float rollRaw, pitchRaw, yawRaw;
    quaternionToEuler(quatReal, quatI, quatJ, quatK, 
                      rollRaw, pitchRaw, yawRaw);

    // Se ainda não temos offset (primeira leitura) ou foi pedido recalibra,
    // zeramos a referência aqui
    if (!temOffset || pedidoLocal) {
      offsetRoll  = rollRaw;
      offsetPitch = pitchRaw;
      offsetYaw   = yawRaw;
      temOffset   = true;
      pedidoLocal = false;

      Serial.println("Offsets atualizados:");
      Serial.print("  offsetRoll  = "); Serial.println(offsetRoll);
      Serial.print("  offsetPitch = "); Serial.println(offsetPitch);
      Serial.print("  offsetYaw   = "); Serial.println(offsetYaw);
    }

    // Aplica offsets para deixar o valor "zerado" na referência atual
    float rollZ  = rollRaw  - offsetRoll;
    float pitchZ = pitchRaw - offsetPitch;
    float yawZ   = yawRaw   - offsetYaw;

    // Normaliza yaw em [-180, 180] (opcional mas ajuda)
    if (yawZ > 180.0f)  yawZ -= 360.0f;
    if (yawZ < -180.0f) yawZ += 360.0f;

    // Preenche struct de telemetria
    ori.roll  = rollZ;
    ori.pitch = pitchZ;
    ori.yaw   = yawZ;

    // Quaternions brutos (sem offset) – referência absoluta
    ori.qw = quatReal;
    ori.qx = quatI;
    ori.qy = quatJ;
    ori.qz = quatK;

    ori.recalibra = false;  // transmissor não pede recalibração

    // Envio periódico
    if (now - lastSend >= sendIntervalMs) {
      esp_err_t result = esp_now_send(receiverMac, (uint8_t*)&ori, sizeof(ori));

      Serial.print("Send -> Rz:");
      Serial.print(ori.roll, 1);
      Serial.print(" Pz:");
      Serial.print(ori.pitch, 1);
      Serial.print(" Yz:");
      Serial.print(ori.yaw, 1);
      Serial.print(" | q=[");
      Serial.print(ori.qw, 3); Serial.print(", ");
      Serial.print(ori.qx, 3); Serial.print(", ");
      Serial.print(ori.qy, 3); Serial.print(", ");
      Serial.print(ori.qz, 3); Serial.print("]");
      Serial.print(" | status=");
      Serial.println((int)result);

      lastSend = now;
    }
  }
  
  // Pequeno delay para não sobrecarregar o loop
  delay(1);
}
