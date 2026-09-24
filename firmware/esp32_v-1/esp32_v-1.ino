#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>  // MQTT over TLS ผ่าน Tailscale Funnel
#include <PubSubClient.h>      // MQTT client — ติดตั้งจาก Library Manager: "PubSubClient" by Nick O'Leary
#include <Preferences.h>   // เก็บค่าตั้งค่า (Wi-Fi/Token) ลง NVS ถาวร
#include <DNSServer.h>     // captive portal — ดึงหน้าตั้งค่าให้เด้งเอง
#include <ESPmDNS.h>       // เข้าหน้าตั้งค่าที่ http://plantpot.local โดยไม่ต้องรู้ IP ของบอร์ด
#include <esp_system.h>    // esp_reset_reason() — บอร์ดรีเซ็ตเพราะอะไร (ไฟตก/watchdog/...)
#include <ArduinoOTA.h>    // อัปเดต firmware ผ่าน Wi-Fi จาก Arduino IDE (พอร์ตเครือข่าย "plantpot")
#include <Update.h>        // อัปเดต firmware ด้วยไฟล์ .bin ผ่านหน้าเว็บ /update

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
const char* DEFAULT_API_BASE = "http://192.168.1.134:3000";

// ===== 2. Config portal (AP mode) =====
const char* AP_SSID    = "PlantPot-Setup";  // ชื่อ Wi-Fi ที่บอร์ดปล่อยตอนตั้งค่า
const byte  DNS_PORT   = 53;
DNSServer   dnsServer;
bool        configMode = false;             // true = อยู่ในโหมดตั้งค่า (AP)
const int   BOOT_BTN_PIN = 0;               // ปุ่ม BOOT — กดค้าง 3 วิตอนใช้งาน = ล้างค่า/ตั้งใหม่

// ===== 3. Pins =====
const int sensorPin          = 34;
const int pumpPin            = 27;
const int valveWaterPin      = 32;
const int valveFertilizerPin = 33;

// ===== 4. Moisture calibration (raw ADC -> percent) =====
const int RAW_DRY = 2500;   // raw ตอนแห้ง  -> 0%
const int RAW_WET = 1400;   // raw ตอนจุ่มน้ำ -> 100%

// ===== 5. Auto rules / intervals =====
const int           AUTO_WATER_ON_PCT  = 10;     // เริ่มรดเมื่อ < นี้ (very dry)
const int           AUTO_WATER_OFF_PCT = 25;     // หยุดเมื่อ > นี้ (กลับสู่ dry zone)
const unsigned long AUTO_WATER_MAX_MS  = 60000;  // safety cap — เปิดต่อเนื่องเกินนี้ = sensor น่าจะพัง
const unsigned long FERT_DURATION_MS   = 5000;   // ปุ่มปุ๋ย local = 5 วิ
const unsigned long SENSOR_POST_MS     = 300000; // ส่งความชื้นทุก 5 นาที
const unsigned long WIFI_RETRY_MS      = 30000;  // ลอง reconnect Wi-Fi ทุก 30 วิ เมื่อหลุด (ไม่ค้าง offline)

// ===== 5b. MQTT =====
const uint16_t      MQTT_TLS_PORT      = 8443;   // Funnel: tailscale funnel --bg --tls-terminated-tcp=8443 tcp://localhost:1883
const uint16_t      MQTT_PLAIN_PORT    = 1883;   // backend ในวง LAN (ไม่เข้ารหัส — ใช้ตอน dev)
const uint16_t      MQTT_KEEPALIVE_S   = 30;     // ping ทุก 30 วิ = heartbeat (backend ถือว่า offline ทันทีที่หลุด)
const unsigned long MQTT_RETRY_MS      = 5000;   // ต่อไม่ติด → ลองใหม่ทุก 5 วิ
const unsigned long MQTT_AUTH_RETRY_MS = 60000;  // token ผิด (เช่น เพิ่ง rotate) → ลองห่างขึ้น ไม่ถล่ม broker

// ===== 6. State =====
WebServer server(80);
bool          mdnsUp = false;   // เริ่ม mDNS responder (plantpot.local) แล้วหรือยัง

bool          isFertilizing = false;
unsigned long fertStartTime = 0;
bool          isManualWater = false;

bool          autoWaterActive    = false;
unsigned long autoWaterStartedAt = 0;
bool          autoWaterLocked    = false;

bool          isCloudActive    = false;
String        cloudType        = "";
long          cloudCmdId       = -1;
unsigned long cloudStart       = 0;
unsigned long cloudDurationMs  = 0;

unsigned long lastSensorPost  = 0;
unsigned long lastWifiTry     = 0;
unsigned long lastMqttTry     = 0;
bool          mqttAuthFailed  = false;  // ครั้งล่าสุดต่อไม่ติดเพราะ token ผิด
bool          mqttWasUp       = false;  // ใช้ log ตอนหลุด พร้อมสาเหตุ

long          pendingAckId     = -1;    // ack ที่ยังส่งไม่ออก (MQTT หลุดตอนทำเสร็จ) — ส่งซ้ำตอนต่อกลับ
String        pendingAckStatus = "";
long          recentCmdIds[4]  = {-1, -1, -1, -1};  // กันคำสั่งซ้ำ (QoS 1 ส่งซ้ำได้) — ปั๊มต้องไม่ทำงานสองรอบ
int           recentCmdPos     = 0;

// ===== 6b. Event log — ดูย้อนหลังได้ที่ http://plantpot.local/log โดยไม่ต้องต่อ USB =====
const int EVLOG_SIZE = 30;
String    evLogBuf[EVLOG_SIZE];
int       evLogPos = 0;

