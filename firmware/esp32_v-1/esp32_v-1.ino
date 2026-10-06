#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h> // MQTT over TLS ผ่าน Tailscale Funnel
#include <PubSubClient.h>     // MQTT client — ติดตั้งจาก Library Manager: "PubSubClient" by Nick O'Leary
#include <Preferences.h>      // เก็บค่าตั้งค่า (Wi-Fi/Token) ลง NVS ถาวร
#include <DNSServer.h>        // captive portal — ดึงหน้าตั้งค่าให้เด้งเอง
#include <ESPmDNS.h>          // เข้าหน้าเว็บของบอร์ดที่ http://plantpot-<deviceid>.local โดยไม่ต้องรู้ IP ของบอร์ด
#include <esp_system.h>       // esp_reset_reason() — บอร์ดรีเซ็ตเพราะอะไร (ไฟตก/watchdog/...)
#include <ArduinoOTA.h>       // อัปเดต firmware ผ่าน Wi-Fi จาก Arduino IDE (พอร์ตเครือข่าย "plantpot-<deviceid>")
#include <Update.h>           // อัปเดต firmware ด้วยไฟล์ .bin ผ่านหน้าเว็บ /update

// ============================================================================
//  วิ่งเพื่อชีวิตของต้นไม้ในกระถาง — ESP32 firmware (MQTT)
//  ต่อ MQTT broker ค้างไว้ → backend ส่งคำสั่งรดน้ำ/ปุ๋ยลงมาทันทีที่ผู้ใช้กด ไม่ต้องถามทุก 5 วิ
//  (รุ่น HTTP polling เดิมเก็บไว้ที่ firmware/esp32_polling/ — backend รองรับทั้งสองรุ่น)
//  *** ไม่มีค่าใดต้องแก้ในโค้ดนี้ — Wi-Fi / Device ID / Token ตั้งผ่านหน้าเว็บ ***
//  ครั้งแรก (ยังไม่ตั้งค่า) บอร์ดจะเปิด Wi-Fi ชื่อ "PlantPot-Setup" ให้เข้าไปกรอก
// ============================================================================

// ===== 1. Config (โหลดจาก NVS ตอน boot — ตั้งผ่าน Config Portal) =====
Preferences prefs;
String cfgSsid, cfgPass, cfgDeviceId, cfgToken, cfgApiBase;
// ค่าเริ่มต้นตอนยังไม่เคยตั้งค่า — แก้ได้ในฟอร์มตั้งค่า (AP) และที่หน้าเว็บ local (/setapi)
// รองรับทั้ง http://<ip>:3000 (backend ในวง LAN) และ https://xxx.ts.net (Tailscale Funnel — ใช้ได้ทุกที่)
// MQTT ใช้ host เดียวกัน: https:// → MQTT over TLS พอร์ต 8443 · http:// → MQTT ธรรมดาพอร์ต 1883
const char *DEFAULT_API_BASE = "http://192.168.1.134:3000";

// ===== 2. Config portal (AP mode) =====
const char *AP_SSID = "PlantPot-Setup"; // ชื่อ Wi-Fi ที่บอร์ดปล่อยตอนตั้งค่า
const byte DNS_PORT = 53;
DNSServer dnsServer;
bool configMode = false;    // true = อยู่ในโหมดตั้งค่า (AP)
const int BOOT_BTN_PIN = 0; // ปุ่ม BOOT — กดค้าง 3 วิตอนใช้งาน = ล้างค่า/ตั้งใหม่

// ===== 3. Pins =====
const int sensorPin = 34;
const int pumpPin = 27;
const int valveWaterPin = 32;
const int valveFertilizerPin = 33;

// ===== 4. Moisture calibration (raw ADC -> percent) =====
const int RAW_DRY = 2500; // raw ตอนแห้ง  -> 0%
const int RAW_WET = 1400; // raw ตอนจุ่มน้ำ -> 100%

// ===== 5. Auto rules / intervals =====
const int AUTO_WATER_ON_PCT = 10;              // เริ่มรดเมื่อ < นี้ (very dry)
const int AUTO_WATER_OFF_PCT = 25;             // หยุดเมื่อ > นี้ (กลับสู่ dry zone)
const unsigned long AUTO_WATER_MAX_MS = 60000; // safety cap — เปิดต่อเนื่องเกินนี้ = sensor น่าจะพัง
const unsigned long FERT_DURATION_MS = 5000;   // ปุ่มปุ๋ย local = 5 วิ
const unsigned long SENSOR_POST_MS = 300000;   // ส่งความชื้นทุก 5 นาที
const unsigned long WIFI_RETRY_MS = 30000;     // ลอง reconnect Wi-Fi ทุก 30 วิ เมื่อหลุด (ไม่ค้าง offline)

// ===== 5b. MQTT =====
const uint16_t MQTT_TLS_PORT = 8443;            // Funnel: tailscale funnel --bg --tls-terminated-tcp=8443 tcp://localhost:1883
const uint16_t MQTT_PLAIN_PORT = 1883;          // backend ในวง LAN (ไม่เข้ารหัส — ใช้ตอน dev)
const uint16_t MQTT_KEEPALIVE_S = 30;           // ping ทุก 30 วิ = heartbeat (backend ถือว่า offline ทันทีที่หลุด)
const unsigned long MQTT_RETRY_MS = 5000;       // ต่อไม่ติด → ลองใหม่ทุก 5 วิ
const unsigned long MQTT_AUTH_RETRY_MS = 60000; // token ผิด (เช่น เพิ่ง rotate) → ลองห่างขึ้น ไม่ถล่ม broker

// ===== 6. State =====
WebServer server(80);
bool mdnsUp = false; // เริ่ม mDNS responder แล้วหรือยัง
String netHostname = "plantpot"; // ชื่อในเครือข่าย — ตั้งตาม Device ID ใน setup() (makeHostname)

// ชื่อเครื่องในเครือข่ายตาม Device ID — หลายกระถางในบ้านเดียวกันจะได้ไม่ชนกัน
// "POT-001" → "plantpot-pot-001" ใช้เป็น mDNS (.local) · พอร์ต OTA ใน Arduino IDE · ชื่อที่โชว์ในหน้าเราเตอร์ (DHCP)
// hostname ใช้ได้แค่ a-z 0-9 และ - จึงแปลงตัวอื่นเป็น -
String makeHostname(const String &id)
{
  String h = "plantpot-";
  for (size_t i = 0; i < id.length() && h.length() < 40; i++)
  {
    char c = tolower((unsigned char)id[i]);
    h += isalnum((unsigned char)c) ? c : '-';
  }
  return h;
}

bool isFertilizing = false;
unsigned long fertStartTime = 0;
bool isManualWater = false;

bool autoWaterActive = false;
unsigned long autoWaterStartedAt = 0;
bool autoWaterLocked = false;

bool isCloudActive = false;
String cloudType = "";
long cloudCmdId = -1;
unsigned long cloudStart = 0;
unsigned long cloudDurationMs = 0;

unsigned long lastSensorPost = 0;
unsigned long lastWifiTry = 0;
unsigned long lastMqttTry = 0;
bool mqttAuthFailed = false; // ครั้งล่าสุดต่อไม่ติดเพราะ token ผิด
bool mqttWasUp = false;      // ใช้ log ตอนหลุด พร้อมสาเหตุ

long pendingAckId = -1; // ack ที่ยังส่งไม่ออก (MQTT หลุดตอนทำเสร็จ) — ส่งซ้ำตอนต่อกลับ
String pendingAckStatus = "";
long recentCmdIds[4] = {-1, -1, -1, -1}; // กันคำสั่งซ้ำ (QoS 1 ส่งซ้ำได้) — ปั๊มต้องไม่ทำงานสองรอบ
int recentCmdPos = 0;

// ===== 6b. Event log — ดูย้อนหลังได้ที่ http://plantpot-<deviceid>.local/log โดยไม่ต้องต่อ USB =====
const int EVLOG_SIZE = 30;
String evLogBuf[EVLOG_SIZE];
int evLogPos = 0;

