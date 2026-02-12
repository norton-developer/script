console.log("--- FULL SCRIPT WITH APPEARANCE + SKIP TUTORIAL ---");

var moduleName = "libMyGame.so";
var base = Module.findBaseAddress(moduleName);

if (base) {
    console.log("[+] libMyGame.so FOUND: " + base);
    initScript();
} else {
    console.log("[!] Waiting for libMyGame.so...");
    var waiter = setInterval(function() {
        var b = Module.findBaseAddress(moduleName);
        if (b) {
            clearInterval(waiter);
            console.log("[+] libMyGame.so loaded: " + b);
            initScript();
        }
    }, 500);
}

function initScript() {

// === ЗАЩИТА ОТ КРАША ===
var validVTable = null;
var clothesConfigBlocked = false;
var originalLoadConfigs = null;


// === GIFT HACK ===
var GIFT_TARGET = "cyberDance";
var GIFT_ENABLED = true;

var workObjects = [];
var nextNet = null;
var nextVisual = null;
var isLocked = false;

// === СИСТЕМА ДУБЛИРОВАНИЯ ===
var globalProcessor = null;
var savedArgs = null;
var repeatCount = 0;
var isReady = false;

var ctorAddr = null;
var scheduleAddr = null;
var ctor = null;
var schedule = null;

// === СИСТЕМА СОХРАНЕНИЙ ===
var savedSlots = {};

var actionToSlot = {
    "defaultDance_1": "1",
    "defaultDance_2": "2",
    "defaultDance_3": "3",
    "defaultDance_4": "4",
    "cryPose": "cry",
    "angryPose": "angry"
};

// === ДЛЯ ЛОКАЛЬНОЙ АНИМАЦИИ ===
var myAvatarObject = null;
var setAnimationFunc = null;

// === ДЛЯ RELATIONS ===
var changeStatusCtor = null;
var createRelCtor = null;

var capturedMapPtr = null;
var isAllowedToKick = false;

// === ДЛЯ B.O.X КНОПКИ ===
var isModdingActive = false;
var box_buttonobjmenu = null;

// =========================================================
// СИСТЕМА ПИННИНГА ПАМЯТИ
// =========================================================
var pinnedMemory = [];

function pinMem(ptr) {
    pinnedMemory.push(ptr);
    if (pinnedMemory.length > 1000) pinnedMemory.shift();
    return ptr;
}

// =========================================================
// APPEARANCE CHANGER SYSTEM
// =========================================================
var APPEARANCE_KEYS = {
    "g":"Gender", "n":"Nickname", "sc":"Skin Color",
    "ht":"Hair Type", "hc":"Hair Color", "et":"Eye Type",
    "ec":"Eye Color", "mt":"Mouth Type", "mc":"Mouth Color",
    "bt":"Beard Type", "bc":"Beard Color", "brt":"Brow Type",
    "brc":"Brow Color", "ss":"Skin Style", "sh":"Face Shape",
    "shc":"Shape Color", "rc":"Rouge Color", "rg":"Rouge Type"
};

var appearanceData = {
    masterCopy: null,
    appearance: {},
    ready: false
};

var fnValCopy = null;
var fnValDtor = null;
var fnSaveReqCtor = null;
var comboTimers = [];
var VALUE_SIZE = 32;

// =========================================================
// UTILITY FUNCTIONS
// =========================================================
function get_func(name) { return Module.findExportByName(moduleName, name); }

function readStdString(addr) {
    if (!addr || addr.isNull()) return "";
    try {
        var isLong = addr.readU8() & 1;
        return isLong ? addr.add(16).readPointer().readUtf8String() : addr.add(1).readUtf8String();
    } catch (e) { return ""; }
}

function writeSSO(addr, text) {
    if (!addr || addr.isNull()) return;
    try {
        Memory.protect(addr, 64, 'rwx');
        var safeText = text.substring(0, 22);
        var len = safeText.length;
        for (var i = 0; i < 24; i++) addr.add(i).writeU8(0);
        addr.writeU8(len << 1);
        addr.add(1).writeUtf8String(safeText);
    } catch(e) {}
}

function writeRawString(addr, text) {
    if (addr.isNull()) return;
    var safeText = text.substring(0, 22);
    for (var i = 0; i < 32; i++) addr.add(i).writeU8(0);
    addr.writeU8(safeText.length << 1);
    addr.add(1).writeUtf8String(safeText);
}

function patchExistingString(strObj, newText) {
    try {
        var isLong = strObj.readU8() & 1;
        var dataPtr = isLong ? strObj.add(16).readPointer() : strObj.add(1);
        dataPtr.writeUtf8String(newText);
        if (isLong) strObj.add(8).writeU64(newText.length);
        else strObj.writeU8(newText.length << 1);
        return true;
    } catch (e) { return false; }
}

function createStdString(text) {
    var safeText = text.substring(0, 22);
    var strPtr = pinMem(Memory.alloc(32));
    for (var i = 0; i < 32; i++) strPtr.add(i).writeU8(0);
    strPtr.writeU8(safeText.length << 1);
    strPtr.add(1).writeUtf8String(safeText);
    return strPtr;
}

function createStdStringLong(text) {
    var strPtr = pinMem(Memory.alloc(32));
    for (var i = 0; i < 32; i++) strPtr.add(i).writeU8(0);
    if (text.length <= 22) {
        strPtr.writeU8(text.length << 1);
        strPtr.add(1).writeUtf8String(text);
    } else {
        var heapBuf = pinMem(Memory.alloc(text.length + 1));
        heapBuf.writeUtf8String(text);
        strPtr.writeU8(1);
        strPtr.add(8).writeU64(text.length);
        strPtr.add(16).writePointer(heapBuf);
    }
    return strPtr;
}

function copyPointerData(srcPtr, size) {
    if (!srcPtr || srcPtr.isNull()) return Memory.alloc(size);
    try {
        var dst = pinMem(Memory.alloc(size));
        Memory.copy(dst, srcPtr, size);
        return dst;
    } catch(e) {
        return pinMem(Memory.alloc(size));
    }
}

function toast(msg) { console.log("[TOAST] " + msg); }
function giftLog(msg) { console.log("[GIFT] " + msg); }

function playClick() {
    var addr = get_func("_ZN12SoundManager14playClickSoundEv");
    if (addr) { try { new NativeFunction(addr, 'void', [])(); } catch(e) {} }
}

function getAgsClient() {
    var agsclientAddr = get_func("_ZN9SingletonIN3ags6ClientEE11getInstanceEv");
    if (agsclientAddr) return new NativeFunction(agsclientAddr, 'pointer', [])();
    return null;
}

function getPlayerID() {
    try {
        var client = getAgsClient();
        if (!client || client.isNull()) return "";
        return readStdString(client);
    } catch (e) { return ""; }
}

function playLocalAnimation(animName) {
    if (!myAvatarObject || !setAnimationFunc) return;
    try {
        var animStr = createStdString(animName);
        var emptyStr = createStdString("");
        setAnimationFunc(myAvatarObject, animStr, emptyStr, 1);
    } catch (e) {}
}

function openDebugMenu() {
    var getInstance = get_func("_ZN9SingletonI13DialogManagerE11getInstanceEv");
    var createDebug = get_func("_ZN13DialogManager17createDebugDialogEv");
    var showDialog = get_func("_ZN13DialogManager10showDialogEP10BaseDialogbb");
    if (getInstance && createDebug && showDialog) {
        var mgr = new NativeFunction(getInstance, 'pointer', [])();
        var dlg = new NativeFunction(createDebug, 'pointer', [])();
        var show = new NativeFunction(showDialog, 'void', ['pointer', 'pointer', 'int', 'int']);
        show(mgr, dlg, 0, 0);
        console.log("[+] Debug Menu");
    }
}

function follow(targetId) {
    targetId = targetId.toString();
    if (!globalProcessor) { console.log("[FOLLOW] Processor not ready!"); return; }
    var followReqSym = "_ZN3ags14PlayersCommand20PlayersFollowRequestC1ENSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE";
    var followAddr = get_func(followReqSym);
    if (!followAddr) followAddr = get_func("_ZN3ags14PlayersCommand20PlayersFollowRequestC2ENSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE");
    if (followAddr) {
        var createRequest = new NativeFunction(followAddr, 'void', ['pointer', 'pointer']);
        var idStr = createStdString(targetId);
        var requestBuf = pinMem(Memory.alloc(1024));
        createRequest(requestBuf, idStr);
        schedule(globalProcessor, requestBuf);
    }
}

function smartFinishAll() {
    var client = getAgsClient();
    if (!client || client.isNull()) { console.log("[!] Client не найден!"); return; }
    if (readStdString(client.add(32)) != "work") { console.log("[+] Вы не на работе!"); return; }
    if (workObjects.length === 0) { console.log("[!] Подвигайтесь"); return; }
    var finishAddr = get_func("_ZN10WorkObject10finishWorkEv");
    if (!finishAddr) return;
    var finishWork = new NativeFunction(finishAddr, 'void', ['pointer']);
    var uniqueObjects = [];
    for (var i = 0; i < workObjects.length; i++) {
        if (uniqueObjects.indexOf(workObjects[i]) === -1) uniqueObjects.push(workObjects[i]);
    }
    var cnt = 0;
    for (var i = 0; i < uniqueObjects.length; i++) {
        try { if (uniqueObjects[i].readPointer() !== null) { finishWork(uniqueObjects[i]); cnt++; } } catch (e) {}
    }
    console.log("[+] Собрано: " + cnt);
    workObjects = [];
}

function duplicateRequest(times, delay) {
    if (!savedArgs || !isReady) { console.log('[!] Запустите "Танец 1"'); return; }
    var sent = 0;
    function sendOne() {
        if (sent >= times) return;
        try {
            var gr = createStdStringLong(savedArgs.group);
            var at = createStdStringLong(savedArgs.action);
            var trg = createStdStringLong(savedArgs.target);
            var requestBuf = pinMem(Memory.alloc(1024));
            ctor(requestBuf, gr, at, trg, savedArgs.roomId, savedArgs.mapData);
            schedule(globalProcessor, requestBuf);
            sent++;
        } catch (e) { console.log("[DUPE] Error: " + e); }
        setTimeout(sendOne, delay);
    }
    sendOne();
}

function sendRelStatus(uid, status) {
    if (!globalProcessor || !changeStatusCtor) { console.log("[REL] Processor/ChangeStatus not ready!"); return false; }
    try {
        var requestBuf = pinMem(Memory.alloc(1024));
        var uidStr = createStdString(uid.toString());
        var map;
        if (capturedMapPtr && !capturedMapPtr.isNull()) {
            map = capturedMapPtr;
        } else {
            console.log("[REL] WARNING: no captured map!");
            map = pinMem(Memory.alloc(64));
            for (var i = 0; i < 64; i++) map.add(i).writeU8(0);
        }
        changeStatusCtor(requestBuf, uidStr, status, map);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) { console.log("[REL] Error: " + e); return false; }
}

function sendRelCreate(uid, type) {
    if (!globalProcessor || !createRelCtor) { console.log("[REL] Processor/CreateRel not ready!"); return false; }
    try {
        var requestBuf = pinMem(Memory.alloc(1024));
        var uidStr = createStdString(uid.toString());
        createRelCtor(requestBuf, uidStr, type);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) { console.log("[REL] Error: " + e); return false; }
}

function chainToFriend(uid, delay) { sendRelStatus(uid, 43); }

// =========================================================
// SKIP TUTORIAL FUNCTION
// =========================================================
function skipTutorial() {
    if (!globalProcessor) {
        console.log("[-] Processor not ready! Do any action first.");
        return false;
    }

    var tutorialFinishAddr = get_func("_ZN3ags15TutorialCommand21TutorialFinishRequestC1Ev");
    if (!tutorialFinishAddr) {
        tutorialFinishAddr = get_func("_ZN3ags15TutorialCommand21TutorialFinishRequestC2Ev");
    }

    if (!tutorialFinishAddr) {
        console.log("[-] TutorialFinishRequest not found!");
        return false;
    }

    try {
        var createRequest = new NativeFunction(tutorialFinishAddr, 'void', ['pointer']);
        var requestBuf = pinMem(Memory.alloc(1024));
        
        console.log("[*] Creating TutorialFinishRequest...");
        createRequest(requestBuf);
        
        console.log("[*] Sending to server...");
        schedule(globalProcessor, requestBuf);
        
        console.log("[+] Tutorial skip sent!");
        return true;
    } catch (e) {
        console.log("[-] Skip error: " + e);
        return false;
    }
}

// =========================================================
// APPEARANCE FUNCTIONS
// =========================================================
function readInnerMapValues(valuePtr) {
    var data = {};
    try {
        var type = valuePtr.add(8).readS32();
        if (type !== 9) return data;
        var mapPtr = valuePtr.readPointer();
        if (mapPtr.isNull()) return data;
        var head = null, keyOff = 16;
        for (var to = 0; to <= 24; to += 8) {
            try {
                var c = mapPtr.add(to).readPointer();
                if (c.isNull() || c.compare(ptr(0x1000)) < 0) continue;
                for (var ko = 8; ko <= 24; ko += 8) {
                    var tk = readStdString(c.add(ko));
                    if (tk && tk.length > 0 && tk.length < 200) { head = c; keyOff = ko; break; }
                }
                if (head) break;
            } catch(e) {}
        }
        if (!head) return data;
        var valOff = keyOff + 24;
        var cur = head, vis = 0;
        while (!cur.isNull() && vis < 50) {
            try {
                var k = readStdString(cur.add(keyOff));
                var t = cur.add(valOff + 8).readS32();
                if (t === 2) data[k] = cur.add(valOff).readS32();
                else if (t === 7) data[k] = readStdString(cur.add(valOff));
                cur = cur.readPointer();
                vis++;
            } catch(e) { break; }
        }
    } catch(e) {}
    return data;
}

function modifyMapValues(valuePtr, modifications) {
    try {
        var type = valuePtr.add(8).readS32();
        if (type !== 9) return false;
        var mapPtr = valuePtr.readPointer();
        if (mapPtr.isNull()) return false;
        var head = null, keyOff = 16;
        for (var to = 0; to <= 24; to += 8) {
            try {
                var c = mapPtr.add(to).readPointer();
                if (c.isNull() || c.compare(ptr(0x1000)) < 0) continue;
                for (var ko = 8; ko <= 24; ko += 8) {
                    var tk = readStdString(c.add(ko));
                    if (tk && tk.length > 0 && tk.length < 200) { head = c; keyOff = ko; break; }
                }
                if (head) break;
            } catch(e) {}
        }
        if (!head) return false;
        var valOff = keyOff + 24;
        var cur = head, modified = 0, vis = 0;
        while (!cur.isNull() && vis < 50) {
            try {
                var k = readStdString(cur.add(keyOff));
                if (modifications.hasOwnProperty(k)) {
                    var t = cur.add(valOff + 8).readS32();
                    if (t === 2) { cur.add(valOff).writeS32(modifications[k]); modified++; }
                }
                cur = cur.readPointer();
                vis++;
            } catch(e) { break; }
        }
        return modified > 0;
    } catch(e) { return false; }
}

function sendAppearance(modifications, quiet) {
    if (!appearanceData.ready || !appearanceData.masterCopy) {
        console.log("[-] No appearance data! Save once in avatar shop."); return false;
    }
    if (!globalProcessor) { console.log("[-] Processor not ready!"); return false; }
    if (!fnValCopy || !fnSaveReqCtor) { console.log("[-] Appearance functions not found!"); return false; }

    if (!quiet && modifications) {
        for (var mk in modifications)
            console.log("  [MOD] " + (APPEARANCE_KEYS[mk]||mk) + ": " + appearanceData.appearance[mk] + " -> " + modifications[mk]);
    }

    try {
        var workCopy = pinMem(Memory.alloc(VALUE_SIZE));
        workCopy.writeByteArray(new Array(VALUE_SIZE).fill(0));
        fnValCopy(workCopy, appearanceData.masterCopy);
        if (workCopy.add(8).readS32() !== 9) return false;

        if (modifications) modifyMapValues(workCopy, modifications);

        var reqObj = pinMem(Memory.alloc(1024));
        reqObj.writeByteArray(new Array(1024).fill(0));
        fnSaveReqCtor(reqObj, workCopy);
        schedule(globalProcessor, reqObj);

        if (modifications) {
            modifyMapValues(appearanceData.masterCopy, modifications);
            for (var mk in modifications) appearanceData.appearance[mk] = modifications[mk];
        }
        return true;
    } catch(e) { console.log("[-] Appearance error: " + e); return false; }
}

function stopAllTimers() {
    for (var i = 0; i < comboTimers.length; i++) clearInterval(comboTimers[i]);
    comboTimers = [];
    console.log("[+] All timers stopped");
}

function autoChangeAppearance(key, values, ms) {
    if (!ms) ms = 3000;
    if (!values || !values.length) { console.log("Usage: !auto hc 1,2,3,4,5 3000"); return; }
    var idx = 0;
    console.log("[*] Auto " + (APPEARANCE_KEYS[key]||key) + " every " + ms + "ms");
    var t = setInterval(function() {
        var v = values[idx % values.length];
        var m = {}; m[key] = v;
        console.log("  [AUTO] " + (APPEARANCE_KEYS[key]||key) + " -> " + v);
        sendAppearance(m, true);
        idx++;
    }, ms);
    comboTimers.push(t);
}

function comboAppearance(config, ms) {
    if (!ms) ms = 2000;
    stopAllTimers();
    var keys = Object.keys(config);
    var indices = {};
    for (var i = 0; i < keys.length; i++) indices[keys[i]] = 0;
    console.log("[*] COMBO started (" + ms + "ms)");
    var t = setInterval(function() {
        var mods = {};
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var vals = config[k];
            var idx = indices[k];
            var v = vals[idx % vals.length];
            mods[k] = v;
            parts.push((APPEARANCE_KEYS[k]||k) + "=" + v);
            indices[k] = idx + 1;
        }
        console.log("  [COMBO] " + parts.join(" | "));
        sendAppearance(mods, true);
    }, ms);
    comboTimers.push(t);
}