// พิมพ์ลง Serial + เก็บลง RAM (หายเมื่อรีเซ็ต — แต่หน้า /log บอกสาเหตุการรีเซ็ตครั้งล่าสุดไว้)
void evlog(const char* fmt, ...) {
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

const char* resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "POWERON (เพิ่งเสียบไฟ)";
    case ESP_RST_BROWNOUT: return "BROWNOUT (ไฟตก — ปั๊ม/รีเลย์ดึงไฟ?)";
    case ESP_RST_SW:       return "SW (รีสตาร์ทจากโค้ด เช่น บันทึกค่าตั้ง)";
    case ESP_RST_PANIC:    return "PANIC (โปรแกรมพัง)";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:      return "WATCHDOG (loop ค้างนานเกินไป)";
    case ESP_RST_EXT:      return "EXT (กดปุ่ม EN/RST)";
    default:               return "OTHER";
  }
}

// ===== 7. NVS config helpers =====
// คืน true ถ้ามีค่าครบพอใช้งาน (Wi-Fi + Device ID + Token)
bool loadConfig() {
  prefs.begin("plantcfg", true);
  cfgSsid     = prefs.getString("ssid",  "");
  cfgPass     = prefs.getString("pass",  "");
  cfgDeviceId = prefs.getString("devid", "");
  cfgToken    = prefs.getString("token", "");
  cfgApiBase  = prefs.getString("api",   DEFAULT_API_BASE);
  prefs.end();
  return cfgSsid.length() > 0 && cfgDeviceId.length() > 0 && cfgToken.length() > 0;
}

void saveConfig(const String& ssid, const String& pass, const String& devid,
                const String& token, const String& api) {
  prefs.begin("plantcfg", false);
  prefs.putString("ssid",  ssid);
  prefs.putString("pass",  pass);
  prefs.putString("devid", devid);
  prefs.putString("token", token);
  prefs.putString("api",   api.length() ? api : String(DEFAULT_API_BASE));
  prefs.end();
}

void clearConfig() {
  prefs.begin("plantcfg", false);
  prefs.clear();
  prefs.end();
}

// ===== 8. Hardware helpers =====
int readMoisturePercent() {
  int raw = analogRead(sensorPin);
  long p = map(raw, RAW_DRY, RAW_WET, 0, 100);
  if (p < 0)   p = 0;
  if (p > 100) p = 100;
  return (int)p;
}

void openWaterValve() {
  digitalWrite(valveFertilizerPin, HIGH);
  digitalWrite(valveWaterPin,      LOW);
  digitalWrite(pumpPin,            LOW);
}
void openFertilizerValve() {
  digitalWrite(valveWaterPin,      HIGH);
  digitalWrite(valveFertilizerPin, LOW);
  digitalWrite(pumpPin,            LOW);
}
void closeAll() {
  digitalWrite(pumpPin,            HIGH);
  digitalWrite(valveWaterPin,      HIGH);
  digitalWrite(valveFertilizerPin, HIGH);
}

// ===== 9. Cloud client (MQTT) =====
// ต่อ broker ครั้งเดียวแล้วค้างไว้ — backend "ส่ง" คำสั่งลงมาเอง (push) ไม่ต้องถามทุก 5 วิ
//   subscribe  plant/<id>/cmd     ← {id, type, durationSeconds}
//   publish    plant/<id>/ack     → {id, status}
//   publish    plant/<id>/sensor  → {moisturePercent}
//   publish    plant/<id>/status  → "online" (retained) · "offline" = Last Will ที่ broker ส่งแทนเมื่อบอร์ดหลุด
// ยืนยันตัวตน: username = Device ID, password = Device Token (ตัวเดียวกับที่ใช้กับเว็บ)
WiFiClientSecure mqttSecure;   // https:// → MQTT over TLS
WiFiClient       mqttPlain;    // http://  → MQTT ธรรมดา (วง LAN)
PubSubClient     mqtt;
String           mqttHost;     // ต้องเป็น global — PubSubClient เก็บแค่ pointer ของ host ไว้
uint16_t         mqttPort = 0;
String           topicCmd, topicAck, topicSensor, topicStatus;

bool usingHttps() { return cfgApiBase.startsWith("https://"); }

// ดึง host ออกจาก Server URL: "https://respi.xxx.ts.net" / "http://192.168.1.134:3000" → host อย่างเดียว
String hostFromUrl(const String& url) {
  String s = url;
  int p = s.indexOf("://");
  if (p >= 0) s = s.substring(p + 3);
  int end = s.length();
  int colon = s.indexOf(':'), slash = s.indexOf('/');
  if (colon >= 0 && colon < end) end = colon;
  if (slash >= 0 && slash < end) end = slash;
  return s.substring(0, end);
}

// เรียกตอน boot และทุกครั้งที่ Server URL เปลี่ยน (/setapi)
void mqttSetup() {
  topicCmd    = "plant/" + cfgDeviceId + "/cmd";
  topicAck    = "plant/" + cfgDeviceId + "/ack";
  topicSensor = "plant/" + cfgDeviceId + "/sensor";
  topicStatus = "plant/" + cfgDeviceId + "/status";

  if (mqtt.connected()) mqtt.disconnect();
  mqttHost = hostFromUrl(cfgApiBase);
  if (usingHttps()) {
    // ไม่ verify certificate — ESP32 ไม่มีนาฬิกาจริงตอนบูตและ root CA กินแฟลช
    // ข้อมูลยังถูกเข้ารหัสระหว่างทาง (token ไม่โผล่บนเน็ต) แค่ไม่กัน MITM แบบเต็มรูปแบบ
    mqttSecure.setInsecure();
    mqttSecure.setHandshakeTimeout(8);   // วินาที — กัน TLS handshake ค้างนานจน loop สะดุด
    mqtt.setClient(mqttSecure);
    mqttPort = MQTT_TLS_PORT;
  } else {
    mqtt.setClient(mqttPlain);
    mqttPort = MQTT_PLAIN_PORT;
  }
  mqtt.setServer(mqttHost.c_str(), mqttPort);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(8);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onMqttMessage);
  lastMqttTry = millis() - MQTT_RETRY_MS;  // ต่อทันทีในรอบ loop ถัดไป
}

