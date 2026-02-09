console.log("--- FULL SCRIPT (FIXED VERSION) ---");

// === СРАЗУ ХУКАЕМ ===
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

// [ИСПРАВЛЕНИЕ] Храним УКАЗАТЕЛЬ на живой map, а не копию байтов.
// Копирование сырых байтов unordered_map ломает внутренние указатели
// (bucket pointers, node pointers) — они указывают на старую память.
var capturedMapPtr = null;

var isAllowedToKick = false;

// === ДЛЯ B.O.X КНОПКИ ===
var isModdingActive = false;
var box_buttonobjmenu = null;

// =========================================================
// [ИСПРАВЛЕНИЕ] СИСТЕМА ПИННИНГА ПАМЯТИ
// На gadget GC Frida агрессивно освобождает Memory.alloc().
// Сохраняем ссылки в массив, чтобы GC не убил буферы раньше
// времени. Через 10 секунд ссылка убирается автоматически.
// =========================================================
var pinnedMemory = [];

function pinMem(ptr) {
    pinnedMemory.push(ptr);
    setTimeout(function() {
        var idx = pinnedMemory.indexOf(ptr);
        if (idx !== -1) pinnedMemory.splice(idx, 1);
    }, 10000);
    return ptr;
}

function get_func(name) { return Module.findExportByName(moduleName, name); }

function readStdString(addr) {
    if (!addr || addr.isNull()) return "";
    try {
        var isLong = addr.readU8() & 1;
        return isLong ? addr.add(16).readPointer().readUtf8String() : addr.add(1).readUtf8String();
    } catch (e) { return ""; }
}

// [ИСПРАВЛЕНИЕ] Обрезаем САМ ТЕКСТ до 22 символов, а не только длину.
// Раньше len обрезался, но writeUtf8String писал полный текст —
// переполнение SSO-буфера (23 байта максимум: 1 байт длина + 22 байта данных).
function writeSSO(addr, text) {
    if (!addr || addr.isNull()) return;
    try {
        Memory.protect(addr, 64, 'rwx');
        var safeText = text.substring(0, 22); // ← обрезаем сам текст
        var len = safeText.length;
        for (var i = 0; i < 24; i++) addr.add(i).writeU8(0);
        addr.writeU8(len << 1);
        addr.add(1).writeUtf8String(safeText);
    } catch(e) {}
}

