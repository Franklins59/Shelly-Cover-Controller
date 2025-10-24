/************************************************************
 * Shelly 2PM + i4 Cover Controller Script
 * Author: Franz Forster
 * License: MIT
 *
 * v1.2 — October 24, 2025   Added Two-Group Mode for i4 (no changes here)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 ************************************************************
 * Behavior:
 *   - single_up / single_down: start if idle; STOP if moving
 *   - long_up / long_down: nudge up / down (absolute milliseconds)
 *   - double_up / double_down:
 *       • Go to preset height (percent, using pos=0..100)
 *       • Then adjust slat angle by time, referenced to arrival direction:
 *         - arrival DOWN  → reference BOTTOM → slat UP  for slat_pos% of slat_full_up_ms
 *         - arrival UP    → reference TOP    → slat DOWN for (100 - slat_pos)% of slat_full_down_ms
 * Requirements:
 *   - Cover must be calibrated; otherwise the script remains inactive
 ************************************************************/

let COVER_ID = 0;
let KVS_CMD_KEY = "coverex_cmd";
let DEBUG = false;            // set to true for verbose logs
let SLAT_MIN_MS = 50;         // minimum slat pulse to avoid zero-duration

/* ---------------- Default configuration (override via KVS) ---------------- */
let DEFAULTS = {
  nudge_up_ms: 800,
  nudge_down_ms: 600,
  preset_1: 40,      // used with double_up
  preset_2: 60,      // used with double_down
  slat_pos_1: 50,    // desired slat after preset_1
  slat_pos_2: 25,    // desired slat after preset_2
  slat_full_up_ms: 1000,     // time from bottom reference to fully open slats
  slat_full_down_ms: 1000,   // time from top reference to fully closed slats
  poll_interval_ms: 50,
  run_timeout_ms: 90000
};
let K = Object.assign({}, DEFAULTS);

/* ---------------- Load KVS parameters once (sequential) ---------------- */
let KEYS = Object.keys(DEFAULTS);
function kvsLoad(i){
  if (i >= KEYS.length){
    if (DEBUG) print("2PM KVS:", JSON.stringify(K));
    checkCalibratedAndStart();
    return;
  }
  let key = KEYS[i];
  Shelly.call("KVS.Get", { key:key }, function(res, err){
    if (err || !res || res.value === undefined || res.value === null){
      let v = DEFAULTS[key];
      K[key] = v;
      Shelly.call("KVS.Set", { key:key, value: JSON.stringify(v) }, function(){
        Timer.set(15, false, function(){ kvsLoad(i+1); });
      });
    } else {
      try { K[key] = JSON.parse(res.value); } catch(e){ K[key] = res.value; }
      Timer.set(10, false, function(){ kvsLoad(i+1); });
    }
  });
}
kvsLoad(0);

/* ---------------- Cover RPC helpers ---------------- */
function coverStop(){ Shelly.call("Cover.Stop",  { id: COVER_ID }); }
function coverUp()  { Shelly.call("Cover.Open",  { id: COVER_ID }); }
function coverDown(){ Shelly.call("Cover.Close", { id: COVER_ID }); }
function coverGoToPercent(percent, cb){
  let pos = Math.max(0, Math.min(100, percent|0)); // pos = 0..100 (confirmed)
  Shelly.call("Cover.GoToPosition", { id: COVER_ID, pos: pos }, function(){ if (cb) cb(); });
}
function coverStatus(cb){ Shelly.call("Cover.GetStatus", { id: COVER_ID }, function(st){ cb(st||{}); }); }

/* ---------------- Calibration check ---------------- */
let READY = false;
function isCalibratedStatus(st){
  if (!st) return false;
  if (st.calibrated === true || st.calibrated === 1 || st.calibrated === "true") return true;
  if (typeof st.pos === "number" || typeof st.position === "number" || typeof st.current_pos === "number") return true;
  return false;
}
function checkCalibratedAndStart(){
  coverStatus(function(st){
    READY = isCalibratedStatus(st);
    if (READY){
      if (DEBUG) print("2PM READY: cover is calibrated.");
      pollOnce();
    } else {
      print("ERROR: Cover is NOT calibrated. Script inactive.");
    }
  });
}