void flushPendingAck() {
  if (pendingAckId < 0 || !mqtt.connected()) return;
  String body = String("{\"id\":") + pendingAckId + ",\"status\":\"" + pendingAckStatus + "\"}";
  if (mqtt.publish(topicAck.c_str(), body.c_str())) {
    evlog("[ack] id=%ld status=%s", pendingAckId, pendingAckStatus.c_str());
    pendingAckId = -1;
  }
}

// ยังไม่ได้ต่อก็ไม่หาย — เก็บไว้ส่งตอนต่อกลับ (backend รอได้ 180 วิก่อน cleanup คืนแต้ม)
void ackCommand(long id, const char* status) {
  pendingAckId     = id;
  pendingAckStatus = status;
  flushPendingAck();
}

bool mqttConnect() {
  String clientId = "plantpot-" + cfgDeviceId;
  evlog("[mqtt] connecting %s:%u ...", mqttHost.c_str(), mqttPort);
  // Last Will: ถ้าบอร์ดหลุดโดยไม่บอกลา broker จะประกาศ "offline" แทน
  bool ok = mqtt.connect(clientId.c_str(), cfgDeviceId.c_str(), cfgToken.c_str(),
                         topicStatus.c_str(), 1, true, "offline");
  if (!ok) {
    int st = mqtt.state();
    mqttAuthFailed = (st == MQTT_CONNECT_BAD_CREDENTIALS || st == MQTT_CONNECT_UNAUTHORIZED);
    evlog("[mqtt] connect failed state=%d%s", st,
                  mqttAuthFailed ? " (token ไม่ถูกต้อง — rotate แล้วหรือยัง? ใส่ใหม่ที่ปุ่มตั้งค่าใหม่/BOOT ค้าง 3 วิ)" : "");
    return false;
  }
  mqttAuthFailed = false;
  mqtt.publish(topicStatus.c_str(), "online", true);
  mqtt.subscribe(topicCmd.c_str(), 1);   // backend ส่งคำสั่งที่ค้างระหว่างออฟไลน์ให้หลัง subscribe
  evlog("[mqtt] connected (rssi=%d)", WiFi.RSSI());
  flushPendingAck();
  lastSensorPost = millis() - SENSOR_POST_MS;  // ส่งความชื้นทันทีที่ต่อได้
  return true;
}

void publishSensor() {
  int pct = readMoisturePercent();
  String body = String("{\"moisturePercent\":") + pct + "}";
  bool ok = mqtt.publish(topicSensor.c_str(), body.c_str());
  evlog("[sensor] publish %s  pct=%d", ok ? "ok" : "FAILED", pct);
}

bool extractJsonInt(const String& s, const String& key, long* out) {
  int k = s.indexOf("\"" + key + "\":");
  if (k < 0) return false;
  k += key.length() + 3;
  while (k < (int)s.length() && s[k] == ' ') k++;
  *out = s.substring(k).toInt();
  return true;
}
bool extractJsonStr(const String& s, const String& key, String* out) {
  int k = s.indexOf("\"" + key + "\":\"");
  if (k < 0) return false;
  k += key.length() + 4;
  int e = s.indexOf('"', k);
  if (e < 0) return false;
  *out = s.substring(k, e);
  return true;
}

bool seenCommand(long id) {
  for (long r : recentCmdIds) if (r == id) return true;
  return false;
}
void rememberCommand(long id) {
  recentCmdIds[recentCmdPos] = id;
  recentCmdPos = (recentCmdPos + 1) % 4;
}

// callback จาก mqtt.loop() — มีคำสั่งใหม่ส่งลงมา
void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  if (topicCmd != topic) return;
  String msg;
  msg.reserve(len);
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];

  long   id  = -1;
  String type;
  long   dur = 5;
  if (!extractJsonInt(msg, "id", &id) || !extractJsonStr(msg, "type", &type)) {
    Serial.printf("[cmd] bad payload: %s\n", msg.c_str());
    return;
  }
  extractJsonInt(msg, "durationSeconds", &dur);
  if (dur < 1)   dur = 1;
  if (dur > 120) dur = 120;

  if (seenCommand(id)) {                  // QoS 1 ส่งซ้ำ — ทำไปแล้ว ไม่รดซ้ำ
    evlog("[cmd] duplicate id=%ld ignored", id);
    return;
  }
  rememberCommand(id);
  if (isCloudActive) {                    // backend ส่งทีละคำสั่งอยู่แล้ว — ถ้ามาซ้อนแปลว่าสถานะไม่ตรงกัน
    evlog("[cmd] busy with id=%ld -> reject id=%ld", cloudCmdId, id);
    ackCommand(id, "failed");             // คืนแต้มทันที ดีกว่าให้ผู้ใช้รอ cleanup
    return;
  }

  evlog("[cmd] start id=%ld type=%s dur=%lds", id, type.c_str(), dur);
  cloudCmdId      = id;
  cloudType       = type;
  cloudDurationMs = (unsigned long)dur * 1000;
  cloudStart      = millis();
  isCloudActive   = true;

  if (type == "water") {
    openWaterValve();
  } else if (type == "fertilizer") {
    openFertilizerValve();
  } else {
    isCloudActive = false;
    closeAll();
    ackCommand(id, "failed");
  }
}

// ===== 10. Config Portal (AP) — หน้าตั้งค่าผ่านเว็บ ไม่ต้องใช้ Arduino =====
String htmlEscape(const String& s) {
  String o; o.reserve(s.length());
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"') o += "&quot;";
    else if (c == '<') o += "&lt;";
    else if (c == '>') o += "&gt;";
    else if (c == '&') o += "&amp;";
    else o += c;
  }
  return o;
}

