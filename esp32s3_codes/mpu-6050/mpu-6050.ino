#include <WiFi.h>
#include <esp_now.h>
#include <Wire.h>
#include <MPU6050_light.h>

MPU6050 mpu(Wire);

// ==================================================
// Estrutura de dados trocada via ESP‑NOW
// ==================================================
typedef struct {
  float roll;
  float pitch;
  float yaw;
  bool  recalibra;  // novo campo p/ pedir recalibração
} OrientationData;

OrientationData ori;
OrientationData recebido;

// ==================================================
// MAC do receptor (ESP32‑S3)
// ==================================================
uint8_t receiverMac[] = {0x34, 0xCD, 0xB0, 0x33, 0xA6, 0xF8};

// ==================================================
// Envio periódico (~20 Hz)
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
      Serial.println("Recalibrando MPU6050, mantenha o sensor parado...");
      mpu.calcOffsets();
      Serial.println("OK: Recalibração concluída!");
    }
  }
}

// ==================================================
// Inicializa o MPU6050
// ==================================================
void setupMPU() {
  Wire.begin(21, 22);  // I2C padrão DevKit V1

  byte status = mpu.begin();
  Serial.print(F("MPU6050 status: "));
  Serial.println(status);
  if (status != 0) {
    Serial.println(F("Erro no MPU6050. Verifique ligações/endereço."));
    while (true) delay(1000);
  }

  Serial.println(F("Calculando offsets, mantenha o sensor PARADO..."));
  delay(1000);
  mpu.calcOffsets();
  Serial.println(F("Calibração concluída!"));
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
// Setup
// ==================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  setupMPU();
  setupEspNow();
}

// ==================================================
// Loop principal
// ==================================================
void loop() {
  mpu.update();

  unsigned long now = millis();
  if (now - lastSend >= sendIntervalMs) {
    // preenche estrutura de envio
    ori.roll      = mpu.getAngleX();
    ori.pitch     = mpu.getAngleY();
    ori.yaw       = mpu.getAngleZ();
    ori.recalibra = false;  // padrão

    // envia para o receptor
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
