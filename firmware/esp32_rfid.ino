#include <Wire.h>
#include <MFRC522_I2C.h>

const unsigned long BAUD_RATE = 115200;
const unsigned long SCAN_PAUSE_MS = 1000;

MFRC522_I2C mfrc522(0x28, -1);

// Return the UID of the badge just read, in upper-case hexadecimal (2 characters per byte)
String uidInHex()
{
  String uid = "";
  byte index = 0;
  while (index < mfrc522.uid.size)
  {
    if (mfrc522.uid.uidByte[index] < 16)
      uid += "0";
    uid += String(mfrc522.uid.uidByte[index], HEX);
    index++;
  }
  uid.toUpperCase();
  return uid;
}

// Start the USB serial link and the MFRC522 reader (I2C on pins 21 and 22)
void setup()
{
  Serial.begin(BAUD_RATE);
  Wire.begin(21, 22);
  mfrc522.PCD_Init();
  Serial.println("Badge reader ready");
}

// Wait for a badge, then print its UID on one line for the USB bridge of the kiosk PC
void loop()
{
  if (!mfrc522.PICC_IsNewCardPresent())
    return;
  if (!mfrc522.PICC_ReadCardSerial())
    return;
  Serial.print("UID read: ");
  Serial.println(uidInHex());
  mfrc522.PICC_HaltA();
  delay(SCAN_PAUSE_MS);
}