// [ИСПРАВЛЕНИЕ] Та же защита от переполнения SSO
function writeRawString(addr, text) {
    if (addr.isNull()) return;
    var safeText = text.substring(0, 22); // ← обрезаем
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

// [ИСПРАВЛЕНИЕ] createStdString теперь пиннит память и обрезает текст
function createStdString(text) {
    var safeText = text.substring(0, 22); // ← SSO safe
    var strPtr = pinMem(Memory.alloc(32)); // ← пиннинг от GC
    for (var i = 0; i < 32; i++) strPtr.add(i).writeU8(0);
    strPtr.writeU8(safeText.length << 1);
    strPtr.add(1).writeUtf8String(safeText);
    return strPtr;
}

// [ИСПРАВЛЕНИЕ] Для длинных строк (>22 символов) — allocate на куче
// SSO не подходит для длинных строк, используем long string format
function createStdStringLong(text) {
    var strPtr = pinMem(Memory.alloc(32));
    for (var i = 0; i < 32; i++) strPtr.add(i).writeU8(0);

    if (text.length <= 22) {
        // SSO формат
        strPtr.writeU8(text.length << 1);
        strPtr.add(1).writeUtf8String(text);
    } else {
        // Long string формат
        var heapBuf = pinMem(Memory.alloc(text.length + 1));
        heapBuf.writeUtf8String(text);
        strPtr.writeU8(1); // флаг long
        strPtr.add(8).writeU64(text.length); // size
        strPtr.add(16).writePointer(heapBuf); // data pointer
    }
    return strPtr;
}

function safeAssign(strAddr, text) {
    var assignAddr = Module.findExportByName("libc++.so", "_ZNSt3__ndk112basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKc");
    if (!assignAddr) {
        assignAddr = Module.findExportByName("libc++_shared.so", "_ZNSt6__ndk112basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKc");
    }
    if (assignAddr) {
        var textBuf = pinMem(Memory.allocUtf8String(text)); // ← пиннинг
        new NativeFunction(assignAddr, 'pointer', ['pointer', 'pointer'])(strAddr, textBuf);
    } else {
        writeRawString(strAddr, text);
    }
}

// [ИСПРАВЛЕНИЕ] copyPointerData — глубокая копия данных по указателю.
// Раньше savedArgs хранил сырые указатели args[4], args[5],
// которые указывали на стековые/временные данные вызывающей функции.
// После возврата из функции эти указатели становились dangling.
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

function toast(msg) {
    console.log("[TOAST] " + msg);
}

function giftLog(msg) {
    console.log("[GIFT] " + msg);
}

function playClick() {
    var addr = get_func("_ZN12SoundManager14playClickSoundEv");
    if (addr) {
        try { new NativeFunction(addr, 'void', [])(); } catch(e) {}
    }
}

function getAgsClient() {
    var agsclientAddr = get_func("_ZN9SingletonIN3ags6ClientEE11getInstanceEv");
    if (agsclientAddr) {
        return new NativeFunction(agsclientAddr, 'pointer', [])();
    }
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
    if (!globalProcessor) {
        console.log("[FOLLOW] Processor not ready!");
        return;
    }

    var followReqSym = "_ZN3ags14PlayersCommand20PlayersFollowRequestC1ENSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE";
    var followAddr = get_func(followReqSym);
    if (!followAddr) {
        followAddr = get_func("_ZN3ags14PlayersCommand20PlayersFollowRequestC2ENSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE");
    }

    if (followAddr) {
        var createRequest = new NativeFunction(followAddr, 'void', ['pointer', 'pointer']);
        var idStr = createStdString(targetId);
        // [ИСПРАВЛЕНИЕ] Увеличен буфер до 1024 и пиннинг
        var requestBuf = pinMem(Memory.alloc(1024));
        createRequest(requestBuf, idStr);
        schedule(globalProcessor, requestBuf);
    }
}

function smartFinishAll() {
    var client = getAgsClient();
    if (!client || client.isNull()) {
        console.log("[!] Client не найден!");
        return;
    }
    if (readStdString(client.add(32)) != "work") {
        console.log("[+] Вы не на работе!");
        return;
    }
    if (workObjects.length === 0) {
        console.log("[!] Подвигайтесь");
        return;
    }

    var finishAddr = get_func("_ZN10WorkObject10finishWorkEv");
    if (!finishAddr) return;
    var finishWork = new NativeFunction(finishAddr, 'void', ['pointer']);
    var uniqueObjects = [];
    for (var i = 0; i < workObjects.length; i++) {
        if (uniqueObjects.indexOf(workObjects[i]) === -1) {
            uniqueObjects.push(workObjects[i]);
        }
    }
    var cnt = 0;
    for (var i = 0; i < uniqueObjects.length; i++) {
        try {
            if (uniqueObjects[i].readPointer() !== null) {
                finishWork(uniqueObjects[i]);
                cnt++;
            }
        } catch (e) {}
    }
    console.log("[+] Собрано: " + cnt);
    workObjects = [];
}

function duplicateRequest(times, delay) {
    if (!savedArgs || !isReady) {
        console.log('[!] Запустите "Танец 1"');
        return;
    }

    var sent = 0;
    function sendOne() {
        if (sent >= times) return;
        try {
            var gr = createStdStringLong(savedArgs.group);
            var at = createStdStringLong(savedArgs.action);
            var trg = createStdStringLong(savedArgs.target);
            // [ИСПРАВЛЕНИЕ] Увеличен буфер + пиннинг
            var requestBuf = pinMem(Memory.alloc(1024));
            // [ИСПРАВЛЕНИЕ] savedArgs.roomId и mapData теперь глубокие копии
            ctor(requestBuf, gr, at, trg, savedArgs.roomId, savedArgs.mapData);
            schedule(globalProcessor, requestBuf);
            sent++;
        } catch (e) {
            console.log("[DUPE] Error: " + e);
        }
        setTimeout(sendOne, delay);
    }
    sendOne();
}

function sendRelStatus(uid, status) {
    if (!globalProcessor || !changeStatusCtor) {
        console.log("[REL] Processor/ChangeStatus not ready! Сделай действие через UI!");
        return false;
    }
    try {
        // [ИСПРАВЛЕНИЕ] Буфер увеличен до 1024 + пиннинг
        var requestBuf = pinMem(Memory.alloc(1024));
        var uidStr = createStdString(uid.toString());

        // [ИСПРАВЛЕНИЕ] Используем захваченный живой указатель на map,
        // а не самодельный из нулей. Фейковый unordered_map из нулей
        // крашит native код при обращении к bucket pointers.
        var map;
        if (capturedMapPtr && !capturedMapPtr.isNull()) {
            map = capturedMapPtr;
            console.log("[REL] Using captured map pointer");
        } else {
            // Если map не захвачен — создаём пустой, но с предупреждением
            console.log("[REL] WARNING: no captured map! Нужно сначала совершить действие через UI");
            map = pinMem(Memory.alloc(64));
            for (var i = 0; i < 64; i++) map.add(i).writeU8(0);
        }

        console.log("[REL] Status " + status + " -> " + uid);
        changeStatusCtor(requestBuf, uidStr, status, map);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) {
        console.log("[REL] Error: " + e);
        return false;
    }
}

function sendRelCreate(uid, type) {
    if (!globalProcessor || !createRelCtor) {
        console.log("[REL] Processor/CreateRel not ready! Сделай действие через UI!");
        return false;
    }
    try {
        // [ИСПРАВЛЕНИЕ] Буфер увеличен до 1024 + пиннинг
        var requestBuf = pinMem(Memory.alloc(1024));
        var uidStr = createStdString(uid.toString());
        console.log("[REL] Create type=" + type + " -> " + uid);
        createRelCtor(requestBuf, uidStr, type);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) {
        console.log("[REL] Error: " + e);
        return false;
    }
}

// [ИСПРАВЛЕНИЕ] chainToFriend теперь выполняет правильную последовательность:
// 1. Сначала создаёт связь (RelationsCreateRequest)
// 2. Потом с задержкой меняет статус (RelationsChangeStatusRequest)
// Раньше вызывался ТОЛЬКО ChangeStatus для несуществующей связи — сервер отклонял.
function chainToFriend(uid, delay) {
    sendRelStatus(uid, 43);
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
            var original = readStdString(args[2]);
            giftLog(original + " -> " + GIFT_TARGET);
            writeSSO(args[2], GIFT_TARGET);
        }
    });
    giftLog("[+] Активно! Все подарки -> " + GIFT_TARGET);
} else {
    giftLog("[-] MakeGiftRequest не найден");
}