/* ---------------- FSM + timer discipline ---------------- */
let STATE   = "IDLE";      // IDLE | OPENING | CLOSING | NUDGING | PRESET | SLAT_ADJUST
let moving  = false;
let runT    = null;
let timers  = [];

function Tset(ms, fn){ let id = Timer.set(ms, false, fn); timers.push(id); return id; }
function TclearAll(){ for (let i=0;i<timers.length;i++){ try{ Timer.clear(timers[i]); }catch(e){} } timers = []; }
function clearRunT(){ if (runT!==null){ try{ Timer.clear(runT); }catch(e){} runT=null; } }
function armRunTimeout(){
  clearRunT();
  runT = Timer.set(K.run_timeout_ms|0, false, function(){ moving=false; STATE="IDLE"; if (DEBUG) print("RUN TIMEOUT → IDLE"); });
}
function enter(s){ STATE = s; if (DEBUG) print("STATE →", s); }

/* ---------------- Atomic actions ---------------- */
function doStop(){
  TclearAll(); clearRunT();
  coverStop();
  moving = false;
  enter("IDLE");
}
function doOpen(){
  TclearAll();
  coverUp();
  moving = true;
  armRunTimeout();
  enter("OPENING");
}
function doClose(){
  TclearAll();
  coverDown();
  moving = true;
  armRunTimeout();
  enter("CLOSING");
}
function doNudge(dir, ms){
  TclearAll();
  let dur = Math.max(SLAT_MIN_MS, ms|0);  // enforce minimum pulse for mechanical effect
  if (DEBUG) print("NUDGE:", dir, dur, "ms");
  if (dir==="up") coverUp(); else coverDown();
  moving = true;
  enter("NUDGING");
  Tset(dur, function(){ coverStop(); moving=false; enter("IDLE"); });
}

/* ---------------- Helper: wait until target position reached ---------------- */
function waitUntilAtTarget(targetPercent, tolerancePercent, maxWaitMs, cb){
  let start = Date.now();
  function loop(){
    coverStatus(function(st){
      let pos = (typeof st.pos === "number") ? st.pos
              : (typeof st.position === "number") ? st.position
              : (typeof st.current_pos === "number") ? st.current_pos
              : null;
      let done = (pos !== null) && (Math.abs((pos|0) - (targetPercent|0)) <= (tolerancePercent|0));
      if (done || (Date.now() - start) > (maxWaitMs|0)) {
        if (DEBUG) print("AT TARGET? done=", done, "pos=", pos, "target=", targetPercent);
        Timer.set(150, false, function(){ cb(pos); });
        return;
      }
      Timer.set(150, false, loop);
    });
  }
  loop();
}

/* ---------------- Slat adjustment by time (based on arrival direction)
 * Interpret slat_pos_* as desired OPENNESS in percent:
 *  - arrival from TOP (plannedArr === "up"): slats are closed → nudge UP for slat_pos% of slat_full_up_ms
 *  - arrival from BOTTOM (plannedArr === "down"): slats are open → nudge DOWN for (100 - slat_pos)% of slat_full_down_ms
 */
