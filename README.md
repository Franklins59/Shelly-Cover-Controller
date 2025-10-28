# Shelly Cover Controller (Gen3 Hardware)

**Control a Shelly 2PM Gen3 roller shutter / blind with a Shelly i4 Gen3**  
using Shelly Script (JS, Gen3). Supports *short*, *double* and *long* presses on the i4,
custom presets, slat-nudging, and safe cover movement.

---
[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/Franklins59)

Deutsche Version unten

## 🧩 Overview

This project connects a **Shelly i4 Gen3** (input controller) with one or more **Shelly 2PM Gen3**
(actuator) using Shelly Script and local KVS (Key-Value Store) messaging.

- **i4 Script:** Detects button events (short / double / long press) and sends commands to one or more target 2PMs.
- **2PM Script:** Interprets these commands, executes cover movements, presets, and slat-nudging.  
- **Communication:** 100% local via **KVS**, no polling, no cloud.
- **Multi-target control:** One i4 can operate multiple 2PMs simultaneously.
- **2 Groups per I4 possible:** Group A controlled via SW1 and SW2, Group B controlled via SW3 and SW3

> ⚠️ Works only with **calibrated covers with mechanical endstops**.  
> The 2PM Script will not start with non-calibrated covers.

---

## 🧰 Components

| Device | Type / Gen | Script | Purpose |
|---------|-------------|---------|----------|
| Shelly i4 Gen3 | Input controller | `scripts/ScriptI4.js` | Sends commands |
| Shelly 2PM Gen3 | Actuator | `scripts/Script2PM.js` | Executes commands |

---

## 🚀 Installation

### 1️⃣ On Shelly i4 Gen3

#### i4 Configuration

**Device:** *Shelly i4 Gen 3*  
**Firmware:** ≥ 1.7.x  
Under **Inputs / Settings**:

| Parameter | Value |
|------------|-------|
| Input Names | UpGroupA, DownGroupA, (optional UpGroupB, DownGroupB) |
| Enable | Yes |
| Input/Output Settings | **Button** |
| Automations | None |

**Insert script:**

1. Web-UI → **Scripts → + → Paste ScriptI4.js**
2. Enable “Run on boot”
3. Web-UI → **Advanced** → **KVS** Set the IP/hostnames of your 2PMs: `groupA_targets` and, optional `groupB_targets`

##### Two-Group Mode (i4)

When using **one i4 to control two independent shutter groups**, the script supports *Group A* and *Group B*:

| Inputs | Function | Target variable |
|---------|-----------|----------------|
| IN 0 / IN 1 | Up / Down for Group A | `target_2pm_ips_a` |
| IN 2 / IN 3 | Up / Down for Group B | `target_2pm_ips_b` |

Each group can hold a comma-separated list of IPs, for example:

``` bash
192.168.1.63,192.168.1.64
```

If no valid IP list is defined for Group B, the related inputs remain inactive.  
Requests are sent sequentially with a short delay between devices.

##### ⚙️ Configurable KVS Parameters on I4

| Key | Unit | Description | Default |
|-----|------|-------------|----------|
| `target_2pm_ips_a` | IP | Target IPs called from I4, change for your own (1 or more) | 192.168.1.63,192.168.1.64 |

All values can be set via `/rpc/KVS.Set` and viewed using `/rpc/KVS.GetAll`

### 2️⃣ On Shelly 2PM Gen3

#### 2PM Configuration

**Device:** *Shelly 2PM Gen 3*  
**Firmware:** ≥ 1.7.x  

Under **Settings → Device Profile**, set **Cover** (requires reboot).  
Calibration must be complete — only **motors with integrated hardware limit switches** are supported.

##### ⚙️ Configurable KVS Parameters on 2PM

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

1. Web-UI → **Scripts → + → Paste Script2PM.js**
2. Enable “Run on boot”
3. (Optional) Web-UI → **Advanced** → **KVS** Adjust presets and nudging times using KVS

---

#### Example RPC calls

```bash
# Set 2PM target IP on i4
http://<I4-IP>/rpc/KVS.Set?key=groupA_targets&value="192.168.1.63,192.168.1.65"

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

``` bash
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

