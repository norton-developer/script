var validVTable = null; 
var GIFT_TARGET = "cyberDance";
var GIFT_ENABLED = true;

var moduleName = "libMyGame.so";
var workObjects = [];
var nextNet = null;
var nextVisual = null;
var isLocked = false;

var globalProcessor = null;
var savedArgs = null;
var repeatCount = 0;
var isReady = false;

var ctorAddr = null;
var scheduleAddr = null;
var ctor = null;
var schedule = null;

var savedSlots = {};

var actionToSlot = {
    "defaultDance_1": "1",
    "defaultDance_2": "2",
    "defaultDance_3": "3",
    "defaultDance_4": "4",
    "cryPose": "cry",
    "angryPose": "angry"
};

var myAvatarObject = null;
var setAnimationFunc = null;

var changeStatusCtor = null;
var createRelCtor = null;
var capturedMapData = null;

var isAllowedToKick = false;

var isModdingActive = false;
var box_buttonobjmenu = null;

function waitForModule(callback) {
    var interval = setInterval(function() {
        var addr = Module.findBaseAddress(moduleName);
        if (addr) {
            clearInterval(interval);
            console.log("[+] Lib loaded: " + addr);
            callback(addr);
        }
    }, 1000);
}

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
        var len = text.length;
        if (len > 22) len = 22;
        for (var i = 0; i < 24; i++) addr.add(i).writeU8(0);
        addr.writeU8(len << 1);
        addr.add(1).writeUtf8String(text);
    } catch(e) {}
}

function writeRawString(addr, text) {
    if (addr.isNull()) return;
    for (var i = 0; i < 32; i++) addr.add(i).writeU8(0);
    addr.writeU8(text.length << 1);
    addr.add(1).writeUtf8String(text);
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
    var strPtr = Memory.alloc(32);
    for (var i = 0; i < 32; i++) strPtr.add(i).writeU8(0);
    strPtr.writeU8(text.length << 1);
    strPtr.add(1).writeUtf8String(text);
    return strPtr;
}

function safeAssign(strAddr, text) {
    var assignAddr = Module.findExportByName("libc++.so", "_ZNSt3__ndk112basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKc");
    if (assignAddr) {
        new NativeFunction(assignAddr, 'pointer', ['pointer', 'pointer'])(strAddr, Memory.allocUtf8String(text));
    } else {
        writeRawString(strAddr, text);
    }
}

function copyMapData(srcPtr) {
    var data = [];
    try {
        for (var i = 0; i < 64; i++) data.push(srcPtr.add(i).readU8());
        return data;
    } catch(e) { return null; }
}

function createMap() {
    var mapPtr = Memory.alloc(64);
    if (capturedMapData) {
        for (var i = 0; i < 64; i++) mapPtr.add(i).writeU8(capturedMapData[i]);
    } else {
        for (var i = 0; i < 64; i++) mapPtr.add(i).writeU8(0);
        mapPtr.add(0x20).writeU8(0x00);
        mapPtr.add(0x21).writeU8(0x00);
        mapPtr.add(0x22).writeU8(0x80);
        mapPtr.add(0x23).writeU8(0x3f);
    }
    return mapPtr;
}

function toast(msg) { console.log("[TOAST] " + msg); }
function giftLog(msg) { console.log("[GIFT] " + msg); }

function playClick() {
    var addr = get_func("_ZN12SoundManager14playClickSoundEv");
    if (addr) new NativeFunction(addr, 'void', [])();
}

function getAgsClient() {
    var agsclientAddr = get_func("_ZN9SingletonIN3ags6ClientEE11getInstanceEv");
    if (agsclientAddr) return new NativeFunction(agsclientAddr, 'pointer', [])();
}

function getPlayerID() {
    try { return readStdString(getAgsClient()); } catch (e) { return ""; }
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
    }
}

function follow(targetId) {
    targetId = targetId.toString();
    if (!globalProcessor) return;
    var followAddr = get_func("_ZN3ags14PlayersCommand20PlayersFollowRequestC1ENSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE");
    if (!followAddr) followAddr = get_func("_ZN3ags14PlayersCommand20PlayersFollowRequestC2ENSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE");
    if (followAddr) {
        var createRequest = new NativeFunction(followAddr, 'void', ['pointer', 'pointer']);
        var idStr = createStdString(targetId);
        var requestBuf = Memory.alloc(256);
        createRequest(requestBuf, idStr);
        schedule(globalProcessor, requestBuf);
    }
}

