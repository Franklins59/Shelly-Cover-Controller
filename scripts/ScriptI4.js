/************************************************************
 * Shelly 2PM + i4 Cover Controller Script
 * Author: Franz Forster
 * License: MIT
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

***** Shelly i4 Gen3 1.7.x – lightweight sender → 2PM /rpc/KVS.Set
 * In0 = up, In1 = down
 * Sends ONLY: single_up/down, double_up/down, long_up/down
 * (NO stop command from the i4 – stop logic is handled on the 2PM)
 *********************************************************************/

let TARGET_IP = "192.168.1.64";   // configurable via KVS key "target_2pm_ip"
let KVS_KEY  = "coverex_cmd";

// Load target IP as string from KVS
Shelly.call("KVS.Get", { key: "target_2pm_ip" }, function(res, err){
  if (!err && res && res.value !== undefined && res.value !== null) TARGET_IP = String(res.value);
  else Shelly.call("KVS.Set", { key:"target_2pm_ip", value: JSON.stringify(TARGET_IP) });
  print("i4 target_2pm_ip =", TARGET_IP);
});

function dirForInputId(id){ return id===0 ? "up" : (id===1 ? "down" : null); }
function mapToken(id, ev){
  let dir = dirForInputId(id);
  if (!dir) return null;
  if (ev==="single_push") return "single_"+dir;
  if (ev==="double_push") return "double_"+dir;
  if (ev==="long_push")   return "long_"+dir;
  return null; // ignore btn_down / btn_up
}

function kvsSet(token){
  if (!token) return;
  let url = "http://" + TARGET_IP + "/rpc/KVS.Set?key=" + KVS_KEY + "&value=" + token;
  Shelly.call("HTTP.GET", { url: url, timeout: 4 }, function(res){
    print("KVS.Set sent:", token, "HTTP", res ? res.code : "nores");
  });
}

// Gen3 event format (single parameter containing obj.info)
Shelly.addEventHandler(function (obj) {
  if (!obj || !obj.info || typeof obj.info !== "object") return;
  let inf = obj.info;  // {component:"input:x", id, event}
  if (typeof inf.component !== "string" || inf.component.indexOf("input:")!==0) return;

  // ignore btn_down / btn_up – stop logic is handled by the 2PM
  if (inf.event === "btn_down" || inf.event === "btn_up") return;

  let id = (typeof inf.id === "number") ? inf.id : parseInt(String(inf.id), 10);
  let ev = String(inf.event || "");
  let tok = mapToken(id, ev);
  if (tok) kvsSet(tok);
});

// Optional fallback (classic 2-parameter hook, for older FW behavior)
Shelly.addEventHandler(function (ev, info) {
  if (ev !== "input_event" || !info) return;
  let id = (typeof info.id === "number") ? info.id : parseInt(String(info.id), 10);
  let tok = mapToken(id, String(info.event||""));
  if (tok) kvsSet(tok);
});