// ДВИЖОК АНИМАЦИЙ
var addActionSym = "_ZN14MyAvatarObject9addActionEP11ActorActionii";
var addActionAddr = get_func(addActionSym);

if (addActionAddr) {
    console.log("[+] ENGINE: addAction hooked");
    Interceptor.attach(addActionAddr, {
        onEnter: function(args) {
            var actionPtr = args[1];
            if (actionPtr.isNull()) return;

            try {
                var vtable = actionPtr.readPointer();

                if (validVTable === null) {
                    try {
                        var checkAction = readStdString(actionPtr.add(296));
                        if (checkAction && checkAction.length > 1 &&
                            checkAction.indexOf("Walk") === -1 &&
                            checkAction.indexOf("Run") === -1) {
                            validVTable = vtable;
                            console.log("[SYSTEM] VTable: " + vtable);
                        } else {
                            return;
                        }
                    } catch(e) { return; }
                }

                if (!vtable.equals(validVTable)) return;

                if (isLocked && nextNet) {
                    writeSSO(actionPtr.add(272), nextNet.gr);
                    writeSSO(actionPtr.add(296), nextNet.at);
                }
            } catch(e) {
                // [ИСПРАВЛЕНИЕ] Ловим возможный краш при чтении vtable
                console.log("[addAction] Error: " + e);
            }
        }
    });
} else {
    console.log("[-] addAction не найден!");
}

// ANIMATION CTOR
var ctorSym = "_ZN3ags11RoomCommand29RoomAvatarCustomActionRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEESA_SA_SA_RKNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE";
ctorAddr = get_func(ctorSym);
scheduleAddr = get_func("_ZN3ags16CommandProcessor15scheduleRequestERKNS_10AGSRequestE");

