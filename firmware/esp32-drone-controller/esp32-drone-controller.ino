#include <WiFi.h>
#include <WebServer.h>
#include <esp_timer.h>
#include "secrets.h"

// The two outputs drive isolated, normally-open switches only. Never wire GPIO
// directly to the remote-controller button contacts or battery supply.
constexpr uint8_t TAKEOFF_PIN = 18;
constexpr uint8_t LAND_PIN = 19;
constexpr uint8_t ENABLE_PIN = 23; // physical switch to GND, INPUT_PULLUP
constexpr unsigned long BUTTON_PULSE_MS = 200; // test value; verify on hardware
constexpr unsigned long COMMAND_COOLDOWN_MS = 1500;
constexpr unsigned long HEARTBEAT_INTERVAL_MS = 3000;
constexpr unsigned long CONNECTION_TIMEOUT_MS = 15000;
constexpr char DEVICE_ID[] = "wildtrace-esp32-01";
constexpr char FIRMWARE_VERSION[] = "1.0.0";

WebServer server(80);
esp_timer_handle_t pulseTimer = nullptr;
volatile bool pulseExpiredFlag = false;
enum Output { NONE, TAKEOFF, LAND };
Output activeOutput = NONE;
unsigned long pulseStartedAt = 0;
unsigned long lastCommandAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long sequenceNumber = 0;
bool cooldownStarted = false;
bool armed = false;
String lastCommandId = "";
String lastCommandType = "";
String lastCommandStatus = "none";