function doSlatAdjustFor(which, arrivalDir){
  // desired openness in percent (0 = fully closed, 100 = fully open)
  let targetOpenPct = (which===1) ? (K.slat_pos_1|0) : (K.slat_pos_2|0);
  targetOpenPct = Math.max(0, Math.min(100, targetOpenPct));

  let dir, dur;

  if (arrivalDir === "up") {
    // Arrived from TOP → currently closed → open upwards by targetOpenPct
    dur = Math.round((targetOpenPct / 100) * (K.slat_full_up_ms|0));
    dir = "up";
  } else if (arrivalDir === "down") {
    // Arrived from BOTTOM → currently open → close downwards by (100 - targetOpenPct)
    dur = Math.round(((100 - targetOpenPct) / 100) * (K.slat_full_down_ms|0));
    dir = "down";
  } else {
    // Fallback if arrival cannot be determined:
    // Use preset semantics as tie-breaker (keeps UX intuitive):
    if (which === 1) {
      // double_up: assume we want openness target from TOP side → open up by target%
      dur = Math.round((targetOpenPct / 100) * (K.slat_full_up_ms|0));
      dir = "up";
    } else {
      // double_down: assume we want closure from BOTTOM side → down by (100 - target)%
      dur = Math.round(((100 - targetOpenPct) / 100) * (K.slat_full_down_ms|0));
      dir = "down";
    }
  }

  if (DEBUG) print("SLAT PLAN:", "which=", which, "arrival=", arrivalDir, "dir=", dir, "dur=", dur);

  if ((dur|0) <= 0){ if (DEBUG) print("SLAT SKIP (dur<=0)"); enter("IDLE"); return; }
  doNudge(dir, dur|0);  // doNudge handles double-stop/quiet-window and returns to IDLE
}

/* ---------------- Preset movement (then slat adjustment) ---------------- */
function doPreset(which){
  let p = (which===1) ? K.preset_1 : K.preset_2;

  coverStatus(function(st0){
    let startPos = (typeof st0.pos === "number") ? st0.pos
                 : (typeof st0.position === "number") ? st0.position
                 : (typeof st0.current_pos === "number") ? st0.current_pos
                 : null;

    // Planned arrival based on start vs target
    let plannedDir = "none";
    if (startPos !== null) {
      if ((startPos|0) < (p|0)) plannedDir = "down";   // moving downward to target
      else if ((startPos|0) > (p|0)) plannedDir = "up";
      else plannedDir = "none";
    }
    if (DEBUG) print("PRESET:", which, "start=", startPos, "target=", p, "plannedArr=", plannedDir);

    // Start GoTo
    TclearAll();
    moving = true;
    armRunTimeout();
    enter("PRESET");

    coverGoToPercent(p, function(){
      waitUntilAtTarget(p, 1, K.run_timeout_ms, function(finalPos){
        moving = false;

        // If startPos unknown, derive a best-effort arrival from finalPos relative to target (edge tolerance)
        let arrival = plannedDir;
        if (arrival === "none" && typeof finalPos === "number"){
          let delta = (finalPos - p);
          if (Math.abs(delta) >= 1) arrival = (delta > 0) ? "up" : "down";  // >target ⇒ came from below? (defensive)
        }

        if (DEBUG) print("ARRIVAL:", arrival, "finalPos=", finalPos);
        doSlatAdjustFor(which, arrival);
      });
    });
  });
}

/* ---------------- Token processing ---------------- */
function processToken(tok){
  if (!READY) return;

  if (tok === "single_up"){
    if (moving){ doStop(); return; }
    doOpen(); return;
  }
  if (tok === "single_down"){
    if (moving){ doStop(); return; }
    doClose(); return;
  }
  if (tok === "long_up"){   doNudge("up",   K.nudge_up_ms);   return; }
  if (tok === "long_down"){ doNudge("down", K.nudge_down_ms); return; }

  if (tok === "double_up"){   doPreset(1); return; }
  if (tok === "double_down"){ doPreset(2); return; }
}

/* ---------------- KVS polling (communication channel) ---------------- */
function nextPoll(){ Timer.set(K.poll_interval_ms|0, false, pollOnce); }
function pollOnce(){
  Shelly.call("KVS.Get", { key: KVS_CMD_KEY }, function(res, err){
    if (!err && res && typeof res.value === "string" && res.value.length>0){
      let tok = res.value;
      Shelly.call("KVS.Delete", { key: KVS_CMD_KEY }, function(){
        processToken(tok);
        nextPoll();
      });
    } else {
      nextPoll();
    }
  });
}