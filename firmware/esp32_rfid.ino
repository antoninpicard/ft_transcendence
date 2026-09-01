#include <WiFi.h>
#include <Wire.h>
#include "secrets.h"
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <MFRC522_I2C.h>


IPAddress       serverIP;
MFRC522_I2C     mfrc522(0x28, -1);
const char*     mdnsName            = "transcendence";
const uint16_t  SERVER_PORT         = 3000;

String uidInHex()
{
  String s = "";
  for (byte i = 0; i < mfrc522.uid.size; i++)
  {
    if (mfrc522.uid.uidByte[i] < 16)
      s += "0";
    s += String(mfrc522.uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

void sendScan(const String& uid)
{
  HTTPClient  http;
  int         status;
  String      url     = "http://" + serverIP.toString() + ":" + String(SERVER_PORT) + "/api/scan";

  http.begin(url);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  String payload = "{\"uid\":\"" + uid + "\"}";
  status = http.POST(payload);

  if (status == 200)
    Serial.println("Scan sent successfully");
  else
  {
    Serial.print("Scan failed, code: ");
    Serial.println(status);
    Serial.println("Refreshing server IP via mDNS...");
    serverIP = MDNS.queryHost(mdnsName);
  }

  http.end();
}

void sendHello()
{
  HTTPClient http;
  String url = "http://" + serverIP.toString() + ":" + String(SERVER_PORT) + "/api/hello";

  http.begin(url);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  String payload = "{\"device\":\"esp32-badge\",\"status\":\"online\"}";
  int status = http.POST(payload);

  Serial.print("POST /api/hello -> status ");
  Serial.println(status);

  http.end();
}

void connectWifi()
{
  Serial.print("Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  mfrc522.PCD_Init();
  connectWifi();

  MDNS.begin("esp32-badge");

  serverIP = MDNS.queryHost(mdnsName);
  while (serverIP == IPAddress(0, 0, 0, 0))
  {
    Serial.println("mDNS: server not found, retrying...");
    delay(1000);
    serverIP = MDNS.queryHost(mdnsName);
  }

  Serial.print("mDNS: ");
  Serial.print(mdnsName);
  Serial.print(".local -> ");
  Serial.println(serverIP);

  sendHello();
}

void loop()
{
  if (WiFi.status() != WL_CONNECTED)
    connectWifi();
  if (!mfrc522.PICC_IsNewCardPresent())
    return;
  if (!mfrc522.PICC_ReadCardSerial())
    return;

  String uid = uidInHex();
  Serial.print("UID read: ");
  Serial.println(uid);

  sendScan(uid);
  mfrc522.PICC_HaltA();
  delay(1000);
}
