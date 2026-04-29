#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>

// ===== 1. Wi-Fi =====
const char* ssid = "Chalom-2.4G";
const char* password = "0917524416";

// ===== 2. Cloud config (แก้ตรงนี้ถ้า PC IP / device id เปลี่ยน) =====
const char* API_BASE     = "http://192.168.1.7:3000";
const char* DEVICE_ID    = "POT-001";
// Bearer token จาก backend หลัง register บนเว็บ (โชว์รอบเดียว — ห้ามทำหาย)
// ลงทะเบียนใหม่ = backend rotate token = ต้องอัปค่านี้แล้ว re-flash
const char* DEVICE_TOKEN = "PASTE-TOKEN-FROM-WEB-HERE";

// ===== 3. Pins =====
const int sensorPin          = 34;
const int pumpPin            = 27;
const int valveWaterPin      = 32;
const int valveFertilizerPin = 33;

// ===== 4. Moisture calibration (raw ADC -> percent) =====
//   ปรับ 2 ค่านี้ให้ตรง sensor จริง: วัด raw ตอน "แห้งสนิท" และ "จุ่มน้ำ" แล้วใส่
const int RAW_DRY = 3500;   // ค่า raw ตอนแห้ง  -> 0%
const int RAW_WET = 1500;   // ค่า raw ตอนจุ่มน้ำ -> 100%

// ===== 5. Auto rules / intervals =====
int                 threshold          = 2000;   // raw — ออโต้รดน้ำเมื่อ raw > threshold (แห้ง)
const unsigned long FERT_DURATION_MS   = 5000;   // ปุ่มปุ๋ย local = 5 วิ
const unsigned long SENSOR_POST_MS     = 30000;  // POST /api/sensor ทุก 30 วิ
const unsigned long COMMAND_POLL_MS    = 5000;   // poll /command ทุก 5 วิ

// ===== 6. State =====
WebServer server(80);

bool          isFertilizing = false;
unsigned long fertStartTime = 0;

bool          isManualWater = false;

// Cloud-driven action override
bool          isCloudActive    = false;
String        cloudType        = "";
long          cloudCmdId       = -1;
unsigned long cloudStart       = 0;
unsigned long cloudDurationMs  = 0;

unsigned long lastSensorPost  = 0;
unsigned long lastCommandPoll = 0;

// ===== 7. Hardware helpers =====
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

// ===== 8. Cloud client =====
// แนบ Authorization + Content-Type ให้ทุก request — backend middleware ใช้ verify
void addAuthHeaders(HTTPClient& http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
}

void postSensor() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(API_BASE) + "/api/sensor";
  http.begin(url);
  addAuthHeaders(http);
  int pct = readMoisturePercent();
  String body = String("{\"deviceId\":\"") + DEVICE_ID +
                "\",\"moisturePercent\":" + pct + "}";
  int code = http.POST(body);
  Serial.printf("[sensor] POST %d  pct=%d\n", code, pct);
  http.end();
}

void ackCommand(long id, const char* status) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(API_BASE) + "/api/device/" + DEVICE_ID +
               "/command/" + String(id) + "/ack";
  http.begin(url);
  addAuthHeaders(http);
  String body = String("{\"status\":\"") + status + "\"}";
  int code = http.POST(body);
  Serial.printf("[ack] id=%ld status=%s -> http %d\n", id, status, code);
  http.end();
}

// JSON ตัวเล็กๆ — extract แบบ manual ไม่ต้องลง ArduinoJson
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
  if (isCloudActive) return;   // กำลังทำคำสั่งอยู่ ไม่ต้อง poll คำสั่งใหม่

  HTTPClient http;
  String url = String(API_BASE) + "/api/device/" + DEVICE_ID + "/command";
  http.begin(url);
  addAuthHeaders(http);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[cmd] GET http %d\n", code);
    http.end();
    return;
  }
  String resp = http.getString();
  http.end();

  // ไม่มีคำสั่ง pending — backend ตอบ {"command":null}
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
    // ประเภทคำสั่งไม่รู้จัก — ack failed ทันที (backend จะคืนแต้มให้)
    isCloudActive = false;
    closeAll();
    ackCommand(id, "failed");
  }
}

// ===== 9. Local web UI (ของเดิม + เพิ่มสถานะ Cloud) =====
void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body{font-family:sans-serif;text-align:center;background:#e9ecef;padding:20px;} .card{background:#fff;padding:20px;border-radius:10px;margin-bottom:20px;box-shadow:0 4px 8px rgba(0,0,0,0.1);} .btn{padding:12px;font-size:16px;color:#fff;background:#28a745;border:none;border-radius:5px;cursor:pointer;margin:5px;text-decoration:none;display:inline-block;} .btn-primary{background:#007bff;} .btn-danger{background:#dc3545;} .meta{font-size:12px;color:#6c757d;margin-top:8px;font-family:monospace;}</style></head><body>";

  html += "<h1>💧 Run for Water</h1>";

  // ส่วน 1: ความชื้น
  html += "<div class=\"card\"><h2>ความชื้นในดิน</h2>";
  html += "<h1 id=\"moistureValue\" style=\"color:#007bff;font-size:60px;margin:10px 0;\">--</h1>";
  html += "<p style=\"color:#6c757d;font-size:14px;\">ระบบออโต้จะทำงานเมื่อค่าเกิน " + String(threshold) + "</p></div>";

  // ส่วน 2: Manual + Cloud status
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

  // ส่วน 3: ปุ๋ย local
  html += "<div class=\"card\"><h2>🏆 ให้รางวัลต้นไม้</h2>";
  html += "<button class=\"btn\" onclick=\"giveFertilizer()\">วิ่งครบ 5KM (สั่งจ่ายปุ๋ย 5 วิ)</button>";
  html += "<p id=\"statusText\" style=\"color:#dc3545;font-weight:bold;margin-top:15px;\"></p></div>";

  // Meta — ดูได้ว่าบอร์ดยิงไปที่ไหน
  html += "<div class=\"meta\">API: " + String(API_BASE) + " · Device: " + String(DEVICE_ID) + "</div>";

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

// ===== 10. Setup / Loop =====
void setup() {
  Serial.begin(115200);
  pinMode(pumpPin,            OUTPUT);
  pinMode(valveWaterPin,      OUTPUT);
  pinMode(valveFertilizerPin, OUTPUT);
  closeAll();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  Serial.print("Wi-Fi connected. Local UI -> http://");
  Serial.println(WiFi.localIP());
  Serial.print("Cloud target -> ");
  Serial.println(API_BASE);

  server.on("/",            handleRoot);
  server.on("/on",          handleOn);
  server.on("/off",         handleOff);
  server.on("/moisture",    handleMoisture);
  server.on("/fertilizer",  handleFertilizer);
  server.begin();
}

void loop() {
  server.handleClient();
  unsigned long now = millis();

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
    int raw = analogRead(sensorPin);
    if (raw > threshold) openWaterValve();
    else                 closeAll();
  }

  // --- Cloud sync (ทำตามรอบ ไม่บล็อก loop) ---
  if (now - lastSensorPost >= SENSOR_POST_MS) {
    lastSensorPost = now;
    postSensor();
  }
  if (now - lastCommandPoll >= COMMAND_POLL_MS) {
    lastCommandPoll = now;
    pollCommand();
  }
}