function randomAppearance(config, ms) {
    if (!ms) ms = 2000;
    stopAllTimers();
    var keys = Object.keys(config);
    console.log("[*] RANDOM started (" + ms + "ms)");
    var t = setInterval(function() {
        var mods = {};
        var parts = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var vals = config[k];
            var v = vals[Math.floor(Math.random() * vals.length)];
            mods[k] = v;
            parts.push((APPEARANCE_KEYS[k]||k) + "=" + v);
        }
        console.log("  [RND] " + parts.join(" | "));
        sendAppearance(mods, true);
    }, ms);
    comboTimers.push(t);
}
var loadConfigsAddr = get_func("_ZN20AvatarClothesManager11loadConfigsEv");
if (loadConfigsAddr) {
    Interceptor.replace(loadConfigsAddr, new NativeCallback(function(thisPtr) {
        // Эта функция вызывается ВМЕСТО оригинала
        // Оригинальный код loadConfigs() НЕ выполняется
        console.log("[BLOCKED] loadConfigs — original code NEVER runs");
        return; // просто выходим
    }, 'void', ['pointer']));
}
// =========================================================
// НАЧИНАЕМ ХУКИ
// =========================================================
console.log("[+] Installing hooks...");

// GIFT HACK
var giftSym = "_ZN3ags12TradeCommand15MakeGiftRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEESA_";
var giftAddr = get_func(giftSym);
if (giftAddr) {
    Interceptor.attach(giftAddr, {
        onEnter: function(args) {
            if (!GIFT_ENABLED) return;
            giftLog(readStdString(args[2]) + " -> " + GIFT_TARGET);
            writeSSO(args[2], GIFT_TARGET);
        }
    });
    giftLog("[+] Active! -> " + GIFT_TARGET);
}

