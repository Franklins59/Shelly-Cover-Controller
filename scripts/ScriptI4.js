/************************************************************
 * Shelly i4 Gen3 1.7.x – lightweight sender → 2PM /rpc/KVS.Set
 * Author: Franz Forster
 * License: MIT
 *  
 * v1.2 — October 24, 2025   Added Two-Group Mode for i4  
 *
 *
 * Sends ONLY: single_up/down, double_up/down, long_up/down.
 * (NO stop command from the i4 – stop logic is handled on the 2PM)
 *
 * Two-Group Mode:
 *   - Group A: IN0 = up, IN1 = down  → KVS "groupA_targets"
 *   - Group B: IN2 = up, IN3 = down  → KVS "groupB_targets"
 *   - A group is ACTIVE iff its target list contains ≥ 1 valid IPv4.
 *
 * KVS keys (all on i4):
 *   - groupA_targets : comma-separated IPs (preferred), e.g. 192.168.1.63,192.168.1.64
 *                      (also accepts JSON array ["192.168.1.63","192.168.1.64"] when clean)
 *   - groupB_targets : same format; if empty/invalid → Group B disabled
 *   - send_delay_ms  : global inter-target gap (default 80, range 0..2000)
 *   - debug          : boolean (true/false) for verbose logging (default false)
 *
 * On first start if "groupA_targets" is missing, it will be created with:
 *   192.168.1.xx,192.168.1.yy   (raw string, no quotes)
 ************************************************************/

let DEFAULT_GROUPA = "192.168.1.xx,192.168.1.yy"; // set your site defaults here (raw, no quotes)
let KVS_KEY_CMD   = "coverex_cmd";
let KVS_A_TARGETS = "groupA_targets";
let KVS_B_TARGETS = "groupB_targets";
let KVS_DELAY     = "send_delay_ms";
let KVS_DEBUG     = "debug";

let SEND_DELAY_MS = 80;   // global delay
let DEBUG = false;

let A_IPS = [];           // Group A resolved targets
let B_IPS = [];           // Group B resolved targets

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

/* Parse KVS value into { valid:[], invalid:[] }.
   Prefers comma-separated raw string; supports JSON array when clean. */
function parseTargetsDetailed(v){
  let raw = [];
  let out = { valid: [], invalid: [] };
  if (v === undefined || v === null) return out;

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
      // comma-separated preferred
      raw = s.split(",");
    }
  } else if (isArr(v)) {
    for (let i=0;i<v.length;i++) raw.push(v[i]);
  } else {
    raw = String(v).split(",");
  }

  for (let i=0;i<raw.length;i++){
    let s = dequote(trim(String(raw[i])));
    if (!s) continue;
    if (validIPv4(s)) out.valid.push(s);
    else out.invalid.push(s);
  }
  return out;
}

/* ---------- KVS loaders ---------- */
function loadDebug(){
  Shelly.call("KVS.Get", { key: KVS_DEBUG }, function(res, err){
    if (!err && res && res.value !== undefined && res.value !== null) {
      let v = res.value;
      DEBUG = (v === true || v === "true" || v === 1 || v === "1");
    } else {
      Shelly.call("KVS.Set", { key: KVS_DEBUG, value: false });
      DEBUG = false;
    }
    if (DEBUG) print("i4 DEBUG =", DEBUG);
  });
}

function loadDelay(){
  Shelly.call("KVS.Get", { key: KVS_DELAY }, function(res, err){
    if (!err && res && res.value !== undefined && res.value !== null) {
      let n = toInt(res.value);
      if (n >= 0 && n <= 2000) SEND_DELAY_MS = n;
    } else {
      Shelly.call("KVS.Set", { key: KVS_DELAY, value: SEND_DELAY_MS });
    }
    print("i4 send_delay_ms =", SEND_DELAY_MS);
  });
}

function logTargets(label, valid, invalid){
  print(label, "(valid):", JSON.stringify(valid));
  if (DEBUG && invalid && invalid.length){
    print(label, "(invalid, ignored):", JSON.stringify(invalid));
  }
}

function loadGroupA(){
  Shelly.call("KVS.Get", { key: KVS_A_TARGETS }, function(res, err){
    let parsed = { valid: [], invalid: [] };
    if (!err && res && res.value !== undefined && res.value !== null){
      parsed = parseTargetsDetailed(res.value);
      if (parsed.valid.length === 0 && parsed.invalid.length === 0){
        // value exists but empty → prefill defaults
        Shelly.call("KVS.Set", { key: KVS_A_TARGETS, value: DEFAULT_GROUPA });
        parsed = parseTargetsDetailed(DEFAULT_GROUPA);
      }
    } else {
      // missing → create with defaults
      Shelly.call("KVS.Set", { key: KVS_A_TARGETS, value: DEFAULT_GROUPA });
      parsed = parseTargetsDetailed(DEFAULT_GROUPA);
    }
    A_IPS = parsed.valid;
    logTargets("A targets", parsed.valid, parsed.invalid);
  });
}

