# Tadoba Sentinel ESP32 integration

The existing React/Vite dashboard is in `frontend/`. The Node gateway in `backend/` listens only on `127.0.0.1:3099`, detects the laptop network, scans for compatible ESP32 devices, and sends HTTP requests to an ESP32 on a private IPv4 address. The Arduino sketch is in `firmware/esp32-drone-controller/`. Settings → Device Connection now shows network mode, discovered devices, connection status, command controls, telemetry if available, and an event log. Missions has separate manual controls and browser saved mission records. Live Map displays a live drone marker only when recent telemetry from a flight controller or external gateway is supplied.

The current E88 remote bridge has **no verified remote switch interface, drone GPS link, or flight state feedback**. GPIO pulses and ESP32 acknowledgements must never be described as confirmed takeoff or landing. The older firmware's `GET /start` and `GET /stop` are removed; `/stop` only drove GPIO18 low and never landed the drone.

## Install and run on Windows

Use separate PowerShell terminals from this repository:

```powershell
cd backend
npm ci
# Copy .env.example to .env.local once. Replace both token placeholders.
# OPERATOR_TOKEN is entered in Settings; ESP32_COMMAND_TOKEN must match secrets.h.
npm start
```

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
```

Open `http://localhost:5174`. If the backend runs on a different local address, set `VITE_GATEWAY_URL` in `frontend/.env` before starting Vite. Keep the backend bound to loopback. The operator token is entered in Settings and held in browser session storage; it is never the ESP32 token. The ESP32 token stays in the firmware and `backend/.env.local`; they must match. The readiness endpoint reports whether both are configured without revealing their values. Do not use development credentials from the old sketch. Both `npm start` and the legacy `npm run discovery` command provide the full gateway routes on port 3099.

## Flash the ESP32-WROOM-32

1. In Arduino IDE, install the Espressif ESP32 board package. Select **ESP32 Dev Module** (or the exact board variant if known), then select the CP2102 **COM port** shown in Device Manager.
2. Copy `firmware/esp32-drone-controller/secrets.example.h` to `secrets.h` in that folder. Set station Wi-Fi credentials, a unique AP password (at least eight characters), and a long random `DEVICE_COMMAND_TOKEN`. Set the backend `ESP32_COMMAND_TOKEN` to exactly that value. The real `secrets.h` is ignored by Git.
3. Open `esp32-drone-controller.ino`, verify and upload. Open Serial Monitor at 115200 baud. Both outputs initialize LOW. GPIO23 is a physical enable input using `INPUT_PULLUP`; open means disabled, connecting it to GND means enabled. Use a physical switch, not a software-only jumper in field use.
4. With `WIFI_STATION_MODE = true`, the sketch joins the configured router/hotspot and prints its DHCP IP. If it cannot connect within 15 seconds, it starts the field AP. With `false`, it starts the AP directly. The AP address is normally `192.168.4.1`. Connecting a laptop to this AP may interrupt normal Wi-Fi access.

The firmware uses GPIO18 for a **takeoff button** pulse and GPIO19 for a **landing button** pulse. The 200 ms duration is an initial test value. Each output must drive an electrically isolated, normally open switch across the corresponding K5 or K3 contacts. The switch driver must default **off** during ESP32 reset, power loss, and pin startup; use appropriate external biasing and verify it on the actual circuit. Software only drives LOW once `setup()` runs. Never connect a GPIO pin directly to the unknown controller voltage or battery. Measure both contacts and isolation with a multimeter first. The ESP32 and remote controller retain separate supplies. No physical wiring design has been validated by this repository.

## First test with the remote disconnected

1. Leave both remote-controller button contacts disconnected from the electronic switches. Confirm GPIO18 and GPIO19 are LOW after reset with a suitable meter or logic probe.
2. Connect the laptop to the ESP32 AP or the same station network. Run `Invoke-RestMethod http://192.168.4.1/health` and `Invoke-RestMethod http://192.168.4.1/api/status` if using AP mode; substitute the printed DHCP address in station mode. `/health` reports the device identity and firmware version. `/api/status` reports the actual arm and GPIO output states and `flight_state: "unknown"`.
3. In Settings → Device Connection, confirm the current laptop Wi-Fi, adapter IP, subnet, mask, and gateway. The local gateway reads the active laptop Wi-Fi interface directly and refreshes the connection page every three seconds. On **WildTrace-ESP32** it probes `192.168.4.1:80`; on shared Wi-Fi it scans the active adapter's private IPv4 subnet on ports 80 and 8080, up to 1022 hosts. Select a discovered ESP32, enter the backend operator token, then press **Connect selected IP**. The scanner shows only firmware that identifies itself as the ESP32 remote bridge; it may not cross subnet or Wi-Fi isolation boundaries. Use the manual IP fields when needed. The optional auto-reconnect setting remembers compatible device IDs in this browser and retries them after discovery; turning it off stops retries, and Disconnect removes the device from the remembered list.
4. Close the GPIO23 physical enable switch. Test the outputs with the remote disconnected. Record measured electrical isolation and both pulse tests in the hardware verification panel. This is an operator record; the software cannot measure isolation itself.
5. In Settings or Missions, select the connected ESP32, complete the operator preflight checkbox, Arm, type the exact takeoff confirmation text, then press **Takeoff GPIO18**. Check GPIO18 rises briefly and returns LOW; GPIO19 stays LOW. Request **Land GPIO19** separately and check the opposite output. **Disarm** clears software arm and both outputs; it cannot stop an airborne drone. Hover and Emergency Stop remain disabled because this bridge has no verified implementation of those commands.
6. Observe `last_command_status` through View Status or the endpoint. `gpio_pulse_active` means the command was accepted and an output was asserted. `gpio_pulse_completed` means the output returned LOW. Neither confirms that a remote contact closed or that the drone moved. Repeat the test after reset; both outputs must remain LOW. Test network interruption and the physical enable opening while an output is active.