void handleConfigRoot() {
  // ถ้าเคยตั้ง Token แล้ว บอกผู้ใช้ว่าเว้นว่างได้ (แก้ Wi-Fi อย่างเดียว) — #2
  String tokPh = cfgToken.length() ? "เว้นว่าง = ใช้ Token เดิม" : "วาง Token ที่ได้จากเว็บ";
  String h = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<style>body{font-family:sans-serif;background:#eef2f1;margin:0;padding:18px;color:#234}"
    ".card{max-width:420px;margin:0 auto;background:#fff;padding:22px;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.08)}"
    "h2{margin:0 0 4px}p.sub{margin:0 0 18px;color:#678;font-size:14px}"
    "label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}"
    "input,select{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cdd;border-radius:9px;font-size:15px}"
    "button{width:100%;margin-top:20px;padding:13px;border:0;border-radius:9px;background:#15a05a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}"
    ".hint{font-size:12px;color:#89a;margin-top:4px}</style></head><body><div class=\"card\">"
    "<h2>🌱 ตั้งค่ากระถาง</h2><p class=\"sub\">กรอก Wi-Fi บ้าน และวาง Token จากหน้า \"เพิ่มกระถาง\" บนเว็บ</p>"
    "<form method=\"POST\" action=\"/save\">"
    "<label>Wi-Fi ที่บ้าน</label>"
    "<select id=\"ssidsel\" onchange=\"document.getElementById('ssid').value=this.value\"><option>— กำลังสแกน… —</option></select>"
    "<input id=\"ssid\" name=\"ssid\" placeholder=\"ชื่อ Wi-Fi\" style=\"margin-top:7px\" value=\"" + htmlEscape(cfgSsid) + "\">"
    "<label>รหัส Wi-Fi</label><input name=\"pass\" type=\"password\" placeholder=\"รหัสผ่าน Wi-Fi\">"
    "<label>Device ID</label><input name=\"devid\" placeholder=\"เช่น POT-001\" value=\"" + htmlEscape(cfgDeviceId) + "\">"
    "<label>Device Token</label><input name=\"token\" placeholder=\"" + tokPh + "\">"
    "<label>Server URL <span class=\"hint\">(ใช้ทั้งเว็บและ MQTT — https:// = พอร์ต 8443 · http:// = 1883 · เว้นว่าง = ใช้ค่าเดิม)</span></label>"
    "<input name=\"api\" value=\"" + htmlEscape(cfgApiBase.length() ? cfgApiBase : String(DEFAULT_API_BASE)) + "\">"
    "<button type=\"submit\">บันทึก แล้วเชื่อมต่อ</button></form></div>"
    "<script>fetch('/scan').then(r=>r.json()).then(list=>{var s=document.getElementById('ssidsel');"
    "s.innerHTML='<option value=\"\">— เลือกจากที่สแกนเจอ —</option>';"
    "list.forEach(n=>{var o=document.createElement('option');o.value=n;o.textContent=n;s.appendChild(o);});});</script>"
    "</body></html>";
  server.send(200, "text/html; charset=utf-8", h);
}

void handleScan() {
  int n = WiFi.scanNetworks();
  String json = "[";
  for (int i = 0; i < n; i++) {
    if (i) json += ",";
    String ssid = WiFi.SSID(i);
    ssid.replace("\\", "\\\\");
    ssid.replace("\"", "\\\"");
    json += "\"" + ssid + "\"";
  }
  json += "]";
  WiFi.scanDelete();
  server.send(200, "application/json", json);
}

void handleSave() {
  String ssid  = server.arg("ssid");  ssid.trim();
  String pass  = server.arg("pass");
  String devid = server.arg("devid"); devid.trim();
  String token = server.arg("token"); token.trim();
  String api   = server.arg("api");   api.trim();

  // เว้นว่าง = ใช้ค่าเดิมใน NVS (แก้ Wi-Fi อย่างเดียวได้โดยไม่ต้องมี Token/Device ID ซ้ำ) — #2
  if (token.length() == 0) token = cfgToken;
  if (devid.length() == 0) devid = cfgDeviceId;
  if (api.length()   == 0) api   = cfgApiBase;

  if (ssid.length() == 0) {
    server.send(400, "text/html; charset=utf-8",
      "<meta charset=\"UTF-8\"><body style=\"font-family:sans-serif;text-align:center;padding:40px\">"
      "<h3>⚠ กรอกไม่ครบ</h3><p>ต้องมีชื่อ Wi-Fi</p><a href=\"/\">← กลับไปแก้</a></body>");
    return;
  }
  if (devid.length() == 0 || token.length() == 0) {
    server.send(400, "text/html; charset=utf-8",
      "<meta charset=\"UTF-8\"><body style=\"font-family:sans-serif;text-align:center;padding:40px\">"
      "<h3>⚠ กรอกไม่ครบ</h3><p>ครั้งแรกต้องกรอก Device ID และ Token ด้วย</p><a href=\"/\">← กลับไปแก้</a></body>");
    return;
  }
  saveConfig(ssid, pass, devid, token, api);
  server.send(200, "text/html; charset=utf-8",
    "<meta charset=\"UTF-8\"><body style=\"font-family:sans-serif;text-align:center;padding:40px;background:#eef2f1\">"
    "<h2>✓ บันทึกแล้ว</h2><p>กระถางกำลังรีสตาร์ทและเชื่อมต่อ Wi-Fi…<br>ปิดหน้านี้ได้เลย</p></body>");
  Serial.println("[config] saved -> restarting");
  delay(1500);
  ESP.restart();
}

// captive portal — ทุก URL แปลก ๆ เด้งกลับหน้าตั้งค่า
void handleCaptive() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/", true);
  server.send(302, "text/plain", "");
}

