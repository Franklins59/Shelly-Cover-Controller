# Shelly Cover Controller (Gen3)

**Control a Shelly Plus 2PM (Gen3) roller shutter / blind with a Shelly i4 (Gen3)**  
using Shelly Script (JS, Gen3). Supports *short*, *double* and *long* presses on the i4,
custom presets, slat-nudging, and safe cover movement.

---

German version below

## 🧩 Overview

This project connects a **Shelly i4 Gen3** (input controller) with one or more **Shelly Plus 2PM Gen3**
(actuator) using Shelly Script and local KVS (Key-Value Store) messaging.

- **i4 Script:** Detects button events (short / double / long press) and sends commands to the target 2PM.  
- **2PM Script:** Interprets these commands, executes cover movements, presets, and slat-nudging.  
- **Communication:** 100% local via **KVS**, no polling, no cloud.  
- **Multi-target control:** One i4 can operate multiple 2PMs simultaneously.

> ⚠️ Works only with **calibrated covers with mechanical endstops**.  
> Non-calibrated covers may not move accurately.

---

## 🧰 Components

| Device | Type / Gen | Script | Purpose |
|---------|-------------|---------|----------|
| Shelly i4 Gen3 | Input controller | `scripts/ScriptI4.js` | Sends commands |
| Shelly Plus 2PM Gen3 | Actuator | `scripts/Script2PM.js` | Executes commands |

---

## 🚀 Installation

### 1️⃣ On Shelly i4 Gen3
1. Web-UI → **Scripts → + → Paste ScriptI4.js**
2. Set the IP/hostname of your 2PM: `target_2pm_ip`
3. Enable “Run on boot”

### 2️⃣ On Shelly Plus 2PM Gen3
1. Web-UI → **Scripts → + → Paste Script2PM.js**
2. Enable “Run on boot”
3. (Optional) Adjust presets and nudging times using KVS

Example RPC calls:
```bash
# Set 2PM target IP on i4
http://<I4-IP>/rpc/KVS.Set?key=target_2pm_ip&value="192.168.1.63"

# Preset 1 on 2PM (e.g. 40% open)
http://192.168.1.63/rpc/KVS.Set?key=preset_1&value=40

# Nudging (in milliseconds)
http://192.168.1.63/rpc/KVS.Set?key=nudge_up_ms&value=800
http://192.168.1.63/rpc/KVS.Set?key=nudge_down_ms&value=600
```

### 3️⃣ Testing
- **Short press →** Move up/down  
- **Double press →** Move to preset position  
- **Long press →** Slat nudge (fine adjustment)

---

## 🧠 Function Flow

```
[i4 Input] → [ScriptI4.js]
   ⇓ (HTTP RPC / KVS)
[2PM KVS Entry] → [Script2PM.js]
   ⇓
[Cover.Move / Stop / Preset / Nudge]
```

- KVS entries handle all communication (`coverex_cmd`, `preset_*`, …)
- No polling, no cloud dependency
- Clean separation of logic: one script per device

---

## ⚙️ Configurable KVS Parameters on 2PM

| Key | Unit | Description | Default |
|-----|------|-------------|----------|
| `nudge_down_ms` | ms | Short down nudge time | 600 |
| `nudge_up_ms` | ms | Short up nudge time | 800 |
| `poll_interval_ms` | ms | polling interval | 50 |
| `preset_1` | % | Preset position 1 | 60 |
| `preset_2` | % | Preset position 2 | 40 |
| `slat_full_down_ms` | ms | Full down slat tilt | 1700 |
| `slat_full_up_ms` | ms | Full up slat tilt | 2000 |
| `slat_pos_1` | % | Preset slat position 1 | 50 |
| `slat_pos_2` | % | Preset slat position 2 | 50 |

## ⚙️ Configurable KVS Parameters on I4

| Key | Unit | Description | Default |
|-----|------|-------------|----------|
| `target_2pm_ips` | IP | Target IPs called from I4, change for your own (1 or more) | 192.168.1.xx,192.168.1.yy |

All values can be set via `/rpc/KVS.Set` and viewed using `/rpc/KVS.GetAll`.

---

## 🧪 Tested with

| Device | Firmware |
|---------|-----------|
| Shelly i4 Gen3 | 1.7.1 |
| Shelly Plus 2PM Gen3 | 1.7.1 |

---

## 🧰 Troubleshooting

- Ensure the 2PM is calibrated (`/rpc/Cover.GetStatus` → `calibrated:true`)
- Enable i4 script logs for debugging
- Verify LAN connectivity (same subnet, no VLAN isolation)
- To reset configuration: `/rpc/KVS.DeleteAll`

---

## 💬 Contribute / Share

Contributions and translations are welcome!  
If you post about this project, please include a link back to this repository.