The equivalent backend API calls use `X-Operator-Token` and POST. For example, after connecting in Settings and recording verification:

```powershell
$headers = @{ 'X-Operator-Token' = 'your-operator-token' }
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3099/api/devices/wildtrace-esp32-01/commands/arm' -Headers $headers
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3099/api/devices/wildtrace-esp32-01/commands/takeoff' -Headers $headers -ContentType 'application/json' -Body '{"confirmation":"TAKEOFF wildtrace-esp32-01","preflightConfirmed":true}'
Invoke-RestMethod -Uri 'http://127.0.0.1:3099/api/devices/wildtrace-esp32-01/status'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3099/api/devices/wildtrace-esp32-01/commands/land' -Headers $headers
```

Once output testing passes, verify the isolated switches actually close the intended K5/K3 contacts with the remote powered but drone unpowered. Flight testing requires a controlled area and an independent way to observe the drone. The dashboard never infers flight state from a button command.

## Telemetry and missions

The ESP32 remote bridge has no drone GPS or altitude/battery feed. Live Map shows **“Live drone location unavailable — GPS telemetry not connected”** until a trusted flight controller or external telemetry gateway posts recent drone position to `POST /api/devices/:id/telemetry` with the operator token. Accepted `source` values are `flight_controller`, `external_gateway`, and explicitly labeled `simulation`; the payload needs a recent ISO `timestamp`, numeric `latitude` and `longitude`, and `gps_fix: true`. Optional altitude, heading, speed, and battery stay `null` when unavailable. The map polls the gateway every three seconds, hides stale markers after ten seconds, and retains up to 300 route points in gateway memory. A GPS receiver attached to a stationary remote controller must not be sent as drone telemetry. GPS coordinates alone do not provide waypoint navigation.

Mission records in the browser support name, assigned ESP32, operator, planned time, manual status, optional planned route points, and operator notes. A route with at least two points can be displayed as a dashed plan on Live Map. It is never sent to this hardware. Mark a record active before sending commands from the same browser tab; the gateway tags command events with that mission ID, and the record displays those events. The historical sample mission cards remain demo data. Assisted, RTL, hold, and autonomous waypoint execution are unsupported by the current E88 remote bridge and are not sent to hardware. Mission records are local to one browser and are not an authoritative flight log.

## Verification and troubleshooting

Run `npm test` in `backend/` to exercise the gateway against a simulated ESP32 HTTP responder. Run `npm test`, `npm run build`, and `npm run lint` in `frontend/` to check command gating, telemetry freshness, and compilation. The firmware has not been compiled or flashed automatically here; use Arduino IDE Verify and the physical test sequence above. End-to-end hardware behavior remains unverified until performed on the actual board and isolated switch circuit.

- **Gateway unavailable:** Check that `npm start` is running and `http://127.0.0.1:3099/health` answers. Frontend and backend are separate processes.
- **“Unexpected token '<'” in Settings:** An older discovery-only server on port 3099 returns an HTML 404 for gateway routes. Stop that process and run `npm start` in `backend/`; the full gateway must serve `/api/network/current`, `/api/gateway/readiness`, and `/api/devices`.
- **Device unreachable:** Confirm the laptop and ESP32 share a reachable network. In AP mode, join the ESP32 SSID; in station mode, check the DHCP address printed to Serial Monitor. A scanner cannot cross isolated subnets; use manual IP entry.
- **Wi-Fi name unavailable:** On Windows, `netsh` can require Location services permission to expose the exact SSID. The Settings page then shows the Windows network profile and laptop IP, and labels a `192.168.4.x` connection with gateway `192.168.4.1` as a SoftAP candidate. Grant Windows Location permission for the exact SSID; the gateway cannot bypass it.
- **Classic HTML ESP32 page:** Choose **Classic HTML page · read only** and enter its IP. The gateway checks that an HTML page responds and shows its title. HTML alone cannot identify the board or prove what a `/start` or `/stop` link does, so no flight commands are mapped to it. Add verified POST command routes and device identity before enabling controls for other firmware.
- **401 from gateway:** `OPERATOR_TOKEN` is unset or differs from the Settings token. **401 from ESP32:** `ESP32_COMMAND_TOKEN` differs from `DEVICE_COMMAND_TOKEN`.
- **Commands disabled:** Complete the physical interface test record, close GPIO23 enable, arm for takeoff, complete preflight, and type the exact confirmation. Landing requires a connected, verified device and closed physical enable. It can be requested even if software arm has cleared.
- **No live map marker:** No fresh drone telemetry has arrived. The ESP32 bridge's own location is not drone location.
- **GPIO output stays inactive:** Check physical enable input and Serial Monitor, then verify the device token and cooldown. Never bypass electrical isolation to make a test pass.