void startConfigPortal() {
  configMode = true;
  Serial.println("[config] starting setup portal (AP)");
  WiFi.persistent(false);
  WiFi.disconnect(true, true);        // ตัด STA + ล้าง creds ใน RAM กัน auto-retry รบกวน AP/scan — #3
  WiFi.mode(WIFI_AP_STA);             // AP_STA เพื่อให้สแกน Wi-Fi ได้ระหว่างเปิด AP
  WiFi.softAP(AP_SSID);              // เปิดแบบไม่มีรหัส — ต่อง่าย
  delay(300);
  Serial.print("[config] AP IP: "); Serial.println(WiFi.softAPIP());
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  server.on("/",     handleConfigRoot);
  server.on("/scan", handleScan);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleCaptive);
  server.begin();
}

// ===== 11. Local web UI (โหมดใช้งานปกติ) =====
void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body{font-family:sans-serif;text-align:center;background:#e9ecef;padding:20px;} .card{background:#fff;padding:20px;border-radius:10px;margin-bottom:20px;box-shadow:0 4px 8px rgba(0,0,0,0.1);} .btn{padding:12px;font-size:16px;color:#fff;background:#28a745;border:none;border-radius:5px;cursor:pointer;margin:5px;text-decoration:none;display:inline-block;} .btn-primary{background:#007bff;} .btn-danger{background:#dc3545;} .btn-gray{background:#6c757d;font-size:13px;padding:8px 12px;} .meta{font-size:12px;color:#6c757d;margin-top:8px;font-family:monospace;}</style></head><body>";

  html += "<h1>💧 Run for Water</h1>";

  html += "<div class=\"card\"><h2>ความชื้นในดิน</h2>";
  html += "<h1 id=\"moistureValue\" style=\"color:#007bff;font-size:60px;margin:10px 0;\">--</h1>";
  html += "<p style=\"color:#6c757d;font-size:14px;\">ระบบออโต้: รดน้ำเมื่อ &lt; " + String(AUTO_WATER_ON_PCT) + "% · หยุดเมื่อ &gt; " + String(AUTO_WATER_OFF_PCT) + "%</p></div>";

  html += "<div class=\"card\"><h2>🎛️ ควบคุมด้วยมือ (Manual)</h2>";
  if (isCloudActive) {
    html += "<p style=\"color:#fd7e14;\">สถานะ: <b>กำลังทำคำสั่งจากเว็บ (" + cloudType + ")</b></p>";
  } else if (isManualWater) {
    html += "<p style=\"color:red;\">สถานะ: <b>กำลังแทรกแซงระบบ (เปิดน้ำค้างไว้)</b></p>";
  } else {
    html += "<p style=\"color:green;\">สถานะ: ปล่อยออโต้ทำงานปกติ</p>";
  }
  html += "<a href=\"/on\" class=\"btn btn-primary\">เปิดน้ำ (ON)</a>";
  html += "<a href=\"/off\" class=\"btn btn-danger\">ปิดน้ำ/กลับสู่ออโต้ (OFF)</a></div>";

  html += "<div class=\"card\"><h2>🏆 ให้รางวัลต้นไม้</h2>";
  html += "<button class=\"btn\" onclick=\"giveFertilizer()\">วิ่งครบ 5KM (สั่งจ่ายปุ๋ย 5 วิ)</button>";
  html += "<p id=\"statusText\" style=\"color:#dc3545;font-weight:bold;margin-top:15px;\"></p></div>";

  html += "<div class=\"card\"><h2>⚙️ ตั้งค่า</h2>";
  html += "<p style=\"color:#6c757d;font-size:13px;margin-bottom:6px;\">Server URL — แก้เมื่อ IP เครื่อง backend เปลี่ยน (เช่น ย้าย Wi-Fi) · ไม่ล้าง Token/Wi-Fi</p>";
  html += "<form method=\"POST\" action=\"/setapi\" style=\"margin-bottom:6px;\">";
  html += "<input name=\"api\" value=\"" + htmlEscape(cfgApiBase) + "\" style=\"width:100%;padding:10px;border:1px solid #cdd;border-radius:7px;font-size:14px;box-sizing:border-box;\">";
  html += "<button type=\"submit\" class=\"btn btn-primary\" style=\"margin-top:8px;\">บันทึก Server URL</button></form>";
  html += "<hr style=\"border:0;border-top:1px solid #eee;margin:14px 0;\">";
  html += "<p style=\"color:#6c757d;font-size:13px;\">เปลี่ยน Wi-Fi หรือใส่ Token ใหม่ (ล้างค่าทั้งหมด)</p>";
  html += "<a href=\"/reset\" class=\"btn btn-gray\" onclick=\"return confirm('ล้างค่าและกลับเข้าโหมดตั้งค่าใหม่?')\">ตั้งค่าใหม่</a></div>";

  html += "<div class=\"meta\">MQTT: " + htmlEscape(mqttHost) + ":" + String(mqttPort) +
          (mqtt.connected() ? " ✅ เชื่อมต่อแล้ว" : (mqttAuthFailed ? " ❌ Token ไม่ถูกต้อง" : " ⏳ กำลังเชื่อมต่อ")) +
          " · Device: " + htmlEscape(cfgDeviceId) + " · <a href=\"/log\">ดู log</a> · <a href=\"/update\">อัปเดต firmware</a></div>";

  html += "<script>";
  html += "setInterval(() => { fetch('/moisture').then(r=>r.text()).then(d=>document.getElementById('moistureValue').innerText=d); }, 3000);";
  html += "function giveFertilizer() { document.getElementById('statusText').innerText='ระบบกำลังสับวาล์วจ่ายปุ๋ย...'; fetch('/fertilizer').then(()=>setTimeout(()=>document.getElementById('statusText').innerText='จ่ายปุ๋ยสำเร็จเรียบร้อย!', 5000)); }";
  html += "</script></body></html>";

  server.send(200, "text/html", html);
}