## 🧪 Tested with

| Device | Firmware |
|---------|-----------|
| Shelly i4 Gen3 | 1.7.1 |
| Shelly 2PM Gen3 | 1.7.1 |

---

## 🧰 Troubleshooting

- Ensure the 2PM is calibrated (`/rpc/Cover.GetStatus` → `calibrated:true`)
- Enable i4 script logs for debugging
- Verify LAN connectivity (same subnet, no VLAN isolation)
- To reset configuration: `/rpc/KVS.DeleteAll`

---

## 💡 About Lamella (Slat) Control and BTHome Limitations

Shelly Gen3 devices (including the 2PM in Cover mode) currently do not expose a public RPC for lamella/slat angle control.
The internal firmware supports this feature, but it is only accessible via the device UI or Actions triggered by BTHome devices (e.g. BLU Buttons).

When using BTHome, the Shelly executes internal logic locally — this includes tilt/slat adjustments if configured in the Action profile.
However, until now these mechanisms are not part of the documented RPC API and cannot be directly scripted.

Multi-target control with BTHome is technically possible but works very differently:

- You can pair one BLU Button with multiple Shelly devices, each reacting locally to the same BLE event.
- There is no IP broadcast or RPC fan-out — each device must be configured individually.
- The result depends on BLE range and signal timing, not on deterministic sequencing like in RPC scripts.

**Summary:**

➡️ BTHome + Actions: Local, simple, and good for single-room setups — but limited to BLE range and predefined actions.

➡️ RPC script: IP-based, scalable, and suitable for multi-device synchronization, precise presets, and state-driven logic.

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

**Deutsche Übersetzung**

# Shelly Rolladen Controller (Gen3 Hardware)

**Steuert einen Rollladen/eine Jalousie** Shelly 2PM Gen3 mit einem Shelly i4 Gen3 mithilfe von Shelly Script (JS, Gen3).
Unterstützt *kurzes*, *doppeltes* und *langes* Drücken auf dem i4, benutzerdefinierte Voreinstellungen, Lamellenverschiebung und sichere Abdeckungsbewegung