// พิมพ์ลง Serial + เก็บลง RAM (หายเมื่อรีเซ็ต — แต่หน้า /log บอกสาเหตุการรีเซ็ตครั้งล่าสุดไว้)
void evlog(const char *fmt, ...)
{
  char buf[200];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  Serial.println(buf);
  unsigned long t = millis() / 1000;
  char stamp[24];
  snprintf(stamp, sizeof(stamp), "[%02lu:%02lu:%02lu] ", t / 3600, (t / 60) % 60, t % 60);
  evLogBuf[evLogPos] = String(stamp) + buf;
  evLogPos = (evLogPos + 1) % EVLOG_SIZE;
}

const char *resetReasonText()
{
  switch (esp_reset_reason())
  {
  case ESP_RST_POWERON:
    return "POWERON (เพิ่งเสียบไฟ)";
  case ESP_RST_BROWNOUT:
    return "BROWNOUT (ไฟตก — ปั๊ม/รีเลย์ดึงไฟ?)";
  case ESP_RST_SW:
    return "SW (รีสตาร์ทจากโค้ด เช่น บันทึกค่าตั้ง)";
  case ESP_RST_PANIC:
    return "PANIC (โปรแกรมพัง)";
  case ESP_RST_INT_WDT:
  case ESP_RST_TASK_WDT:
  case ESP_RST_WDT:
    return "WATCHDOG (loop ค้างนานเกินไป)";
  case ESP_RST_EXT:
    return "EXT (กดปุ่ม EN/RST)";
  default:
    return "OTHER";
  }
}

// ===== 7. NVS config helpers =====
// คืน true ถ้ามีค่าครบพอใช้งาน (Wi-Fi + Device ID + Token)
bool loadConfig()
{
  prefs.begin("plantcfg", true);
  cfgSsid = prefs.getString("ssid", "");
  cfgPass = prefs.getString("pass", "");
  cfgDeviceId = prefs.getString("devid", "");
  cfgToken = prefs.getString("token", "");
  cfgApiBase = prefs.getString("api", DEFAULT_API_BASE);
  prefs.end();
  return cfgSsid.length() > 0 && cfgDeviceId.length() > 0 && cfgToken.length() > 0;
}

void saveConfig(const String &ssid, const String &pass, const String &devid,
                const String &token, const String &api)
{
  prefs.begin("plantcfg", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("devid", devid);
  prefs.putString("token", token);
  prefs.putString("api", api.length() ? api : String(DEFAULT_API_BASE));
  prefs.end();
}

void clearConfig()
{
  prefs.begin("plantcfg", false);
  prefs.clear();
  prefs.end();
}

// ===== 8. Hardware helpers =====
int readMoisturePercent()
{
  int raw = analogRead(sensorPin);
  long p = map(raw, RAW_DRY, RAW_WET, 0, 100);
  if (p < 0)
    p = 0;
  if (p > 100)
    p = 100;
  return (int)p;
}

// ===== 8b. ลำดับวาล์ว > ปั๊ม =====
// เปิด: valve Open > รอ VALVE_DELAY_MS > pump On
// ปิด: valve Close > ปั๊มยังดูดต่อ PUMP_LAG_MS > pump Off (ดูดน้ำในสายให้หมด)
// ⚠️ ใช้ได้เพราะวาล์วอยู่ฝั่งดูด (ถัง > วาล์ว > ปั๊ม) — ถ้าวาล์วอยู่หลังปั๊ม ลำดับปิดแบบนี้จะทำให้ปั๊มดันใส่วาล์วปิด
// openWaterValve()/openFertilizerValve()/closeAll() แค่ตั้งเป้าหมาย — ของจริงสั่งใน updateOutputs() (ห้ามมี delay())
// ปิดทันทีแบบไม่ดูดสาย (บูต/OTA/reset/ปุ่ม BOOT) ใช้ emergencyStop()

const unsigned long VALVE_DELAY_MS = 200; // เปิดวาล์วก่อนปั้ม 0.2 วิ
const unsigned long PUMP_LAG_MS = 500;    // ปั้มยังดูดต่อ 0.5 วิ

enum OutMode
{
  OUT_OFF,
  OUT_WATER,
  OUT_FERTILIZER
};
enum OutStage
{
  ST_IDLE,
  ST_VALVE_LEAD,
  ST_RUNNING,
  ST_PURGING
};
void setValves(OutMode m);

OutMode wantMode = OUT_OFF; // ผู้ใช้/ระบบอยากให้ทำอะไร (manual/auto/cloud)
OutMode runMode = OUT_OFF;  // ปัจจุบันกำลังทำอะไรอยู่ (valve/pump)
OutStage outStage = ST_IDLE;
unsigned long outStageAt = 0;

void setValves(OutMode m)
{
  digitalWrite(valveWaterPin, m == OUT_WATER ? LOW : HIGH); // LOW = ON, HIGH = OFF
  digitalWrite(valveFertilizerPin, m == OUT_FERTILIZER ? LOW : HIGH);
}
void setPump(bool on) { digitalWrite(pumpPin, on ? LOW : HIGH); } // LOW = ON, HIGH = OFF

void openWaterValve() { wantMode = OUT_WATER; }
void openFertilizerValve() { wantMode = OUT_FERTILIZER; }
void closeAll() { wantMode = OUT_OFF; } // ปิดแบบมีลำดับ (ดูดสายก่อน)
bool outputsIdle() { return outStage == ST_IDLE; }

// ปั้มปิดก่อนวาล์ว
void emergencyStop()
{
  setPump(false);
  setValves(OUT_OFF);
  wantMode = runMode = OUT_OFF;
  outStage = ST_IDLE;
}

// เรียกใช้ใน loop() — ควบคุมลำดับ valve > pump
void updateOutputs(unsigned long now)
{
  switch (outStage)
  {
  case ST_IDLE:
    if (wantMode != OUT_OFF)
    {
      runMode = wantMode;
      setValves(runMode);
      outStage = ST_VALVE_LEAD;
      outStageAt = now;
      evlog("[out] %s valve open", runMode == OUT_WATER ? "water" : "fertilizer");
    }
    break;
  case ST_VALVE_LEAD:
    if (wantMode != runMode)
    { // ถูกยกเลิกก่อนปั๊มติด — ปิดวาล์วเลย ไม่ต้องดูดสาย
      setValves(OUT_OFF);
      runMode = OUT_OFF;
      outStage = ST_IDLE;
      evlog("[out] cancelled before pump start");
    }
    else if (now - outStageAt >= VALVE_DELAY_MS)
    {
      setPump(true);
      outStage = ST_RUNNING;
      evlog("[out] pump on");
    }
    break;
  case ST_RUNNING:
    if (wantMode != runMode)
    { // สั่งปิด หรือสลับน้ำ↔ปุ๋ย → ดูดสายก่อนเสมอ
      setValves(OUT_OFF);
      outStage = ST_PURGING;
      outStageAt = now;
      evlog("[out] valve closed -> purging line");
    }
    break;
  case ST_PURGING: // ดูดให้ครบก่อน แม้ wantMode จะเปลี่ยนกลับมา
    if (now - outStageAt >= PUMP_LAG_MS)
    {
      setPump(false);
      runMode = OUT_OFF;
      outStage = ST_IDLE;
      evlog("[out] pump off");
    }
    break;
  }
}

// ===== 9. Cloud client (MQTT) =====
// ต่อ broker ครั้งเดียวแล้วค้างไว้ — backend "ส่ง" คำสั่งลงมาเอง (push) ไม่ต้องถามทุก 5 วิ
//   subscribe  plant/<id>/cmd     ← {id, type, durationSeconds}
//   publish    plant/<id>/ack     → {id, status}
//   publish    plant/<id>/sensor  → {moisturePercent}
//   publish    plant/<id>/status  → "online" (retained) · "offline" = Last Will ที่ broker ส่งแทนเมื่อบอร์ดหลุด
// ยืนยันตัวตน: username = Device ID, password = Device Token (ตัวเดียวกับที่ใช้กับเว็บ)
WiFiClientSecure mqttSecure; // https:// → MQTT over TLS
WiFiClient mqttPlain;        // http://  → MQTT ธรรมดา (วง LAN)
PubSubClient mqtt;
String mqttHost; // ต้องเป็น global — PubSubClient เก็บแค่ pointer ของ host ไว้
uint16_t mqttPort = 0;
String topicCmd, topicAck, topicSensor, topicStatus;

bool usingHttps() { return cfgApiBase.startsWith("https://"); }

// ดึง host ออกจาก Server URL: "https://respi.xxx.ts.net" / "http://192.168.1.134:3000" → host อย่างเดียว
String hostFromUrl(const String &url)
{
  String s = url;
  int p = s.indexOf("://");
  if (p >= 0)
    s = s.substring(p + 3);
  int end = s.length();
  int colon = s.indexOf(':'), slash = s.indexOf('/');
  if (colon >= 0 && colon < end)
    end = colon;
  if (slash >= 0 && slash < end)
    end = slash;
  return s.substring(0, end);
}

// เรียกตอน boot และทุกครั้งที่ Server URL เปลี่ยน (/setapi)
void mqttSetup()
{
  topicCmd = "plant/" + cfgDeviceId + "/cmd";
  topicAck = "plant/" + cfgDeviceId + "/ack";
  topicSensor = "plant/" + cfgDeviceId + "/sensor";
  topicStatus = "plant/" + cfgDeviceId + "/status";

  if (mqtt.connected())
    mqtt.disconnect();
  mqttHost = hostFromUrl(cfgApiBase);
  if (usingHttps())
  {
    // ไม่ verify certificate — ESP32 ไม่มีนาฬิกาจริงตอนบูตและ root CA กินแฟลช
    // ข้อมูลยังถูกเข้ารหัสระหว่างทาง (token ไม่โผล่บนเน็ต) แค่ไม่กัน MITM แบบเต็มรูปแบบ
    mqttSecure.setInsecure();
    mqttSecure.setHandshakeTimeout(8); // วินาที — กัน TLS handshake ค้างนานจน loop สะดุด
    mqtt.setClient(mqttSecure);
    mqttPort = MQTT_TLS_PORT;
  }
  else
  {
    mqtt.setClient(mqttPlain);
    mqttPort = MQTT_PLAIN_PORT;
  }
  mqtt.setServer(mqttHost.c_str(), mqttPort);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(8);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onMqttMessage);
  lastMqttTry = millis() - MQTT_RETRY_MS; // ต่อทันทีในรอบ loop ถัดไป
}