// ДВИЖОК АНИМАЦИЙ
var addActionAddr = get_func("_ZN14MyAvatarObject9addActionEP11ActorActionii");
if (addActionAddr) {
    Interceptor.attach(addActionAddr, {
        onEnter: function(args) {
            var actionPtr = args[1];
            if (actionPtr.isNull()) return;
            try {
                var vtable = actionPtr.readPointer();
                if (validVTable === null) {
                    try {
                        var checkAction = readStdString(actionPtr.add(296));
                        if (checkAction && checkAction.length > 1 && checkAction.indexOf("Walk") === -1 && checkAction.indexOf("Run") === -1) {
                            validVTable = vtable;
                        } else return;
                    } catch(e) { return; }
                }
                if (!vtable.equals(validVTable)) return;
                if (isLocked && nextNet) {
                    writeSSO(actionPtr.add(272), nextNet.gr);
                    writeSSO(actionPtr.add(296), nextNet.at);
                }
            } catch(e) {}
        }
    });
}

// ANIMATION CTOR
var ctorSym = "_ZN3ags11RoomCommand29RoomAvatarCustomActionRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEESA_SA_SA_RKNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE";
ctorAddr = get_func(ctorSym);
scheduleAddr = get_func("_ZN3ags16CommandProcessor15scheduleRequestERKNS_10AGSRequestE");

