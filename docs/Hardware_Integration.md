# Hardware Integration Guide

## Arduino/Raspberry Pi Setup

### Required Components
- Arduino Uno/ESP32 or Raspberry Pi
- 8-channel Relay Module
- LED strips or bulbs for each table
- Network connectivity (WiFi/Ethernet)

### Arduino Code Example
```cpp
#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

WebServer server(80);
int relayPins[8] = {2, 3, 4, 5, 6, 7, 8, 9};

void setup() {
  Serial.begin(115200);
  
  // Initialize relay pins
  for (int i = 0; i < 8; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], LOW);
  }
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  // Setup HTTP endpoints
  server.on("/light/1/on", HTTP_POST, []() { controlLight(0, true); });
  server.on("/light/1/off", HTTP_POST, []() { controlLight(0, false); });
  // ... repeat for all 8 tables
  
  server.begin();
}

void loop() {
  server.handleClient();
}

void controlLight(int tableIndex, bool on) {
  digitalWrite(relayPins[tableIndex], on ? HIGH : LOW);
  server.send(200, "application/json", "{\"success\":true}");
}
```

## Raspberry Pi Setup
```bash
# Install dependencies
sudo apt update
sudo apt install python3-pip python3-flask

# Install GPIO library
pip3 install RPi.GPIO flask

# Run the hardware service
python3 hardware_service.py
```

## Python Service Example
```python
#!/usr/bin/env python3
import RPi.GPIO as GPIO
from flask import Flask, request, jsonify
import json

app = Flask(__name__)

# GPIO pins for each table (BCM numbering)
RELAY_PINS = [18, 19, 20, 21, 22, 23, 24, 25]

# Setup GPIO
GPIO.setmode(GPIO.BCM)
for pin in RELAY_PINS:
    GPIO.setup(pin, GPIO.OUT)
    GPIO.output(pin, GPIO.LOW)

@app.route('/light/<int:table_id>/<action>', methods=['POST'])
def control_light(table_id, action):
    try:
        if table_id < 1 or table_id > 8:
            return jsonify({"error": "Invalid table ID"}), 400
        
        pin_index = table_id - 1
        state = GPIO.HIGH if action == 'on' else GPIO.LOW
        
        GPIO.output(RELAY_PINS[pin_index], state)
        
        return jsonify({
            "success": True,
            "table_id": table_id,
            "action": action,
            "pin": RELAY_PINS[pin_index]
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=80)
    finally:
        GPIO.cleanup()
```

## Environment Configuration
Update your `.env` file:
```env
HARDWARE_ENABLED=true
ARDUINO_HOST=192.168.1.100
ARDUINO_PORT=80
```

## Testing Hardware Integration
```bash
# Test light control
curl -X POST http://localhost:8080/api/lights/1/toggle \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

## Troubleshooting
1. **Connection Issues**: Check network connectivity and firewall settings
2. **GPIO Errors**: Ensure proper wiring and GPIO permissions
3. **Timing Issues**: Add delays between relay operations if needed
4. **Power Supply**: Ensure adequate power for all relays and lights

## Wiring Diagram
```
Table 1 -> Relay Pin 2  -> GPIO 18 (RPi) / Pin 2 (Arduino)
Table 2 -> Relay Pin 3  -> GPIO 19 (RPi) / Pin 3 (Arduino)
Table 3 -> Relay Pin 4  -> GPIO 20 (RPi) / Pin 4 (Arduino)
Table 4 -> Relay Pin 5  -> GPIO 21 (RPi) / Pin 5 (Arduino)
Table 5 -> Relay Pin 6  -> GPIO 22 (RPi) / Pin 6 (Arduino)
Table 6 -> Relay Pin 7  -> GPIO 23 (RPi) / Pin 7 (Arduino)
Table 7 -> Relay Pin 8  -> GPIO 24 (RPi) / Pin 8 (Arduino)
Table 8 -> Relay Pin 9  -> GPIO 25 (RPi) / Pin 9 (Arduino)
```

## Safety Considerations
- Use appropriate fuses for each circuit
- Ensure proper grounding
- Use optoisolated relays for safety
- Test all connections before connecting to mains power
- Consider using low-voltage LED strips for safety