---
[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://paypal.me/Franklins59)

## 🧩 Übersicht

Dieses Projekt verbindet einen **Shelly i4 Gen3** (Eingabecontroller) mit einem oder mehreren **Shelly 2PM Gen3**
(Aktoren) mithilfe von Shelly Script und lokaler KVS-Nachrichtenübermittlung (Key-Value Store).

- **i4 Script:** Erkennt Tastenereignisse (kurzes/doppeltes/langes Drücken) und sendet Befehle an einen oder mehrere Ziel-2PMs.
- **2PM-Skript:** Interpretiert diese Befehle, führt Rollladenbewegungen, Voreinstellungen und Lamellenbewegungen aus.
- **Kommunikation:** 100 % lokal über **KVS**, kein Polling, keine Cloud.
- **Multi-Target-Steuerung:** Ein i4 kann mehrere 2PMs gleichzeitig bedienen.
- **2 Gruppen pro I4 möglich:** Gruppe A wird über SW1 und SW2 gesteuert, Gruppe B über SW3 und SW3

> ⚠️ Funktioniert nur mit **kalibrierten Abdeckungen mit mechanischen Endanschlägen**.
> Das 2PM-Skript startet nicht mit nicht kalibrierten Abdeckungen.

---

## 🧰 Komponenten

| Device | Type / Gen | Script | Funktion |
|---------|-------------|---------|----------|
| Shelly i4 Gen3 | Input controller | `scripts/ScriptI4.js` | Sendet Kommandos |
| Shelly 2PM Gen3 | Actuator | `scripts/Script2PM.js` | Führt Kommandos aus |

---
---

## 🚀 Installieren

### 1️⃣ Shelly i4 Gen3

#### i4 Konfiguration

**Device:** *Shelly i4 Gen 3*  
**Firmware:** ≥ 1.7.x  
Unter **Inputs / Settings**:

| Parameter | Wert |
|------------|-------|
| Input Names | UpGroupA, DownGroupA, (optional UpGroupB, DownGroupB) |
| Enable | Yes |
| Input/Output Settings | **Button** |
| Automations | None |

**Script einsetzten:**

1. Web-UI → **Scripts → + → Paste ScriptI4.js**
2. Enable “Run on boot”
3. Web-UI → **Advanced** → **KVS** Setze die IPs der 2PMs: `groupA_targets` und, optional `groupB_targets`

##### Zwei-Gruppen Modus (i4)

Bei Verwendung von **einem i4 zur Steuerung von zwei unabhängigen Verschlussgruppen** unterstützt das Skript *Gruppe A* und *Gruppe B*:

| Inputs | Funktion | Ziel Variable |
|---------|-----------|----------------|
| IN 0 / IN 1 | Auf / Ab für Gruppe A | `target_2pm_ips_a` |
| IN 2 / IN 3 | Auf / Ab für Gruppe B | `target_2pm_ips_b` |

Jede Gruppe kann eine durch Kommas getrennte Liste von IPs enthalten, zum Beispiel:

``` bash
192.168.1.63,192.168.1.64
```

Wenn für Gruppe B keine gültige IP-Liste definiert ist, bleiben die entsprechenden Eingänge inaktiv.  
Anfragen werden nacheinander mit einer kurzen Verzögerung zwischen den Geräten gesendet.

##### ⚙️ Konfigurierbare KVS-Parameter auf I4

| Schlüssel | Einheit | Beschreibung | Standard |
|-----|------|-------------|----------|
| `target_2pm_ips_a` | IP | Von I4 aufgerufene Ziel-IPs, ändern Sie diese für Ihre eigenen (1 oder mehr) | 192.168.1.63,192.168.1.64 |

Alle Werte können über `/rpc/KVS.Set` festgelegt und mit `/rpc/KVS.GetAll` angezeigt werden.

### 2️⃣ Auf Shelly 2PM Gen3

#### 2PM-Konfiguration

**Gerät:** *Shelly 2PM Gen 3*
  
**Firmware:** ≥ 1.7.x
Legen Sie unter **Einstellungen → Geräteprofil** die **Cover** fest (erfordert Neustart).
Die Kalibrierung muss abgeschlossen sein – es werden nur **Motoren mit integrierten Hardware-Endschaltern** unterstützt.

##### ⚙️ Konfigurierbare KVS-Parameter auf 2PM

| Schlüssel | Einheit | Beschreibung | Standard |
|-----|------|-------------|----------|
| `nudge_down_ms` | ms | Kurze Abwärts-Nudge-Zeit | 600 |
| `nudge_up_ms` | ms | Kurze Aufwärts-Nudge-Zeit | 800 |
| `poll_interval_ms` | ms | Abfrageintervall | 50 |
| `preset_1` | % | Voreingestellte Position 1 | 60 |
| `preset_2` | % | Voreingestellte Position 2 | 40 |
| `slat_full_down_ms` | ms | Vollständige Neigung der Lamellen nach unten | 1700 |
| `slat_full_up_ms` | ms | Vollständige Neigung der Lamellen nach oben | 2000 |
| `slat_pos_1` | % | Voreingestellte Lamellenposition 1 | 50 |
| `slat_pos_2` | % | Voreingestellte Lamellenposition 2 | 50 |

1. Web-UI → **Scripts → + → Skript2PM.js einfügen**
2. „Beim Start ausführen” aktivieren
3. (Optional) Web-UI → **Erweitert** → **KVS** Voreinstellungen und Nudging-Zeiten mit KVS anpassen

---

#### Beispiel für RPC-Aufrufe

```bash
# Setzt 2PM Ziel IP im i4
http://<I4-IP>/rpc/KVS.Set?key=groupA_targets&value="192.168.1.63,192.168.1.65"

# Voreinstellung Position 1 im 2PM (z.B. 40% offen)
http://192.168.1.63/rpc/KVS.Set?key=preset_1&value=40

# Nudging (in Millisekunden)
http://192.168.1.63/rpc/KVS.Set?key=nudge_up_ms&value=800
http://192.168.1.63/rpc/KVS.Set?key=nudge_down_ms&value=600
```

### 3️⃣ Testen

- **Kurzer Druck →** Nach oben/unten bewegen
- **Doppelter Druck →** Zur voreingestellten Position bewegen
- **Langer Druck →** Lamellen verschieben (Feineinstellung)

---

## 🧠 Funktionsablauf

``` bash
[i4-Eingabe] → [ScriptI4.js]   
⇓ (HTTP RPC / KVS)
[2PM KVS-Eintrag] → [Script2PM.js]
   ⇓
[Cover.Move / Stop / Preset / Nudge]
```

- KVS-Einträge übernehmen die gesamte Kommunikation (`coverex_cmd`, `preset_*`, …)
- Keine Abfrage, keine Cloud-Abhängigkeit
- Klare Trennung der Logik: ein Skript pro Gerät

---

## 🧪 Getestet mit

| Gerät | Firmware |
|---------|-----------|
| Shelly i4 Gen3 | 1.7.1 |
| Shelly 2PM Gen3 | 1.7.1 |

---

## 🧰 Fehlerbehebung

- Stellen Sie sicher, dass das 2PM kalibriert ist (`/rpc/Cover.GetStatus` → `calibrated:true`)
- Aktivieren Sie i4-Skriptprotokolle für die Fehlerbehebung
- Überprüfen Sie die LAN-Verbindung (gleiches Subnetz, keine VLAN-Isolation)
- So setzen Sie die Konfiguration zurück: `/rpc/KVS.DeleteAll` (oder im Web-UI unter KVS)

---

## 💡 Über Lamellenverstellung und BTHome

Shelly Gen3-Geräte (einschließlich 2PM im Cover-Modus) bieten derzeit keine dokumentierte RPC für die Steuerung des Lamellenwinkels.
Die interne Firmware unterstützt diese Funktion, sie ist jedoch nur über die Geräte-Benutzeroberfläche oder über Aktionen zugänglich, die von BTHome-Geräten (z. B. BLU-Tasten) ausgelöst werden.

Bei Verwendung von BTHome führt Shelly die interne Logik lokal aus – dies umfasst auch Neigungs-/Lamellenanpassungen, sofern diese im Aktionsprofil konfiguriert sind.
Bislang sind diese Mechanismen jedoch nicht Teil der dokumentierten RPC-API und können nicht direkt benutzt werden.

Die Multi-Target-Steuerung mit BTHome ist technisch möglich, funktioniert jedoch ganz anders:

- Sie können einen BLU-Button mit mehreren Shelly-Geräten koppeln, die jeweils lokal auf dasselbe BLE-Ereignis reagieren.
- Es gibt keine IP-Broadcast- oder RPC-Fan-Out-Funktion – jedes Gerät muss einzeln konfiguriert werden.
- Das Ergebnis hängt von der BLE-Reichweite und dem Signal-Timing ab, nicht von einer deterministischen Abfolge wie in RPC-Skripten.

**Zusammenfassung:**

➡️ BTHome + Actions: Lokal, einfach und gut für Einzelraumkonfigurationen geeignet – jedoch auf BLE-Reichweite und vordefinierte Aktionen beschränkt.

➡️ RPC script: IP-basiert, skalierbar und geeignet für die Synchronisierung mehrerer Geräte, präzise Voreinstellungen und zustandsgesteuerte Logik.

## 💬 Beitragen / Teilen

Beiträge und Übersetzungen sind willkommen!  
Wenn Sie etwas über dieses Projekt posten, fügen Sie bitte einen Link zu diesem Repository hinzu.

- Deutsches Forum: [Shelly-Forum.com](https://shelly-forum.com)
- Offizielle Shelly-Community: [community.shelly.cloud](https://community.shelly.cloud)
- Home Assistant Forum: „Teilen Sie Ihre Projekte“ → *Shelly i4 → 2PM Cover Controller*

---

## ⚙️ Lizenz & Haftungsausschluss

Dieses Projekt wird unter der **MIT-Lizenz** veröffentlicht.  
© 2025 Franz Forster

⚠️ Die Verwendung erfolgt auf eigene Gefahr - es wird keine Garantie oder Haftung übernommen.
Es steht Ihnen frei, es unter den Bedingungen der MIT-Lizenz zu verwenden und zu verändern.  