- German Forum: [Shelly-Forum.com](https://shelly-forum.com)  
- Official Shelly Community: [community.shelly.cloud](https://community.shelly.cloud)  
- Home Assistant Forum: “Share your Projects” → *Shelly i4 → 2PM Cover Controller*

---

## ⚙️ License & Disclaimer

This project is released under the **MIT License**  
© 2025 Franz Forster

⚠️ Use at your own risk — no warranty or liability is provided.
You are free to use and modify it under the terms of the MIT License.  

---

## 🇩🇪 Kurzbeschreibung

Ziel dieses Projekts:  
Mit einem **Shelly i4 Gen3** zwei Tasten (SW1 / SW2) nutzen, um einen oder mehrere **Shelly Plus 2PM Gen3**
zu steuern – z. B. Jalousie oder Rollladen mit kalibrierter Laufzeit.

- **i4 Script:** erkennt Short / Double / Long Press und sendet Kommandos an den / die 2PM.  
- **2PM Script:** interpretiert diese Kommandos, verwaltet Presets, Nudging-Zeiten usw.  
- **Kommunikation:** rein lokal über **KVS (Key-Value Store)**, keine Polls oder Cloud.  
- **Multi-Target-Control:** Ein i4 kann mehrere 2PM-Geräte parallel ansprechen.  

> ⚠️ Nur für **kalibrierte Covers mit Endschaltern** geeignet!  
> Sonst kann die Positionierung nicht korrekt funktionieren.

---

## 🧩 Komponenten

| Gerät | Typ / Gen | Script | Zweck |
|-------|------------|--------|-------|
| Shelly i4 Gen3 | Input-Controller | `scripts/ScriptI4.js` | sendet Kommandos |
| Shelly Plus 2PM Gen3 | Aktor | `scripts/Script2PM.js` | führt Kommandos aus |

---

## 🚀 Installation

### 1️⃣ i4 Gen3
1. Web-UI → **Scripts → + → Paste ScriptI4.js**
2. Anpassen: `target_2pm_ip` (IP oder Hostname des 2PM)
3. Script aktivieren („Enable on boot“)

### 2️⃣ 2PM Gen3
1. Web-UI → **Scripts → + → Paste Script2PM.js**
2. Script aktivieren
3. Optional: Presets & Nudging über **KVS API** oder Webinterface anpassen

Beispiel-Befehle:
```bash
# i4 → Ziel-IP setzen
http://<I4-IP>/rpc/KVS.Set?key=target_2pm_ip&value="192.168.1.63"

# Preset 1 am 2PM (z. B. 40 %)
http://192.168.1.63/rpc/KVS.Set?key=preset_1&value=40

# Slat-Nudge (Millisekunden)
http://192.168.1.63/rpc/KVS.Set?key=nudge_up_ms&value=800
http://192.168.1.63/rpc/KVS.Set?key=nudge_down_ms&value=600
```

### 3️⃣ Test
- **Kurzdruck →** Fahre auf / ab  
- **Doppelklick →** Preset-Position  
- **Langdruck →** Nudge (Lamellenstellung)

---

## 🧠 Funktionsprinzip

```
[i4 Button] → [ScriptI4.js]
   ⇓  (HTTP RPC → KVS)
[2PM KVS Entry] → [Script2PM.js]
   ⇓
[Cover.Move / Stop / Preset / Nudge]
```

- Kommunikation über KVS-Einträge (`coverex_cmd`, `preset_*`, …)
- Keine zyklische Abfrage, keine Cloud
- Getrennte Logik → leicht anpassbar für mehrere Targets

---

## ⚙️ Konfigurierbare Parameter im 2PM

| Name | Einheit | Beschreibung | Default |
|-----|------|-------------|----------|
| `nudge_down_ms` | ms | Short down nudge time | 600 |
| `nudge_up_ms` | ms | Short up nudge time | 800 |
| `poll_interval_ms` | ms | polling interval | 50 |
| `preset_1` | % | Preset position 1 | 60 |
| `preset_2` | % | Preset position 2 | 40 |
| `slat_full_down_ms` | ms | Full down slat tilt | 1700 |
| `slat_full_up_ms` | ms | Full up slat tilt | 2000 |
| `slat_pos_1` | % | Preset slat position 1 | 50 |
| `slat_pos_2` | % | Preset slat position 2 | 50 |

## ⚙️ Konfigurierbare Parameters im I4

| Key | Unit | Description | Default |
|-----|------|-------------|----------|
| `target_2pm_ips` | IP | Ziel IPs aufgerufen vom I4, anpassen (1 oder mehrere) | 192.168.1.xx,192.168.1.yy |

Alle Werte können per `/rpc/KVS.Set` gesetzt und mit `/rpc/KVS.GetAll` ausgelesen werden.

---

## 🧪 Getestet mit

| Gerät | Firmware |
|--------|-----------|
| i4 Gen3 | 1.7.1 |
| Plus 2PM Gen3 | 1.7.1 |

---

## 🧰 Troubleshooting

- Prüfen, ob 2PM kalibriert ist (`/rpc/Cover.GetStatus` → `calibrated:true`)
- i4-Script-Logs im Browser aktivieren
- Netz-Zugriff prüfen (same LAN, kein VLAN-Block)
- Bei Bedarf KVS-Einträge löschen (`/rpc/KVS.DeleteAll`)

---

## 📣 Beitragen / Teilen

Sie können die Skripte gerne verbessern oder übersetzen.  
Wenn Sie darüber schreiben, verlinken Sie auf dieses Repository.

- Forum (DE): [Shelly-Forum.com](https://shelly-forum.com)
- Official Community: [community.shelly.cloud](https://community.shelly.cloud)
- Home Assistant: “Share your Projects” → Shelly i4 → 2PM Cover Controller

---

## ⚙️ Lizenz & Haftungsausschluss

Dieses Projekt wird unter der **MIT-Lizenz** veröffentlicht.  
© 2025 Franz Forster

⚠️ Die Verwendung erfolgt auf eigene Gefahr - es wird keine Garantie oder Haftung übernommen.
Es steht Ihnen frei, es unter den Bedingungen der MIT-Lizenz zu verwenden und zu verändern.  