void handleOn()       { isManualWater = true;  server.sendHeader("Location", "/"); server.send(303); }
void handleOff()      { isManualWater = false; server.sendHeader("Location", "/"); server.send(303); }
void handleMoisture() { server.send(200, "text/plain", String(analogRead(sensorPin))); }

void handleFertilizer() {
  if (!isFertilizing) {
    isFertilizing = true;
    fertStartTime = millis();
    openFertilizerValve();
  }
  server.send(200, "text/plain", "OK");
}

// หน้าดูเหตุการณ์ย้อนหลัง — ใช้วิเคราะห์ตอนบอร์ดหลุดโดยไม่ต้องต่อ USB/Serial Monitor
void handleLog() {
  unsigned long t = millis() / 1000;
  String out;
  out.reserve(3000);
  out += "Uptime: " + String(t / 3600) + "h " + String((t / 60) % 60) + "m " + String(t % 60) + "s  (เลขน้อย = เพิ่งรีเซ็ต)\n";
  out += "Reset reason: " + String(resetReasonText()) + "\n";
  out += "Wi-Fi: " + String(WiFi.status() == WL_CONNECTED ? "connected" : "DOWN") + "  rssi=" + String(WiFi.RSSI()) + " dBm\n";
  out += "MQTT: " + String(mqtt.connected() ? "connected" : "DOWN") + "  state=" + String(mqtt.state()) +
         "  " + mqttHost + ":" + String(mqttPort) + "\n";
  out += "Free heap: " + String(ESP.getFreeHeap()) + " bytes\n\n--- เหตุการณ์ล่าสุด (ใหม่สุดอยู่บน) ---\n";
  for (int i = 1; i <= EVLOG_SIZE; i++) {
    const String& line = evLogBuf[(evLogPos - i + EVLOG_SIZE) % EVLOG_SIZE];
    if (line.length()) out += line + "\n";
  }
  server.send(200, "text/plain; charset=utf-8", out);
}

// อัปเดตแค่ Server URL ลง NVS แบบไม่ล้างค่าอื่น — ใช้ตอน IP เครื่อง backend เปลี่ยน (เช่น Wi-Fi หอ)
// มีผลทันที ไม่ต้องรีสตาร์ท ไม่เสีย Token/Wi-Fi
void handleSetApi() {
  String api = server.arg("api"); api.trim();
  if (api.length() == 0) {
    server.send(400, "text/html; charset=utf-8",
      "<meta charset=\"UTF-8\"><body style=\"font-family:sans-serif;text-align:center;padding:40px\">"
      "<h3>⚠ ต้องกรอก Server URL</h3><a href=\"/\">← กลับ</a></body>");
    return;
  }
  prefs.begin("plantcfg", false);
  prefs.putString("api", api);
  prefs.end();
  cfgApiBase = api;
  Serial.printf("[config] API base updated -> %s\n", api.c_str());
  mqttSetup();   // ต่อ broker ใหม่ที่ host ใหม่ทันที
  server.sendHeader("Location", "/");
  server.send(303);
}

// ล้างค่า + กลับเข้าโหมดตั้งค่า (AP)
void handleReset() {
  server.send(200, "text/html; charset=utf-8",
    "<meta charset=\"UTF-8\"><body style=\"font-family:sans-serif;text-align:center;padding:40px\">"
    "<h2>กำลังกลับเข้าโหมดตั้งค่า…</h2><p>เชื่อมต่อ Wi-Fi \"PlantPot-Setup\" อีกครั้ง</p></body>");
  Serial.println("[config] reset requested");
  closeAll();          // ปิดปั๊ม/วาล์วก่อนรีบูต กันค้าง energized ระหว่าง reset — #4
  delay(800);
  clearConfig();
  ESP.restart();
}

// ===== 11b. OTA — อัปเดต firmware ผ่าน Wi-Fi ไม่ต้องเสียบ USB =====
// รหัสผ่าน = Device Token (rotate token บนเว็บ → รหัส OTA เปลี่ยนตามอัตโนมัติ หลังใส่ token ใหม่ในบอร์ด)
// ช่องทาง A: Arduino IDE → Tools → Port → "plantpot at 192.168.x.x" → Upload (ถามรหัส = token)
// ช่องทาง B: Sketch → Export Compiled Binary → เปิด http://plantpot.local/update (user: plantpot / รหัส: token)
// ต้องอยู่ Wi-Fi วงเดียวกับบอร์ด · ถ้า flash ไม่ครบ บอร์ดบูต firmware เดิมต่อ (เขียนลงอีก partition)
const char* OTA_USER = "plantpot";
bool        otaStarted  = false;
bool        webOtaAuthed = false;

// หยุดทุกอย่างที่เปิดน้ำอยู่ก่อนเริ่มเขียนแฟลช — ระหว่างอัปโหลด loop ถูกบล็อก ปั๊มจะค้างสถานะเดิม
// คำสั่งจากเว็บที่ค้างอยู่จะไม่มี ack → backend คืนแต้มเองหลัง 180 วิ (cleanup job)
void prepareForOta() {
  closeAll();
  isCloudActive   = false;
  isFertilizing   = false;
  isManualWater   = false;
  autoWaterActive = false;
  if (mqtt.connected()) mqtt.disconnect();
}

void startArduinoOta() {
  ArduinoOTA.setHostname("plantpot");
  ArduinoOTA.setPassword(cfgToken.c_str());
  ArduinoOTA.setMdnsEnabled(false);   // ประกาศ mDNS เองใน loop (MDNS.enableArduino) กันชนกับ plantpot.local
  ArduinoOTA.onStart([]() {
    prepareForOta();
    evlog("[ota] IDE upload start");
  });
  ArduinoOTA.onEnd([]() { evlog("[ota] IDE upload done -> restart"); });
  ArduinoOTA.onError([](ota_error_t e) { evlog("[ota] IDE upload error=%u", (unsigned)e); });
  ArduinoOTA.begin();
  otaStarted = true;
  evlog("[ota] ready (Arduino IDE port: plantpot)");
}