void flushPendingAck()
{
  if (pendingAckId < 0 || !mqtt.connected())
    return;
  String body = String("{\"id\":") + pendingAckId + ",\"status\":\"" + pendingAckStatus + "\"}";
  if (mqtt.publish(topicAck.c_str(), body.c_str()))
  {
    evlog("[ack] id=%ld status=%s", pendingAckId, pendingAckStatus.c_str());
    pendingAckId = -1;
  }
}

// ยังไม่ได้ต่อก็ไม่หาย — เก็บไว้ส่งตอนต่อกลับ (backend รอได้ 180 วิก่อน cleanup คืนแต้ม)
void ackCommand(long id, const char *status)
{
  pendingAckId = id;
  pendingAckStatus = status;
  flushPendingAck();
}

bool mqttConnect()
{
  String clientId = "plantpot-" + cfgDeviceId;
  evlog("[mqtt] connecting %s:%u ...", mqttHost.c_str(), mqttPort);
  // Last Will: ถ้าบอร์ดหลุดโดยไม่บอกลา broker จะประกาศ "offline" แทน
  bool ok = mqtt.connect(clientId.c_str(), cfgDeviceId.c_str(), cfgToken.c_str(),
                         topicStatus.c_str(), 1, true, "offline");
  if (!ok)
  {
    int st = mqtt.state();
    mqttAuthFailed = (st == MQTT_CONNECT_BAD_CREDENTIALS || st == MQTT_CONNECT_UNAUTHORIZED);
    evlog("[mqtt] connect failed state=%d%s", st,
          mqttAuthFailed ? " (token ไม่ถูกต้อง — rotate แล้วหรือยัง? วาง token ใหม่ที่ช่องเปลี่ยน Token บนหน้าเว็บของบอร์ด)" : "");
    return false;
  }
  mqttAuthFailed = false;
  mqtt.publish(topicStatus.c_str(), "online", true);
  mqtt.subscribe(topicCmd.c_str(), 1); // backend ส่งคำสั่งที่ค้างระหว่างออฟไลน์ให้หลัง subscribe
  evlog("[mqtt] connected (rssi=%d)", WiFi.RSSI());
  flushPendingAck();
  lastSensorPost = millis() - SENSOR_POST_MS; // ส่งความชื้นทันทีที่ต่อได้
  return true;
}

void publishSensor()
{
  int pct = readMoisturePercent();
  // ip = ที่อยู่ในวง LAN → เว็บหลักใช้ทำลิงก์สำรองไปหน้าเว็บบอร์ด (มือถือ Android บางรุ่นเปิดชื่อ .local ไม่ได้)
  String body = String("{\"moisturePercent\":") + pct + ",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
  bool ok = mqtt.publish(topicSensor.c_str(), body.c_str());
  evlog("[sensor] publish %s  pct=%d", ok ? "ok" : "FAILED", pct);
}

bool extractJsonInt(const String &s, const String &key, long *out)
{
  int k = s.indexOf("\"" + key + "\":");
  if (k < 0)
    return false;
  k += key.length() + 3;
  while (k < (int)s.length() && s[k] == ' ')
    k++;
  *out = s.substring(k).toInt();
  return true;
}
bool extractJsonStr(const String &s, const String &key, String *out)
{
  int k = s.indexOf("\"" + key + "\":\"");
  if (k < 0)
    return false;
  k += key.length() + 4;
  int e = s.indexOf('"', k);
  if (e < 0)
    return false;
  *out = s.substring(k, e);
  return true;
}

bool seenCommand(long id)
{
  for (long r : recentCmdIds)
    if (r == id)
      return true;
  return false;
}
void rememberCommand(long id)
{
  recentCmdIds[recentCmdPos] = id;
  recentCmdPos = (recentCmdPos + 1) % 4;
}

// callback จาก mqtt.loop() — มีคำสั่งใหม่ส่งลงมา
void onMqttMessage(char *topic, byte *payload, unsigned int len)
{
  if (topicCmd != topic)
    return;
  String msg;
  msg.reserve(len);
  for (unsigned int i = 0; i < len; i++)
    msg += (char)payload[i];

  long id = -1;
  String type;
  long dur = 5;
  if (!extractJsonInt(msg, "id", &id) || !extractJsonStr(msg, "type", &type))
  {
    Serial.printf("[cmd] bad payload: %s\n", msg.c_str());
    return;
  }
  extractJsonInt(msg, "durationSeconds", &dur);
  if (dur < 1)
    dur = 1;
  if (dur > 120)
    dur = 120;

  if (seenCommand(id))
  { // QoS 1 ส่งซ้ำ — ทำไปแล้ว ไม่รดซ้ำ
    evlog("[cmd] duplicate id=%ld ignored", id);
    return;
  }
  rememberCommand(id);
  if (isCloudActive)
  { // backend ส่งทีละคำสั่งอยู่แล้ว — ถ้ามาซ้อนแปลว่าสถานะไม่ตรงกัน
    evlog("[cmd] busy with id=%ld -> reject id=%ld", cloudCmdId, id);
    ackCommand(id, "failed"); // คืนแต้มทันที ดีกว่าให้ผู้ใช้รอ cleanup
    return;
  }

  evlog("[cmd] start id=%ld type=%s dur=%lds", id, type.c_str(), dur);
  cloudCmdId = id;
  cloudType = type;
  cloudDurationMs = (unsigned long)dur * 1000 + VALVE_DELAY_MS;
  cloudStart = millis();
  isCloudActive = true;

  if (type == "water")
  {
    openWaterValve();
  }
  else if (type == "fertilizer")
  {
    openFertilizerValve();
  }
  else
  {
    isCloudActive = false;
    closeAll();
    ackCommand(id, "failed");
  }
}

// ===== 10. Config Portal (AP) — หน้าตั้งค่าผ่านเว็บ ไม่ต้องใช้ Arduino =====
String htmlEscape(const String &s)
{
  String o;
  o.reserve(s.length());
  for (size_t i = 0; i < s.length(); i++)
  {
    char c = s[i];
    if (c == '"')
      o += "&quot;";
    else if (c == '<')
      o += "&lt;";
    else if (c == '>')
      o += "&gt;";
    else if (c == '&')
      o += "&amp;";
    else
      o += c;
  }
  return o;
}