function loadGroupB(){
  Shelly.call("KVS.Get", { key: KVS_B_TARGETS }, function(res, err){
    let parsed = { valid: [], invalid: [] };
    if (!err && res && res.value !== undefined && res.value !== null){
      parsed = parseTargetsDetailed(res.value);
    } // else: missing → B stays disabled
    B_IPS = parsed.valid;
    logTargets("B targets", parsed.valid, parsed.invalid);
    if (DEBUG && B_IPS.length === 0) print("B disabled (no targets)");
  });
}

/* ---------- Mapping ---------- */
function dirForInputId(id){
  return id===0 || id===2 ? "up"   :
         id===1 || id===3 ? "down" : null;
}
function mapToken(id, ev){
  let dir = dirForInputId(id);
  if (!dir) return null;
  if (ev==="single_push") return "single_"+dir;
  if (ev==="double_push") return "double_"+dir;
  if (ev==="long_push")   return "long_"+dir;
  return null; // ignore btn_down / btn_up
}

/* ---------- Sender (sequential with 1 retry) ---------- */
function kvsSetToList(token, ipList, label){
  if (!token) return;
  let ips = ipList.slice(0);
  if (ips.length === 0) {
    if (DEBUG) print(label, "skip (no targets):", token);
    return;
  }
  let ok = 0, fail = 0;

  function sendTo(idx){
    if (idx >= ips.length){
      print(label, "summary:", token, "ok:", ok, "fail:", fail, "targets:", ips.length);
      return;
    }
    let ip = ips[idx];
    let url = "http://" + ip + "/rpc/KVS.Set?key=" + KVS_KEY_CMD + "&value=" + token;

    Shelly.call("HTTP.GET", { url: url, timeout: 4 }, function(res){
      if (res && res.code === 200){
        if (DEBUG) print(label, "OK →", ip, token);
        ok++;
        if (SEND_DELAY_MS > 0) Timer.set(SEND_DELAY_MS, false, function(){ sendTo(idx+1); });
        else sendTo(idx+1);
      } else {
        if (DEBUG) print(label, "ERR →", ip, token, "code:", res ? res.code : "nores", "retry");
        Timer.set(120, false, function(){
          Shelly.call("HTTP.GET", { url: url, timeout: 4 }, function(res2){
            if (res2 && res2.code === 200) { if (DEBUG) print(label, "OK(retry) →", ip); ok++; }
            else { if (DEBUG) print(label, "FAIL →", ip); fail++; }
            if (SEND_DELAY_MS > 0) Timer.set(SEND_DELAY_MS, false, function(){ sendTo(idx+1); });
            else sendTo(idx+1);
          });
        });
      }
    });
  }
  sendTo(0);
}

/* ---------- Startup ---------- */
loadDebug();
loadGroupA();
loadGroupB();
loadDelay();

/* ---------- Event handling ---------- */
/* Gen3 event format (single parameter containing obj.info) */
Shelly.addEventHandler(function (obj) {
  if (!obj || !obj.info || typeof obj.info !== "object") return;
  let inf = obj.info;  // {component:"input:x", id, event}
  if (typeof inf.component !== "string" || inf.component.indexOf("input:")!==0) return;

  if (inf.event === "btn_down" || inf.event === "btn_up") return; // ignore raw edges

  let id = (typeof inf.id === "number") ? inf.id : parseInt(String(inf.id), 10);
  let ev = String(inf.event || "");
  let tok = mapToken(id, ev);
  if (!tok) return;

  // Route by group: A = id 0/1, B = id 2/3
  if (id === 0 || id === 1)      kvsSetToList(tok, A_IPS, "A");
  else if (id === 2 || id === 3) kvsSetToList(tok, B_IPS, "B");
});

/* Optional fallback (classic 2-parameter hook, for older FW behavior) */
Shelly.addEventHandler(function (ev, info) {
  if (ev !== "input_event" || !info) return;
  let id = (typeof info.id === "number") ? info.id : parseInt(String(info.id), 10);
  let tok = mapToken(id, String(info.event||""));
  if (!tok) return;

  if (id === 0 || id === 1)      kvsSetToList(tok, A_IPS, "A");
  else if (id === 2 || id === 3) kvsSetToList(tok, B_IPS, "B");
});
