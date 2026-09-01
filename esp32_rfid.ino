#include <WiFi.h>
#include <Wire.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <MFRC522_I2C.h>


IPAddress       serverIP;
MFRC522_I2C     mfrc522(0x28, -1);
const char*     WIFI_SSID           = "POP-ANTO";
const char*     WIFI_PASSWORD       = "subnautica6003";
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
  HTTPClient http;
  String url = "http://" + serverIP.toString() + ":" + String(SERVER_PORT) + "/api/scan";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"uid\":\"" + uid + "\"}";
  int status = http.POST(payload);

  Serial.print("POST /api/scan -> statut ");
  Serial.println(status);

  http.end();
}

void sendHello()
{
  HTTPClient http;
  String url = "http://" + serverIP.toString() + ":" + String(SERVER_PORT) + "/api/hello";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"device\":\"esp32-badge\",\"status\":\"online\"}";
  int status = http.POST(payload);

  Serial.print("POST /api/hello -> statut ");
  Serial.println(status);

  http.end();
}

void connectWifi() 
{
  Serial.print("Connexion ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) 
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP ESP32 : ");
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
    Serial.println("mDNS : serveur introuvable, nouvelle tentative...");
    delay(1000);
    serverIP = MDNS.queryHost(mdnsName);
  }

  Serial.print("mDNS : ");
  Serial.print(mdnsName);
  Serial.print(".local -> ");
  Serial.println(serverIP);

  sendHello();
}

void loop() 
{
  if (!mfrc522.PICC_IsNewCardPresent()) 
    return;
  if (!mfrc522.PICC_ReadCardSerial())
    return;

  String uid = uidInHex();
  Serial.print("UID lu : ");
  Serial.println(uid);

  sendScan(uid);
  mfrc522.PICC_HaltA();
  delay(1000);
}