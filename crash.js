/*
 * Frida Script: CRASH v4.1 - MULTI-CODE + AUTO REMOVE
 * Target: libMyGame.so
 */

const moduleName = "libMyGame.so";

function waitForModule() {
    var base = Module.findBaseAddress(moduleName);
    if (!base) { setTimeout(waitForModule, 500); return; }
    console.log("[+] Module loaded: " + base);
    initScript();
}

function initScript() {

    var globalProcessor = null;
    var schedule = null;
    var fnChangeStatus = null;
    var fnRemoveFriend = null;
    var myPlayerId = "";
    var foundPlayers = {};
    var crashedPlayers = {};
    var confirmedLeft = {};
    var crashAttempts = {};
    var whitelist = {};
    var currentRoomId = "";
    var isCrashActive = false;
    var crashRepeatTimer = null;
    var crashSession = 0;
    var removeQueue = [];
    var isRemoving = false;

    var crashDelay = 400;
    var RECRASH_CHECK_MS = 5000;
    var MAX_RECRASH = 8;
    var REPEAT_INTERVAL = 12000;
    var REMOVE_DELAY = 300;

    var CRASH_CODES = [999, 0, -1, 2147483647, -2147483648, 1, 99999];
    var playerCodeIndex = {};

    var parseParamsList = [
        "_ZN3ags16RelationsCommand23RelationsRemoveResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand20RelationsNewResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand29RelationsChangeStatusResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand31RelationsUpdateProgressResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand27RelationsUpdateTagsResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand22RelationsErrorResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand20RelationsGetResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand31RelationsWeddingApproveResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand29RelationsWeddingStartResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand30RelationsWeddingCancelResponse11parseParamsEv",
        "_ZN3ags16RelationsCommand29RelationsWeddingRingsResponse11parseParamsEv"
    ];
    var patchStore = {};
    var isProtected = false;

    var pinnedMemory = [];
    function pinMem(ptr) {
        pinnedMemory.push(ptr);
        if (pinnedMemory.length > 5000) pinnedMemory.shift();
        return ptr;
    }

    var pendingTasks = [];
    var mainLoopAddr = Module.findExportByName(moduleName, "_ZN7cocos2d8Director8mainLoopEv");
    if (mainLoopAddr) {
        Interceptor.attach(mainLoopAddr, {
            onEnter: function() {
                while (pendingTasks.length > 0) { try { pendingTasks.shift()(); } catch(e) {} }
            }
        });
    }

    var dmSingletonAddr = Module.findExportByName(moduleName, "_ZN9SingletonI13DialogManagerE10m_instanceE");
    var showAlertBoxAddr = Module.findExportByName(moduleName,
        "_ZN13DialogManager12showAlertBoxERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_RKNS0_8functionIFvvEEE");
    var alertKeepAlive = [];

    function makeAlertString(str) {
        var enc = Memory.allocUtf8String(str);
        var bl = 0; while (enc.add(bl).readU8() !== 0) bl++;
        var cap = bl + 32; var buf = Memory.alloc(cap);
        Memory.copy(buf, enc, bl); buf.add(bl).writeU8(0);
        alertKeepAlive.push(buf);
        var mem = Memory.alloc(24);
        mem.writeU64(cap | 1); mem.add(8).writeU64(bl); mem.add(16).writePointer(buf);
        alertKeepAlive.push(mem); return mem;
    }

    function showAlert(title, message) {
        if (!dmSingletonAddr || !showAlertBoxAddr) return;
        pendingTasks.push(function() {
            try {
                var dm = dmSingletonAddr.readPointer(); if (dm.isNull()) return;
                alertKeepAlive = [];
                var t = makeAlertString(title || ""), m = makeAlertString(message || "");
                var e = Memory.alloc(48); for (var i = 0; i < 48; i += 8) e.add(i).writeU64(0);
                alertKeepAlive.push(e);
                new NativeFunction(showAlertBoxAddr, 'void', ['pointer', 'pointer', 'pointer', 'pointer'])(dm, t, m, e);
            } catch(e) {}
        });
    }

    function get_func(n) { return Module.findExportByName(moduleName, n); }
    function safeRead(cb) { try { return cb(); } catch(e) { return ""; } }

    function readStdString(addr) {
        if (!addr || addr.isNull()) return "";
        try {
            var b = addr.readU8();
            if ((b & 1) === 0) return addr.add(1).readUtf8String(b >> 1);
            var len = Number(addr.add(8).readU64());
            if (len === 0 || len > 10000) return "";
            var dp = addr.add(16).readPointer();
            if (dp.isNull()) return "";
            return dp.readUtf8String(len);
        } catch(e) { return ""; }
    }

    function createStrFor(text, memArr) {
        var sp = Memory.alloc(24); if (memArr) memArr.push(sp);
        var buf = Memory.allocUtf8String(text); if (memArr) memArr.push(buf);
        var bl = 0; while (buf.add(bl).readU8() !== 0) bl++;
        for (var i = 0; i < 24; i++) sp.add(i).writeU8(0);
        if (bl <= 22) { sp.writeU8(bl << 1); Memory.copy(sp.add(1), buf, bl); }
        else { var hb = Memory.alloc(bl + 1); if (memArr) memArr.push(hb);
            Memory.copy(hb, buf, bl + 1); sp.writeU64(((bl + 1) * 2) + 1);
            sp.add(8).writeU64(bl); sp.add(16).writePointer(hb); }
        return sp;
    }

    function makeStr(text) {
        var buf = pinMem(Memory.alloc(64)); for (var i = 0; i < 64; i++) buf.add(i).writeU8(0);
        if (text.length <= 22) { buf.writeU8(text.length << 1); buf.add(1).writeUtf8String(text); }
        else { var heap = pinMem(Memory.alloc(text.length + 16)); heap.writeUtf8String(text);
            buf.writeU8(1); buf.add(8).writeU64(text.length); buf.add(16).writePointer(heap); }
        return buf;
    }

    function patchExistingString(strObj, newText) {
        try { var il = strObj.readU8() & 1;
            var dp = il ? strObj.add(16).readPointer() : strObj.add(1);
            dp.writeUtf8String(newText);
            if (il) strObj.add(8).writeU64(newText.length);
            else strObj.writeU8(newText.length << 1); return true;
        } catch(e) { return false; }
    }

    function getPlayerID() {
        try { var addr = get_func("_ZN9SingletonIN3ags6ClientEE11getInstanceEv");
            if (!addr) return ""; var c = new NativeFunction(addr, 'pointer', [])();
            if (!c || c.isNull()) return ""; return readStdString(c);
        } catch(e) { return ""; }
    }

    function getCmdProcessor() {
        var addr = get_func("_ZN9SingletonIN3ags16CommandProcessorEE11getInstanceEv");
        if (addr) return new NativeFunction(addr, 'pointer', [])(); return null;
    }

    function tryGetMyId() {
        if (myPlayerId) return;
        var id = getPlayerID();
        if (id && /^\d{3,20}$/.test(id)) { myPlayerId = id; console.log("[+] My ID: " + myPlayerId); }
    }
    var idTimer = setInterval(function() { tryGetMyId(); if (myPlayerId) clearInterval(idTimer); }, 1000);

    // === PROTECTION ===
    function isARM64(addr) {
        try { var b = new Uint8Array(addr.readByteArray(4));
            return (b[3]===0xD6||b[3]===0xA9||b[3]===0xF9||b[3]===0xB9||
                    b[3]===0x52||b[3]===0xAA||b[3]===0xD2||b[3]===0x94);
        } catch(e) { return false; }
    }

    function patchParseParams() {
        if (isProtected) return; var count = 0;
        parseParamsList.forEach(function(sym) {
            var addr = Module.findExportByName(moduleName, sym); if (!addr) return;
            var key = addr.toString(); if (patchStore[key] && patchStore[key].patched) return;
            try { Memory.protect(addr, 16, 'rwx'); var orig = addr.readByteArray(16);
                if (isARM64(addr)) addr.writeByteArray([0x00,0x00,0x80,0xD2,0xC0,0x03,0x5F,0xD6]);
                else addr.writeByteArray([0x48,0x31,0xC0,0xC3]);
                patchStore[key] = {addr:addr, original:orig, patched:true}; count++;
            } catch(e) {}
        });
        isProtected = true; console.log("[+] Protected: " + count);
    }

    function restoreParseParams() {
        if (!isProtected) return; var count = 0;
        Object.keys(patchStore).forEach(function(key) {
            var info = patchStore[key]; if (!info.patched || !info.original) return;
            try { Memory.protect(info.addr, 16, 'rwx'); info.addr.writeByteArray(info.original);
                info.patched = false; count++; } catch(e) {}
        });
        isProtected = false; console.log("[+] Restored: " + count);
    }

    // =========================================================
    // CRASH + REMOVE ENGINE
    // =========================================================
    function sendCrashWithCode(targetId, code) {
        if (!globalProcessor || !fnChangeStatus) return false;
        if (!targetId || targetId === myPlayerId || whitelist[targetId]) return false;
        try {
            var mem = []; var req = pinMem(Memory.alloc(512));
            for (var i = 0; i < 512; i++) req.add(i).writeU8(0);
            var sId = createStrFor(targetId, mem);
            var eMap = pinMem(Memory.alloc(64));
            for (var i = 0; i < 64; i++) eMap.add(i).writeU8(0);
            mem.forEach(function(m) { pinMem(m); });
            fnChangeStatus(req, sId, code, eMap);
            schedule(globalProcessor, req); return true;
        } catch(e) { return false; }
    }

    function sendRemoveDirect(targetId) {
        if (!globalProcessor || !fnRemoveFriend) return false;
        try {
            var mem = []; var req = pinMem(Memory.alloc(512));
            for (var i = 0; i < 512; i++) req.add(i).writeU8(0);
            var sId = createStrFor(targetId, mem);
            mem.forEach(function(m) { pinMem(m); });
            fnRemoveFriend(req, sId);
            schedule(globalProcessor, req); return true;
        } catch(e) { return false; }
    }

    // === ОЧЕРЕДЬ УДАЛЕНИЙ ===
    var removedSet = {};

    function queueRemove(targetId) {
        if (!targetId || targetId === myPlayerId || whitelist[targetId]) return;
        if (removedSet[targetId]) return;
        if (removeQueue.indexOf(targetId) !== -1) return;
        removeQueue.push(targetId);
        processRemoveQueue();
    }

    function processRemoveQueue() {
        if (isRemoving || removeQueue.length === 0) return;
        isRemoving = true;
        function next() {
            if (removeQueue.length === 0) { isRemoving = false; return; }
            var tid = removeQueue.shift();
            if (!removedSet[tid]) {
                sendRemoveDirect(tid);
                removedSet[tid] = true;
                console.log("[+] Remove: " + tid);
            }
            setTimeout(next, REMOVE_DELAY);
        }
        next();
    }

    // === КРАШ + REMOVE ===
    function crashAndRemove(targetId, code) {
        var ok = sendCrashWithCode(targetId, code);
        if (ok) {
            setTimeout(function() { queueRemove(targetId); }, 200);
        }
        return ok;
    }

    function canCrash(uid) { return uid && uid !== myPlayerId && !whitelist[uid]; }

    function getCodeForPlayer(uid) {
        var idx = playerCodeIndex[uid] || 0;
        if (idx >= CRASH_CODES.length) idx = 0;
        return CRASH_CODES[idx];
    }

    function nextCodeForPlayer(uid) {
        if (!playerCodeIndex[uid]) playerCodeIndex[uid] = 0;
        playerCodeIndex[uid]++;
        return playerCodeIndex[uid] < CRASH_CODES.length;
    }

    function canRecrash(uid) {
        if (!canCrash(uid)) return false;
        if (!crashAttempts[uid]) return true;
        return crashAttempts[uid] < MAX_RECRASH;
    }

    function crashWithCheck(targetId) {
        if (!canCrash(targetId)) return false;
        if (!crashAttempts[targetId]) crashAttempts[targetId] = 0;
        crashAttempts[targetId]++;

        if (crashAttempts[targetId] > MAX_RECRASH) {
            console.log("[-] " + targetId + " max (" + MAX_RECRASH + ")");
            return false;
        }

        var code = getCodeForPlayer(targetId);
        var ok = crashAndRemove(targetId, code);
        if (!ok) return false;

        crashedPlayers[targetId] = Date.now();
        delete confirmedLeft[targetId];

        var att = crashAttempts[targetId];
        if (att === 1)
            console.log("[*] -> " + targetId + " (code:" + code + ")");
        else
            console.log("[*] -> " + targetId + " (" + att + "/" + MAX_RECRASH + " c:" + code + ")");

        var ses = crashSession;
        setTimeout(function() {
            if (ses !== crashSession || !isCrashActive) return;
            if (confirmedLeft[targetId]) {
                console.log("[+] " + targetId + " LEFT (c:" + getCodeForPlayer(targetId) + " att:" + (crashAttempts[targetId]||0) + ")");
                return;
            }
            if (foundPlayers[targetId] && canRecrash(targetId)) {
                nextCodeForPlayer(targetId);
                delete removedSet[targetId];
                delete crashedPlayers[targetId];
                crashWithCheck(targetId);
            } else if (crashAttempts[targetId] >= MAX_RECRASH) {
                console.log("[-] " + targetId + " immune (" + CRASH_CODES.length + " codes)");
            }
        }, RECRASH_CHECK_MS);

        return true;
    }

    // =========================================================
    // PLAYER TRACKING
    // =========================================================
    function onPlayerLeft(uid) {
        if (!uid) return;
        delete foundPlayers[uid];
        confirmedLeft[uid] = true;
        if (crashedPlayers[uid]) {
            var att = crashAttempts[uid] || 1;
            var code = getCodeForPlayer(uid);
            console.log("[+] " + uid + " out (att:" + att + " c:" + code + ")");
        }
    }

    function onPlayerDetected(uid) {
        if (!uid || !/^\d{3,20}$/.test(uid)) return;
        if (!myPlayerId) tryGetMyId();
        if (uid === myPlayerId) return;

        var isNew = !foundPlayers[uid];
        foundPlayers[uid] = true;
        delete confirmedLeft[uid];

        if (isNew && isCrashActive && canCrash(uid)) {
            delete crashAttempts[uid];
            delete crashedPlayers[uid];
            delete playerCodeIndex[uid];
            delete removedSet[uid];
            crashWithCheck(uid);
        }
    }

    function resetPlayers() {
        foundPlayers = {}; crashedPlayers = {}; confirmedLeft = {};
        crashAttempts = {}; playerCodeIndex = {};
        removeQueue = []; isRemoving = false; removedSet = {};
        crashSession++;
        console.log("[+] Reset (s" + crashSession + ")");
    }

    function onLocationChange() {
        console.log("[+] Location change");
        if (isCrashActive) {
            isCrashActive = false;
            if (crashRepeatTimer) { clearInterval(crashRepeatTimer); crashRepeatTimer = null; }
            showAlert("Crash", "New location\nStopped\nRestart manually");
        }
        resetPlayers();
    }

    // =========================================================
    // COMMANDS
    // =========================================================
    function crashOne(targetId) {
        if (!fnChangeStatus || !globalProcessor) { showAlert("Crash", "Not ready!"); return; }
        if (!myPlayerId) tryGetMyId();
        if (!canCrash(targetId)) { showAlert("Crash", "Can't crash: " + targetId); return; }
        patchParseParams();
        delete crashedPlayers[targetId]; delete crashAttempts[targetId];
        delete playerCodeIndex[targetId]; delete removedSet[targetId];

        var idx = 0;
        function sendNext() {
            if (idx >= CRASH_CODES.length) {
                setTimeout(function() {
                    sendRemoveDirect(targetId);
                    console.log("[+] Remove: " + targetId);
                }, 300);
                return;
            }
            sendCrashWithCode(targetId, CRASH_CODES[idx]);
            console.log("[*] " + targetId + " code:" + CRASH_CODES[idx]);
            idx++;
            setTimeout(sendNext, 150);
        }
        sendNext();

        showAlert("Crash", "-> " + targetId + "\n" + CRASH_CODES.length + " codes + remove");
        setTimeout(function() { if (!isCrashActive) restoreParseParams(); }, 10000);
    }

    function crashAllOnce() {
        if (!fnChangeStatus || !globalProcessor) { showAlert("Crash", "Not ready!"); return; }
        if (!myPlayerId) tryGetMyId();
        var ids = Object.keys(foundPlayers).filter(function(id) {
            return canCrash(id) && !crashedPlayers[id];
        });
        if (ids.length === 0) { showAlert("Crash", "No targets!"); return; }
        patchParseParams();
        showAlert("Crash", ids.length + " targets + remove");
        var idx = 0;
        function batch() {
            if (idx >= ids.length) {
                setTimeout(function() {
                    console.log("[+] Mass remove: " + ids.length);
                    ids.forEach(function(tid) { queueRemove(tid); });
                    setTimeout(function() { if (!isCrashActive) restoreParseParams(); }, 10000);
                }, 1000);
                return;
            }
            var tid = ids[idx++];
            var ci = 0;
            function sc() {
                if (ci >= CRASH_CODES.length) { setTimeout(batch, 100); return; }
                sendCrashWithCode(tid, CRASH_CODES[ci++]);
                setTimeout(sc, 80);
            }
            sc();
        }
        batch();
    }

    function startCrashAll() {
        if (!fnChangeStatus) { showAlert("Crash", "Not ready!"); return; }
        if (!myPlayerId) tryGetMyId();
        if (!myPlayerId) { showAlert("Crash", "No ID!\nWalk around"); return; }
        if (isCrashActive) { showAlert("Crash", "Already active!"); return; }

        isCrashActive = true;
        crashedPlayers = {}; confirmedLeft = {}; crashAttempts = {};
        playerCodeIndex = {}; removedSet = {};
        removeQueue = []; isRemoving = false;
        crashSession++;
        patchParseParams();

        var ids = Object.keys(foundPlayers).filter(canCrash);
        showAlert("Crash", "AUTO ON\n" + ids.length + " targets\n" +
                  CRASH_CODES.length + " codes + auto remove\n!stopcrash");
        console.log("[*] START: " + ids.length + " (s" + crashSession + ")");

        var ses = crashSession; var idx = 0;
        function si() {
            if (ses !== crashSession || idx >= ids.length) return;
            crashWithCheck(ids[idx++]);
            setTimeout(si, crashDelay);
        }
        si();

        crashRepeatTimer = setInterval(function() {
            if (!isCrashActive || ses !== crashSession) {
                clearInterval(crashRepeatTimer); crashRepeatTimer = null; return;
            }
            var stillHere = Object.keys(foundPlayers).filter(function(id) {
                return canCrash(id) && !confirmedLeft[id];
            });
            var recrash = stillHere.filter(function(id) {
                return canRecrash(id) &&
                    (!crashedPlayers[id] || (Date.now() - crashedPlayers[id]) > RECRASH_CHECK_MS);
            });
            var immune = stillHere.filter(function(id) { return crashAttempts[id] >= MAX_RECRASH; });

            if (recrash.length > 0) {
                var i2 = 0;
                function rep() {
                    if (ses !== crashSession || i2 >= recrash.length) return;
                    delete crashedPlayers[recrash[i2]];
                    delete removedSet[recrash[i2]];
                    crashWithCheck(recrash[i2++]);
                    setTimeout(rep, crashDelay);
                }
                rep();
            }

            var total = Object.keys(foundPlayers).filter(canCrash).length;
            var left = Object.keys(confirmedLeft).length;
            var removed = Object.keys(removedSet).length;
            console.log("[i] here:" + total + " left:" + left +
                        " immune:" + immune.length + " removed:" + removed);

            if (total === 0 || (recrash.length === 0 && immune.length === total)) {
                console.log("[*] Done. Auto-stop.");
                stopCrashAll();
            }
        }, REPEAT_INTERVAL);
    }

    function stopCrashAll() {
        var wasActive = isCrashActive;
        isCrashActive = false; crashSession++;
        if (crashRepeatTimer) { clearInterval(crashRepeatTimer); crashRepeatTimer = null; }

        var total = Object.keys(confirmedLeft).length;
        var removed = Object.keys(removedSet).length;
        var immune = Object.keys(crashAttempts).filter(function(id) {
            return crashAttempts[id] >= MAX_RECRASH && foundPlayers[id] && !confirmedLeft[id];
        });

        console.log("[*] STOP. Left:" + total + " Removed:" + removed + " Immune:" + immune.length);
        if (immune.length > 0) {
            console.log("[-] Immune:"); immune.forEach(function(id) { console.log("  " + id); });
        }

        showAlert("Crash", "Stopping\nLeft: " + total + "\nRemoved: " + removed +
                  "\nImmune: " + immune.length + "\nRestore 5s");
        setTimeout(function() {
            restoreParseParams();
            showAlert("Crash", "Done!\nLeft: " + total + "\nRemoved: " + removed);
        }, 5000);
    }

    // === Массовое удаление всех из друзей ===
    function removeAllPlayers() {
        var ids = Object.keys(foundPlayers).filter(function(id) {
            return id !== myPlayerId && !whitelist[id];
        });
        if (ids.length === 0) { console.log("[-] No players"); return; }
        console.log("[+] Removing " + ids.length + "...");
        ids.forEach(function(id) { queueRemove(id); });
    }

    // =========================================================
    // GLOBALS
    // =========================================================
    global.crash = function(id) { crashOne(id); };
    global.crashAll = function() { startCrashAll(); };
    global.crashOnce = function() { crashAllOnce(); };
    global.stopCrash = function() { stopCrashAll(); };
    global.remove = function(id) { sendRemoveDirect(id); console.log("[+] " + id); };
    global.removeAll = function() { removeAllPlayers(); };
    global.protect = function() { patchParseParams(); };
    global.unprotect = function() { restoreParseParams(); };
    global.setCodes = function(arr) { CRASH_CODES = arr; console.log("[+] Codes: " + JSON.stringify(CRASH_CODES)); };
    global.addCode = function(n) { CRASH_CODES.push(n); console.log("[+] Codes: " + JSON.stringify(CRASH_CODES)); };
    global.setCrashDelay = function(n) { crashDelay = n; };
    global.setMaxRecrash = function(n) { MAX_RECRASH = n; };
    global.setRemoveDelay = function(n) { REMOVE_DELAY = n; };
    global.wl = function(id) { whitelist[id] = true; console.log("[+] WL: " + id); };
    global.unwl = function(id) { delete whitelist[id]; };
    global.clearWl = function() { whitelist = {}; };

    global.info = function() {
        var pl = Object.keys(foundPlayers).filter(function(id) { return id !== myPlayerId; }).length;
        var left = Object.keys(confirmedLeft).length;
        var removed = Object.keys(removedSet).length;
        var immune = Object.keys(crashAttempts).filter(function(id) {
            return crashAttempts[id] >= MAX_RECRASH && foundPlayers[id] && !confirmedLeft[id];
        }).length;
        console.log("\n" + "=".repeat(55));
        console.log("  CRASH v4.1");
        console.log("=".repeat(55));
        console.log("  My ID:     " + myPlayerId);
        console.log("  Room:      " + currentRoomId);
        console.log("  Players:   " + pl);
        console.log("  Left:      " + left);
        console.log("  Removed:   " + removed);
        console.log("  Immune:    " + immune);
        console.log("  Active:    " + (isCrashActive ? "ON" : "OFF") + " (s" + crashSession + ")");
        console.log("  Shield:    " + (isProtected ? "ON" : "OFF"));
        console.log("  Codes:     " + JSON.stringify(CRASH_CODES));
        console.log("  Queue:     " + removeQueue.length + " pending removes");
        console.log("=".repeat(55) + "\n");
    };

    global.players = function() {
        var ids = Object.keys(foundPlayers).filter(function(id) { return id !== myPlayerId; });
        console.log("\n=== PLAYERS (" + ids.length + ") ===");
        for (var p = 0; p < ids.length; p++) {
            var id = ids[p], tags = "";
            if (whitelist[id]) tags += " WL";
            if (confirmedLeft[id]) tags += " LEFT";
            else if (crashAttempts[id] >= MAX_RECRASH) tags += " IMM";
            else if (crashedPlayers[id]) tags += " (" + (crashAttempts[id]||0) + ")";
            if (removedSet[id]) tags += " RM";
            console.log("  " + (p + 1) + ". " + id + tags);
        }
        console.log("==================\n");
    };

    global.immune = function() {
        var ids = Object.keys(crashAttempts).filter(function(id) {
            return crashAttempts[id] >= MAX_RECRASH && foundPlayers[id] && !confirmedLeft[id];
        });
        console.log("\n=== IMMUNE (" + ids.length + ") ===");
        ids.forEach(function(id) { console.log("  " + id + " (" + crashAttempts[id] + " att)"); });
        console.log("==================\n");
    };

    global.help = function() {
        console.log("\n" + "=".repeat(60));
        console.log("  CRASH v4.1 - MULTI-CODE + AUTO REMOVE");
        console.log("=".repeat(60));
        console.log("  crash('uid')     - all codes + remove");
        console.log("  crashAll()       - auto + remove after each");
        console.log("  crashOnce()      - once + mass remove");
        console.log("  stopCrash()      - stop");
        console.log("  remove('uid')    - remove from friends");
        console.log("  removeAll()      - remove all");
        console.log("");
        console.log("  info() / players() / immune()");
        console.log("  setCodes([...]) / addCode(n)");
        console.log("  wl('id') / clearWl()");
        console.log("  !crash uid / !crashall / !stopcrash");
        console.log("=".repeat(60) + "\n");
    };

    // =========================================================
    // FIND EXPORTS
    // =========================================================
    var allExports = Module.enumerateExportsSync(moduleName);
    for (var i = 0; i < allExports.length; i++) {
        var nm = allExports[i].name;
        if (nm.indexOf("RelationsChangeStatusRequest") !== -1 && nm.indexOf("C1") !== -1 && !fnChangeStatus) {
            fnChangeStatus = new NativeFunction(allExports[i].address, 'void', ['pointer', 'pointer', 'int', 'pointer']);
            console.log("[+] ChangeStatus: OK");
        }
        if (nm.indexOf("RelationsRemoveRequest") !== -1 && (nm.indexOf("C1") !== -1 || nm.indexOf("C2") !== -1) && !fnRemoveFriend) {
            fnRemoveFriend = new NativeFunction(allExports[i].address, 'void', ['pointer', 'pointer']);
            console.log("[+] Remove: OK");
        }
    }

    // =========================================================
    // SCHEDULE HOOK
    // =========================================================
    var scheduleRequestAddr = Module.findExportByName(moduleName,
        "_ZN3ags16CommandProcessor15scheduleRequestERKNS_10AGSRequestE");
    if (scheduleRequestAddr) {
        var originalSchedule = new NativeFunction(scheduleRequestAddr, 'void', ['pointer', 'pointer']);
        schedule = originalSchedule;
        Interceptor.attach(scheduleRequestAddr, {
            onEnter: function(args) {
                if (!globalProcessor) { globalProcessor = args[0]; console.log("[+] Processor!"); }
                try { for (var off = 24; off <= 200; off += 8) {
                    var str = readStdString(args[1].add(off));
                    if (str && str.indexOf(":") !== -1) currentRoomId = str;
                } } catch(e) {}
            }
        });
        console.log("[+] scheduleRequest hooked");
    }

    // =========================================================
    // PLAYER HOOKS
    // =========================================================
    var moveReqAddr = Module.findExportByName(moduleName,
        "_ZN3ags11RoomCommand21RoomAvatarMoveRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEN7cocos2d4Vec2ESC_SA_");
    if (moveReqAddr) {
        Interceptor.attach(moveReqAddr, {
            onEnter: function(args) {
                var uid = readStdString(args[1]);
                if (uid && /^\d{3,20}$/.test(uid) && !myPlayerId) { myPlayerId = uid; console.log("[+] My ID: " + myPlayerId); }
            }
        });
    }

    var stateReqAddr = Module.findExportByName(moduleName,
        "_ZN3ags11RoomCommand28RoomAvatarUpdateStateRequestC1ERKNS0_21AvatarUpdateStateDataERKNSt6__ndk112basic_stringIcNS5_11char_traitsIcEENS5_9allocatorIcEEEE");
    if (stateReqAddr) {
        Interceptor.attach(stateReqAddr, {
            onEnter: function(args) {
                var uid = readStdString(args[1].add(0));
                if (uid && /^\d{3,20}$/.test(uid) && !myPlayerId) { myPlayerId = uid; console.log("[+] My ID (state): " + myPlayerId); }
                onPlayerDetected(uid);
            }
        });
    }

    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf("AvatarUpdateStateData") !== -1 &&
            (allExports[i].name.indexOf("C1E") !== -1 || allExports[i].name.indexOf("C2E") !== -1)) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) { onPlayerDetected(safeRead(function() { return readStdString(args[1]); })); }
            }); break;
        }
    }

    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf("PlayersManager") !== -1 && allExports[i].name.indexOf("addPlayer") !== -1 &&
            allExports[i].name.indexOf("typeinfo") === -1) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) {
                    var rp = args[1]; if (!rp || rp.isNull()) return;
                    var obj = safeRead(function() { return rp.readPointer(); });
                    if (!obj || obj.isNull()) return;
                    onPlayerDetected(safeRead(function() { return readStdString(obj.add(104)); }));
                }
            }); break;
        }
    }

    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf("RoomJoinUserResponse") !== -1 && allExports[i].name.indexOf("parseParams") !== -1) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) { this.self = args[0]; },
                onLeave: function() { for (var off = 8; off <= 200; off += 8)
                    safeRead(function() { var s = readStdString(this.self.add(off));
                        if (s && /^\d{3,20}$/.test(s) && s !== myPlayerId) onPlayerDetected(s); }.bind(this)); }
            }); console.log("[+] JoinUserResponse hooked"); break;
        }
    }

    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf("RoomLeaveUserResponse") !== -1 && allExports[i].name.indexOf("parseParams") !== -1) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) { this.self = args[0]; },
                onLeave: function() { for (var off = 8; off <= 200; off += 8)
                    safeRead(function() { var s = readStdString(this.self.add(off));
                        if (s && /^\d{3,20}$/.test(s)) onPlayerLeft(s); }.bind(this)); }
            }); console.log("[+] LeaveUserResponse hooked"); break;
        }
    }

    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf("LeavedGameResponse") !== -1 && allExports[i].name.indexOf("parseParams") !== -1) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) { this.self = args[0]; },
                onLeave: function() { for (var off = 8; off <= 200; off += 8)
                    safeRead(function() { var s = readStdString(this.self.add(off));
                        if (s && /^\d{3,20}$/.test(s)) onPlayerLeft(s); }.bind(this)); }
            }); break;
        }
    }

    var rn = ["AvararMoveResponse", "AvararCustomActionResponse"];
    for (var r = 0; r < rn.length; r++) { for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf(rn[r]) !== -1 && allExports[i].name.indexOf("parseParams") !== -1) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) { this.self = args[0]; },
                onLeave: function() { for (var off = 8; off <= 200; off += 8)
                    safeRead(function() { onPlayerDetected(readStdString(this.self.add(off))); }.bind(this)); }
            }); break;
        }
    } }

    var clAddr = get_func("_ZN13WorkGameScene14changeLocationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_S8_");
    if (clAddr) { Interceptor.attach(clAddr, { onEnter: function() { onLocationChange(); } }); console.log("[+] changeLocation hooked"); }

    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf("RoomJoinResponse") !== -1 && allExports[i].name.indexOf("JoinUser") === -1 &&
            allExports[i].name.indexOf("parseParams") !== -1) {
            Interceptor.attach(allExports[i].address, { onEnter: function() { onLocationChange(); } });
            console.log("[+] RoomJoinResponse hooked"); break;
        }
    }

    // =========================================================
    // CHAT
    // =========================================================
    var chatAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
    if (chatAddr) {
        Interceptor.attach(chatAddr, {
            onEnter: function(args) {
                var msg = readStdString(args[1]).trim();
                var myId = getPlayerID(); var sid = ""; try { sid = readStdString(args[0]); } catch(e) {}
                if (myId && sid && sid !== myId) return;
                if (msg.indexOf("!") === 0) patchExistingString(args[1], "");
                var p = msg.split(" "), cmd = p[0], a1 = p[1];

                if (cmd === "!crash" && a1) crashOne(a1);
                if (cmd === "!crashall") startCrashAll();
                if (cmd === "!crashonce") crashAllOnce();
                if (cmd === "!stopcrash") stopCrashAll();
                if (cmd === "!remove" && a1) { sendRemoveDirect(a1); console.log("[+] " + a1); }
                if (cmd === "!removeall") removeAllPlayers();
                if (cmd === "!protect") patchParseParams();
                if (cmd === "!unprotect") restoreParseParams();
                if (cmd === "!info") global.info();
                if (cmd === "!players") global.players();
                if (cmd === "!immune") global.immune();
                if (cmd === "!clearplayers") resetPlayers();
                if (cmd === "!whitelist") { for (var x = 1; x < p.length; x++) if (p[x] && /^\d+$/.test(p[x])) whitelist[p[x]] = true; }
                if (cmd === "!clearlist") whitelist = {};
                if (cmd === "!status") {
                    var left = Object.keys(confirmedLeft).length;
                    var removed = Object.keys(removedSet).length;
                    showAlert("Crash", (isCrashActive ? "ON" : "OFF") + "\nLeft:" + left +
                              "\nRemoved:" + removed + "\nShield:" + (isProtected ? "ON" : "OFF"));
                }
                if (cmd === "!help") showAlert("Crash", "!crash uid\n!crashall\n!stopcrash\n!removeall\n!info !players !immune");
            }
        }); console.log("[+] Chat hooked!");
    }

    globalProcessor = getCmdProcessor();
    tryGetMyId();

    console.log("\n" + "=".repeat(60));
    console.log("  CRASH v4.1 - MULTI-CODE + AUTO REMOVE");
    console.log("=".repeat(60));
    console.log("  ChangeStatus: " + (fnChangeStatus ? "OK" : "FAIL"));
    console.log("  Remove:       " + (fnRemoveFriend ? "OK" : "FAIL"));
    console.log("  My ID:        " + (myPlayerId || "(walk)"));
    console.log("  Codes:        " + JSON.stringify(CRASH_CODES));
    console.log("  Max:          " + MAX_RECRASH);
    console.log("");
    console.log("  crashAll() / stopCrash() / info()");
    console.log("=".repeat(60) + "\n");
}

waitForModule();