function smartFinishAll() {
    if (readStdString(getAgsClient().add(32)) != "work") { console.log("[+] Not at work!"); return; }
    if (workObjects.length === 0) { console.log("[!] Move around"); return; }
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
    console.log("[+] Collected: " + cnt);
    workObjects = [];
}

function duplicateRequest(times, delay) {
    if (!savedArgs || !isReady) { console.log('[!] Do Dance 1 first'); return; }
    var sent = 0;
    function sendOne() {
        if (sent >= times) return;
        try {
            var gr = createStdString(savedArgs.group);
            var at = createStdString(savedArgs.action);
            var trg = createStdString(savedArgs.target);
            var requestBuf = Memory.alloc(320);
            ctor(requestBuf, gr, at, trg, savedArgs.roomId, savedArgs.mapData);
            schedule(globalProcessor, requestBuf);
            sent++;
        } catch (e) {}
        setTimeout(sendOne, delay);
    }
    sendOne();
}

function sendRelStatus(uid, status) {
    if (!globalProcessor || !changeStatusCtor) return false;
    try {
        var requestBuf = Memory.alloc(256);
        var uidStr = createStdString(uid.toString());
        var map = createMap();
        changeStatusCtor(requestBuf, uidStr, status, map);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) { return false; }
}

function sendRelCreate(uid, type) {
    if (!globalProcessor || !createRelCtor) return false;
    try {
        var requestBuf = Memory.alloc(256);
        var uidStr = createStdString(uid.toString());
        createRelCtor(requestBuf, uidStr, type);
        schedule(globalProcessor, requestBuf);
        return true;
    } catch (e) { return false; }
}

function chainToFriend(uid, delay) { sendRelStatus(uid, 43); }