// ===== 10a. หน้าเว็บบนบอร์ด — ธีมเดียวกับเว็บหลัก (Bright Nature glassmorphism) =====
// สีตรงกับ frontend/tailwind.config.js: plant (เขียว) · sky2 (ฟ้า/น้ำ) · sun (ส้ม) · forest (ตัวอักษร)
// ฟอนต์โหลดแบบไม่บล็อก (media=print) — ตอนอยู่โหมด PlantPot-Setup ไม่มีเน็ต หน้าเว็บยังขึ้นทันทีด้วยฟอนต์เครื่อง
static const char PAGE_CSS[] PROGMEM = R"css(
*{box-sizing:border-box}
body{margin:0;min-height:100vh;color:#0B1F18;font-family:"Noto Sans Thai",-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;
background:radial-gradient(ellipse 60% 40% at 0 0,rgba(125,211,252,.4),transparent 60%),radial-gradient(ellipse 50% 35% at 100% 0,rgba(255,179,71,.22),transparent 60%),radial-gradient(ellipse 70% 50% at 50% 100%,rgba(94,214,145,.32),transparent 65%),linear-gradient(180deg,#F4FAF5,#FAFEFB 60%,#EFF8F2);background-attachment:fixed}
.wrap{max-width:460px;margin:0 auto;padding:16px 16px 40px}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 2px 16px}
.brand{font-family:"Space Grotesk","Noto Sans Thai",sans-serif;font-weight:700;letter-spacing:.08em;font-size:14px;color:#2E4A36;text-decoration:none}
.brand b{background:linear-gradient(90deg,#0EA15A,#076635);-webkit-background-clip:text;background-clip:text;color:transparent}
.card{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.7);border-radius:24px;padding:20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,42,30,.05),0 8px 24px -10px rgba(15,42,30,.1)}
.eye{font-size:10px;text-transform:uppercase;letter-spacing:.22em;color:#42624A;font-weight:600;margin:0 0 12px}
h1{font-family:"Space Grotesk","Noto Sans Thai",sans-serif;font-size:20px;margin:0;color:#0B1F18}
.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace}
.mut{color:#42624A;font-size:13px;line-height:1.6;margin:0}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.06em;border:1px solid rgba(255,255,255,.6);background:rgba(255,255,255,.45);color:#5E8267;white-space:nowrap}
.chip i{width:6px;height:6px;border-radius:50%;background:currentColor}
.ok{background:rgba(197,248,216,.75);color:#076635;border-color:rgba(95,212,145,.5)}
.ok i{box-shadow:0 0 8px rgba(14,161,90,.6)}
.bad{background:#FFF1F2;color:#BE123C;border-color:#FECDD3}
.warn{background:#FFF7E8;color:#B85100;border-color:#FFE6BC}
.note{border:1px solid;border-radius:14px;padding:10px 12px;font-size:13px;line-height:1.55;margin:0 0 14px}
.btn{display:block;width:100%;text-align:center;border:0;border-radius:14px;padding:12px 14px;font:inherit;font-size:14px;font-weight:700;color:#fff;cursor:pointer;text-decoration:none;background:linear-gradient(90deg,#2EBE73,#0A8347);box-shadow:0 6px 18px -6px rgba(14,161,90,.55);transition:transform .1s,filter .2s}
.btn:hover{filter:brightness(1.05)}.btn:active{transform:scale(.97)}.btn:disabled{opacity:.6}
.water{background:linear-gradient(135deg,#38BDF8,#0284C7);box-shadow:0 6px 18px -6px rgba(14,165,233,.55)}
.sun{background:linear-gradient(135deg,#FFB347,#E76A00);box-shadow:0 6px 18px -6px rgba(231,106,0,.5)}
.out{background:rgba(255,255,255,.5);color:#1F3527;border:1px solid #B0C7B5;box-shadow:none;font-weight:600}
.danger{background:rgba(255,255,255,.6);color:#BE123C;border:1px solid #FECDD3;box-shadow:none;font-weight:600}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
label{display:block;font-size:12px;font-weight:600;color:#2E4A36;margin:0 0 6px}
input,select{width:100%;background:rgba(255,255,255,.7);border:1px solid #B0C7B5;border-radius:12px;padding:11px 13px;font:inherit;font-size:14px;color:#0B1F18;margin:0 0 10px;outline:none}
input:focus,select:focus{border-color:#2EBE73;box-shadow:0 0 0 3px rgba(46,190,115,.18)}
.hint{font-size:11px;color:#5E8267;font-weight:400}
input::placeholder{font-family:"Noto Sans Thai",-apple-system,"Segoe UI",sans-serif;color:#85A48C}
.sep{height:1px;background:linear-gradient(90deg,transparent,rgba(176,199,181,.7),transparent);margin:20px 0}
.gauge{position:relative;width:180px;height:180px;margin:4px auto 10px}
.gauge svg{transform:rotate(-90deg);display:block}
.gauge .v{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.big{font-family:"Space Grotesk",sans-serif;font-size:46px;font-weight:700;line-height:1;background:linear-gradient(90deg,#38BDF8,#0284C7);-webkit-background-clip:text;background-clip:text;color:transparent}
.big small{font-size:20px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px}
.kv span:nth-child(odd){color:#42624A}.kv span:nth-child(even){font-weight:600;word-break:break-word}
pre{white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.7;margin:0;color:#15291F}
.foot{text-align:center;font-size:11px;color:#85A48C;margin-top:18px;line-height:1.8}
a{color:#0284C7}
)css";

String pageHead(const String &title)
{
  String h;
  h.reserve(6500);
  h = "<!DOCTYPE html><html lang=\"th\"><head><meta charset=\"UTF-8\">"
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"theme-color\" content=\"#F4FAF5\"><title>";
  h += title;
  h += "</title><link rel=\"stylesheet\" media=\"print\" onload=\"this.media='all'\" "
       "href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;700&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono&display=swap\">"
       "<style>";
  h += PAGE_CSS;
  h += "</style></head><body><div class=\"wrap\">";
  return h;
}

String topBar(const String &right)
{
  return "<div class=\"top\"><a class=\"brand\" href=\"/\">R⇢ <b>RUN→GROW</b></a>" + right + "</div>";
}

const char *PAGE_END = "</div></body></html>";

String mqttChip()
{
  if (mqtt.connected())
    return "<span class=\"chip ok\"><i></i>LIVE</span>";
  if (mqttAuthFailed)
    return "<span class=\"chip bad\"><i></i>TOKEN ไม่ถูกต้อง</span>";
  return "<span class=\"chip warn\"><i></i>กำลังเชื่อมต่อ</span>";
}

// หน้าข้อความสั้น (บันทึกแล้ว / กรอกผิด / กำลังรีสตาร์ท) — การ์ดเดียวกลางจอ
void sendNotice(int code, const String &title, const String &msg, const String &href, const String &label)
{
  String h = pageHead(title);
  h += "<div class=\"card\" style=\"text-align:center;margin-top:12vh;padding:28px 22px\"><h1>";
  h += title;
  h += "</h1><p class=\"mut\" style=\"margin:10px 0 20px\">";
  h += msg;
  h += "</p>";
  if (href.length())
    h += "<a class=\"btn\" href=\"" + href + "\">" + label + "</a>";
  h += "</div>";
  h += PAGE_END;
  server.send(code, "text/html; charset=utf-8", h);
}

void handleConfigRoot()
{
  // ถ้าเคยตั้ง Token แล้ว บอกผู้ใช้ว่าเว้นว่างได้ (แก้ Wi-Fi อย่างเดียว) — #2
  String tokPh = cfgToken.length() ? "เว้นว่าง = ใช้ Token เดิม" : "วาง Token ที่ได้จากเว็บหลัก";
  String h = pageHead("ตั้งค่ากระถาง");
  h += topBar("<span class=\"chip warn\"><i></i>SETUP</span>");
  h += "<div class=\"card\"><h1>🌱 ตั้งค่ากระถาง</h1>"
       "<p class=\"mut\" style=\"margin:6px 0 18px\">กรอก Wi-Fi บ้าน และวาง Token จากหน้า “เพิ่มกระถาง” บนเว็บหลัก</p>"
       "<form method=\"POST\" action=\"/save\">"
       "<label>📶 Wi-Fi ที่บ้าน</label>"
       "<select id=\"ssidsel\" onchange=\"document.getElementById('ssid').value=this.value\"><option>— กำลังสแกน… —</option></select>"
       "<input id=\"ssid\" name=\"ssid\" placeholder=\"ชื่อ Wi-Fi\" value=\"";
  h += htmlEscape(cfgSsid);
  h += "\"><label>รหัส Wi-Fi</label><input name=\"pass\" type=\"password\" placeholder=\"รหัสผ่าน Wi-Fi\">"
       "<div class=\"sep\" style=\"margin:10px 0 16px\"></div>"
       "<label>Device ID</label><input class=\"mono\" name=\"devid\" placeholder=\"เช่น POT-001\" value=\"";
  h += htmlEscape(cfgDeviceId);
  h += "\"><label>🔑 Device Token</label><input class=\"mono\" name=\"token\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" placeholder=\"";
  h += tokPh;
  h += "\"><label>🌐 Server URL <span class=\"hint\">· https:// = MQTT พอร์ต 8443 · http:// = 1883 · เว้นว่าง = ค่าเดิม</span></label>"
       "<input class=\"mono\" name=\"api\" value=\"";
  h += htmlEscape(cfgApiBase.length() ? cfgApiBase : String(DEFAULT_API_BASE));
  h += "\"><button class=\"btn\" type=\"submit\" style=\"margin-top:6px\">บันทึก แล้วเชื่อมต่อ</button></form></div>"
       "<div class=\"foot\">กระถางจะรีสตาร์ทแล้วต่อ Wi-Fi บ้าน · Wi-Fi “";
  h += AP_SSID;
  h += "” จะหายไปเอง</div>"
       "<script>fetch('/scan').then(function(r){return r.json()}).then(function(list){var s=document.getElementById('ssidsel');"
       "s.innerHTML='<option value=\"\">— เลือกจากที่สแกนเจอ —</option>';"
       "list.forEach(function(n){var o=document.createElement('option');o.value=n;o.textContent=n;s.appendChild(o);});});</script>";
  h += PAGE_END;
  server.send(200, "text/html; charset=utf-8", h);
}

void handleScan()
{
  int n = WiFi.scanNetworks();
  String json = "[";
  for (int i = 0; i < n; i++)
  {
    if (i)
      json += ",";
    String ssid = WiFi.SSID(i);
    ssid.replace("\\", "\\\\");
    ssid.replace("\"", "\\\"");
    json += "\"" + ssid + "\"";
  }
  json += "]";
  WiFi.scanDelete();
  server.send(200, "application/json", json);
}

void handleSave()
{
  String ssid = server.arg("ssid");
  ssid.trim();
  String pass = server.arg("pass");
  String devid = server.arg("devid");
  devid.trim();
  String token = server.arg("token");
  token.trim();
  String api = server.arg("api");
  api.trim();

  // เว้นว่าง = ใช้ค่าเดิมใน NVS (แก้ Wi-Fi อย่างเดียวได้โดยไม่ต้องมี Token/Device ID ซ้ำ) — #2
  if (token.length() == 0)
    token = cfgToken;
  if (devid.length() == 0)
    devid = cfgDeviceId;
  if (api.length() == 0)
    api = cfgApiBase;

  if (ssid.length() == 0)
  {
    sendNotice(400, "⚠ กรอกไม่ครบ", "ต้องมีชื่อ Wi-Fi", "/", "← กลับไปแก้");
    return;
  }
  if (devid.length() == 0 || token.length() == 0)
  {
    sendNotice(400, "⚠ กรอกไม่ครบ", "ครั้งแรกต้องกรอก Device ID และ Token ด้วย", "/", "← กลับไปแก้");
    return;
  }
  saveConfig(ssid, pass, devid, token, api);
  sendNotice(200, "✓ บันทึกแล้ว", "กระถางกำลังรีสตาร์ทและเชื่อมต่อ Wi-Fi บ้าน…<br>ต่อมือถือกลับ Wi-Fi บ้าน แล้วปิดหน้านี้ได้เลย", "", "");
  Serial.println("[config] saved -> restarting");
  delay(1500);
  ESP.restart();
}

// captive portal — ทุก URL แปลก ๆ เด้งกลับหน้าตั้งค่า
void handleCaptive()
{
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  server.send(302, "text/plain", "");
}

void startConfigPortal()
{
  configMode = true;
  Serial.println("[config] starting setup portal (AP)");
  WiFi.persistent(false);
  WiFi.disconnect(true, true); // ตัด STA + ล้าง creds ใน RAM กัน auto-retry รบกวน AP/scan — #3
  WiFi.mode(WIFI_AP_STA);      // AP_STA เพื่อให้สแกน Wi-Fi ได้ระหว่างเปิด AP
  WiFi.softAP(AP_SSID);        // เปิดแบบไม่มีรหัส — ต่อง่าย
  delay(300);
  Serial.print("[config] AP IP: ");
  Serial.println(WiFi.softAPIP());
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  server.on("/", handleConfigRoot);
  server.on("/scan", handleScan);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleCaptive);
  server.begin();
}

// ===== 11. Local web UI (โหมดใช้งานปกติ) =====
void handleRoot()
{
  int pct = readMoisturePercent();
  String html = pageHead("กระถาง " + htmlEscape(cfgDeviceId));
  html.reserve(12000);
  html += topBar(mqttChip());

  // ความชื้น — วงแหวนแบบเดียวกับ MoistureGauge บนเว็บหลัก (r=78 → เส้นรอบวง 490.1)
  html += "<div class=\"card\" style=\"text-align:center\"><p class=\"eye mono\">";
  html += htmlEscape(cfgDeviceId);
  html += "</p><div class=\"gauge\"><svg width=\"180\" height=\"180\" viewBox=\"0 0 180 180\">"
          "<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#38BDF8\"/><stop offset=\"1\" stop-color=\"#2EBE73\"/></linearGradient></defs>"
          "<circle cx=\"90\" cy=\"90\" r=\"78\" fill=\"none\" stroke=\"rgba(176,199,181,.35)\" stroke-width=\"12\"/>"
          "<circle id=\"arc\" cx=\"90\" cy=\"90\" r=\"78\" fill=\"none\" stroke=\"url(#g)\" stroke-width=\"12\" stroke-linecap=\"round\" "
          "stroke-dasharray=\"490.1\" style=\"transition:stroke-dashoffset .6s\" stroke-dashoffset=\"";
  html += String(490.1f * (100 - pct) / 100.0f, 1);
  html += "\"/></svg><div class=\"v\"><div class=\"big\"><span id=\"pct\">";
  html += String(pct);
  html += "</span><small>%</small></div><div class=\"eye\" style=\"margin:8px 0 0\">SOIL MOISTURE</div></div></div>"
          "<p class=\"mut\">ออโต้ — รดน้ำเมื่อต่ำกว่า ";
  html += String(AUTO_WATER_ON_PCT);
  html += "% · หยุดเมื่อเกิน ";
  html += String(AUTO_WATER_OFF_PCT);
  html += "%</p></div>";

  // ควบคุมด้วยมือ
  html += "<div class=\"card\"><p class=\"eye\">MANUAL CONTROL</p><div style=\"margin:0 0 14px\">";
  if (isCloudActive)
    html += "<span class=\"chip ok\"><i></i>กำลังทำคำสั่งจากเว็บ (" + htmlEscape(cloudType) + ")</span>";
  else if (isManualWater)
    html += "<span class=\"chip warn\"><i></i>เปิดน้ำค้างไว้ · ออโต้หยุดชั่วคราว</span>";
  else
    html += "<span class=\"chip\"><i></i>ออโต้ทำงานปกติ</span>";
  html += "</div><div class=\"row\"><a class=\"btn water\" href=\"/on\">💧 เปิดน้ำ</a><a class=\"btn out\" href=\"/off\">ปิด · กลับออโต้</a></div>"
          "<button class=\"btn sun\" style=\"margin-top:10px\" onclick=\"fert(this)\">🌿 จ่ายปุ๋ย 5 วินาที</button></div>";

  // ตั้งค่า — เรียงตามที่ใช้บ่อย: Token → Server URL → ล้างทั้งหมด
  html += "<div class=\"card\" id=\"settings\"><p class=\"eye\">SETTINGS</p>";
  if (server.arg("saved") == "token")
    html += "<div class=\"note ok\">✓ บันทึก Token แล้ว — กำลังเชื่อมต่อใหม่ รีเฟรชในอีกราว 10 วินาที ป้ายมุมขวาบนควรเป็น LIVE</div>";
  else if (mqttAuthFailed)
    html += "<div class=\"note bad\">Token ไม่ถูกต้อง — ถ้าเพิ่งกด “ขอ Token ใหม่” บนเว็บหลัก ให้วาง Token ใหม่ด้านล่าง</div>";
  html += "<form method=\"POST\" action=\"/settoken\"><label>🔑 เปลี่ยน Token</label>"
          "<input class=\"mono\" name=\"token\" placeholder=\"วาง Token ใหม่ (64 ตัว)\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\" required>"
          "<button class=\"btn\" type=\"submit\">บันทึก Token</button></form>"
          "<p class=\"mut\" style=\"margin-top:8px;font-size:12px\">ใช้หลังกดขอ Token ใหม่บนเว็บหลัก · Wi-Fi และค่าอื่นคงเดิม ไม่ต้องรีบูต</p>"
          "<div class=\"sep\"></div>"
          "<form method=\"POST\" action=\"/setapi\"><label>🌐 Server URL</label><input class=\"mono\" name=\"api\" value=\"";
  html += htmlEscape(cfgApiBase);
  html += "\"><button class=\"btn out\" type=\"submit\">บันทึก Server URL</button></form>"
          "<div class=\"sep\"></div>"
          "<label>📶 เปลี่ยน Wi-Fi / Device ID</label><p class=\"mut\" style=\"margin:0 0 12px;font-size:12px\">ล้างค่าทั้งหมด แล้วเปิด Wi-Fi “";
  html += AP_SSID;
  html += "” ให้ตั้งค่าใหม่จากมือถือ</p>"
          "<a class=\"btn danger\" href=\"/reset\" onclick=\"return confirm('ล้างค่าทั้งหมดแล้วกลับเข้าโหมดตั้งค่า?')\">ตั้งค่าใหม่ทั้งหมด</a></div>";

  // เครื่องมือ + ข้อมูลเครือข่าย
  html += "<div class=\"row\"><a class=\"btn out\" href=\"/log\">📜 ดู Log</a><a class=\"btn out\" href=\"/update\">⬆️ อัปเดต Firmware</a></div>"
          "<div class=\"foot mono\">";
  html += netHostname + ".local · " + WiFi.localIP().toString() + "<br>MQTT " + htmlEscape(mqttHost) + ":" + String(mqttPort);
  html += "</div><script>"
          "var C=490.1;setInterval(function(){fetch('/moisture').then(function(r){return r.json()}).then(function(d){"
          "document.getElementById('pct').textContent=d.pct;document.getElementById('arc').style.strokeDashoffset=(C*(100-d.pct)/100).toFixed(1)})},3000);"
          "function fert(b){b.disabled=true;b.textContent='กำลังจ่ายปุ๋ย…';fetch('/fertilizer').then(function(){setTimeout(function(){"
          "b.textContent='✓ จ่ายปุ๋ยแล้ว';setTimeout(function(){b.disabled=false;b.textContent='🌿 จ่ายปุ๋ย 5 วินาที'},2500)},5000)})}"
          "</script>";
  html += PAGE_END;
  server.send(200, "text/html; charset=utf-8", html);
}

void handleOn()
{
  isManualWater = true;
  server.sendHeader("Location", "/");
  server.send(303);
}
void handleOff()
{
  isManualWater = false;
  server.sendHeader("Location", "/");
  server.send(303);
}
// หน้าเว็บบอร์ดดึงทุก 3 วิ — pct = ค่าเดียวกับที่ส่งขึ้นเว็บหลัก · raw = ค่า ADC ไว้ calibrate
void handleMoisture()
{
  server.send(200, "application/json", String("{\"pct\":") + readMoisturePercent() + ",\"raw\":" + analogRead(sensorPin) + "}");
}

void handleFertilizer()
{
  if (!isFertilizing)
  {
    isFertilizing = true;
    fertStartTime = millis();
    openFertilizerValve();
  }
  server.send(200, "text/plain", "OK");
}

// หน้าดูเหตุการณ์ย้อนหลัง — ใช้วิเคราะห์ตอนบอร์ดหลุดโดยไม่ต้องต่อ USB/Serial Monitor
void handleLog()
{
  unsigned long t = millis() / 1000;
  String upt = String(t / 3600) + "h " + String((t / 60) % 60) + "m " + String(t % 60) + "s";
  String wifi = String(WiFi.status() == WL_CONNECTED ? "connected" : "DOWN") + "  rssi=" + String(WiFi.RSSI()) + " dBm";
  String mq = String(mqtt.connected() ? "connected" : "DOWN") + "  state=" + String(mqtt.state()) + "  " + mqttHost + ":" + String(mqttPort);
  String events;
  events.reserve(2500);
  for (int i = 1; i <= EVLOG_SIZE; i++)
  {
    const String &line = evLogBuf[(evLogPos - i + EVLOG_SIZE) % EVLOG_SIZE];
    if (line.length())
      events += line + "\n";
  }

  // /log?txt=1 = ข้อความล้วน ไว้คัดลอกส่งให้คนช่วยดู
  if (server.hasArg("txt"))
  {
    String out = "Device: " + cfgDeviceId + "  (http://" + netHostname + ".local)\n";
    out += "Uptime: " + upt + "  (เลขน้อย = เพิ่งรีเซ็ต)\nReset reason: " + String(resetReasonText()) + "\n";
    out += "Wi-Fi: " + wifi + "\nMQTT: " + mq + "\nFree heap: " + String(ESP.getFreeHeap()) + " bytes\n\n--- เหตุการณ์ล่าสุด (ใหม่สุดอยู่บน) ---\n" + events;
    server.send(200, "text/plain; charset=utf-8", out);
    return;
  }

  String h = pageHead("Log · " + htmlEscape(cfgDeviceId));
  h.reserve(7000);
  h += topBar(mqttChip());
  h += "<div class=\"card\"><p class=\"eye\">BOARD STATUS</p><div class=\"kv\">"
       "<span>Device</span><span class=\"mono\">";
  h += htmlEscape(cfgDeviceId) + " · " + netHostname + ".local";
  h += "</span><span>Uptime</span><span class=\"mono\">" + upt + " <span class=\"hint\">(น้อย = เพิ่งรีเซ็ต)</span></span>";
  h += "<span>Reset</span><span class=\"mono\">" + String(resetReasonText()) + "</span>";
  h += "<span>Wi-Fi</span><span class=\"mono\">" + wifi + "</span>";
  h += "<span>MQTT</span><span class=\"mono\">" + htmlEscape(mq) + "</span>";
  h += "<span>Free heap</span><span class=\"mono\">" + String(ESP.getFreeHeap()) + " bytes</span></div></div>";
  h += "<div class=\"card\"><p class=\"eye\">RECENT EVENTS · ใหม่สุดอยู่บน</p><pre class=\"mono\">";
  h += events.length() ? htmlEscape(events) : String("(ยังไม่มี)");
  h += "</pre></div><div class=\"row\"><a class=\"btn out\" href=\"/log\">↻ รีเฟรช</a><a class=\"btn out\" href=\"/log?txt=1\">ข้อความล้วน</a></div>"
       "<a class=\"btn\" style=\"margin-top:10px\" href=\"/\">← กลับหน้ากระถาง</a>";
  h += PAGE_END;
  server.send(200, "text/html; charset=utf-8", h);
}

// อัปเดตแค่ Server URL ลง NVS แบบไม่ล้างค่าอื่น — ใช้ตอน IP เครื่อง backend เปลี่ยน (เช่น Wi-Fi หอ)
// มีผลทันที ไม่ต้องรีสตาร์ท ไม่เสีย Token/Wi-Fi
void handleSetApi()
{
  String api = server.arg("api");
  api.trim();
  if (api.length() == 0)
  {
    sendNotice(400, "⚠ ต้องกรอก Server URL", "เช่น https://plantvm.xxx.ts.net", "/#settings", "← กลับ");
    return;
  }
  prefs.begin("plantcfg", false);
  prefs.putString("api", api);
  prefs.end();
  cfgApiBase = api;
  Serial.printf("[config] API base updated -> %s\n", api.c_str());
  mqttSetup(); // ต่อ broker ใหม่ที่ host ใหม่ทันที
  server.sendHeader("Location", "/");
  server.send(303);
}

// เปลี่ยนเฉพาะ Token ลง NVS (หลัง rotate บนเว็บ) — Wi-Fi / Device ID / Server URL คงเดิม ไม่ต้องรีบูต
// ไม่ถาม token เดิม เพราะตอนใช้จริง token เดิมถูก rotate ทิ้งไปแล้ว — สิทธิ์เท่ากับปุ่มตั้งค่าใหม่ (ต้องอยู่ Wi-Fi วงเดียวกัน)
// token จาก backend = 32 byte เป็น hex 64 ตัว → ตรวจรูปแบบไว้กันวางมาไม่ครบ
void handleSetToken()
{
  String token = server.arg("token");
  token.trim();
  bool hex = token.length() == 64;
  for (size_t i = 0; hex && i < token.length(); i++)
    hex = isxdigit((unsigned char)token[i]);
  if (!hex)
  {
    sendNotice(400, "⚠ Token ไม่ถูกรูปแบบ", "ต้องเป็นตัวอักษร 0-9 a-f ยาว 64 ตัว — กด COPY TOKEN บนเว็บหลักแล้ววางใหม่อีกครั้ง", "/#settings", "← กลับไปวางใหม่");
    return;
  }
  prefs.begin("plantcfg", false);
  prefs.putString("token", token);
  prefs.end();
  cfgToken = token;
  ArduinoOTA.setPassword(cfgToken.c_str()); // รหัส OTA = token ใหม่ (หน้า /update อ่าน cfgToken ตรง ๆ อยู่แล้ว)
  mqttAuthFailed = false;
  evlog("[config] token updated -> reconnect MQTT");
  mqttSetup(); // ตัด connection เดิมแล้วต่อใหม่ด้วย token ใหม่ในรอบ loop ถัดไป
  server.sendHeader("Location", "/?saved=token#settings");
  server.send(303);
}

// ล้างค่า + กลับเข้าโหมดตั้งค่า (AP)
void handleReset()
{
  sendNotice(200, "กำลังกลับเข้าโหมดตั้งค่า…", String("ต่อมือถือเข้า Wi-Fi “") + AP_SSID + "” แล้วหน้าตั้งค่าจะเปิดขึ้นเอง", "", "");
  Serial.println("[config] reset requested");
  emergencyStop(); // ปิดทันทีก่อนรีบูต (ไม่ดูดสาย — loop ไม่ได้ทำงานต่อแล้ว)
  delay(800);
  clearConfig();
  ESP.restart();
}

// ===== 11b. OTA — อัปเดต firmware ผ่าน Wi-Fi ไม่ต้องเสียบ USB =====
// รหัสผ่าน = Device Token (rotate token บนเว็บ → รหัส OTA เปลี่ยนตามอัตโนมัติ หลังใส่ token ใหม่ในบอร์ด)
// ช่องทาง A: Arduino IDE → Tools → Port → "plantpot-pot-001 at 192.168.x.x" → Upload (ถามรหัส = token)
// ช่องทาง B: Sketch → Export Compiled Binary → เปิด http://plantpot-pot-001.local/update (user: plantpot / รหัส: token)
// ต้องอยู่ Wi-Fi วงเดียวกับบอร์ด · ถ้า flash ไม่ครบ บอร์ดบูต firmware เดิมต่อ (เขียนลงอีก partition)
const char *OTA_USER = "plantpot";
bool otaStarted = false;
bool webOtaAuthed = false;

// หยุดทุกอย่างที่เปิดน้ำอยู่ก่อนเริ่มเขียนแฟลช — ระหว่างอัปโหลด loop ถูกบล็อก ปั๊มจะค้างสถานะเดิม
// คำสั่งจากเว็บที่ค้างอยู่จะไม่มี ack → backend คืนแต้มเองหลัง 180 วิ (cleanup job)
void prepareForOta()
{
  emergencyStop();
  isCloudActive = false;
  isFertilizing = false;
  isManualWater = false;
  autoWaterActive = false;
  if (mqtt.connected())
    mqtt.disconnect();
}

void startArduinoOta()
{
  ArduinoOTA.setHostname(netHostname.c_str());
  ArduinoOTA.setPassword(cfgToken.c_str());
  ArduinoOTA.setMdnsEnabled(false); // ประกาศ mDNS เองใน loop (MDNS.enableArduino) ไม่ให้ ArduinoOTA ตั้ง mDNS ซ้อน
  ArduinoOTA.onStart([]()
                     {
    prepareForOta();
    evlog("[ota] IDE upload start"); });
  ArduinoOTA.onEnd([]()
                   { evlog("[ota] IDE upload done -> restart"); });
  ArduinoOTA.onError([](ota_error_t e)
                     { evlog("[ota] IDE upload error=%u", (unsigned)e); });
  ArduinoOTA.begin();
  otaStarted = true;
  evlog("[ota] ready (Arduino IDE port: %s)", netHostname.c_str());
}

void handleUpdatePage()
{
  if (!server.authenticate(OTA_USER, cfgToken.c_str()))
    return server.requestAuthentication();
  String h = pageHead("อัปเดต Firmware");
  h += topBar(mqttChip());
  h += "<div class=\"card\"><h1>⬆️ อัปเดต Firmware</h1>"
       "<p class=\"mut\" style=\"margin:6px 0 16px\">Arduino IDE → Sketch → Export Compiled Binary → เลือกไฟล์ <b class=\"mono\">esp32_v-1.ino.bin</b><br>"
       "ระหว่างอัปเดตปั๊มและวาล์วจะถูกปิด · เสร็จแล้วบอร์ดรีสตาร์ทเอง</p>"
       "<form method=\"POST\" action=\"/update\" enctype=\"multipart/form-data\" onsubmit=\"var b=this.querySelector('button');b.disabled=true;b.textContent='กำลังอัปโหลด… อย่าปิดหน้านี้'\">"
       "<input type=\"file\" name=\"firmware\" accept=\".bin\" required><button class=\"btn\" type=\"submit\">อัปโหลดและติดตั้ง</button></form></div>"
       "<a class=\"btn out\" href=\"/\">← กลับหน้ากระถาง</a>";
  h += PAGE_END;
  server.send(200, "text/html; charset=utf-8", h);
}

// รับไฟล์ทีละก้อนแล้วเขียนลงแฟลชเลย (ไม่เก็บทั้งไฟล์ใน RAM)
void handleUpdateUpload()
{
  HTTPUpload &up = server.upload();
  if (up.status == UPLOAD_FILE_START)
  {
    webOtaAuthed = server.authenticate(OTA_USER, cfgToken.c_str());
    if (!webOtaAuthed)
      return;
    prepareForOta();
    evlog("[ota] web upload start: %s", up.filename.c_str());
    if (!Update.begin(UPDATE_SIZE_UNKNOWN))
      evlog("[ota] begin failed: %s", Update.errorString());
  }
  else if (!webOtaAuthed)
  {
    return;
  }
  else if (up.status == UPLOAD_FILE_WRITE)
  {
    if (Update.write(up.buf, up.currentSize) != up.currentSize)
      evlog("[ota] write failed: %s", Update.errorString());
  }
  else if (up.status == UPLOAD_FILE_END)
  {
    if (Update.end(true))
      evlog("[ota] web upload ok (%u bytes)", (unsigned)up.totalSize);
    else
      evlog("[ota] web upload failed: %s", Update.errorString());
  }
  else if (up.status == UPLOAD_FILE_ABORTED)
  {
    Update.abort();
    evlog("[ota] web upload aborted");
  }
}

void handleUpdateDone()
{
  if (!webOtaAuthed)
    return server.requestAuthentication();
  bool ok = !Update.hasError() && Update.isFinished();
  if (ok)
    sendNotice(200, "✓ อัปเดตสำเร็จ", "บอร์ดกำลังรีสตาร์ท… รอราว 20 วินาทีแล้วเปิด Log ดูได้", "/log", "ดู Log");
  else
    sendNotice(500, "✗ อัปเดตไม่สำเร็จ", String(Update.errorString()) + "<br>บอร์ดยังใช้ firmware เดิม", "/update", "ลองใหม่");
  if (ok)
  {
    delay(1000);
    ESP.restart();
  }
}

// ===== 12. Setup / Loop =====
void setup()
{
  Serial.begin(115200);
  evlog("[boot] reset reason: %s", resetReasonText());
  pinMode(pumpPin, OUTPUT);
  pinMode(valveWaterPin, OUTPUT);
  pinMode(valveFertilizerPin, OUTPUT);
  pinMode(BOOT_BTN_PIN, INPUT_PULLUP);
  emergencyStop();

  bool haveConfig = loadConfig();
  if (!haveConfig)
  {
    Serial.println("[boot] no config -> setup portal");
    startConfigPortal();
    return; // อยู่ในโหมด AP — loop จะ handle portal
  }

  // ต่อ Wi-Fi บ้าน (DHCP — ใช้ได้กับ router ทุกวง)
  netHostname = makeHostname(cfgDeviceId);
  WiFi.setHostname(netHostname.c_str()); // ต้องตั้งก่อน WiFi.mode/begin ไม่งั้น DHCP ใช้ชื่อเริ่มต้น
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true); // ให้ stack ต่อกลับเองเมื่อ Wi-Fi กลับมา
  WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
  Serial.printf("[boot] connecting to \"%s\" ", cfgSsid.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000)
  {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED)
  {
    // ต่อไม่ติดตอน boot (เช่น router ยังไม่ขึ้นหลังไฟดับ) — ไม่ค้างโหมด AP — #1
    // เข้าโหมดใช้งานปกติเลย: auto-water ทำงาน offline ได้ + loop จะ retry Wi-Fi เองทุก 30 วิ
    Serial.println("\n[boot] Wi-Fi not up yet -> continue offline, will retry in loop");
  }
  else
  {
    Serial.print("\nWi-Fi connected. Local UI -> http://");
    Serial.println(WiFi.localIP());
  }
  mqttSetup();
  Serial.printf("Cloud target -> %s (MQTT %s:%u)\n", cfgApiBase.c_str(), mqttHost.c_str(), mqttPort);

  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.on("/moisture", handleMoisture);
  server.on("/fertilizer", handleFertilizer);
  server.on("/setapi", HTTP_POST, handleSetApi);
  server.on("/settoken", HTTP_POST, handleSetToken);
  server.on("/reset", handleReset);
  server.on("/log", handleLog);
  server.on("/update", HTTP_GET, handleUpdatePage);
  server.on("/update", HTTP_POST, handleUpdateDone, handleUpdateUpload);
  server.begin();
}

void loop()
{
  // โหมดตั้งค่า — เสิร์ฟ captive portal อย่างเดียว
  if (configMode)
  {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  server.handleClient();
  if (otaStarted)
    ArduinoOTA.handle();
  unsigned long now = millis();

  // Wi-Fi หลุด (router รีบูต / ต่อไม่ติดตอน boot) — ลอง reconnect เป็นระยะ ไม่ค้าง offline — #1
  if (WiFi.status() != WL_CONNECTED && now - lastWifiTry >= WIFI_RETRY_MS)
  {
    lastWifiTry = now;
    evlog("[wifi] disconnected -> reconnecting...");
    WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
  }

  // mDNS: เข้าหน้าเว็บของบอร์ดที่ http://plantpot-<deviceid>.local ได้โดยไม่ต้องรู้ IP ของบอร์ด (IP หอเปลี่ยนบ่อย)
  static bool wifiWasUp = false;
  bool wifiUp = WiFi.status() == WL_CONNECTED;
  if (wifiUp != wifiWasUp)
  {
    if (wifiUp)
      evlog("[wifi] connected ip=%s rssi=%d", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (wifiUp && !otaStarted)
      startArduinoOta();
    else
      evlog("[wifi] lost (status=%d)", WiFi.status());
    wifiWasUp = wifiUp;
  }

  if (WiFi.status() == WL_CONNECTED && !mdnsUp)
  {
    if (MDNS.begin(netHostname.c_str()))
    {
      MDNS.addService("http", "tcp", 80);
      MDNS.enableArduino(3232, true); // ให้ Arduino IDE เห็นพอร์ตเครือข่ายชื่อเดียวกัน (ต้องใส่รหัส)
      evlog("[mdns] http://%s.local ready", netHostname.c_str());
    }
    mdnsUp = true;
  }
  else if (WiFi.status() != WL_CONNECTED && mdnsUp)
  {
    MDNS.end();
    mdnsUp = false;
  }

  // ปุ่ม BOOT กดค้าง 3 วิระหว่างใช้งาน = ล้างค่า + กลับเข้าโหมดตั้งค่า
  static unsigned long btnDownAt = 0;
  if (digitalRead(BOOT_BTN_PIN) == LOW)
  {
    if (btnDownAt == 0)
      btnDownAt = now;
    else if (now - btnDownAt > 3000)
    {
      Serial.println("[config] BOOT held -> reset to setup");
      emergencyStop(); // ปิดทันทีก่อนรีบูต
      clearConfig();
      ESP.restart();
    }
  }
  else
  {
    btnDownAt = 0;
  }

  // --- ตัดสินใจสถานะ valve+ปั๊ม (priority: cloud > local-fert > local-manual > auto) ---
  if (isCloudActive)
  {
    if (now - cloudStart >= cloudDurationMs)
    {
      closeAll(); // เริ่มลำดับปิด: วาล์ว → ดูดสาย → ปั๊ม
      if (outputsIdle())
      { // ดูดสายเสร็จแล้วค่อยรายงานผล — คำสั่งถัดไปจะได้ไม่ชนขั้นดูดสาย
        ackCommand(cloudCmdId, "success");
        isCloudActive = false;
      }
    }
  }
  else if (isFertilizing)
  {
    if (now - fertStartTime >= FERT_DURATION_MS + VALVE_DELAY_MS)
    {
      isFertilizing = false;
      closeAll();
    }
  }
  else if (isManualWater)
  {
    openWaterValve();
  }
  else
  {
    int pct = readMoisturePercent();
    if (autoWaterLocked)
    {
      if (pct > AUTO_WATER_OFF_PCT)
      {
        autoWaterLocked = false;
        Serial.println("[auto] lockout cleared — sensor recovered");
      }
    }
    else if (!autoWaterActive && pct < AUTO_WATER_ON_PCT)
    {
      autoWaterActive = true;
      autoWaterStartedAt = now;
      evlog("[auto] start watering — pct=%d", pct);
    }
    else if (autoWaterActive)
    {
      if (pct > AUTO_WATER_OFF_PCT)
      {
        autoWaterActive = false;
        evlog("[auto] stop watering — recovered to pct=%d", pct);
      }
      else if (now - autoWaterStartedAt > AUTO_WATER_MAX_MS)
      {
        autoWaterActive = false;
        autoWaterLocked = true;
        evlog("[auto] WARNING: max duration %lums hit at pct=%d — sensor may be faulty, locking out",
              AUTO_WATER_MAX_MS, pct);
      }
    }
    if (autoWaterActive)
      openWaterValve();
    else
      closeAll();
  }
  updateOutputs(now);

  // --- Cloud (MQTT) ---
  if (mqttWasUp && !mqtt.connected())
  {
    // -4 = keepalive timeout (ไม่ได้คำตอบ ping) · -3 = connection ขาด (Wi-Fi/เน็ต/Funnel) · -1 = ถูกตัดจากฝั่ง broker
    evlog("[mqtt] lost connection state=%d wifi=%d rssi=%d", mqtt.state(), WiFi.status(), WiFi.RSSI());
  }
  mqttWasUp = mqtt.connected();
  if (WiFi.status() == WL_CONNECTED)
  {
    if (mqtt.connected())
    {
      mqtt.loop(); // รับคำสั่ง + ส่ง keepalive ping (heartbeat)
      if (now - lastSensorPost >= SENSOR_POST_MS)
      {
        lastSensorPost = now;
        publishSensor();
      }
    }
    else
    {
      // connect (โดยเฉพาะ TLS handshake) บล็อก loop ได้หลายวินาที — ห้ามทำตอนปั๊มกำลังทำงานแบบจับเวลา
      // ไม่งั้นปั๊มจะปิดช้ากว่ากำหนด (ack ที่ค้างจะถูกส่งตอนต่อกลับ backend รอได้ 180 วิ)
      bool pumpTimed = isCloudActive || isFertilizing || autoWaterActive || !outputsIdle();
      unsigned long wait = mqttAuthFailed ? MQTT_AUTH_RETRY_MS : MQTT_RETRY_MS;
      if (!pumpTimed && now - lastMqttTry >= wait)
      {
        lastMqttTry = now;
        mqttConnect();
      }
    }
  }
}
