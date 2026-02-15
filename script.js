console.log("--- FULL MEGA SCRIPT: APPEARANCE + SKIP + SILENT v11 + ZONEKICK ---");

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

// === APPEARANCE ===
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

// === SILENT ACTION v11 ===
var SILENT_COMMAND = "";
var TP_COMMAND = "";
var lastTarget = "";
var pendingSilentReplace = "";
var interactCtorAddr = null;
var dtorAddr = null;
var originalKick = null;

// === ZONE KICK ===
var foundPlayers = {};
var currentRoomId = "";
var myPlayerId = "";
var kickCtor = null;
var zoneKickActive = false;
var whitelist = {};
var kickQueue = [];
var isKicking = false;

// === SILENT v11: getMyAvatar ===
var gameManagerGetMyAvatarAddr = null;
var gameManagerSingletonAddr = null;
var myAvatarAddActionAddr = null;

// === GoAndUserInteractAction конструкторы ===
var goCtorAddrs = {};
var goActionNames = ["KissAction", "KissLongAction",
                     "HugAction", "PairDanceAction",
                     "HighFiveAction"];
var cmdToGoName = {
    "r.ks": "KissAction",
    "r.kl": "KissLongAction",
    "r.hg": "HugAction",
    "r.pd": "PairDanceAction",
    "r.hf": "HighFiveAction"
};

// === Simple Action конструкторы (телепорт) ===
var simpleCtorAddrs = {};
var simpleActionNames = ["KissAction", "KissLongAction",
                         "HugAction", "PairDanceAction",
                         "HighFiveAction"];

var retainFunc = null;
var releaseFunc = null;
var autoreleaseFunc = null;
var dynamicCastFunc = null;
var worldObjTI = null;
var avatarObjTI = null;
var nothrowNew = null;
var nothrowAddr = null;

// =========================================================
// СИСТЕМА ПИННИНГА ПАМЯТИ
// =========================================================
var pinnedMemory = [];

function pinMem(ptr) {
    pinnedMemory.push(ptr);
    if (pinnedMemory.length > 3000) pinnedMemory.shift();
    return ptr;
}

// =========================================================
// ALERT SYSTEM
// =========================================================
var pendingTasks = [];
var mainLoopAddr = Module.findExportByName(moduleName, "_ZN7cocos2d8Director8mainLoopEv");

if (mainLoopAddr) {
    Interceptor.attach(mainLoopAddr, {
        onEnter: function(args) {
            while (pendingTasks.length > 0) {
                var task = pendingTasks.shift();
                try { task(); } catch(e) { console.log("[-] Alert error: " + e); }
            }
        }
    });
}

function runOnMainThread(fn) {
    pendingTasks.push(fn);
}

var dmSingletonAddr = Module.findExportByName(moduleName,
    "_ZN9SingletonI13DialogManagerE10m_instanceE");
var showAlertBoxAddr = Module.findExportByName(moduleName,
    "_ZN13DialogManager12showAlertBoxERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_RKNS0_8functionIFvvEEE");

var alertKeepAlive = [];

function makeAlertString(str) {
    var encoded = Memory.allocUtf8String(str);
    var byteLen = 0;
    while (encoded.add(byteLen).readU8() !== 0) byteLen++;

    var cap = byteLen + 32;
    var buf = Memory.alloc(cap);
    Memory.copy(buf, encoded, byteLen);
    buf.add(byteLen).writeU8(0);
    alertKeepAlive.push(buf);

    var mem = Memory.alloc(24);
    mem.writeU64(cap | 1);
    mem.add(8).writeU64(byteLen);
    mem.add(16).writePointer(buf);
    alertKeepAlive.push(mem);

    return mem;
}

function showAlert(title, message) {
    if (!dmSingletonAddr || !showAlertBoxAddr) return;

    runOnMainThread(function() {
        try {
            var dm = dmSingletonAddr.readPointer();
            if (dm.isNull()) return;

            alertKeepAlive = [];

            var titleStr = makeAlertString(title || "");
            var msgStr = makeAlertString(message || "");

            var emptyFn = Memory.alloc(48);
            for (var i = 0; i < 48; i += 8) emptyFn.add(i).writeU64(0);
            alertKeepAlive.push(emptyFn);

            var fn = new NativeFunction(showAlertBoxAddr,
                'void', ['pointer', 'pointer', 'pointer', 'pointer']);
            fn(dm, titleStr, msgStr, emptyFn);
        } catch(e) {
            console.log("[-] showAlert error: " + e);
        }
    });
}

// =========================================================
// UTILITY FUNCTIONS
// =========================================================
function get_func(name) { return Module.findExportByName(moduleName, name); }

function safeRead(cb) { try { return cb(); } catch(e) { return ""; } }

function isValidPtr(p) {
    if (!p || p.isNull()) return false;
    try { p.readU8(); return true; } catch(e) { return false; }
}