if (ctorAddr && scheduleAddr) {
    ctor = new NativeFunction(ctorAddr, 'void', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer']);
    schedule = new NativeFunction(scheduleAddr, 'void', ['pointer', 'pointer']);

    Interceptor.attach(ctorAddr, {
        onEnter: function(args) {
            var originalGroup = readStdString(args[1]);
            var originalAction = readStdString(args[2]);
            var originalTarget = readStdString(args[3]);
            var needLocalAnim = null;
            var slot = actionToSlot[originalAction];
            if (slot && savedSlots[slot]) {
                patchExistingString(args[1], savedSlots[slot].gr);
                patchExistingString(args[2], savedSlots[slot].at);
                needLocalAnim = savedSlots[slot].visual || "Dance1";
                savedArgs = { group: savedSlots[slot].gr, action: savedSlots[slot].at, target: originalTarget, roomId: copyPointerData(args[4], 128), mapData: copyPointerData(args[5], 128) };
            } else {
                savedArgs = { group: originalGroup, action: originalAction, target: originalTarget, roomId: copyPointerData(args[4], 128), mapData: copyPointerData(args[5], 128) };
            }
            if (needLocalAnim) setTimeout(function() { playLocalAnimation(needLocalAnim); }, 100);
            if (repeatCount > 0) { var cnt = repeatCount; repeatCount = 0; setTimeout(function() { duplicateRequest(cnt, 50); }, 100); }
        }
    });

    Interceptor.attach(scheduleAddr, {
        onEnter: function(args) {
            if (!globalProcessor) { globalProcessor = args[0]; isReady = true; console.log("[+] Processor ready!"); }
        }
    });
}

// RELATIONS
var changeStatusAddr = get_func("_ZN3ags16RelationsCommand28RelationsChangeStatusRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEiNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE");
var createRelAddr = get_func("_ZN3ags16RelationsCommand22RelationsCreateRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEi");
if (changeStatusAddr) {
    changeStatusCtor = new NativeFunction(changeStatusAddr, 'void', ['pointer', 'pointer', 'int', 'pointer']);
    Interceptor.attach(changeStatusAddr, { onEnter: function(args) { capturedMapPtr = args[3]; } });
}
if (createRelAddr) createRelCtor = new NativeFunction(createRelAddr, 'void', ['pointer', 'pointer', 'int']);

// LOCAL ANIMATION
var setAnimAddr = get_func("_ZN12AvatarObject12setAnimationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_b");
if (setAnimAddr) {
    setAnimationFunc = new NativeFunction(setAnimAddr, 'void', ['pointer', 'pointer', 'pointer', 'bool']);
    Interceptor.attach(setAnimAddr, { onEnter: function(args) { if (!myAvatarObject) myAvatarObject = args[0]; } });
}

// WORK OBJECTS
var isTouchAddr = get_func("_ZN10WorkObject15isTouchOnObjectEPN7cocos2d5TouchE");
if (isTouchAddr) Interceptor.attach(isTouchAddr, { onEnter: function(args) { if (workObjects.indexOf(args[0]) === -1) workObjects.push(args[0]); } });

var changeLocAddr = get_func("_ZN13WorkGameScene14changeLocationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_S8_");
if (changeLocAddr) Interceptor.attach(changeLocAddr, { onEnter: function() { workObjects = []; myAvatarObject = null; } });

var getTextAddr2 = get_func("_ZN9GameScene14isHouseOwnerMeEv");
if (getTextAddr2) Interceptor.attach(getTextAddr2, { onLeave: function(retval) { if (isAllowedToKick) retval.replace(1); } });

var fillMenuAddr22 = get_func("_ZN9GameScene7onEnterEv");
if (fillMenuAddr22) Interceptor.attach(fillMenuAddr22, { onEnter: function() { isAllowedToKick = false; }, onLeave: function() { setTimeout(function() { isAllowedToKick = true; }, 100); } });

// =========================================================
// SKIP TUTORIAL BUTTON HOOK
// При нажатии на кнопку ArtefactNews — скипаем туториал
// =========================================================
var artefactNewsAddr = get_func("_ZN11SettingsDlg21onArtefactNewsPressedEPN7cocos2d3RefE");
if (artefactNewsAddr) {
    Interceptor.attach(artefactNewsAddr, {
        onEnter: function(args) {
            console.log("[*] ArtefactNews button pressed -> Skipping tutorial...");
            skipTutorial();
        }
    });
    console.log("[+] Skip Tutorial button hooked (ArtefactNews)");
} else {
    console.log("[-] ArtefactNews button not found");
}

// =========================================================
// APPEARANCE HOOKS
// =========================================================
var allExports = Module.enumerateExportsSync(moduleName);
var saveReqCtorAddr = null;
var parseParamsAddr = null;
var valCopyAddr = null;
var valDtorAddr = null;

for (var i = 0; i < allExports.length; i++) {
    var nm = allExports[i].name;
    if (nm.indexOf("AvatarAppearanceSaveRequestC") !== -1 && !saveReqCtorAddr) saveReqCtorAddr = allExports[i].address;
    if (nm.indexOf("SaveAppearanceResponse") !== -1 && nm.indexOf("parseParams") !== -1) parseParamsAddr = allExports[i].address;
    if (/^_ZN7cocos2d5ValueC[12]ERKS0_$/.test(nm)) valCopyAddr = allExports[i].address;
    if (/^_ZN7cocos2d5ValueD[12]Ev$/.test(nm)) valDtorAddr = allExports[i].address;
}

if (saveReqCtorAddr && valCopyAddr) {
    fnSaveReqCtor = new NativeFunction(saveReqCtorAddr, 'void', ['pointer', 'pointer']);
    fnValCopy = new NativeFunction(valCopyAddr, 'void', ['pointer', 'pointer']);
    if (valDtorAddr) fnValDtor = new NativeFunction(valDtorAddr, 'void', ['pointer']);

    Interceptor.attach(saveReqCtorAddr, {
        onEnter: function(args) {
            try {
                var type = args[1].add(8).readS32();
                if (type === 9) {
                    var newCopy = pinMem(Memory.alloc(VALUE_SIZE));
                    newCopy.writeByteArray(new Array(VALUE_SIZE).fill(0));
                    fnValCopy(newCopy, args[1]);
                    if (newCopy.add(8).readS32() === 9) {
                        if (appearanceData.masterCopy && fnValDtor) try { fnValDtor(appearanceData.masterCopy); } catch(e) {}
                        appearanceData.masterCopy = newCopy;
                        appearanceData.appearance = readInnerMapValues(newCopy);
                        appearanceData.ready = true;
                        console.log("[APPEARANCE] Captured (" + Object.keys(appearanceData.appearance).length + " fields)");
                    }
                }
            } catch(e) {}
        }
    });
    console.log("[+] Appearance hooks ready");
}

if (parseParamsAddr) {
    Interceptor.attach(parseParamsAddr, {
        onEnter: function(args) { this.self = args[0]; },
        onLeave: function() {
            try {
                var tbl = this.self.add(40);
                var head = null, keyOff = 16;
                for (var to = 0; to <= 24; to += 8) {
                    try {
                        var c = tbl.add(to).readPointer();
                        if (c.isNull() || c.compare(ptr(0x1000)) < 0) continue;
                        for (var ko = 8; ko <= 24; ko += 8) {
                            var tk = readStdString(c.add(ko));
                            if (tk && tk.length > 0) { head = c; keyOff = ko; break; }
                        }
                        if (head) break;
                    } catch(e) {}
                }
                if (head) {
                    var valOff = keyOff + 24;
                    var cur = head;
                    while (!cur.isNull()) {
                        try {
                            var k = readStdString(cur.add(keyOff));
                            if (k === "apprnc") {
                                var t = cur.add(valOff + 8).readS32();
                                if (t === 9 && fnValCopy) {
                                    var nm = pinMem(Memory.alloc(VALUE_SIZE));
                                    nm.writeByteArray(new Array(VALUE_SIZE).fill(0));
                                    fnValCopy(nm, cur.add(valOff));
                                    if (nm.add(8).readS32() === 9) {
                                        if (appearanceData.masterCopy && fnValDtor) try { fnValDtor(appearanceData.masterCopy); } catch(e) {}
                                        appearanceData.masterCopy = nm;
                                        appearanceData.appearance = readInnerMapValues(nm);
                                        console.log("[APPEARANCE] Synced from server");
                                    }
                                }
                                break;
                            }
                            cur = cur.readPointer();
                        } catch(e) { break; }
                    }
                }
            } catch(e) {}
        }
    });
}

// =========================================================
// ОБРАБОТЧИК ЧАТА
// =========================================================
var clientsendAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
if (clientsendAddr) {
    Interceptor.attach(clientsendAddr, {
        onEnter: function(args) {
            var msg = readStdString(args[1]).trim();
            var myId = getPlayerID();
            var senderId = "";
            try { senderId = readStdString(args[0]); } catch(e) {}
            if (myId && senderId && senderId !== myId) return;
            if (msg.indexOf("!") === 0) patchExistingString(args[1], "");

            var parts = msg.split(" ");
            var cmd = parts[0];
            var arg1 = parts[1];
            var arg2 = parts[2];
            var arg3 = parts[3];

            // === ОСНОВНЫЕ КОМАНДЫ ===
            if (cmd === "!test") patchExistingString(args[1], "t.me/avataria_destony");
            if (cmd === "!debug") { openDebugMenu(); playClick(); }
            if (cmd === "!work") smartFinishAll();

            if (cmd === "!gift" && arg1) { GIFT_TARGET = arg1; GIFT_ENABLED = true; giftLog("Target: " + arg1); }
            if (cmd === "!giftoff") { GIFT_ENABLED = false; giftLog("OFF"); }
            if (cmd === "!gifton") { GIFT_ENABLED = true; giftLog("ON: " + GIFT_TARGET); }

            if (cmd === "!guitar") { nextNet = { gr: "skygacha26_guitar_off", at: "PlayGuitNew1" }; isLocked = true; validVTable = null; }
            if (cmd === "!cyber") { nextNet = { gr: "myAvatar", at: "est23solodnc" }; isLocked = true; validVTable = null; }
            if (cmd === "!dj") { nextNet = { gr: "danceroom_djpult_off", at: "Dj" }; isLocked = true; validVTable = null; }
            if (cmd === "!setAnim" && parts.length >= 3) { nextNet = { gr: parts[1], at: parts[2] }; isLocked = true; validVTable = null; }
            if (cmd === "!off") { nextNet = null; isLocked = false; repeatCount = 0; validVTable = null; stopAllTimers(); }

            if (cmd === "!follow" && arg1) follow(arg1);
            if (cmd === "!rep" && arg1) { repeatCount = Math.min(parseInt(arg1) || 10, 100); }
            if (cmd === "!dupe" && arg1) duplicateRequest(parseInt(arg1) || 20, 200);
            if (cmd === "!dupe" && !arg1) duplicateRequest(20, 50);

            if (cmd === "!save" && arg1 && nextNet) savedSlots[arg1] = { gr: nextNet.gr, at: nextNet.at, visual: parts[2] || "Dance1" };
            if (cmd === "!del" && arg1 && savedSlots[arg1]) delete savedSlots[arg1];
            if (cmd === "!clear") savedSlots = {};
            if (cmd === "!anim" && arg1) playLocalAnimation(arg1);
            if (cmd === "!tofriend" && arg1) chainToFriend(arg1, 2500);

            // === SKIP TUTORIAL ===
            if (cmd === "!skip") {
                skipTutorial();
            }

            // === APPEARANCE КОМАНДЫ ===
            if (cmd === "!hair" && arg1) sendAppearance({"ht": parseInt(arg1)});
            if (cmd === "!hairtype" && arg1) sendAppearance({"ht": parseInt(arg1)});
            if (cmd === "!eyes" && arg1) sendAppearance({"ec": parseInt(arg1)});
            if (cmd === "!eyetype" && arg1) sendAppearance({"et": parseInt(arg1)});
            if (cmd === "!skin" && arg1) sendAppearance({"sc": parseInt(arg1)});
            if (cmd === "!brows" && arg1) sendAppearance({"brc": parseInt(arg1)});
            if (cmd === "!browtype" && arg1) sendAppearance({"brt": parseInt(arg1)});
            if (cmd === "!mouth" && arg1) sendAppearance({"mt": parseInt(arg1)});
            if (cmd === "!gender" && arg1) sendAppearance({"g": parseInt(arg1)});
            if (cmd === "!blockclothes") {
              var addr = get_func("_ZN20AvatarClothesManager11loadConfigsEv");
              if (addr && !clothesConfigBlocked) {
               Interceptor.replace(addr, new NativeCallback(function(t) {}, 'void', ['pointer']));
               clothesConfigBlocked = true;
               console.log("[+] Clothes config BLOCKED");
              }
            }

            // !auto hc 1,2,3,4,5 3000
            if (cmd === "!auto" && arg1 && arg2) {
                var vals = arg2.split(",").map(function(x) { return parseInt(x); });
                var interval = parseInt(arg3) || 3000;
                autoChangeAppearance(arg1, vals, interval);
            }

            // !combo hc:1,2,3,4,5 ec:1,2,3 brc:1,2,3 2000
            if (cmd === "!combo") {
                var config = {};
                var interval = 2000;
                for (var pi = 1; pi < parts.length; pi++) {
                    var p = parts[pi];
                    if (p.indexOf(":") !== -1) {
                        var kv = p.split(":");
                        var key = kv[0];
                        var vals = kv[1].split(",").map(function(x) { return parseInt(x); });
                        config[key] = vals;
                    } else {
                        interval = parseInt(p) || 2000;
                    }
                }
                if (Object.keys(config).length > 0) comboAppearance(config, interval);
            }

            // !random hc:1,2,3,4,5 ec:1,2,3 2000
            if (cmd === "!random") {
                var config = {};
                var interval = 2000;
                for (var pi = 1; pi < parts.length; pi++) {
                    var p = parts[pi];
                    if (p.indexOf(":") !== -1) {
                        var kv = p.split(":");
                        config[kv[0]] = kv[1].split(",").map(function(x) { return parseInt(x); });
                    } else {
                        interval = parseInt(p) || 2000;
                    }
                }
                if (Object.keys(config).length > 0) randomAppearance(config, interval);
            }

            if (cmd === "!stop") stopAllTimers();

            if (cmd === "!look") {
                if (Object.keys(appearanceData.appearance).length === 0) {
                    console.log("[-] No appearance data. Save once in avatar shop!");
                } else {
                    console.log("=== APPEARANCE ===");
                    for (var k in appearanceData.appearance) {
                        console.log("  " + (APPEARANCE_KEYS[k]||k) + " (" + k + ") = " + appearanceData.appearance[k]);
                    }
                }
            }

            if (cmd === "!keys") {
                console.log("=== KEYS ===");
                for (var k in APPEARANCE_KEYS) console.log("  " + k + " = " + APPEARANCE_KEYS[k]);
            }

            if (cmd === "!status") {
                console.log("=== STATUS ===");
                console.log("Processor: " + (globalProcessor ? "OK" : "NULL"));
                console.log("Appearance ready: " + appearanceData.ready);
                console.log("Appearance fields: " + Object.keys(appearanceData.appearance).length);
                console.log("Timers: " + comboTimers.length);
            }
        }
    });
    console.log("[+] Chat hooked!");
}

console.log("\n===============================================");
console.log("  COMMANDS:");
console.log("");
console.log("  --- SKIP TUTORIAL ---");
console.log("  !skip           — skip tutorial (or press ArtefactNews button)");
console.log("");
console.log("  --- APPEARANCE ---");
console.log("  !hair 5         — hair color");
console.log("  !eyes 2         — eye color");
console.log("  !brows 3        — brow color");
console.log("  !auto hc 1,2,3,4,5 3000");
console.log("  !combo hc:1,2,3,4,5 ec:1,2,3 brc:1,2,3 2000");
console.log("  !random hc:1,2,3,4,5 ec:1,2,3 2000");
console.log("  !stop           — stop all timers");
console.log("  !look           — show appearance");
console.log("  !keys           — show all keys");
console.log("");
console.log("  --- OTHER ---");
console.log("  !work           — collect work objects");
console.log("  !guitar / !dj / !cyber");
console.log("  !follow ID      — follow player");
console.log("===============================================\n");

} // конец initScriptнец initScript
