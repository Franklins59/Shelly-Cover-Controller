/************************************************************
 * Shelly i4 Gen3 1.7.x – lightweight sender → 2PM /rpc/KVS.Set
 * Author: Franz Forster
 * License: MIT
 *
 * Sends ONLY: single_up/down, double_up/down, long_up/down
 * (NO stop command from the i4 – stop logic is handled on the 2PM)
 *
 * Multi-target support:
 *   - KVS "target_2pm_ips": comma-separated IPs (preferred), e.g. 192.168.1.63,192.168.1.64
 *     Also accepts a JSON array when stored cleanly: ["192.168.1.63","192.168.1.64"]
 *   - Optional: KVS "send_delay_ms" (default 80), KVS "debug" (boolean).
 *
 * New:
 *   - Startup validation prints (in DEBUG mode) both valid and ignored (invalid) entries.
 ************************************************************/

let DEFAULT_TARGET_IPS = "192.168.1.xx,192.168.1.yy";   // set your defaults here 
let KVS_KEY_CMD    = "coverex_cmd";
let KVS_KEY_IPS    = "target_2pm_ips";
let KVS_KEY_DELAY  = "send_delay_ms";
let KVS_KEY_DEBUG  = "debug";

let SEND_DELAY_MS = 80;    // inter-target gap
let TARGET_IPS = [];       // resolved list of target IPs
let DEBUG = true;

/* ---------- Small utilities (no RegEx, Espruino-friendly) ---------- */
function isStr(x){ return typeof x === "string"; }
function isArr(x){ return Array.isArray ? Array.isArray(x) : (x && typeof x.length === "number" && typeof x !== "string"); }
function toInt(x){ let n = parseInt(x,10); return isNaN(n) ? 0 : n|0; }

/* Trim ASCII <= space */
function trim(s){
  s = String(s || "");
  let a = 0, b = s.length;
  while (a < b && s.charCodeAt(a) <= 32) a++;
  while (b > a && s.charCodeAt(b - 1) <= 32) b--;
  return s.slice(a, b);
}

/* Remove surrounding quotes if present */
function dequote(s){
  s = String(s || "");
  if (s.length >= 2){
    let a = s.charCodeAt(0), b = s.charCodeAt(s.length - 1);
    if ((a === 34 && b === 34) || (a === 39 && b === 39)) { // "..." or '...'
      return s.slice(1, -1);
    }
  }
  return s;
}

/* IPv4 checker without RegEx */
function validIPv4(s) {
  if (!isStr(s)) return false;
  s = trim(s);
  let parts = s.split(".");
  if (parts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    let p = parts[i];
    if (p === "" || p.length > 3) return false;
    for (let j = 0; j < p.length; j++) {
      let c = p.charCodeAt(j);
      if (c < 48 || c > 57) return false; // not digit
    }
    let n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return false;
  }
  return true;
}

/* Parse KVS value into arrays of IPv4s: returns { valid:[], invalid:[] }.
   Prefers comma-separated raw string; supports JSON array when clean. */
function parseTargetsDetailed(v){
  let raw = [];
  let result = { valid: [], invalid: [] };
  if (v === undefined || v === null) return result;

  if (isStr(v)) {
    let s = trim(v);
    if (s.charAt(0) === '[') {
      // looks like JSON array
      let parsed = null;
      try { parsed = JSON.parse(s); } catch(_e){ parsed = null; }
      if (isArr(parsed)) {
        for (let i=0;i<parsed.length;i++) raw.push(parsed[i]);
      } else {
        // fallback to comma
        raw = s.split(",");
      }
    } else {
      // comma-separated string (preferred)
      raw = s.split(",");
    }
  } else if (isArr(v)) {
    for (let i=0;i<v.length;i++) raw.push(v[i]);
  } else {
    raw = String(v).split(",");
  }

  // Normalize, dequote, validate
  for (let i=0;i<raw.length;i++){
    let s = dequote(trim(String(raw[i])));
    if (!s) continue;
    if (validIPv4(s)) result.valid.push(s);
    else result.invalid.push(s);
  }
  return result;
}

/* ---------- KVS loaders ---------- */
function loadDebug(){
  Shelly.call("KVS.Get", { key: KVS_KEY_DEBUG }, function(res, err){
    if (!err && res && res.value !== undefined && res.value !== null) {
      let v = res.value;
      if (v === true || v === "true" || v === 1 || v === "1") DEBUG = true;
      else DEBUG = false;
    } else {
      Shelly.call("KVS.Set", { key: KVS_KEY_DEBUG, value: false });
      DEBUG = false;
    }
    if (DEBUG) print("i4 DEBUG =", DEBUG);
  });
}