waitForModule(function(baseAddr) {

    var giftAddr = get_func("_ZN3ags12TradeCommand15MakeGiftRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEESA_");
    if (giftAddr) {
        Interceptor.attach(giftAddr, {
            onEnter: function(args) {
                if (!GIFT_ENABLED) return;
                var original = readStdString(args[2]);
                giftLog(original + " -> " + GIFT_TARGET);
                writeSSO(args[2], GIFT_TARGET);
            }
        });
        giftLog("[+] Active -> " + GIFT_TARGET);
    }

    var addActionAddr = get_func("_ZN14MyAvatarObject9addActionEP11ActorActionii");
    if (addActionAddr) {
        Interceptor.attach(addActionAddr, {
            onEnter: function(args) {
                var actionPtr = args[1];
                if (actionPtr.isNull()) return;
                var vtable = actionPtr.readPointer();
                if (validVTable === null) {
                    try {
                        var checkAction = readStdString(actionPtr.add(296));
                        if (checkAction && checkAction.length > 1 && checkAction.indexOf("Walk") === -1 && checkAction.indexOf("Run") === -1) {
                            validVTable = vtable;
                        } else { return; }
                    } catch(e) { return; }
                }
                if (!vtable.equals(validVTable)) return;
                if (isLocked && nextNet) {
                    writeSSO(actionPtr.add(272), nextNet.gr);
                    writeSSO(actionPtr.add(296), nextNet.at);
                }
            }
        });
    }

    ctorAddr = get_func("_ZN3ags11RoomCommand29RoomAvatarCustomActionRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEESA_SA_SA_RKNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE");
    scheduleAddr = get_func("_ZN3ags16CommandProcessor15scheduleRequestERKNS_10AGSRequestE");
    if (ctorAddr && scheduleAddr) {
        ctor = new NativeFunction(ctorAddr, 'void', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer']);
        schedule = new NativeFunction(scheduleAddr, 'void', ['pointer', 'pointer']);
    }

    var changeStatusAddr = get_func("_ZN3ags16RelationsCommand28RelationsChangeStatusRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEiNS2_13unordered_mapIS8_N7cocos2d5ValueENS2_4hashIS8_EENS2_8equal_toIS8_EENS6_INS2_4pairIS9_SD_EEEEEE");
    if (changeStatusAddr) {
        changeStatusCtor = new NativeFunction(changeStatusAddr, 'void', ['pointer', 'pointer', 'int', 'pointer']);
        Interceptor.attach(changeStatusAddr, { onEnter: function(args) { var m = copyMapData(args[3]); if (m) capturedMapData = m; } });
    }

    var createRelAddr = get_func("_ZN3ags16RelationsCommand22RelationsCreateRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEi");
    if (createRelAddr) createRelCtor = new NativeFunction(createRelAddr, 'void', ['pointer', 'pointer', 'int']);

    var setAnimAddr = get_func("_ZN12AvatarObject12setAnimationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_b");
    if (setAnimAddr) {
        setAnimationFunc = new NativeFunction(setAnimAddr, 'void', ['pointer', 'pointer', 'pointer', 'bool']);
        Interceptor.attach(setAnimAddr, { onEnter: function(args) { if (!myAvatarObject) myAvatarObject = args[0]; } });
    }

    if (ctorAddr) {
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
                    savedArgs = { group: savedSlots[slot].gr, action: savedSlots[slot].at, target: originalTarget, roomId: args[4], mapData: args[5] };
                } else {
                    savedArgs = { group: originalGroup, action: originalAction, target: originalTarget, roomId: args[4], mapData: args[5] };
                }
                if (needLocalAnim) setTimeout(function() { playLocalAnimation(needLocalAnim); }, 100);
                if (repeatCount > 0) { var cnt = repeatCount; repeatCount = 0; setTimeout(function() { duplicateRequest(cnt, 50); }, 100); }
            }
        });
    }

    Interceptor.attach(scheduleAddr, { onEnter: function(args) { if (!globalProcessor) { globalProcessor = args[0]; isReady = true; } } });

    var isTouchAddr = get_func("_ZN10WorkObject15isTouchOnObjectEPN7cocos2d5TouchE");
    if (isTouchAddr) Interceptor.attach(isTouchAddr, { onEnter: function(args) { if (workObjects.indexOf(args[0]) === -1) workObjects.push(args[0]); } });

    var changeLocAddr = get_func("_ZN13WorkGameScene14changeLocationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_S8_");
    if (changeLocAddr) Interceptor.attach(changeLocAddr, { onEnter: function() { workObjects = []; myAvatarObject = null; } });

    var getTextAddr = get_func("_ZN19LocalizationManager7getTextERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEE");
    if (getTextAddr) Interceptor.attach(getTextAddr, { onEnter: function(args) { this.key = readStdString(args[1]); }, onLeave: function(retval) { if (isModdingActive && this.key === "ticTacActionLabel") safeAssign(retval, "Friend Exploit"); } });

    var setCallbackAddr = get_func("_ZN16ObjectMenuButton23setDefaultCallbackByTagE18OBJECT_MENU_BUTTON");
    if (setCallbackAddr) Interceptor.attach(setCallbackAddr, { onEnter: function(args) { if (isModdingActive && args[1].toInt32() === 62) { args[1] = ptr(1); box_buttonobjmenu = args[0]; } } });

    var customActionAddr = get_func("_ZN16ObjectMenuButton16onSitDownPressedEv");
    if (customActionAddr) {
        Interceptor.attach(customActionAddr, {
            onEnter: function(args) {
                var btn = args[0];
                if (box_buttonobjmenu && ptr(box_buttonobjmenu).toString() === ptr(btn).toString()) {
                    var player_id = null;
                    try { var subObj = btn.add(824).readPointer(); if (!subObj.isNull()) { var targetAvatar = subObj.add(744).readPointer(); if (!targetAvatar.isNull()) player_id = readStdString(targetAvatar.add(752)); } } catch (e) {}
                    if (player_id) chainToFriend(player_id, 2500);
                    box_buttonobjmenu = null;
                }
            }
        });
    }

    var getTextAddr2 = get_func("_ZN9GameScene14isHouseOwnerMeEv");
    if (getTextAddr2) Interceptor.attach(getTextAddr2, { onLeave: function(retval) { if (isAllowedToKick) retval.replace(1); } });

    var fillMenuAddr22 = get_func("_ZN9GameScene7onEnterEv");
    if (fillMenuAddr22) Interceptor.attach(fillMenuAddr22, { onEnter: function() { isAllowedToKick = false; }, onLeave: function() { setTimeout(function() { isAllowedToKick = true; }, 100); } });

    var fillMenuAddr = get_func("_ZN17ObjectMenuManager17fillMenuForObjectER17ObjectMenuContentRKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEESA_");
    if (fillMenuAddr) {
        Interceptor.attach(fillMenuAddr, {
            onEnter: function(args) { this.contentPtr = args[1]; if (readStdString(args[2]) === "avatar") isModdingActive = true; },
            onLeave: function(retval) {
                if (isModdingActive) {
                    var start = this.contentPtr.readPointer();
                    var end = this.contentPtr.add(8).readPointer();
                    Memory.copy(end, start, 288);
                    end.writeU32(62);
                    writeRawString(end.add(0x38), "action_PosterBuddy_icon");
                    this.contentPtr.add(8).writePointer(end.add(288));
                }
                setTimeout(function() { isModdingActive = false; }, 100);
            }
        });
    }

    var clientsendAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
    if (clientsendAddr) {
        Interceptor.attach(clientsendAddr, {
            onEnter: function(args) {
                var msg = readStdString(args[1]).trim();
                if (readStdString(args[0]) != getPlayerID()) return;
                if (msg.indexOf("!") === 0) patchExistingString(args[1], "");
                var parts = msg.split(" ");
                var cmd = parts[0];
                var uid = parts[1];

                if (cmd === "!debug") { openDebugMenu(); playClick(); }
                if (cmd === "!click") playClick();
                if (cmd === "!work") smartFinishAll();
                if (cmd === "!gift" && uid) { GIFT_TARGET = uid; GIFT_ENABLED = true; }
                if (cmd === "!giftoff") GIFT_ENABLED = false;
                if (cmd === "!gifton") GIFT_ENABLED = true;
                if (cmd === "!guitar") { nextNet = { gr: "skygacha26_guitar_off", at: "PlayGuitNew1" }; isLocked = true; validVTable = null; }
                if (cmd === "!tree") { nextNet = { gr: "ny26_xmastree", at: "NY26joy" }; isLocked = true; validVTable = null; }
                if (cmd === "!dj") { nextNet = { gr: "danceroom_djpult_off", at: "Dj" }; isLocked = true; validVTable = null; }
                if (cmd === "!setAnim" && parts.length >= 3) { nextNet = { gr: parts[1], at: parts[2] }; isLocked = true; validVTable = null; }
                if (cmd === "!off") { nextNet = null; isLocked = false; repeatCount = 0; validVTable = null; }
                if (cmd === "!follow" && uid) follow(uid);
                if (cmd === "!rep" && uid) repeatCount = Math.min(parseInt(uid) || 10, 100);
                if (cmd === "!dupe" && uid) duplicateRequest(parseInt(uid) || 20, 200);
                if (cmd === "!dupe" && !uid) duplicateRequest(20, 50);
                if (cmd === "!xmas_dupe" && uid) { nextNet = { gr: "ny26_xmastree", at: "NY26joy" }; isLocked = true; validVTable = null; duplicateRequest(parseInt(uid) || 10, 800); }
                if (cmd === "!getEnergy" && uid) { nextNet = { gr: "refrigerator", at: "use" }; isLocked = true; validVTable = null; duplicateRequest(parseInt(uid) || 1, 1000); }
                if (cmd === "!setEnergy" && uid) { nextNet = { gr: "refrigerator", at: "use" }; isLocked = true; validVTable = null; duplicateRequest(Math.round((parseInt(uid) || 50) / 50), 1000); }
                if (cmd === "!save" && uid && nextNet) savedSlots[uid] = { gr: nextNet.gr, at: nextNet.at, visual: parts[2] || "Dance1" };
                if (cmd === "!del" && uid && savedSlots[uid]) delete savedSlots[uid];
                if (cmd === "!clear") savedSlots = {};
                if (cmd === "!anim" && uid) playLocalAnimation(uid);
                if (cmd === "!tofriend" && uid) chainToFriend(uid, 2500);
            }
        });
    }

    console.log("[+] ========== SCRIPT READY ==========");
});