bool enablePresent() { return digitalRead(ENABLE_PIN) == LOW; }
void outputsLow() {
  if (pulseTimer) esp_timer_stop(pulseTimer);
  digitalWrite(TAKEOFF_PIN, LOW);
  digitalWrite(LAND_PIN, LOW);
  activeOutput = NONE;
}
void pulseExpired(void*) {
  // Timer task runs even if HTTP response transmission is slow.
  digitalWrite(TAKEOFF_PIN, LOW);
  digitalWrite(LAND_PIN, LOW);
  pulseExpiredFlag = true;
}
String quoted(const String& value) {
  String out = "\"";
  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '"' || c == '\\') out += '\\';
    if (c >= 32) out += c;
  }
  return out + "\"";
}
void json(int code, const String& body) {
  server.sendHeader("Cache-Control", "no-store");
  server.send(code, "application/json", body);
}
void errorResponse(int code, const String& message) {
  json(code, "{\"message\":" + quoted(message) + "}");
}
bool authorized() {
  if (strlen(DEVICE_COMMAND_TOKEN) < 16 || String(DEVICE_COMMAND_TOKEN).startsWith("CHANGE_") ||
      server.header("X-Device-Token") != DEVICE_COMMAND_TOKEN) {
    errorResponse(401, "Device command token missing or invalid");
    return false;
  }
  return true;
}
String baseStatus() {
  return "\"device_id\":" + quoted(DEVICE_ID) +
    ",\"device_type\":\"esp32-remote-bridge\"" +
    ",\"firmware_version\":" + quoted(FIRMWARE_VERSION) +
    ",\"connected\":true,\"armed\":" + String(armed ? "true" : "false") +
    ",\"physical_enable\":" + String(enablePresent() ? "true" : "false") +
    ",\"takeoff_output_active\":" + String(activeOutput == TAKEOFF ? "true" : "false") +
    ",\"landing_output_active\":" + String(activeOutput == LAND ? "true" : "false") +
    ",\"gps_available\":false,\"flight_state\":\"unknown\"" +
    ",\"last_command_id\":" + quoted(lastCommandId) +
    ",\"last_command_type\":" + quoted(lastCommandType) +
    ",\"last_command_status\":" + quoted(lastCommandStatus);
}
void respondCommand(const String& type, const String& status, const String& message) {
  String body = "{\"command_id\":" + quoted(lastCommandId) +
    ",\"timestamp_ms\":" + String(millis()) +
    ",\"type\":" + quoted(type) +
    ",\"status\":" + quoted(status) +
    ",\"message\":" + quoted(message) +
    ",\"drone_response_confirmed\":false}";
  json(202, body);
}
void beginPulse(Output output, const String& name) {
  if (!authorized()) return;
  if (!pulseTimer) { errorResponse(503, "Pulse timer unavailable"); return; }
  unsigned long now = millis();
  if (!enablePresent()) { armed = false; errorResponse(409, "Physical enable switch is open"); return; }
  // Landing stays available while connected and physically enabled, even if
  // the software arm state was cleared. It remains a button pulse, not proof
  // of a landing or a motor-stop command.
  if (!armed && output != LAND) { errorResponse(409, "Controller is not armed"); return; }
  if (activeOutput != NONE) { errorResponse(409, "Another button pulse is active"); return; }
  // Permit a landing request immediately after a takeoff pulse completes;
  // repeated land requests still observe the cooldown.
  if (cooldownStarted && now - lastCommandAt < COMMAND_COOLDOWN_MS &&
      (output == TAKEOFF || lastCommandType == "land")) {
    errorResponse(429, "Command cooldown active"); return;
  }
  outputsLow();
  lastCommandId = String(DEVICE_ID) + "-" + String(++sequenceNumber);
  lastCommandType = name;
  lastCommandStatus = "gpio_pulse_active";
  pulseStartedAt = now;
  pulseExpiredFlag = false;
  lastCommandAt = now;
  cooldownStarted = true;
  activeOutput = output;
  digitalWrite(output == TAKEOFF ? TAKEOFF_PIN : LAND_PIN, HIGH);
  if (esp_timer_start_once(pulseTimer, BUTTON_PULSE_MS * 1000ULL) != ESP_OK) {
    outputsLow();
    lastCommandStatus = "timer_error";
    errorResponse(503, "Pulse timer could not start; outputs disabled");
    return;
  }
  Serial.println(name + " accepted: " + lastCommandId + " (drone response unverified)");
  respondCommand(name, "gpio_pulse_active", "GPIO pulse started; remote actuation and drone response unverified");
}
void setup() {
  // Latches LOW before switching pins to outputs.
  digitalWrite(TAKEOFF_PIN, LOW);
  digitalWrite(LAND_PIN, LOW);
  pinMode(TAKEOFF_PIN, OUTPUT);
  pinMode(LAND_PIN, OUTPUT);
  pinMode(ENABLE_PIN, INPUT_PULLUP);
  outputsLow();
  Serial.begin(115200);
  esp_timer_create_args_t timerArgs = {};
  timerArgs.callback = &pulseExpired;
  timerArgs.name = "button_pulse";
  if (esp_timer_create(&timerArgs, &pulseTimer) != ESP_OK) {
    Serial.println("ERROR: pulse timer unavailable; refusing command output");
  }

  if (WIFI_STATION_MODE && strlen(WIFI_SSID) > 0 && strlen(WIFI_PASSWORD) > 0 &&
      !String(WIFI_PASSWORD).startsWith("ENTER_") && !String(WIFI_SSID).startsWith("YOUR_")) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECTION_TIMEOUT_MS) delay(50);
    if (WiFi.status() == WL_CONNECTED) Serial.println("Station IP: " + WiFi.localIP().toString());
    else Serial.println("Station connection failed; starting field AP");
  } else if (WIFI_STATION_MODE) {
    Serial.println("Station credentials incomplete; starting field AP");
  }
  if (!WIFI_STATION_MODE || WiFi.status() != WL_CONNECTED) {
    WiFi.mode(WIFI_AP);
    if (strlen(AP_PASSWORD) < 8 || String(AP_PASSWORD).startsWith("CHANGE_")) Serial.println("ERROR: set a unique AP password in secrets.h");
    else if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) Serial.println("ERROR: AP could not start");
    else Serial.println("AP IP: " + WiFi.softAPIP().toString());
  }

  const char* headers[] = { "X-Device-Token" };
  server.collectHeaders(headers, 1);
  server.on("/health", HTTP_GET, []() {
    json(200, "{\"status\":\"ok\"," + baseStatus() + "}");
  });
  server.on("/api/status", HTTP_GET, []() { json(200, "{" + baseStatus() + "}"); });
  server.on("/api/commands/arm", HTTP_POST, []() {
    if (!authorized()) return;
    if (!enablePresent() || activeOutput != NONE) { errorResponse(409, "Physical enable must be closed and outputs inactive"); return; }
    armed = true;
    lastCommandId = String(DEVICE_ID) + "-" + String(++sequenceNumber);
    lastCommandType = "arm";
    lastCommandStatus = "accepted";
    Serial.println("Armed; no drone flight state implied");
    respondCommand("arm", "accepted", "Controller armed; no GPIO pulse or drone response implied");
  });
  server.on("/api/commands/takeoff", HTTP_POST, []() { beginPulse(TAKEOFF, "takeoff"); });
  server.on("/api/commands/land", HTTP_POST, []() { beginPulse(LAND, "land"); });
  server.on("/api/commands/disarm", HTTP_POST, []() {
    if (!authorized()) return;
    outputsLow();
    armed = false;
    lastCommandId = String(DEVICE_ID) + "-" + String(++sequenceNumber);
    lastCommandType = "disarm";
    lastCommandStatus = "accepted";
    Serial.println("Outputs disabled; airborne motors are NOT stopped by this action");
    respondCommand("disarm", "accepted", "Outputs disabled; this cannot stop an airborne drone");
  });
  server.onNotFound([]() { errorResponse(404, "Unknown endpoint; legacy GET /start and /stop are unsupported"); });
  server.begin();
  Serial.println("WildTrace controller ready. Outputs LOW; physical enable required.");
}

void loop() {
  // Pulse completion is independent of Wi-Fi or HTTP client state.
  if (activeOutput != NONE && (pulseExpiredFlag || millis() - pulseStartedAt >= BUTTON_PULSE_MS)) {
    outputsLow();
    pulseExpiredFlag = false;
    lastCommandStatus = "gpio_pulse_completed";
    Serial.println(lastCommandType + " GPIO pulse completed; drone response unverified");
  }
  if (!enablePresent() && (armed || activeOutput != NONE)) {
    outputsLow();
    armed = false;
    if (lastCommandStatus == "gpio_pulse_active") lastCommandStatus = "interrupted_by_physical_disable";
  }
  bool networkReady = WiFi.getMode() == WIFI_AP ? WiFi.softAPgetStationNum() > 0 : WiFi.status() == WL_CONNECTED;
  if (!networkReady && (armed || activeOutput != NONE)) {
    outputsLow();
    armed = false;
    lastCommandStatus = "disarmed_on_network_loss";
  }
  if (millis() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = millis();
    if (WIFI_STATION_MODE && WiFi.getMode() == WIFI_STA && WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  }
  server.handleClient();
}
