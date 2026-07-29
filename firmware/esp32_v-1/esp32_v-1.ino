#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Preferences.h>   // เก็บค่าตั้งค่า (Wi-Fi/Token) ลง NVS ถาวร
#include <DNSServer.h>     // captive portal — ดึงหน้าตั้งค่าให้เด้งเอง

// ============================================================================
//  วิ่งเพื่อชีวิตของต้นไม้ในกระถาง — ESP32 firmware
//  *** ไม่มีค่าใดต้องแก้ในโค้ดนี้ — Wi-Fi / Device ID / Token ตั้งผ่านหน้าเว็บ ***
//  ครั้งแรก (ยังไม่ตั้งค่า) บอร์ดจะเปิด Wi-Fi ชื่อ "PlantPot-Setup" ให้เข้าไปกรอก
// ============================================================================

// ===== 1. Config (โหลดจาก NVS ตอน boot — ตั้งผ่าน Config Portal) =====
Preferences prefs;
String cfgSsid, cfgPass, cfgDeviceId, cfgToken, cfgApiBase;
const char* DEFAULT_API_BASE = "http://192.168.1.4:3000"; // ค่าเริ่มต้น (แก้ในฟอร์มได้)

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
const unsigned long SENSOR_POST_MS     = 300000; // POST /api/sensor ทุก 5 นาที
const unsigned long COMMAND_POLL_MS    = 5000;   // poll /command ทุก 5 วิ
const unsigned long CLOUD_HEARTBEAT_MS = 30000;  // ระหว่างคำสั่ง cloud ยิง sensor ถี่ขึ้นเป็น heartbeat กัน false-offline
const unsigned long WIFI_RETRY_MS      = 30000;  // ลอง reconnect Wi-Fi ทุก 30 วิ เมื่อหลุด (ไม่ค้าง offline)

// ===== 6. State =====
WebServer server(80);

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
unsigned long lastCommandPoll = 0;
unsigned long lastWifiTry     = 0;

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

// ===== 9. Cloud client =====
void addAuthHeaders(HTTPClient& http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + cfgToken);
}

void postSensor() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = cfgApiBase + "/api/sensor";
  http.begin(url);
  http.setConnectTimeout(3000);   // กัน block loop เมื่อ backend up-but-unresponsive
  http.setTimeout(3000);
  addAuthHeaders(http);
  int pct = readMoisturePercent();
  String body = String("{\"deviceId\":\"") + cfgDeviceId +
                "\",\"moisturePercent\":" + pct + "}";
  int code = http.POST(body);
  Serial.printf("[sensor] POST %d  pct=%d\n", code, pct);
  http.end();
}

void ackCommand(long id, const char* status) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = cfgApiBase + "/api/device/" + cfgDeviceId + "/command/" + String(id) + "/ack";
  http.begin(url);
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  addAuthHeaders(http);
  String body = String("{\"status\":\"") + status + "\"}";
  int code = http.POST(body);
  Serial.printf("[ack] id=%ld status=%s -> http %d\n", id, status, code);
  http.end();
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

void pollCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (isCloudActive) return;

  HTTPClient http;
  String url = cfgApiBase + "/api/device/" + cfgDeviceId + "/command";
  http.begin(url);
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  addAuthHeaders(http);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[cmd] GET http %d\n", code);
    http.end();
    return;
  }
  String resp = http.getString();
  http.end();

  if (resp.indexOf("\"command\":null") >= 0) return;

  long  id   = -1;
  String type;
  long  dur  = 5;
  if (!extractJsonInt(resp, "id",   &id))   return;
  if (!extractJsonStr(resp, "type", &type)) return;
  extractJsonInt(resp, "durationSeconds", &dur);
  if (dur < 1)   dur = 1;
  if (dur > 120) dur = 120;

  Serial.printf("[cmd] start id=%ld type=%s dur=%lds\n", id, type.c_str(), dur);

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
    "<label>Server URL <span class=\"hint\">(ปกติไม่ต้องแก้)</span></label>"
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

  html += "<div class=\"card\"><h2>⚙️ ตั้งค่า</h2><p style=\"color:#6c757d;font-size:13px;\">เปลี่ยน Wi-Fi หรือใส่ Token ใหม่</p>";
  html += "<a href=\"/reset\" class=\"btn btn-gray\" onclick=\"return confirm('ล้างค่าและกลับเข้าโหมดตั้งค่าใหม่?')\">ตั้งค่าใหม่</a></div>";

  html += "<div class=\"meta\">API: " + htmlEscape(cfgApiBase) + " · Device: " + htmlEscape(cfgDeviceId) + "</div>";

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

// ===== 12. Setup / Loop =====
void setup() {
  Serial.begin(115200);
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
  Serial.print("Cloud target -> ");
  Serial.println(cfgApiBase);

  server.on("/",           handleRoot);
  server.on("/on",         handleOn);
  server.on("/off",        handleOff);
  server.on("/moisture",   handleMoisture);
  server.on("/fertilizer", handleFertilizer);
  server.on("/reset",      handleReset);
  server.begin();

  // ให้ post ความชื้นแรกเกิดใน loop (หลัง UI พร้อม) แทน blocking ใน setup — #5
  lastSensorPost = millis() - SENSOR_POST_MS;
}

void loop() {
  // โหมดตั้งค่า — เสิร์ฟ captive portal อย่างเดียว
  if (configMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  server.handleClient();
  unsigned long now = millis();

  // Wi-Fi หลุด (router รีบูต / ต่อไม่ติดตอน boot) — ลอง reconnect เป็นระยะ ไม่ค้าง offline — #1
  if (WiFi.status() != WL_CONNECTED && now - lastWifiTry >= WIFI_RETRY_MS) {
    lastWifiTry = now;
    Serial.println("[wifi] disconnected -> reconnecting...");
    WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
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
      Serial.printf("[auto] start watering — pct=%d\n", pct);
    } else if (autoWaterActive) {
      if (pct > AUTO_WATER_OFF_PCT) {
        autoWaterActive = false;
        Serial.printf("[auto] stop watering — recovered to pct=%d\n", pct);
      } else if (now - autoWaterStartedAt > AUTO_WATER_MAX_MS) {
        autoWaterActive = false;
        autoWaterLocked = true;
        Serial.printf("[auto] WARNING: max duration %lums hit at pct=%d — sensor may be faulty, locking out\n",
                      AUTO_WATER_MAX_MS, pct);
      }
    }
    if (autoWaterActive) openWaterValve();
    else                 closeAll();
  }

  // --- Cloud sync (ทำตามรอบ ไม่บล็อก loop) ---
  // ระหว่างคำสั่ง cloud ยิง sensor ถี่ขึ้น (30 วิ) เป็น heartbeat กัน dashboard เด้ง offline
  // ทั้งที่ปั๊มยังทำงาน (pollCommand ไม่ส่ง heartbeat ตอน isCloudActive) — #6
  unsigned long postInterval = isCloudActive ? CLOUD_HEARTBEAT_MS : SENSOR_POST_MS;
  if (now - lastSensorPost >= postInterval) {
    lastSensorPost = now;
    postSensor();
  }
  if (now - lastCommandPoll >= COMMAND_POLL_MS) {
    lastCommandPoll = now;
    pollCommand();
  }
}