function loadDelay(){
  Shelly.call("KVS.Get", { key: KVS_KEY_DELAY }, function(res, err){
    if (!err && res && res.value !== undefined && res.value !== null) {
      let n = toInt(res.value);
      if (n >= 0 && n <= 2000) SEND_DELAY_MS = n;
    } else {
      Shelly.call("KVS.Set", { key: KVS_KEY_DELAY, value: SEND_DELAY_MS });
    }
    print("i4 send_delay_ms =", SEND_DELAY_MS);
  });
}

function logTargets(valid, invalid){
  print("i4 targets (valid):", JSON.stringify(valid));
  if (DEBUG && invalid && invalid.length){
    print("i4 targets (invalid, ignored):", JSON.stringify(invalid));
  }
}

function loadTargets(){
  Shelly.call("KVS.Get", { key: KVS_KEY_IPS }, function(res_ips, err_ips){
    let parsed = { valid: [], invalid: [] };

    if (!err_ips && res_ips && res_ips.value !== undefined && res_ips.value !== null){
      parsed = parseTargetsDetailed(res_ips.value);
      // If KVS existed but all entries invalid → keep empty list, just log
      if (parsed.valid.length === 0 && parsed.invalid.length === 0){
        // value may be empty string; in that case prefill with defaults
        Shelly.call("KVS.Set", { key: KVS_KEY_IPS, value: DEFAULT_TARGET_IPS });
        parsed = parseTargetsDetailed(DEFAULT_TARGET_IPS);
      }
    } else {
      // missing → create with default IPs (raw string)
      Shelly.call("KVS.Set", { key: KVS_KEY_IPS, value: DEFAULT_TARGET_IPS });
      parsed = parseTargetsDetailed(DEFAULT_TARGET_IPS);
    }

    TARGET_IPS = parsed.valid;
    logTargets(parsed.valid, parsed.invalid);
    loadDelay();
  });
}

/* ---------- Mapping ---------- */
function dirForInputId(id){ return id===0 ? "up" : (id===1 ? "down" : null); }
function mapToken(id, ev){
  let dir = dirForInputId(id);
  if (!dir) return null;
  if (ev==="single_push") return "single_"+dir;
  if (ev==="double_push") return "double_"+dir;
  if (ev==="long_push")   return "long_"+dir;
  return null; // ignore btn_down / btn_up
}

/* ---------- Sender ---------- */
function kvsSetMulti(token){
  if (!token) return;
  let ips = TARGET_IPS.slice(0);
  if (ips.length === 0) {
    if (DEBUG) print("No targets configured; skip", token);
    return;
  }

  let ok = 0, fail = 0;

  function sendTo(idx){
    if (idx >= ips.length){
      print("KVS.Set summary:", token, "ok:", ok, "fail:", fail, "targets:", ips.length);
      return;
    }
    let ip = ips[idx];
    let url = "http://" + ip + "/rpc/KVS.Set?key=" + KVS_KEY_CMD + "&value=" + token;

    Shelly.call("HTTP.GET", { url: url, timeout: 4 }, function(res){
      if (res && res.code === 200){
        if (DEBUG) print("OK →", ip, token);
        ok++;
        if (SEND_DELAY_MS > 0){
          Timer.set(SEND_DELAY_MS, false, function(){ sendTo(idx+1); });
        } else sendTo(idx+1);
      } else {
        if (DEBUG) print("ERR →", ip, token, "code:", res ? res.code : "nores", "retry");
        Timer.set(120, false, function(){
          Shelly.call("HTTP.GET", { url: url, timeout: 4 }, function(res2){
            if (res2 && res2.code === 200) { if (DEBUG) print("OK(retry) →", ip); ok++; }
            else { if (DEBUG) print("FAIL →", ip); fail++; }
            if (SEND_DELAY_MS > 0){
              Timer.set(SEND_DELAY_MS, false, function(){ sendTo(idx+1); });
            } else sendTo(idx+1);
          });
        });
      }
    });
  }

  sendTo(0);
}

/* ---------- Startup ---------- */
loadDebug();
loadTargets();

/* ---------- Event handling ---------- */
Shelly.addEventHandler(function (obj) {
  if (!obj || !obj.info || typeof obj.info !== "object") return;
  let inf = obj.info;
  if (typeof inf.component !== "string" || inf.component.indexOf("input:")!==0) return;
  if (inf.event === "btn_down" || inf.event === "btn_up") return;

  let id = (typeof inf.id === "number") ? inf.id : parseInt(String(inf.id), 10);
  let ev = String(inf.event || "");
  let tok = mapToken(id, ev);
  if (tok) kvsSetMulti(tok);
});

Shelly.addEventHandler(function (ev, info) {
  if (ev !== "input_event" || !info) return;
  let id = (typeof info.id === "number") ? info.id : parseInt(String(info.id), 10);
  let tok = mapToken(id, String(info.event||""));
  if (tok) kvsSetMulti(tok);
});