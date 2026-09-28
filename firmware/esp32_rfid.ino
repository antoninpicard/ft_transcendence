#include <WiFi.h>
#include <Wire.h>
#include "secrets.h"
#include "ca_cert.h"
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <MFRC522_I2C.h>
#include <time.h>


IPAddress        serverIP;
MFRC522_I2C      mfrc522(0x28, -1);
WiFiClientSecure secureClient;
const char*      mdnsName            = "transcendence";
const uint16_t   SERVER_PORT         = 3000;

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
  String      url     = "https://" + serverIP.toString() + ":" + String(SERVER_PORT) + "/api/scan";

  http.begin(secureClient, url);
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
  String url = "https://" + serverIP.toString() + ":" + String(SERVER_PORT) + "/api/hello";

  http.begin(secureClient, url);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);

  String payload = "{\"device\":\"esp32-badge\",\"status\":\"online\"}";
  int status = http.POST(payload);

  Serial.print("POST /api/hello -> status ");
  Serial.println(status);

  http.end();
}

// Sync the system clock via NTP: TLS certificate validation checks the cert's
// notBefore/notAfter dates, which requires a roughly correct clock. The ESP32
// has no battery-backed RTC, so it boots with a wrong (1970) clock every time.
void syncTime()
{
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("Syncing time via NTP");
  time_t now = time(nullptr);
  while (now < 8 * 3600 * 2)
  {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.println();
  Serial.print("Time synced: ");
  Serial.print(ctime(&now));
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
  syncTime();

  // Trust exactly the backend's own self-signed certificate (see ca_cert.h) instead
  // of skipping validation with setInsecure() — a MITM presenting any other cert,
  // even a valid one from a real CA, will be rejected.
  secureClient.setCACert(ROOT_CA_CERT);

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
