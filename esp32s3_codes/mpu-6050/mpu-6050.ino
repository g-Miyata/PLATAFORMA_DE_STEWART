#include <Wire.h>
#include <MPU6050_light.h>

MPU6050 mpu(Wire);
unsigned long timer = 0;

void setup() {
  Serial.begin(115200);

  // SDA = 18, SCL = 19
  Wire.begin(47, 48);

  byte status = mpu.begin();
  Serial.print(F("MPU6050 status: "));
  Serial.println(status);
  while (status != 0) { /* travado se der erro */ }

  Serial.println(F("Calculando offsets, não mexa no MPU6050..."));
  delay(1000);
  mpu.calcOffsets();
  Serial.println(F("Pronto!\n"));
}

void loop() {
  mpu.update();

  if (millis() - timer > 1000) {
    Serial.print("Pitch: ");
    Serial.print(mpu.getAngleX());
    Serial.print("\t|\tRoll: ");
    Serial.print(mpu.getAngleY());
    Serial.print("\t|\tYaw: ");
    Serial.println(mpu.getAngleZ());
    timer = millis();
  }
}
