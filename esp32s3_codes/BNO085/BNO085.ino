#include <WiFi.h>
#include <esp_now.h>
#include <Wire.h>
#include "SparkFun_BNO08x_Arduino_Library.h"

BNO08x imu;

// ==================================================
// Estrutura de dados trocada via ESP‑NOW
// ==================================================
typedef struct {
  float roll;
  float pitch;
  float yaw;
  bool  recalibra;  // campo p/ pedir recalibração
} OrientationData;

OrientationData ori;
OrientationData recebido;

// ==================================================
// MAC do receptor (ESP32‑S3)
// ==================================================
uint8_t receiverMac[] = {0x34, 0xCD, 0xB0, 0x33, 0xA6, 0xF8};

// ==================================================
// Envio periódico (~20 Hz)
// ==================================================
unsigned long lastSend = 0;
const unsigned long sendIntervalMs = 50; 

// ==================================================
// Callback de recepção — recebe comandos do S3
// ==================================================
void onDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
  if (len == sizeof(OrientationData)) {
    memcpy(&recebido, incomingData, sizeof(recebido));

    if (recebido.recalibra) {
      Serial.println(">> Comando de recalibração recebido!");
      Serial.println("Executando Tare (zerando orientação)...");
      
      // Tare: zera a orientação atual do BNO08x
      if (imu.tareNow(true, SH2_TARE_BASIS_ROTATION_VECTOR)) {
        Serial.println("OK: Tare concluído!");
        // Opcional: salvar o tare na memória flash
        imu.saveTare();
      } else {
        Serial.println("ERRO: Falha ao executar Tare!");
      }
    }
  }
}

// ==================================================
// Inicializa o BNO08x
// ==================================================
void setupBNO() {
  Wire.begin(21, 22);  // I2C padrão DevKit V1
  Wire.setClock(400000); // 400kHz

  Serial.println("Inicializando BNO08x...");
  
  // Tenta inicializar no endereço padrão (0x4B)
  // Caso seu módulo use 0x4A, troque por: imu.begin(0x4A, Wire)
  if (!imu.begin(BNO08x_DEFAULT_ADDRESS, Wire)) {
    Serial.println(F("BNO08x não detectado. Verifique as conexões!"));
    while (true) delay(1000);
  }

  Serial.println(F("BNO08x conectado!"));

  // Habilita o Rotation Vector com taxa de atualização de 50ms (20Hz)
  // Este sensor já fornece orientação em quaternions
  if (!imu.enableRotationVector(50)) {
    Serial.println("Erro ao habilitar Rotation Vector!");
  }

  Serial.println(F("BNO08x configurado! Aguarde estabilização..."));
  delay(1000);
}

// ==================================================
// Inicializa o ESP‑NOW (envio + recepção)
// ==================================================
void setupEspNow() {
  WiFi.mode(WIFI_STA);
  delay(200);

  Serial.print("MAC do transmissor: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("Erro ao iniciar ESP‑NOW");
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

  Serial.println("ESP‑NOW pronto. Enviando ângulos...");
}

// ==================================================
// Converte quaternion para Euler (Roll, Pitch, Yaw)
// ==================================================
void quaternionToEuler(float qw, float qx, float qy, float qz, 
                       float &roll, float &pitch, float &yaw) {
  // Roll (X-axis rotation)
  float sinr_cosp = 2.0 * (qw * qx + qy * qz);
  float cosr_cosp = 1.0 - 2.0 * (qx * qx + qy * qy);
  roll = atan2(sinr_cosp, cosr_cosp) * 180.0 / PI;

  // Pitch (Y-axis rotation)
  float sinp = 2.0 * (qw * qy - qz * qx);
  if (abs(sinp) >= 1)
    pitch = copysign(90.0, sinp); // use 90 degrees if out of range
  else
    pitch = asin(sinp) * 180.0 / PI;

  // Yaw (Z-axis rotation)
  float siny_cosp = 2.0 * (qw * qz + qx * qy);
  float cosy_cosp = 1.0 - 2.0 * (qy * qy + qz * qz);
  yaw = atan2(siny_cosp, cosy_cosp) * 180.0 / PI;
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
  // Verifica se há novos dados do sensor
  if (imu.getSensorEvent()) {
    unsigned long now = millis();
    
    if (now - lastSend >= sendIntervalMs) {
      // Obtém quaternions do sensor
      float quatI = imu.getQuatI();
      float quatJ = imu.getQuatJ();
      float quatK = imu.getQuatK();
      float quatReal = imu.getQuatReal();

      // Converte para ângulos Euler (compatível com MPU6050)
      quaternionToEuler(quatReal, quatI, quatJ, quatK, 
                       ori.roll, ori.pitch, ori.yaw);

      ori.recalibra = false;  // padrão

      // Envia para o receptor
      esp_err_t result = esp_now_send(receiverMac, (uint8_t*)&ori, sizeof(ori));

      Serial.print("Send -> R:");
      Serial.print(ori.roll, 1);
      Serial.print(" P:");
      Serial.print(ori.pitch, 1);
      Serial.print(" Y:");
      Serial.print(ori.yaw, 1);
      Serial.print(" | status=");
      Serial.println((int)result);

      lastSend = now;
    }
  }
  
  // Pequeno delay para não sobrecarregar o loop
  delay(1);
}