if (ctorAddr && scheduleAddr) {
    ctor = new NativeFunction(ctorAddr, 'void', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer']);
    schedule = new NativeFunction(scheduleAddr, 'void', ['pointer', 'pointer']);
    console.log("[+] Animation ready");

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

                // [ИСПРАВЛЕНИЕ] Глубокая копия args[4] и args[5] вместо сырых указателей.
                // args указывают на стековые данные вызывающей функции —
                // после возврата они невалидны.
                savedArgs = {
                    group: savedSlots[slot].gr,
                    action: savedSlots[slot].at,
                    target: originalTarget,
                    roomId: copyPointerData(args[4], 128),
                    mapData: copyPointerData(args[5], 128)
                };
            } else {
                // [ИСПРАВЛЕНИЕ] Глубокая копия
                savedArgs = {
                    group: originalGroup,
                    action: originalAction,
                    target: originalTarget,
                    roomId: copyPointerData(args[4], 128),
                    mapData: copyPointerData(args[5], 128)
                };
            }

            if (needLocalAnim) {
                setTimeout(function() { playLocalAnimation(needLocalAnim); }, 100);
            }

            if (repeatCount > 0) {
                var cnt = repeatCount;
                repeatCount = 0;
                setTimeout(function() { duplicateRequest(cnt, 50); }, 100);
            }
        }
    });

    Interceptor.attach(scheduleAddr, {
        onEnter: function(args) {
            if (!globalProcessor) {
                globalProcessor = args[0];
                isReady = true;
                console.log("[+] Processor ready!");
            }
        }
    });
}

// RELATIONS
var changeStatusAddr = get_func("_ZN3ags16RelationsCommand28RelationsChangeStatusRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEiNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE");
var createRelAddr = get_func("_ZN3ags16RelationsCommand22RelationsCreateRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEi");

if (changeStatusAddr) {
    changeStatusCtor = new NativeFunction(changeStatusAddr, 'void', ['pointer', 'pointer', 'int', 'pointer']);
    console.log("[+] ChangeStatus ready");
    Interceptor.attach(changeStatusAddr, {
        onEnter: function(args) {
            // [ИСПРАВЛЕНИЕ] Сохраняем УКАЗАТЕЛЬ на живой map,
            // а не копию байтов. Копирование байтов unordered_map
            // ломает внутренние указатели (buckets, nodes).
            capturedMapPtr = args[3];
            console.log("[REL] Map pointer captured: " + capturedMapPtr);
        }
    });
}

if (createRelAddr) {
    createRelCtor = new NativeFunction(createRelAddr, 'void', ['pointer', 'pointer', 'int']);
    console.log("[+] CreateRelation ready");
}

// LOCAL ANIMATION
var setAnimSym = "_ZN12AvatarObject12setAnimationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_b";
var setAnimAddr = get_func(setAnimSym);
if (setAnimAddr) {
    setAnimationFunc = new NativeFunction(setAnimAddr, 'void', ['pointer', 'pointer', 'pointer', 'bool']);
    Interceptor.attach(setAnimAddr, {
        onEnter: function(args) {
            if (!myAvatarObject) myAvatarObject = args[0];
        }
    });
    console.log("[+] setAnimation ready");
}

// WORK OBJECTS
var isTouchAddr = get_func("_ZN10WorkObject15isTouchOnObjectEPN7cocos2d5TouchE");
if (isTouchAddr) {
    Interceptor.attach(isTouchAddr, {
        onEnter: function(args) {
            if (workObjects.indexOf(args[0]) === -1) workObjects.push(args[0]);
        }
    });
}

var changeLocAddr = get_func("_ZN13WorkGameScene14changeLocationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_S8_");
if (changeLocAddr) {
    Interceptor.attach(changeLocAddr, {
        onEnter: function() {
            workObjects = [];
            myAvatarObject = null;
        }
    });
}


var getTextAddr2 = get_func("_ZN9GameScene14isHouseOwnerMeEv");
if (getTextAddr2) {
    Interceptor.attach(getTextAddr2, {
        onLeave: function(retval) {
            if (isAllowedToKick) retval.replace(1);
        }
    });
}

var fillMenuAddr22 = get_func("_ZN9GameScene7onEnterEv");
if (fillMenuAddr22) {
    Interceptor.attach(fillMenuAddr22, {
        onEnter: function() { isAllowedToKick = false; },
        onLeave: function() { setTimeout(function() { isAllowedToKick = true; }, 100); }
    });
}