function readStdString(addr) {
    if (!addr || addr.isNull()) return "";
    try {
        var b = addr.readU8();
        if ((b & 1) === 0) return addr.add(1).readUtf8String(b >> 1);
        return addr.add(16).readPointer().readUtf8String();
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

function writeStr(addr, text) {
    try {
        for (var b = 0; b < 24; b++) addr.add(b).writeU8(0);
        var len = text.length;
        if (len <= 22) {
            addr.writeU8(len << 1);
            for (var c = 0; c < len; c++)
                addr.add(1 + c).writeU8(text.charCodeAt(c));
        } else {
            var opNew = new NativeFunction(Module.findExportByName(null, "_Znwm"), 'pointer', ['size_t']);
            var buf = opNew(len + 1);
            buf.writeUtf8String(text);
            addr.writeU64((len + 1) | 1);
            addr.add(8).writeU64(len);
            addr.add(16).writePointer(buf);
        }
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

function makeStr(text) {
    var buf = pinMem(Memory.alloc(64));
    for (var i = 0; i < 64; i++) buf.add(i).writeU8(0);
    if (text.length <= 22) {
        buf.writeU8(text.length << 1);
        buf.add(1).writeUtf8String(text);
    } else {
        var heap = pinMem(Memory.alloc(text.length + 16));
        heap.writeUtf8String(text);
        buf.writeU8(1);
        buf.add(8).writeU64(text.length);
        buf.add(16).writePointer(heap);
    }
    return buf;
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

function getCmdProcessor() {
    var addr = get_func("_ZN9SingletonIN3ags16CommandProcessorEE11getInstanceEv");
    if (addr) return new NativeFunction(addr, 'pointer', [])();
    return null;
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

function getActionName(cmd) {
    var n = {"r.ks":"Kiss","r.kl":"KissLong","r.hg":"Hug",
             "r.hf":"HighFive","r.pd":"PairDance","r.ka":"Kick"};
    return n[cmd] || "?";
}

function playLocalAnimation(animName) {
    if (!myAvatarObject && !setAnimationFunc) return;
    try {
        var avatarObj = myAvatarObject || getMyAvatar();
        if (!avatarObj) return;
        if (!setAnimationFunc) return;
        var animStr = createStdString(animName);
        var emptyStr = createStdString("");
        setAnimationFunc(avatarObj, animStr, emptyStr, 1);
    } catch (e) {}
}

function openDebugMenu() {
    var getInstance = get_func("_ZN9SingletonI13DialogManagerE11getInstanceEv");
    var createDebug = get_func("_ZN13DialogManager17createDebugDialogEv");
    var showDialogAddr2 = get_func("_ZN13DialogManager10showDialogEP10BaseDialogbb");
    if (getInstance && createDebug && showDialogAddr2) {
        var mgr = new NativeFunction(getInstance, 'pointer', [])();
        var dlg = new NativeFunction(createDebug, 'pointer', [])();
        var show = new NativeFunction(showDialogAddr2, 'void', ['pointer', 'pointer', 'int', 'int']);
        show(mgr, dlg, 0, 0);
        console.log("[+] Debug Menu");
    }
}

function follow(targetId) {
    targetId = targetId.toString();
    if (!globalProcessor) {
        showAlert("BloodMoon", "Ошибка 1!");
        return;
    }
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
    if (!client || client.isNull()) {
        showAlert("BloodMoon", "Ошибка 3!");
        return;
    }
    if (readStdString(client.add(32)) != "work") {
        showAlert("BloodMoon", "Вы не на работе!");
        return;
    }
    if (workObjects.length === 0) {
        showAlert("BloodMoon", "Походите!");
        return;
    }
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
    showAlert("BloodMoon", "Собрано: " + cnt);
    workObjects = [];
}

function duplicateRequest(times, delay) {
    if (!savedArgs) {
        showAlert("BloodMoon", "Станцуйте любой танец!");
        return;
    }
    var sent = 0;
    function sendOne() {
        if (sent >= times) {
            return;
        }
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
    if (!globalProcessor || !changeStatusCtor) {
        showAlert("BloodMoon", "Ошибка 1!");
        return false;
    }
    try {
        var requestBuf = pinMem(Memory.alloc(1024));
        var uidStr = createStdString(uid.toString());
        var map;
        if (capturedMapPtr && !capturedMapPtr.isNull()) {
            map = capturedMapPtr;
        } else {
            map = pinMem(Memory.alloc(64));
            for (var i = 0; i < 64; i++) map.add(i).writeU8(0);
        }
        changeStatusCtor(requestBuf, uidStr, status, map);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) { return false; }
}

function sendRelCreate(uid, type) {
    if (!globalProcessor || !createRelCtor) {
        showAlert("BloodMoon", "Ошибка 1!");
        return false;
    }
    try {
        var requestBuf = pinMem(Memory.alloc(1024));
        var uidStr = createStdString(uid.toString());
        createRelCtor(requestBuf, uidStr, type);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) { return false; }
}

function chainToFriend(uid, delay) { sendRelStatus(uid, 43); }

// =========================================================
// getMyAvatar — всегда актуальный указатель (из v11)
// =========================================================
function getMyAvatar() {
    if (!getGameManagerFunc || !getMyAvatarFunc) return null;
    try {
        var gm = getGameManagerFunc();
        if (!gm || gm.isNull()) return null;
        var avatar = getMyAvatarFunc(gm);
        if (!avatar || avatar.isNull()) return null;
        return avatar;
    } catch(e) {
        return null;
    }
}

// NativeFunction holders for getMyAvatar
var getMyAvatarFunc = null;
var getGameManagerFunc = null;
var myAvatarAddAction = null;

// =========================================================
// createGoAction — с подходом (Walk + Action) (из v11)
// =========================================================
function createGoAction(cmd, targetAvatar) {
    var goName = cmdToGoName[cmd];
    if (!goName || !goCtorAddrs[goName]) return null;
    try {
        var mem = nothrowNew(0x160, nothrowAddr);
        if (!mem || mem.isNull()) return null;
        pinMem(mem);
        for (var z = 0; z < 0x160; z += 8) mem.add(z).writeU64(0);
        var ctorFn = new NativeFunction(goCtorAddrs[goName],
            'pointer', ['pointer', 'pointer', 'bool']);
        ctorFn(mem, targetAvatar, 1);
        autoreleaseFunc(mem);
        retainFunc(mem);
        return mem;
    } catch(e) {
        console.log("[❌] GoAction error: " + e);
        return null;
    }
}

// =========================================================
// createSimpleAction — без подхода / телепорт (из v11)
// =========================================================
function createSimpleAction(cmd, targetAvatar) {
    var sn = cmdToGoName[cmd];
    if (!sn || !simpleCtorAddrs[sn]) return null;
    try {
        var mem = nothrowNew(0x110, nothrowAddr);
        if (!mem || mem.isNull()) return null;
        pinMem(mem);
        for (var z = 0; z < 0x110; z += 8) mem.add(z).writeU64(0);
        var ctorFn = new NativeFunction(simpleCtorAddrs[sn],
            'void', ['pointer', 'pointer']);
        ctorFn(mem, targetAvatar);
        autoreleaseFunc(mem);
        retainFunc(mem);
        return mem;
    } catch(e) {
        console.log("[❌] SimpleAction error: " + e);
        return null;
    }
}

// =========================================================
// getTargetFromButton (из v11)
// =========================================================
function getTargetFromButton(thisPtr) {
    try {
        var worldObj = thisPtr.add(103 * 8).readPointer()
                              .add(744).readPointer();
        if (!worldObj.isNull()) {
            if (dynamicCastFunc && worldObjTI && avatarObjTI) {
                var cast = dynamicCastFunc(
                    worldObj, worldObjTI, avatarObjTI, 0);
                if (cast && !cast.isNull()) return cast;
            }
            return worldObj;
        }
    } catch(e) {}
    return null;
}

// =========================================================
// doAction — выполнить действие (из v11)
// =========================================================
function doAction(cmd, targetAvatar, teleport) {
    var myAvatar = getMyAvatar();
    if (!myAvatar) {
        console.log("[❌] MyAvatar not found!");
        return false;
    }

    if (!isValidPtr(targetAvatar)) {
        console.log("[❌] Target invalid!");
        return false;
    }

    var tId = "";
    try { tId = readStdString(targetAvatar.add(752)); } catch(e) {}

    console.log("[🔘] " + (teleport ? "TP " : "") +
                getActionName(cmd) + " → " + tId);

    try { retainFunc(targetAvatar); } catch(e) {
        console.log("[❌] retain failed");
        return false;
    }

    var action;
    if (teleport) {
        action = createSimpleAction(cmd, targetAvatar);
    } else {
        action = createGoAction(cmd, targetAvatar);
    }

    if (!action) {
        try { releaseFunc(targetAvatar); } catch(e) {}
        console.log("[❌] Action create failed");
        return false;
    }

    pendingSilentReplace = cmd;

    try {
        myAvatarAddAction(myAvatar, action, -1, 0);
        console.log("[🎭] " + (teleport ? "⚡TP " : "") +
                    getActionName(cmd) + "!");
    } catch(e) {
        console.log("[❌] addAction error: " + e);
        pendingSilentReplace = "";
        try { releaseFunc(action); } catch(e2) {}
        try { releaseFunc(targetAvatar); } catch(e2) {}
        return false;
    }

    try { releaseFunc(action); } catch(e) {}
    try { releaseFunc(targetAvatar); } catch(e) {}
    return true;
}

// =========================================================
// sendSilentAction — сетевой silent (оригинальный из мега-скрипта)
// =========================================================
function sendSilentAction(command, targetId) {
    if (!globalProcessor) {
        showAlert("BloodMoon", "Ошибка 1!");
        console.log("[❌] Processor не найден — подожди или сделай действие");
        return;
    }
    if (!myPlayerId) {
        console.log("[❌] myId неизвестен");
        return;
    }
    if (!currentRoomId) {
        console.log("[❌] room неизвестен — подожди");
        return;
    }
    if (!interactCtorAddr) {
        console.log("[❌] InteractCtor not found");
        return;
    }

    try {
        var reqObj = Memory.alloc(256);
        for (var z = 0; z < 256; z += 8) reqObj.add(z).writeU64(0);

        var sCmd = Memory.alloc(64); writeStr(sCmd, command);
        var sTgt = Memory.alloc(64); writeStr(sTgt, targetId);
        var sUsr = Memory.alloc(64); writeStr(sUsr, myPlayerId);
        var sRoom = Memory.alloc(64); writeStr(sRoom, currentRoomId);

        var interactCtor = new NativeFunction(interactCtorAddr, 'pointer',
            ['pointer', 'pointer', 'pointer', 'pointer', 'pointer']);
        interactCtor(reqObj, sCmd, sTgt, sUsr, sRoom);

        schedule(globalProcessor, reqObj);

        if (dtorAddr) {
            var dtor = new NativeFunction(dtorAddr, 'void', ['pointer']);
            dtor(reqObj);
        }
        console.log("[SILENT] " + command + " → " + targetId);
    } catch(e) {
        console.log("[❌] " + e);
    }
}

// =========================================================
// SKIP TUTORIAL
// =========================================================
function skipTutorial() {
    if (!globalProcessor) {
        showAlert("BloodMoon", "Ошибка 1!");
        return false;
    }
    var tutorialFinishAddr = get_func("_ZN3ags15TutorialCommand21TutorialFinishRequestC1Ev");
    if (!tutorialFinishAddr) tutorialFinishAddr = get_func("_ZN3ags15TutorialCommand21TutorialFinishRequestC2Ev");
    if (!tutorialFinishAddr) {
        showAlert("BloodMoon", "Ошибка 2!");
        return false;
    }
    try {
        var createRequest = new NativeFunction(tutorialFinishAddr, 'void', ['pointer']);
        var requestBuf = pinMem(Memory.alloc(1024));
        console.log("[*] Creating TutorialFinishRequest...");
        createRequest(requestBuf);
        console.log("[*] Sending to server...");
        schedule(globalProcessor, requestBuf);
        showAlert("BloodMoon", "Успешно, перезайдите в игру");
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
        if (!quiet) showAlert("BloodMoon", "Нет данных! Сохраните внешность!");
        return false;
    }
    if (!globalProcessor) {
        if (!quiet) showAlert("BloodMoon", "Ошибка 1!");
        return false;
    }
    if (!fnValCopy || !fnSaveReqCtor) {
        if (!quiet) showAlert("BloodMoon", "Ошибка 2!");
        return false;
    }

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
    } catch(e) {
        console.log("[-] Appearance error: " + e);
        return false;
    }
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

// =========================================================
// ZONE KICK FUNCTIONS
// =========================================================
function canKick(uid) {
    if (!uid) return false;
    if (uid === myPlayerId) return false;
    if (whitelist[uid]) return false;
    return true;
}

function sendKick(targetId) {
    if (!globalProcessor || !kickCtor || !currentRoomId) return;
    if (!canKick(targetId)) return;
    try {
        var req = pinMem(Memory.alloc(2048));
        for (var j = 0; j < 2048; j++) req.add(j).writeU8(0);
        kickCtor(req, makeStr(targetId), makeStr(currentRoomId));
        schedule(globalProcessor, req);
        console.log("[KICK] " + targetId);
    } catch(e) {}
}

function processKickQueue() {
    if (isKicking) return;
    if (kickQueue.length === 0) return;
    isKicking = true;
    function next() {
        if (!zoneKickActive && kickQueue.length > 0) {
            kickQueue = [];
            isKicking = false;
            return;
        }
        if (kickQueue.length === 0) {
            isKicking = false;
            return;
        }
        var uid = kickQueue.shift();
        if (canKick(uid)) sendKick(uid);
        setTimeout(next, 200);
    }
    next();
}

function queueKick(uid) {
    if (!canKick(uid)) return;
    if (!zoneKickActive) return;
    if (kickQueue.indexOf(uid) !== -1) return;
    kickQueue.push(uid);
    processKickQueue();
}

function kickAllNow() {
    if (!currentRoomId) {
        showAlert("BloodMoon", "Подвигайтесь!");
        console.log("[-] No room ID! Move first.");
        return;
    }
    var ids = Object.keys(foundPlayers).filter(function(id) { return canKick(id); });
    if (ids.length === 0) {
        showAlert("BloodMoon", "Игроков не найдено!");
        console.log("[-] No players to kick!");
        return;
    }
    console.log("[KICKALL] Queueing " + ids.length + " players...");
    for (var k = 0; k < ids.length; k++) {
        queueKick(ids[k]);
    }
}

function stopZoneKick() {
    zoneKickActive = false;
    kickQueue = [];
    isKicking = false;
    showAlert("BloodMoon", "Выключено");
    console.log("\n══════════════════════════════");
    console.log("  ZONE KICK: ⚪ OFF");
    console.log("  Queue cleared");
    console.log("══════════════════════════════\n");
}

function startZoneKick() {
    zoneKickActive = true;
    showAlert("BloodMoon", "Включено");
    console.log("\n══════════════════════════════");
    console.log("  ZONE KICK: 🔴 ACTIVE");
    console.log("  Room: " + currentRoomId);
    console.log("  My ID: " + myPlayerId);
    console.log("  Whitelist: " + Object.keys(whitelist).length);
    console.log("══════════════════════════════\n");
    kickAllNow();
}

function onPlayerDetected(uid) {
    if (!uid || uid === myPlayerId) return;
    if (!/^\d{3,20}$/.test(uid)) return;
    foundPlayers[uid] = true;
    if (zoneKickActive && canKick(uid)) {
        console.log("[ZONEKICK] Detected: " + uid + " -> KICK");
        queueKick(uid);
    }
}

// =========================================================
// GLOBAL FUNCTIONS FOR CONSOLE
// =========================================================
global.sendAction = sendSilentAction;
global.kiss = function() { SILENT_COMMAND = "r.ks"; TP_COMMAND = ""; console.log("[✅] Кнопка = ПОЦЕЛУЙ (подход)"); };
global.kissLong = function() { SILENT_COMMAND = "r.kl"; TP_COMMAND = ""; console.log("[✅] Кнопка = ДОЛГИЙ ПОЦЕЛУЙ (подход)"); };
global.hug = function() { SILENT_COMMAND = "r.hg"; TP_COMMAND = ""; console.log("[✅] Кнопка = ОБНЯТЬ (подход)"); };
global.kick = function() { SILENT_COMMAND = "r.ka"; TP_COMMAND = ""; console.log("[✅] Кнопка = ПНУТЬ"); };
global.dance = function() { SILENT_COMMAND = "r.pd"; TP_COMMAND = ""; console.log("[✅] Кнопка = ТАНЕЦ (подход)"); };
global.five = function() { SILENT_COMMAND = "r.hf"; TP_COMMAND = ""; console.log("[✅] Кнопка = ДАЙ ПЯТЬ (подход)"); };

global.tpkiss = function() { TP_COMMAND = "r.ks"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ПОЦЕЛУЙ"); };
global.tpkisslong = function() { TP_COMMAND = "r.kl"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ДОЛГИЙ ПОЦЕЛУЙ"); };
global.tphug = function() { TP_COMMAND = "r.hg"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ОБНЯТЬ"); };
global.tpdance = function() { TP_COMMAND = "r.pd"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ТАНЕЦ"); };
global.tpfive = function() { TP_COMMAND = "r.hf"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ДАЙ ПЯТЬ"); };
global.tpkick = function() { TP_COMMAND = "r.ka"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ПНУТЬ"); };

global.silentOff = function() {
    SILENT_COMMAND = "";
    TP_COMMAND = "";
    pendingSilentReplace = "";
    console.log("[⏹] Подмена ВЫКЛ — кнопка как обычно");
};

global.doKiss = function(id) { sendSilentAction("r.ks", id || lastTarget); };
global.doHug = function(id) { sendSilentAction("r.hg", id || lastTarget); };
global.doKick = function(id) { sendSilentAction("r.ka", id || lastTarget); };
global.doDance = function(id) { sendSilentAction("r.pd", id || lastTarget); };
global.doFive = function(id) { sendSilentAction("r.hf", id || lastTarget); };

global.spam = function(cmd, target, count, delay) {
    if (!count) count = 5;
    if (!delay) delay = 2000;
    if (!target) target = lastTarget;
    if (!target) { console.log("❌ Нет цели"); return; }
    console.log("[🔄] " + cmd + " → " + target + " x" + count);
    var done = 0;
    var t = setInterval(function() {
        if (done >= count) { clearInterval(t); console.log("[🔄] Done!"); return; }
        sendSilentAction(cmd, target);
        done++;
    }, delay);
    global._spamTimer = t;
};

global.stopSpam = function() {
    if (global._spamTimer) { clearInterval(global._spamTimer); console.log("[⏹]"); }
};

global.who = function() {
    var myAv = getMyAvatar();
    console.log("\n══════════════════════════");
    console.log("  Me:        " + myPlayerId);
    console.log("  Target:    " + (lastTarget || "❓"));
    console.log("  Room:      " + (currentRoomId || "❓"));
    console.log("  Silent:    " + (SILENT_COMMAND ? getActionName(SILENT_COMMAND) + " (подход)" : "OFF"));
    console.log("  Teleport:  " + (TP_COMMAND ? getActionName(TP_COMMAND) + " (⚡мгновенно)" : "OFF"));
    console.log("  MyAvatar:  " + (myAv ? "✅ " + myAv : "❌"));
    console.log("  Processor: " + (globalProcessor ? "✅" : "❌"));
    console.log("  Go ctors:  " + Object.keys(goCtorAddrs).length);
    console.log("  Simple:    " + Object.keys(simpleCtorAddrs).length);
    console.log("══════════════════════════\n");
};

// =========================================================
// BYPASS DRESSCODE
// =========================================================
var mapCheckAddr = get_func("_ZN10MapManager14checkDresscodeEv");
if (!mapCheckAddr) {
    var exports = Module.enumerateExportsSync(moduleName);
    for (var i = 0; i < exports.length; i++) {
        if (exports[i].name.indexOf("MapManager") !== -1 &&
            exports[i].name.indexOf("checkDresscode") !== -1) {
            mapCheckAddr = exports[i].address;
            break;
        }
    }
}

if (mapCheckAddr) {
    Interceptor.replace(mapCheckAddr, new NativeCallback(function(a1, a2, a3, a4) {
        return 1;
    }, 'uint32', ['pointer', 'pointer', 'pointer', 'pointer']));
    console.log("[+] MapManager::checkDresscode BYPASSED");
}

// =========================================================
// НАЧИНАЕМ ХУКИ
// =========================================================
console.log("[+] Installing hooks...");

var allExports = Module.enumerateExportsSync(moduleName);

// === FIND ADDRESSES ===
var saveReqCtorAddr = null;
var parseParamsAddr = null;
var valCopyAddr = null;
var valDtorAddr = null;
var kickPressedAddr = null;

for (var i = 0; i < allExports.length; i++) {
    var nm = allExports[i].name;
    if (nm.indexOf("AvatarAppearanceSaveRequestC") !== -1 && !saveReqCtorAddr) saveReqCtorAddr = allExports[i].address;
    if (nm.indexOf("SaveAppearanceResponse") !== -1 && nm.indexOf("parseParams") !== -1) parseParamsAddr = allExports[i].address;
    if (/^_ZN7cocos2d5ValueC[12]ERKS0_$/.test(nm)) valCopyAddr = allExports[i].address;
    if (/^_ZN7cocos2d5ValueD[12]Ev$/.test(nm)) valDtorAddr = allExports[i].address;

    // Silent Action
    if (nm.indexOf("RoomInteractWithUserRequest") !== -1 && nm.indexOf("C1E") !== -1 && !interactCtorAddr)
        interactCtorAddr = allExports[i].address;
    if (nm.indexOf("AGSRequest") !== -1 && nm.indexOf("D1E") !== -1)
        dtorAddr = allExports[i].address;

    // onActionKickPressed
    if (nm.indexOf("onActionKickPressed") !== -1 && !kickPressedAddr)
        kickPressedAddr = allExports[i].address;

    // Zone Kick
    if (nm.indexOf("RoomKickRequest") !== -1 &&
        (nm.indexOf("C1E") !== -1 || nm.indexOf("C2E") !== -1) && !kickCtor) {
        kickCtor = new NativeFunction(allExports[i].address, 'void', ['pointer', 'pointer', 'pointer']);
    }

    // === v11: GameManager::getMyAvatar ===
    if (nm.indexOf("GameManager") !== -1 &&
        nm.indexOf("getMyAvatar") !== -1 &&
        !gameManagerGetMyAvatarAddr)
        gameManagerGetMyAvatarAddr = allExports[i].address;

    // === v11: Singleton<GameManager>::getInstance ===
    if (nm.indexOf("SingletonI11GameManager") !== -1 &&
        nm.indexOf("getInstance") !== -1 &&
        !gameManagerSingletonAddr)
        gameManagerSingletonAddr = allExports[i].address;

    // === v11: MyAvatarObject::addAction ===
    if (nm === "_ZN14MyAvatarObject9addActionEP11ActorActionii" &&
        !myAvatarAddActionAddr)
        myAvatarAddActionAddr = allExports[i].address;

    // === v11: GoAndUserInteractAction constructors ===
    for (var gi = 0; gi < goActionNames.length; gi++) {
        var gn = goActionNames[gi];
        if (nm.indexOf("GoAndUserInteractAction") !== -1 &&
            nm.indexOf(gn) !== -1 &&
            nm.indexOf("C2E") !== -1 &&
            nm.indexOf("doChild") === -1 &&
            nm.indexOf("create") === -1 &&
            nm.indexOf("RefPtr") === -1 &&
            nm.indexOf("~") === -1) {
            if (!goCtorAddrs[gn]) {
                goCtorAddrs[gn] = allExports[i].address;
                console.log("[+] Go" + gn + ": OK");
            }
        }
    }

    // === v11: Simple Action constructors (телепорт) ===
    for (var si = 0; si < simpleActionNames.length; si++) {
        var sn = simpleActionNames[si];
        if (nm.indexOf(sn) !== -1 &&
            nm.indexOf("C2E") !== -1 &&
            nm.indexOf("AvatarObject") !== -1 &&
            nm.indexOf("GoAnd") === -1 &&
            nm.indexOf("create") === -1 &&
            nm.indexOf("RefPtr") === -1 &&
            nm.indexOf("~") === -1) {
            if (!simpleCtorAddrs[sn]) {
                simpleCtorAddrs[sn] = allExports[i].address;
                console.log("[+] " + sn + ": OK");
            }
        }
    }

    // === v11: cocos2d Ref functions ===
    if (nm === "_ZN7cocos2d3Ref6retainEv" && !retainFunc)
        retainFunc = new NativeFunction(allExports[i].address, 'void', ['pointer']);
    if (nm === "_ZN7cocos2d3Ref7releaseEv" && !releaseFunc)
        releaseFunc = new NativeFunction(allExports[i].address, 'void', ['pointer']);
    if (nm === "_ZN7cocos2d3Ref11autoreleaseEv" && !autoreleaseFunc)
        autoreleaseFunc = new NativeFunction(allExports[i].address, 'pointer', ['pointer']);
    if (nm === "__dynamic_cast" && !dynamicCastFunc)
        dynamicCastFunc = new NativeFunction(allExports[i].address, 'pointer', ['pointer', 'pointer', 'pointer', 'int']);
    if (nm === "_ZTI11WorldObject") worldObjTI = allExports[i].address;
    if (nm === "_ZTI12AvatarObject") avatarObjTI = allExports[i].address;
    if (nm === "_ZSt7nothrow") nothrowAddr = allExports[i].address;
    if (nm === "_ZnwmRKSt9nothrow_t" && !nothrowNew)
        nothrowNew = new NativeFunction(allExports[i].address, 'pointer', ['size_t', 'pointer']);
}

// === v11: Init NativeFunction holders ===
if (gameManagerGetMyAvatarAddr)
    getMyAvatarFunc = new NativeFunction(gameManagerGetMyAvatarAddr, 'pointer', ['pointer']);
if (gameManagerSingletonAddr)
    getGameManagerFunc = new NativeFunction(gameManagerSingletonAddr, 'pointer', []);
if (myAvatarAddActionAddr)
    myAvatarAddAction = new NativeFunction(myAvatarAddActionAddr, 'void', ['pointer', 'pointer', 'int', 'int']);

var kickPressedFunc = kickPressedAddr ?
    new NativeFunction(kickPressedAddr, 'void', ['pointer']) : null;

// === GIFT HACK ===
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

// === ДВИЖОК АНИМАЦИЙ ===
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

// === ANIMATION CTOR ===
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
            if (!globalProcessor) {
                globalProcessor = args[0];
                isReady = true;
                console.log("[+] Processor ready!");
            }
            // Ищем room в пакетах
            var reqObj = args[1];
            if (!reqObj || reqObj.isNull()) return;
            try {
                for (var off = 24; off <= 200; off += 8) {
                    var str = readStdString(reqObj.add(off));
                    if (str && str.indexOf(":") !== -1) {
                        currentRoomId = str;
                    }
                }
            } catch(e) {}
        }
    });
}

// === RELATIONS ===
var changeStatusAddr = get_func("_ZN3ags16RelationsCommand28RelationsChangeStatusRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEiNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE");
var createRelAddr = get_func("_ZN3ags16RelationsCommand22RelationsCreateRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEi");
if (changeStatusAddr) {
    changeStatusCtor = new NativeFunction(changeStatusAddr, 'void', ['pointer', 'pointer', 'int', 'pointer']);
    Interceptor.attach(changeStatusAddr, { onEnter: function(args) { capturedMapPtr = args[3]; } });
}
if (createRelAddr) createRelCtor = new NativeFunction(createRelAddr, 'void', ['pointer', 'pointer', 'int']);

// === LOCAL ANIMATION ===
var setAnimAddr = get_func("_ZN12AvatarObject12setAnimationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_b");
if (setAnimAddr) {
    setAnimationFunc = new NativeFunction(setAnimAddr, 'void', ['pointer', 'pointer', 'pointer', 'bool']);
    Interceptor.attach(setAnimAddr, { onEnter: function(args) { if (!myAvatarObject) myAvatarObject = args[0]; } });
}

// === WORK OBJECTS ===
var isTouchAddr = get_func("_ZN10WorkObject15isTouchOnObjectEPN7cocos2d5TouchE");
if (isTouchAddr) Interceptor.attach(isTouchAddr, { onEnter: function(args) { if (workObjects.indexOf(args[0]) === -1) workObjects.push(args[0]); } });

var changeLocAddr = get_func("_ZN13WorkGameScene14changeLocationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_S8_");
if (changeLocAddr) Interceptor.attach(changeLocAddr, { onEnter: function() { workObjects = []; myAvatarObject = null; } });

var getTextAddr2 = get_func("_ZN9GameScene14isHouseOwnerMeEv");
if (getTextAddr2) Interceptor.attach(getTextAddr2, { onLeave: function(retval) { if (isAllowedToKick) retval.replace(1); } });

var fillMenuAddr22 = get_func("_ZN9GameScene7onEnterEv");
if (fillMenuAddr22) Interceptor.attach(fillMenuAddr22, { onEnter: function() { isAllowedToKick = false; }, onLeave: function() { setTimeout(function() { isAllowedToKick = true; }, 100); } });

// === SKIP TUTORIAL BUTTON ===
var artefactNewsAddr = get_func("_ZN11SettingsDlg21onArtefactNewsPressedEPN7cocos2d3RefE");
if (artefactNewsAddr) {
    Interceptor.attach(artefactNewsAddr, {
        onEnter: function(args) {
            console.log("[*] ArtefactNews button pressed -> Skipping tutorial...");
            skipTutorial();
        }
    });
    console.log("[+] Skip Tutorial button hooked (ArtefactNews)");
}

// === SILENT ACTION: InteractCtor (v11 — с pendingSilentReplace) ===
if (interactCtorAddr) {
    Interceptor.attach(interactCtorAddr, {
        onEnter: function(args) {
            var action = readStdString(args[1]);
            var target = readStdString(args[2]);
            var user = readStdString(args[3]);
            var room = readStdString(args[4]);
            if (user && user.length > 3 && !myPlayerId) myPlayerId = user;
            if (target && target.length > 3) lastTarget = target;
            if (room && room.length > 3) currentRoomId = room;

            // v11: подмена команды если pendingSilentReplace
            if (pendingSilentReplace && pendingSilentReplace.length > 0) {
                patchExistingString(args[1], pendingSilentReplace);
                pendingSilentReplace = "";
            }

            console.log("[📤] " + readStdString(args[1]) + " | " + user + " → " + target + " @ " + room);
        }
    });
    console.log("[+] InteractCtor hooked (v11)");
}

// === SILENT ACTION: onActionKickPressed REPLACE (v11 — с GoAction/SimpleAction) ===
if (kickPressedAddr && kickPressedFunc) {
    Interceptor.replace(kickPressedAddr, new NativeCallback(function(thisPtr) {

        // Обычный пинок — ни SILENT ни TP не установлены
        if (!SILENT_COMMAND && !TP_COMMAND) {
            kickPressedFunc(thisPtr);
            return;
        }

        // v11: Извлекаем target avatar через getTargetFromButton
        var targetAvatar = getTargetFromButton(thisPtr);

        // Fallback: пробуем старый метод для targetId
        var targetId = "";
        if (targetAvatar && !targetAvatar.isNull()) {
            try { targetId = readStdString(targetAvatar.add(752)); } catch(e) {}
        }

        if (!targetId || targetId.length < 3) {
            // Старый fallback
            try {
                var field = thisPtr.add(103 * 8).readPointer();
                var avatarObj = field.add(744).readPointer();
                targetId = readStdString(avatarObj.add(752));
            } catch(e) {}
        }

        if (targetId && targetId.length >= 3) lastTarget = targetId;

        // v11: Телепорт (SimpleAction — без подхода)
        if (TP_COMMAND) {
            if (targetAvatar && !targetAvatar.isNull()) {
                if (!doAction(TP_COMMAND, targetAvatar, true)) {
                    // Fallback на сетевой silent
                    if (targetId && targetId.length >= 3) {
                        sendSilentAction(TP_COMMAND, targetId);
                    } else {
                        kickPressedFunc(thisPtr);
                    }
                }
            } else if (targetId && targetId.length >= 3) {
                sendSilentAction(TP_COMMAND, targetId);
            } else {
                kickPressedFunc(thisPtr);
            }
            return;
        }

        // v11: С подходом (GoAction)
        if (SILENT_COMMAND && SILENT_COMMAND !== "r.ka") {
            if (targetAvatar && !targetAvatar.isNull()) {
                if (!doAction(SILENT_COMMAND, targetAvatar, false)) {
                    // Fallback на сетевой silent
                    if (targetId && targetId.length >= 3) {
                        sendSilentAction(SILENT_COMMAND, targetId);
                    } else {
                        kickPressedFunc(thisPtr);
                    }
                }
            } else if (targetId && targetId.length >= 3) {
                sendSilentAction(SILENT_COMMAND, targetId);
            } else {
                kickPressedFunc(thisPtr);
            }
            return;
        }

        // Обычный пинок
        kickPressedFunc(thisPtr);

    }, 'void', ['pointer']));

    console.log("[+] onActionKickPressed REPLACED (v11)");
}

// === SILENT ACTION: Response ===
for (var i = 0; i < allExports.length; i++) {
    if (allExports[i].name.indexOf("AvararInteractResponse") !== -1 &&
        allExports[i].name.indexOf("parseParams") !== -1) {
        Interceptor.attach(allExports[i].address, {
            onEnter: function(args) { this.self = args[0]; },
            onLeave: function() {
                if (!this.self) return;
                try {
                    var code = this.self.add(8).readS32();
                    var cmd = readStdString(this.self.add(16));
                    console.log(code === 1 ?
                        "[✅] " + cmd + " СРАБОТАЛО!" :
                        "[❌] " + cmd + " err=" + code);
                } catch(e) {}
            }
        });
        console.log("[+] InteractResponse hooked");
        break;
    }
}

// === ZONE KICK: MoveRequest ===
for (var i = 0; i < allExports.length; i++) {
    if (allExports[i].name.indexOf("RoomAvatarMoveRequest") !== -1 &&
        (allExports[i].name.indexOf("C1E") !== -1 || allExports[i].name.indexOf("C2E") !== -1)) {
        Interceptor.attach(allExports[i].address, {
            onEnter: function(args) {
                var a1 = safeRead(function() { return readStdString(args[1]); });
                var a2 = safeRead(function() { return readStdString(args[2]); });
                if (a1 && /^\d{3,20}$/.test(a1) && !myPlayerId) {
                    myPlayerId = a1;
                    console.log("[+] My ID: " + myPlayerId);
                }
                if (a2 && a2.indexOf(":") !== -1) currentRoomId = a2;
            }
        });
        break;
    }
}

// === ZONE KICK: AvatarUpdateStateData ===
for (var i = 0; i < allExports.length; i++) {
    if (allExports[i].name.indexOf("AvatarUpdateStateData") !== -1 &&
        (allExports[i].name.indexOf("C1E") !== -1 || allExports[i].name.indexOf("C2E") !== -1)) {
        Interceptor.attach(allExports[i].address, {
            onEnter: function(args) {
                var uid = safeRead(function() { return readStdString(args[1]); });
                onPlayerDetected(uid);
            }
        });
        break;
    }
}

// === ZONE KICK: PlayersManager::addPlayer ===
for (var i = 0; i < allExports.length; i++) {
    if (allExports[i].name.indexOf("PlayersManager") !== -1 &&
        allExports[i].name.indexOf("addPlayer") !== -1 &&
        allExports[i].name.indexOf("typeinfo") === -1) {
        Interceptor.attach(allExports[i].address, {
            onEnter: function(args) {
                var refPtr = args[1];
                if (!refPtr || refPtr.isNull()) return;
                var obj = safeRead(function() { return refPtr.readPointer(); });
                if (!obj || obj.isNull()) return;
                var uid = safeRead(function() { return readStdString(obj.add(104)); });
                onPlayerDetected(uid);
            }
        });
        break;
    }
}

// === ZONE KICK: RoomJoinUserResponse ===
for (var i = 0; i < allExports.length; i++) {
    if (allExports[i].name.indexOf("RoomJoinUserResponse") !== -1 &&
        allExports[i].name.indexOf("parseParams") !== -1) {
        Interceptor.attach(allExports[i].address, {
            onEnter: function(args) { this.self = args[0]; },
            onLeave: function() {
                for (var off = 8; off <= 200; off += 8) {
                    safeRead(function() {
                        var str = readStdString(this.self.add(off));
                        if (str && /^\d{3,20}$/.test(str) && str !== myPlayerId) {
                            foundPlayers[str] = true;
                            if (zoneKickActive && canKick(str)) {
                                console.log("[ZONEKICK] 🚪 Joined: " + str + " -> KICK");
                                queueKick(str);
                            }
                        }
                    }.bind(this));
                }
            }
        });
        break;
    }
}

// === ZONE KICK: RoomLeaveUserResponse ===
for (var i = 0; i < allExports.length; i++) {
    if (allExports[i].name.indexOf("RoomLeaveUserResponse") !== -1 &&
        allExports[i].name.indexOf("parseParams") !== -1) {
        Interceptor.attach(allExports[i].address, {
            onEnter: function(args) { this.self = args[0]; },
            onLeave: function() {
                for (var off = 8; off <= 200; off += 8) {
                    safeRead(function() {
                        var str = readStdString(this.self.add(off));
                        if (str && /^\d{3,20}$/.test(str)) delete foundPlayers[str];
                    }.bind(this));
                }
            }
        });
        break;
    }
}

// === ZONE KICK: MoveResponse / ActionResponse ===
var responseNames = ["AvararMoveResponse", "AvararCustomActionResponse"];
for (var r = 0; r < responseNames.length; r++) {
    for (var i = 0; i < allExports.length; i++) {
        if (allExports[i].name.indexOf(responseNames[r]) !== -1 &&
            allExports[i].name.indexOf("parseParams") !== -1) {
            Interceptor.attach(allExports[i].address, {
                onEnter: function(args) { this.self = args[0]; },
                onLeave: function() {
                    for (var off = 8; off <= 200; off += 8) {
                        safeRead(function() {
                            var str = readStdString(this.self.add(off));
                            onPlayerDetected(str);
                        }.bind(this));
                    }
                }
            });
            break;
        }
    }
}

// === APPEARANCE HOOKS ===
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
                                    var nm2 = pinMem(Memory.alloc(VALUE_SIZE));
                                    nm2.writeByteArray(new Array(VALUE_SIZE).fill(0));
                                    fnValCopy(nm2, cur.add(valOff));
                                    if (nm2.add(8).readS32() === 9) {
                                        if (appearanceData.masterCopy && fnValDtor) try { fnValDtor(appearanceData.masterCopy); } catch(e) {}
                                        appearanceData.masterCopy = nm2;
                                        appearanceData.appearance = readInnerMapValues(nm2);
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
// ОБЪЕДИНЁННЫЙ ОБРАБОТЧИК ЧАТА
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
            if (cmd === "!test") { cmd = "!status"; }
            if (cmd === "!debug") { openDebugMenu(); playClick(); }
            if (cmd === "!work") smartFinishAll();

            // === GIFT ===
            if (cmd === "!gift" && arg1) {
                GIFT_TARGET = arg1;
                GIFT_ENABLED = true;
                giftLog("Target: " + arg1);
                showAlert("BloodMoon", "Уязвимость подарков включена: " + arg1);
            }
            if (cmd === "!giftoff") { GIFT_ENABLED = false; giftLog("OFF"); showAlert("BloodMoon", "Отключено"); }
            if (cmd === "!gifton") { GIFT_ENABLED = true; giftLog("ON: " + GIFT_TARGET); showAlert("BloodMoon", "Включено: " + GIFT_TARGET); }

            // === АНИМАЦИИ ===
            if (cmd === "!guitar") { nextNet = { gr: "skygacha26_guitar_off", at: "PlayGuitNew1" }; isLocked = true; validVTable = null; showAlert("BloodMoon", "Анимация гитары включена, теперь используйте любой танец"); }
            if (cmd === "!cyber") { nextNet = { gr: "myAvatar", at: "est23solodnc" }; isLocked = true; validVTable = null; showAlert("BloodMoon", "Анимация кибертанец включен, теперь используйте любой танец"); }
            if (cmd === "!dj") { nextNet = { gr: "danceroom_djpult_off", at: "Dj" }; isLocked = true; validVTable = null; showAlert("BloodMoon", "Анимация DJ включена, теперь используйте любой танец"); }
            if (cmd === "!setAnim" && parts.length >= 3) { nextNet = { gr: parts[1], at: parts[2] }; isLocked = true; validVTable = null; showAlert("BloodMoon", "Успешно, " + parts[1] + " / " + parts[2] + ", теперь используйте любой танец"); }
            if (cmd === "!off") {
                nextNet = null; isLocked = false; repeatCount = 0; validVTable = null;
                stopAllTimers();
                SILENT_COMMAND = ""; TP_COMMAND = ""; pendingSilentReplace = "";
                showAlert("BloodMoon", "Всё отключено");
            }
            if (cmd === "!getEnergy") {
                nextNet = { gr: "refrigerator", at: "use" };
                validVTable = null;
                isLocked = true;
                showAlert('BloodMoon', 'Используйте любой танец, и пропишите команду !setEnergy (количество)')
            }
            if (cmd === "!setEnergy" && arg1) {
                var count = Math.round((parseInt(arg1) || 50) / 50);
                duplicateRequest(count, 1);
                showAlert('BloodMoon', 'Уязвимость с энергией запущена')
            }


            if (cmd === "!follow" && arg1) follow(arg1);
            if (cmd === "!rep" && arg1) { repeatCount = Math.min(parseInt(arg1) || 10, 100); }
            if (cmd === "!dupe" && arg1) duplicateRequest(parseInt(arg1) || 20, 200);
            if (cmd === "!dupe" && !arg1) duplicateRequest(20, 50);

            if (cmd === "!save" && arg1 && nextNet) { savedSlots[arg1] = { gr: nextNet.gr, at: nextNet.at, visual: parts[2] || "Dance1" }; showAlert("BloodMoon", "Слот " + arg1 + " сохранен"); }
            if (cmd === "!del" && arg1 && savedSlots[arg1]) { delete savedSlots[arg1]; showAlert("BloodMoon", "Слот " + arg1 + " удален!"); }
            if (cmd === "!clear") { savedSlots = {}; showAlert("BloodMoon", "Слоты отчищены"); }
            if (cmd === "!clearslots") { savedSlots = {}; showAlert("BloodMoon", "Слоты отчищены"); }
            if (cmd === "!anim" && arg1) playLocalAnimation(arg1);
            if (cmd === "!tofriend" && arg1) chainToFriend(arg1, 2500);

            // === SKIP TUTORIAL ===
            if (cmd === "!skip") skipTutorial();

            // === APPEARANCE ===
            if (cmd === "!hair" && arg1) sendAppearance({"ht": parseInt(arg1)});
            if (cmd === "!hairtype" && arg1) sendAppearance({"ht": parseInt(arg1)});
            if (cmd === "!haircolor" && arg1) sendAppearance({"hc": parseInt(arg1)});
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
                    showAlert("BloodMoon", "Проверка дресс-кода заблокирована");
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
                        config[kv[0]] = kv[1].split(",").map(function(x) { return parseInt(x); });
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
                    showAlert("BloodMoon", "Нет данных! Сохраните внешность");
                    console.log("[-] No appearance data. Save once in avatar shop!");
                } else {
                    var txt = "";
                    console.log("=== APPEARANCE ===");
                    for (var k in appearanceData.appearance) {
                        txt += (APPEARANCE_KEYS[k]||k) + "=" + appearanceData.appearance[k] + "\n";
                        console.log("  " + (APPEARANCE_KEYS[k]||k) + " (" + k + ") = " + appearanceData.appearance[k]);
                    }
                    showAlert("BloodMoon", txt);
                }
            }

            if (cmd === "!keys") {
                var txt = "";
                console.log("=== KEYS ===");
                for (var k in APPEARANCE_KEYS) {
                    txt += k + " = " + APPEARANCE_KEYS[k] + "\n";
                    console.log("  " + k + " = " + APPEARANCE_KEYS[k]);
                }
                showAlert("BloodMoon", txt);
            }

            // === SILENT ACTION COMMANDS (v11 — с подходом) ===
            if (cmd === "!kiss") { SILENT_COMMAND = "r.ks"; TP_COMMAND = ""; console.log("[✅] Кнопка = ПОЦЕЛУЙ (подход)"); }
            if (cmd === "!kisslong") { SILENT_COMMAND = "r.kl"; TP_COMMAND = ""; console.log("[✅] Кнопка = ДОЛГИЙ ПОЦЕЛУЙ (подход)"); }
            if (cmd === "!hug") { SILENT_COMMAND = "r.hg"; TP_COMMAND = ""; console.log("[✅] Кнопка = ОБНЯТЬ (подход)"); }
            if (cmd === "!kickaction") { SILENT_COMMAND = "r.ka"; TP_COMMAND = ""; console.log("[✅] Кнопка = ПНУТЬ"); }
            if (cmd === "!danceaction") { SILENT_COMMAND = "r.pd"; TP_COMMAND = ""; console.log("[✅] Кнопка = ТАНЕЦ (подход)"); }
            if (cmd === "!fiveaction") { SILENT_COMMAND = "r.hf"; TP_COMMAND = ""; console.log("[✅] Кнопка = ДАЙ ПЯТЬ (подход)"); }

            // === TELEPORT COMMANDS (v11 — без подхода, мгновенно) ===
            if (cmd === "!tpkiss") { TP_COMMAND = "r.ks"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ПОЦЕЛУЙ (мгновенно)"); }
            if (cmd === "!tpkisslong") { TP_COMMAND = "r.kl"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ДОЛГИЙ ПОЦЕЛУЙ (мгновенно)"); }
            if (cmd === "!tphug") { TP_COMMAND = "r.hg"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ОБНЯТЬ (мгновенно)"); }
            if (cmd === "!tpdance") { TP_COMMAND = "r.pd"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ТАНЕЦ (мгновенно)"); }
            if (cmd === "!tpfive") { TP_COMMAND = "r.hf"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ДАЙ ПЯТЬ (мгновенно)"); }
            if (cmd === "!tpkick") { TP_COMMAND = "r.ka"; SILENT_COMMAND = ""; console.log("[⚡] Кнопка = TP ПНУТЬ (мгновенно)"); }

            if (cmd === "!silentoff") { SILENT_COMMAND = ""; TP_COMMAND = ""; pendingSilentReplace = ""; console.log("[⏹] Подмена ВЫКЛ"); }

            if (cmd === "!dokiss" && arg1) sendSilentAction("r.ks", arg1);
            if (cmd === "!dohug" && arg1) sendSilentAction("r.hg", arg1);
            if (cmd === "!dokick" && arg1) sendSilentAction("r.ka", arg1);
            if (cmd === "!dodance" && arg1) sendSilentAction("r.pd", arg1);
            if (cmd === "!dofive" && arg1) sendSilentAction("r.hf", arg1);

            if (cmd === "!spamaction" && arg1) {
                var cnt = parseInt(arg2) || 5;
                var delay = parseInt(arg3) || 2000;
                var target = arg1.indexOf("r.") === 0 ? lastTarget : arg1;
                var action = arg1.indexOf("r.") === 0 ? arg1 : "r.ks";
                if (arg1.indexOf("r.") !== 0) action = arg2 || "r.ks";
                global.spam(action, target, cnt, delay);
            }

            // === ZONE KICK COMMANDS ===
            if (cmd === "!kickall") startZoneKick();
            if (cmd === "!stopkickall") stopZoneKick();

            if (cmd === "!whitelist") {
                var added = 0;
                for (var p = 1; p < parts.length; p++) {
                    if (parts[p] && /^\d+$/.test(parts[p])) {
                        whitelist[parts[p]] = true;
                        console.log("[WHITELIST] ✅ " + parts[p]);
                        added++;
                    }
                }
                if (added === 0) console.log("Usage: !whitelist <id1> <id2> ...");
            }

            if (cmd === "!clearlist") {
                whitelist = {};
                console.log("[WHITELIST] Cleared");
            }

            if (cmd === "!players") {
                var ids = Object.keys(foundPlayers).filter(function(id) { return id !== myPlayerId; });
                console.log("\n═══ PLAYERS (" + ids.length + ") ═══");
                console.log("Room: " + currentRoomId);
                console.log("My ID: " + myPlayerId);
                console.log("Zone Kick: " + (zoneKickActive ? "🔴 ON" : "⚪ OFF"));
                console.log("Whitelist: " + Object.keys(whitelist).length);
                console.log("Queue: " + kickQueue.length);
                for (var p = 0; p < ids.length; p++) {
                    var mark = whitelist[ids[p]] ? " ✅ SAFE" : "";
                    console.log("  " + (p + 1) + ". " + ids[p] + mark);
                }
                console.log("══════════════════════\n");
            }

            if (cmd === "!room") console.log("[ROOM] " + currentRoomId);
            if (cmd === "!myid") console.log("[MY ID] " + myPlayerId);
            if (cmd === "!setroom" && arg1) { currentRoomId = parts.slice(1).join(" "); console.log("[ROOM] " + currentRoomId); }
            if (cmd === "!setmyid" && arg1) { myPlayerId = arg1; console.log("[MY ID] " + myPlayerId); }
            if (cmd === "!clearplayers") { foundPlayers = {}; kickQueue = []; console.log("[+] Cleared"); }

            if (cmd === "!who") {
                var myAv = getMyAvatar();
                console.log("\n══════════════════════════");
                console.log("  Me:        " + myPlayerId);
                console.log("  Target:    " + (lastTarget || "❓"));
                console.log("  Room:      " + (currentRoomId || "❓"));
                console.log("  Silent:    " + (SILENT_COMMAND ? getActionName(SILENT_COMMAND) + " (подход)" : "OFF"));
                console.log("  Teleport:  " + (TP_COMMAND ? getActionName(TP_COMMAND) + " (⚡мгновенно)" : "OFF"));
                console.log("  MyAvatar:  " + (myAv ? "✅ " + myAv : "❌"));
                console.log("  Processor: " + (globalProcessor ? "✅" : "❌"));
                console.log("  Go ctors:  " + Object.keys(goCtorAddrs).length);
                console.log("  Simple:    " + Object.keys(simpleCtorAddrs).length);
                console.log("══════════════════════════\n");
            }

            if (cmd === "!status") {
                var myAv = getMyAvatar();
                var txt = "Processor: " + (globalProcessor ? "OK" : "NULL") + "\n" +
                          "Appearance: " + (appearanceData.ready ? "OK" : "NO") + "\n" +
                          "Fields: " + Object.keys(appearanceData.appearance).length + "\n" +
                          "Timers: " + comboTimers.length + "\n" +
                          "Silent: " + (SILENT_COMMAND ? getActionName(SILENT_COMMAND) + " (подход)" : "OFF") + "\n" +
                          "Teleport: " + (TP_COMMAND ? getActionName(TP_COMMAND) + " (⚡)" : "OFF") + "\n" +
                          "MyAvatar: " + (myAv ? "OK" : "NULL") + "\n" +
                          "Go ctors: " + Object.keys(goCtorAddrs).length + "\n" +
                          "Simple ctors: " + Object.keys(simpleCtorAddrs).length + "\n" +
                          "Zone Kick: " + (zoneKickActive ? "ON" : "OFF") + "\n" +
                          "Room: " + currentRoomId + "\n" +
                          "My ID: " + myPlayerId;
                showAlert("BloodMoon", txt);
                console.log("=== STATUS ===");
                console.log("Processor: " + (globalProcessor ? "OK" : "NULL"));
                console.log("Appearance ready: " + appearanceData.ready);
                console.log("Appearance fields: " + Object.keys(appearanceData.appearance).length);
                console.log("Timers: " + comboTimers.length);
                console.log("Silent: " + (SILENT_COMMAND ? getActionName(SILENT_COMMAND) + " (подход)" : "OFF"));
                console.log("Teleport: " + (TP_COMMAND ? getActionName(TP_COMMAND) + " (⚡)" : "OFF"));
                console.log("MyAvatar: " + (myAv ? "OK " + myAv : "NULL"));
                console.log("Go ctors: " + Object.keys(goCtorAddrs).length);
                console.log("Simple ctors: " + Object.keys(simpleCtorAddrs).length);
                console.log("Zone Kick: " + (zoneKickActive ? "ON" : "OFF"));
                console.log("Room: " + currentRoomId);
                console.log("My ID: " + myPlayerId);
            }

            if (cmd === "!help") {
                showAlert("BloodMoon",
                    "!guitar !cyber !dj\n" +
                    "!setAnim gr act\n" +
                    "!off !work !skip\n" +
                    "!gift ID !follow ID\n" +
                    "!hair N !eyes N\n" +
                    "!look !status !keys\n" +
                    "!dupe N !rep N\n" +
                    "=== С ПОДХОДОМ ===\n" +
                    "!kiss !hug !kisslong\n" +
                    "!danceaction !fiveaction\n" +
                    "=== ТЕЛЕПОРТ ⚡ ===\n" +
                    "!tpkiss !tphug !tpkisslong\n" +
                    "!tpdance !tpfive !tpkick\n" +
                    "!silentoff !who\n" +
                    "!stopkickall !kickall\n" +
                    "!players");
                console.log("\n═══════════════════════════════════════════════════════════");
                console.log("  === ОСНОВНЫЕ ===");
                console.log("  !test !debug !work !skip");
                console.log("");
                console.log("  === GIFT ===");
                console.log("  !gift <id>  !gifton  !giftoff");
                console.log("");
                console.log("  === АНИМАЦИИ ===");
                console.log("  !guitar !cyber !dj !setAnim <gr> <at> !off");
                console.log("  !follow <id>  !rep <n>  !dupe <n>");
                console.log("  !save <slot>  !del <slot>  !anim <name>");
                console.log("");
                console.log("  === APPEARANCE ===");
                console.log("  !hair <n> !eyes <n> !skin <n> !brows <n> !mouth <n>");
                console.log("  !auto hc 1,2,3 3000");
                console.log("  !combo hc:1,2,3 ec:1,2 2000");
                console.log("  !random hc:1,2,3 ec:1,2 2000");
                console.log("  !stop !look !keys");
                console.log("");
                console.log("  === SILENT ACTION (с подходом) ===");
                console.log("  !kiss !hug !kisslong !kickaction !danceaction !fiveaction");
                console.log("");
                console.log("  === ТЕЛЕПОРТ ⚡ (без подхода, мгновенно) ===");
                console.log("  !tpkiss !tpkisslong !tphug");
                console.log("  !tpdance !tpfive !tpkick");
                console.log("");
                console.log("  !silentoff — выключить подмену");
                console.log("  !who — статус silent/tp");
                console.log("");
                console.log("  === СЕТЕВОЙ SILENT (по ID) ===");
                console.log("  !dokiss <id> !dohug <id> !dodance <id>");
                console.log("");
                console.log("  === ZONE KICK ===");
                console.log("  !kickall  !stopkickall");
                console.log("  !whitelist <id1> <id2>  !clearlist");
                console.log("  !players  !room !myid !clearplayers");
                console.log("");
                console.log("  !status — полный статус");
                console.log("  !off — выключить ВСЁ");
                console.log("═══════════════════════════════════════════════════════════\n");
            }
        }
    });
    console.log("[+] Chat hooked!");
}

// === INIT PROCESSOR ===
globalProcessor = getCmdProcessor();

console.log("\n══════════════════════════════════════════════════════════");
console.log("  🎮 MEGA SCRIPT + SILENT v11 LOADED!");
console.log("  getMyAvatar: " + (getMyAvatarFunc ? "✅" : "❌"));
console.log("  addAction:   " + (myAvatarAddAction ? "✅" : "❌"));
console.log("  Go ctors:    " + Object.keys(goCtorAddrs).length);
console.log("  Simple:      " + Object.keys(simpleCtorAddrs).length);
console.log("  nothrow:     " + (nothrowNew ? "✅" : "❌"));
console.log("  Type !help in chat for all commands");
console.log("  Console: kiss() hug() tpkiss() tphug() who() spam()");
console.log("══════════════════════════════════════════════════════════\n");

} // конец initScript