void handleUpdatePage() {
  if (!server.authenticate(OTA_USER, cfgToken.c_str())) return server.requestAuthentication();
  server.send(200, "text/html; charset=utf-8",
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<style>body{font-family:sans-serif;background:#eef2f1;padding:18px;color:#234}.card{max-width:420px;margin:0 auto;background:#fff;padding:22px;border-radius:14px}"
    "input{width:100%;margin:14px 0;font-size:15px}button{width:100%;padding:13px;border:0;border-radius:9px;background:#15a05a;color:#fff;font-size:16px;font-weight:700}"
    ".hint{font-size:13px;color:#678}</style></head><body><div class=\"card\"><h2>⬆️ อัปเดต firmware</h2>"
    "<p class=\"hint\">Arduino IDE → Sketch → Export Compiled Binary → เลือกไฟล์ <b>esp32_v-1.ino.bin</b><br>ระหว่างอัปเดตปั๊มและวาล์วจะถูกปิด · เสร็จแล้วบอร์ดรีสตาร์ทเอง</p>"
    "<form method=\"POST\" action=\"/update\" enctype=\"multipart/form-data\" onsubmit=\"this.querySelector('button').innerText='กำลังอัปโหลด… อย่าปิดหน้านี้'\">"
    "<input type=\"file\" name=\"firmware\" accept=\".bin\" required><button type=\"submit\">อัปโหลดและติดตั้ง</button></form>"
    "<p class=\"hint\"><a href=\"/\">← กลับ</a></p></div></body></html>");
}

// รับไฟล์ทีละก้อนแล้วเขียนลงแฟลชเลย (ไม่เก็บทั้งไฟล์ใน RAM)
void handleUpdateUpload() {
  HTTPUpload& up = server.upload();
  if (up.status == UPLOAD_FILE_START) {
    webOtaAuthed = server.authenticate(OTA_USER, cfgToken.c_str());
    if (!webOtaAuthed) return;
    prepareForOta();
    evlog("[ota] web upload start: %s", up.filename.c_str());
    if (!Update.begin(UPDATE_SIZE_UNKNOWN)) evlog("[ota] begin failed: %s", Update.errorString());
  } else if (!webOtaAuthed) {
    return;
  } else if (up.status == UPLOAD_FILE_WRITE) {
    if (Update.write(up.buf, up.currentSize) != up.currentSize) evlog("[ota] write failed: %s", Update.errorString());
  } else if (up.status == UPLOAD_FILE_END) {
    if (Update.end(true)) evlog("[ota] web upload ok (%u bytes)", (unsigned)up.totalSize);
    else                  evlog("[ota] web upload failed: %s", Update.errorString());
  } else if (up.status == UPLOAD_FILE_ABORTED) {
    Update.abort();
    evlog("[ota] web upload aborted");
  }
}

void handleUpdateDone() {
  if (!webOtaAuthed) return server.requestAuthentication();
  bool ok = !Update.hasError() && Update.isFinished();
  server.send(ok ? 200 : 500, "text/html; charset=utf-8",
    String("<meta charset=\"UTF-8\"><body style=\"font-family:sans-serif;text-align:center;padding:40px\">") +
    (ok ? "<h2>✓ อัปเดตสำเร็จ</h2><p>บอร์ดกำลังรีสตาร์ท… รอราว 20 วิแล้วเปิด <a href=\"/log\">/log</a> ดูได้</p>"
        : String("<h2>✗ อัปเดตไม่สำเร็จ</h2><p>") + Update.errorString() + "</p><p>บอร์ดยังใช้ firmware เดิม</p><a href=\"/update\">ลองใหม่</a>") +
    "</body>");
  if (ok) { delay(1000); ESP.restart(); }
}

// ===== 12. Setup / Loop =====
void setup() {
  Serial.begin(115200);
  evlog("[boot] reset reason: %s", resetReasonText());
  pinMode(pumpPin,            OUTPUT);
  pinMode(valveWaterPin,      OUTPUT);
  pinMode(valveFertilizerPin, OUTPUT);
  pinMode(BOOT_BTN_PIN,       INPUT_PULLUP);
  closeAll();

  bool haveConfig = loadConfig();
  if (!haveConfig) {
    Serial.println("[boot] no config -> setup portal");
    startConfigPortal();
    return;   // อยู่ในโหมด AP — loop จะ handle portal
  }

  // ต่อ Wi-Fi บ้าน (DHCP — ใช้ได้กับ router ทุกวง)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);   // ให้ stack ต่อกลับเองเมื่อ Wi-Fi กลับมา
  WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
  Serial.printf("[boot] connecting to \"%s\" ", cfgSsid.c_str());
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(500); Serial.print("."); }

  if (WiFi.status() != WL_CONNECTED) {
    // ต่อไม่ติดตอน boot (เช่น router ยังไม่ขึ้นหลังไฟดับ) — ไม่ค้างโหมด AP — #1
    // เข้าโหมดใช้งานปกติเลย: auto-water ทำงาน offline ได้ + loop จะ retry Wi-Fi เองทุก 30 วิ
    Serial.println("\n[boot] Wi-Fi not up yet -> continue offline, will retry in loop");
  } else {
    Serial.print("\nWi-Fi connected. Local UI -> http://");
    Serial.println(WiFi.localIP());
  }
  mqttSetup();
  Serial.printf("Cloud target -> %s (MQTT %s:%u)\n", cfgApiBase.c_str(), mqttHost.c_str(), mqttPort);

  server.on("/",           handleRoot);
  server.on("/on",         handleOn);
  server.on("/off",        handleOff);
  server.on("/moisture",   handleMoisture);
  server.on("/fertilizer", handleFertilizer);
  server.on("/setapi",     HTTP_POST, handleSetApi);
  server.on("/reset",      handleReset);
  server.on("/log",        handleLog);
  server.on("/update",     HTTP_GET,  handleUpdatePage);
  server.on("/update",     HTTP_POST, handleUpdateDone, handleUpdateUpload);
  server.begin();

}