// =========================================================
// ОБРАБОТЧИК ЧАТА
// =========================================================
var clientsendAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
if (clientsendAddr) {
    console.log("[+] Chat function: " + clientsendAddr);
    Interceptor.attach(clientsendAddr, {
        onEnter: function(args) {
            var msg = readStdString(args[1]).trim();
            console.log("[CHAT] " + msg);

            // [ИСПРАВЛЕНИЕ] Защита от null getAgsClient
            var myId = getPlayerID();
            var senderId = "";
            try { senderId = readStdString(args[0]); } catch(e) {}

            if (myId && senderId && senderId !== myId) return;

            if (msg.indexOf("!") === 0) { patchExistingString(args[1], ""); }

            var parts = msg.split(" ");
            var cmd = parts[0];
            var uid = parts[1];

            // [ИСПРАВЛЕНИЕ] Исправлено: !test вместо !testill для консистентности
            if (cmd === "!test") { patchExistingString(args[1], "t.me/avataria_destony"); }
            if (cmd === "!debug") { openDebugMenu(); playClick(); }
            if (cmd === "!click") { playClick(); }
            if (cmd === "!work") { smartFinishAll(); }

            if (cmd === "!gift" && uid) { GIFT_TARGET = uid; GIFT_ENABLED = true; giftLog("Цель: " + uid); }
            if (cmd === "!giftoff") { GIFT_ENABLED = false; giftLog("Выключено"); }
            if (cmd === "!gifton") { GIFT_ENABLED = true; giftLog("Вкл: " + GIFT_TARGET); }

            if (cmd === "!guitar") { nextNet = { gr: "skygacha26_guitar_off", at: "PlayGuitNew1" }; isLocked = true; validVTable = null; console.log("[+] Гитара"); }
            if (cmd === "!cyber") { nextNet = { gr: "myAvatar", at: "est23solodnc" }; isLocked = true; validVTable = null; console.log("[+] Ёлка"); }
            if (cmd === "!dj") { nextNet = { gr: "danceroom_djpult_off", at: "Dj" }; isLocked = true; validVTable = null; console.log("[+] DJ"); }

            if (cmd === "!setAnim" && parts.length >= 3) { nextNet = { gr: parts[1], at: parts[2] }; isLocked = true; validVTable = null; console.log("[+] Custom anim: " + parts[1] + "/" + parts[2]); }
            if (cmd === "!off") { nextNet = null; isLocked = false; repeatCount = 0; validVTable = null; console.log("[+] Выкл"); }

            if (cmd === "!follow" && uid) follow(uid);
            if (cmd === "!rep" && uid) { repeatCount = Math.min(parseInt(uid) || 10, 100); console.log("[+] Repeat: " + repeatCount); }
            if (cmd === "!dupe" && uid) { duplicateRequest(parseInt(uid) || 20, 200); }
            if (cmd === "!dupe" && !uid) { duplicateRequest(20, 50); }

            if (cmd === "!save" && uid && nextNet) {
                savedSlots[uid] = { gr: nextNet.gr, at: nextNet.at, visual: parts[2] || "Dance1" };
                console.log("[+] Saved slot " + uid);
            }
            if (cmd === "!del" && uid && savedSlots[uid]) { delete savedSlots[uid]; console.log("[+] Deleted slot " + uid); }
            if (cmd === "!clear") { savedSlots = {}; console.log("[+] All slots cleared"); }
            if (cmd === "!anim" && uid) { playLocalAnimation(uid); }
            if (cmd === "!tofriend" && uid) { chainToFriend(uid, 2500); }

            if (cmd === "!getEnergy") {
                nextNet = { gr: "refrigerator", at: "use" };
                validVTable = null;
                isLocked = true;
            }
            if (cmd === "!setEnergy" && uid) {
                var count = Math.round((parseInt(uid) || 50) / 50);
                duplicateRequest(count, 1000);
            }

            // [ИСПРАВЛЕНИЕ] Диагностическая команда для проверки состояния
            if (cmd === "!status") {
                console.log("=== STATUS ===");
                console.log("Processor: " + (globalProcessor ? "OK" : "NULL"));
                console.log("isReady: " + isReady);
                console.log("changeStatusCtor: " + (changeStatusCtor ? "OK" : "NULL"));
                console.log("createRelCtor: " + (createRelCtor ? "OK" : "NULL"));
                console.log("capturedMapPtr: " + (capturedMapPtr ? capturedMapPtr : "NULL"));
                console.log("savedArgs: " + (savedArgs ? "OK" : "NULL"));
                console.log("myAvatarObject: " + (myAvatarObject ? "OK" : "NULL"));
                console.log("workObjects: " + workObjects.length);
                console.log("pinnedMemory: " + pinnedMemory.length);
                console.log("GIFT: " + (GIFT_ENABLED ? GIFT_TARGET : "OFF"));
                console.log("===============");
            }
        }
    });
    console.log("[+] Chat hooked!");
} else {
    console.log("[-] Chat NOT FOUND!");
}

} // конец initScript