void loop() {
  // โหมดตั้งค่า — เสิร์ฟ captive portal อย่างเดียว
  if (configMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  server.handleClient();
  if (otaStarted) ArduinoOTA.handle();
  unsigned long now = millis();

  // Wi-Fi หลุด (router รีบูต / ต่อไม่ติดตอน boot) — ลอง reconnect เป็นระยะ ไม่ค้าง offline — #1
  if (WiFi.status() != WL_CONNECTED && now - lastWifiTry >= WIFI_RETRY_MS) {
    lastWifiTry = now;
    evlog("[wifi] disconnected -> reconnecting...");
    WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
  }

  // mDNS: เข้าหน้าตั้งค่าที่ http://plantpot.local ได้โดยไม่ต้องรู้ IP ของบอร์ด (IP หอเปลี่ยนบ่อย)
  static bool wifiWasUp = false;
  bool wifiUp = WiFi.status() == WL_CONNECTED;
  if (wifiUp != wifiWasUp) {
    if (wifiUp) evlog("[wifi] connected ip=%s rssi=%d", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (wifiUp && !otaStarted) startArduinoOta();
    else        evlog("[wifi] lost (status=%d)", WiFi.status());
    wifiWasUp = wifiUp;
  }

  if (WiFi.status() == WL_CONNECTED && !mdnsUp) {
    if (MDNS.begin("plantpot")) {
      MDNS.addService("http", "tcp", 80);
      MDNS.enableArduino(3232, true);   // ให้ Arduino IDE เห็นพอร์ตเครือข่าย "plantpot" (ต้องใส่รหัส)
      Serial.println("[mdns] http://plantpot.local ready");
    }
    mdnsUp = true;
  } else if (WiFi.status() != WL_CONNECTED && mdnsUp) {
    MDNS.end();
    mdnsUp = false;
  }

  // ปุ่ม BOOT กดค้าง 3 วิระหว่างใช้งาน = ล้างค่า + กลับเข้าโหมดตั้งค่า
  static unsigned long btnDownAt = 0;
  if (digitalRead(BOOT_BTN_PIN) == LOW) {
    if (btnDownAt == 0) btnDownAt = now;
    else if (now - btnDownAt > 3000) {
      Serial.println("[config] BOOT held -> reset to setup");
      closeAll();          // ปิดปั๊ม/วาล์วก่อนรีบูต — #4
      clearConfig();
      ESP.restart();
    }
  } else {
    btnDownAt = 0;
  }

  // --- ตัดสินใจสถานะ valve+ปั๊ม (priority: cloud > local-fert > local-manual > auto) ---
  if (isCloudActive) {
    if (now - cloudStart >= cloudDurationMs) {
      closeAll();
      ackCommand(cloudCmdId, "success");
      isCloudActive = false;
    }
  } else if (isFertilizing) {
    if (now - fertStartTime >= FERT_DURATION_MS) {
      isFertilizing = false;
      closeAll();
    }
  } else if (isManualWater) {
    openWaterValve();
  } else {
    int pct = readMoisturePercent();
    if (autoWaterLocked) {
      if (pct > AUTO_WATER_OFF_PCT) {
        autoWaterLocked = false;
        Serial.println("[auto] lockout cleared — sensor recovered");
      }
    } else if (!autoWaterActive && pct < AUTO_WATER_ON_PCT) {
      autoWaterActive = true;
      autoWaterStartedAt = now;
      evlog("[auto] start watering — pct=%d", pct);
    } else if (autoWaterActive) {
      if (pct > AUTO_WATER_OFF_PCT) {
        autoWaterActive = false;
        evlog("[auto] stop watering — recovered to pct=%d", pct);
      } else if (now - autoWaterStartedAt > AUTO_WATER_MAX_MS) {
        autoWaterActive = false;
        autoWaterLocked = true;
        evlog("[auto] WARNING: max duration %lums hit at pct=%d — sensor may be faulty, locking out",
                      AUTO_WATER_MAX_MS, pct);
      }
    }
    if (autoWaterActive) openWaterValve();
    else                 closeAll();
  }

  // --- Cloud (MQTT) ---
  if (mqttWasUp && !mqtt.connected()) {
    // -4 = keepalive timeout (ไม่ได้คำตอบ ping) · -3 = connection ขาด (Wi-Fi/เน็ต/Funnel) · -1 = ถูกตัดจากฝั่ง broker
    evlog("[mqtt] lost connection state=%d wifi=%d rssi=%d", mqtt.state(), WiFi.status(), WiFi.RSSI());
  }
  mqttWasUp = mqtt.connected();
  if (WiFi.status() == WL_CONNECTED) {
    if (mqtt.connected()) {
      mqtt.loop();   // รับคำสั่ง + ส่ง keepalive ping (heartbeat)
      if (now - lastSensorPost >= SENSOR_POST_MS) {
        lastSensorPost = now;
        publishSensor();
      }
    } else {
      // connect (โดยเฉพาะ TLS handshake) บล็อก loop ได้หลายวินาที — ห้ามทำตอนปั๊มกำลังทำงานแบบจับเวลา
      // ไม่งั้นปั๊มจะปิดช้ากว่ากำหนด (ack ที่ค้างจะถูกส่งตอนต่อกลับ backend รอได้ 180 วิ)
      bool pumpTimed = isCloudActive || isFertilizing || autoWaterActive;
      unsigned long wait = mqttAuthFailed ? MQTT_AUTH_RETRY_MS : MQTT_RETRY_MS;
      if (!pumpTimed && now - lastMqttTry >= wait) {
        lastMqttTry = now;
        mqttConnect();
      }
    }
  }
}
