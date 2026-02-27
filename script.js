/**
 * Frida Script: Ghost Mode v4.0 - FIXED
 * Target: libMyGame.so
 *
 * BUG FIX: State requests were being blocked AFTER coordinates were faked.
 *   The server never received the fake position, so the player stayed visible.
 *   Fix: State requests now pass through with faked coords. Only move requests are blocked.
 */

const moduleName = "libMyGame.so";

function waitForModule() {
    var base = Module.findBaseAddress(moduleName);
    if (!base) { setTimeout(waitForModule, 500); return; }
    console.log("[+] Module loaded: " + base);
    initScript();
}

function initScript() {

    // =========================================================
    // GLOBAL VARIABLES
    // =========================================================
    var globalProcessor = null;
    var schedule = null;

    var myPlayerId = "";
    var currentRoomId = "";

    var pinnedMemory = [];
    function pinMem(ptr) {
        pinnedMemory.push(ptr);
        if (pinnedMemory.length > 3000) pinnedMemory.shift();
        return ptr;
    }

    // =========================================================
    // GHOST MODE DATA
    // =========================================================
    var ghostData = {
        uid: "",
        realX: 0, realY: 0,
        fakeX: -9999, fakeY: -9999,
        dir: 1,
        state: 0,
        action: "",
        roomStr: null,
        ghostMode: false,
        savedPos: { x: 0, y: 0 },
        blockedMoves: 0,
        blockedStates: 0
    };

    var blockedRequests = {};
    var blockMoveRequests = false;

    // =========================================================
    // CORE FUNCTION ADDRESSES
    // =========================================================
    const RoomAvatarUpdateStateRequest_C1 = Module.findExportByName(moduleName,
        "_ZN3ags11RoomCommand28RoomAvatarUpdateStateRequestC1ERKNS0_21AvatarUpdateStateDataERKNSt6__ndk112basic_stringIcNS5_11char_traitsIcEENS5_9allocatorIcEEEE");

    const RoomAvatarMoveRequest_C1 = Module.findExportByName(moduleName,
        "_ZN3ags11RoomCommand21RoomAvatarMoveRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEN7cocos2d4Vec2ESC_SA_");

    const scheduleRequestAddr = Module.findExportByName(moduleName,
        "_ZN3ags16CommandProcessor15scheduleRequestERKNS_10AGSRequestE");

    console.log("[*] RoomAvatarUpdateStateRequest: " + RoomAvatarUpdateStateRequest_C1);
    console.log("[*] RoomAvatarMoveRequest: " + RoomAvatarMoveRequest_C1);
    console.log("[*] scheduleRequest: " + scheduleRequestAddr);

    // =========================================================
    // ALERT SYSTEM
    // =========================================================
    var pendingTasks = [];
    var mainLoopAddr = Module.findExportByName(moduleName, "_ZN7cocos2d8Director8mainLoopEv");
    if (mainLoopAddr) {
        Interceptor.attach(mainLoopAddr, {
            onEnter: function (args) {
                while (pendingTasks.length > 0) {
                    var task = pendingTasks.shift();
                    try { task(); } catch (e) { }
                }
            }
        });
    }

    var dmSingletonAddr = Module.findExportByName(moduleName, "_ZN9SingletonI13DialogManagerE10m_instanceE");
    var showAlertBoxAddr = Module.findExportByName(moduleName, "_ZN13DialogManager12showAlertBoxERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_RKNS0_8functionIFvvEEE");
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
        pendingTasks.push(function () {
            try {
                var dm = dmSingletonAddr.readPointer();
                if (dm.isNull()) return;
                alertKeepAlive = [];
                var t = makeAlertString(title || "");
                var m = makeAlertString(message || "");
                var e = Memory.alloc(48);
                for (var i = 0; i < 48; i += 8) e.add(i).writeU64(0);
                alertKeepAlive.push(e);
                new NativeFunction(showAlertBoxAddr, 'void', ['pointer', 'pointer', 'pointer', 'pointer'])(dm, t, m, e);
            } catch (e) { }
        });
    }

    // =========================================================
    // UTILS
    // =========================================================
    function get_func(name) { return Module.findExportByName(moduleName, name); }

    function readStdString(addr) {
        if (!addr || addr.isNull()) return "";
        try {
            var b = addr.readU8();
            if ((b & 1) === 0) return addr.add(1).readUtf8String(b >> 1);
            var len = Number(addr.add(8).readU64());
            if (len === 0 || len > 10000) return "";
            var dataPtr = addr.add(16).readPointer();
            if (dataPtr.isNull()) return "";
            return dataPtr.readUtf8String(len);
        } catch (e) { return ""; }
    }

    function createStdString(str) {
        var mem = Memory.alloc(24);
        var len = str.length;
        if (len <= 22) {
            mem.writeU8(len << 1);
            for (var i = 0; i < len; i++) {
                mem.add(1 + i).writeU8(str.charCodeAt(i));
            }
            mem.add(1 + len).writeU8(0);
        } else {
            var strData = Memory.allocUtf8String(str);
            mem.writeU8(1);
            mem.add(8).writeU64(len);
            mem.add(16).writePointer(strData);
        }
        return mem;
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

    function getPlayerID() {
        try {
            var addr = get_func("_ZN9SingletonIN3ags6ClientEE11getInstanceEv");
            if (!addr) return "";
            var client = new NativeFunction(addr, 'pointer', [])();
            if (!client || client.isNull()) return "";
            return readStdString(client);
        } catch (e) { return ""; }
    }

    function getCmdProcessor() {
        var addr = get_func("_ZN9SingletonIN3ags16CommandProcessorEE11getInstanceEv");
        if (addr) return new NativeFunction(addr, 'pointer', [])();
        return null;
    }

    // =========================================================
    // GHOST MODE FUNCTIONS
    // =========================================================
    function sendStatePacket(uid, x, y, dir, action, state) {
        var cp = getCmdProcessor();
        if (!cp) { console.log("[!] No CommandProcessor"); return false; }
        if (!ghostData.roomStr) { console.log("[!] No room data. Move first!"); return false; }
        if (!RoomAvatarUpdateStateRequest_C1) { console.log("[!] No StateRequest constructor"); return false; }

        // Temporarily disable blocking so our packet goes through
        var wasBlocking = blockMoveRequests;
        var wasGhost = ghostData.ghostMode;
        blockMoveRequests = false;
        ghostData.ghostMode = false;

        var stateData = Memory.alloc(128);
        for (var i = 0; i < 128; i++) stateData.add(i).writeU8(0);

        Memory.copy(stateData, createStdString(String(uid)), 24);
        stateData.add(24).writeFloat(x);
        stateData.add(28).writeFloat(y);
        stateData.add(32).writeS32(dir);
        Memory.copy(stateData.add(40), createStdString(String(action)), 24);
        stateData.add(64).writeS32(state);

        var requestObj = Memory.alloc(512);
        for (var i = 0; i < 512; i++) requestObj.add(i).writeU8(0);

        var constructor = new NativeFunction(RoomAvatarUpdateStateRequest_C1,
            'void', ['pointer', 'pointer', 'pointer']);

        try {
            constructor(requestObj, stateData, ghostData.roomStr);
            schedule(cp, requestObj);
            blockMoveRequests = wasBlocking;
            ghostData.ghostMode = wasGhost;
            return true;
        } catch(e) {
            console.log("[!] Error: " + e.message);
            blockMoveRequests = wasBlocking;
            ghostData.ghostMode = wasGhost;
            return false;
        }
    }

    function teleportTo(x, y) {
        if (!ghostData.uid) {
            console.log("[!] No UID. Move first!");
            return;
        }

        if (sendStatePacket(ghostData.uid, x, y, ghostData.dir, "", 0)) {
            console.log("[TP] Teleported to (" + x.toFixed(1) + ", " + y.toFixed(1) + ")");
        }
    }

    // =========================================================
    // CONSOLE COMMANDS
    // =========================================================

    // --- Ghost Mode ---
    global.ghost = function(enable) {
        if (enable === false) {
            ghostData.ghostMode = false;
            blockMoveRequests = false;

            console.log("[GHOST OFF]");
            console.log("  Blocked moves:  " + ghostData.blockedMoves);
            console.log("  Faked states:   " + ghostData.blockedStates);

            ghostData.blockedMoves = 0;
            ghostData.blockedStates = 0;

            if (ghostData.savedPos.x !== 0 || ghostData.savedPos.y !== 0) {
                teleportTo(ghostData.savedPos.x, ghostData.savedPos.y);
                console.log("  Returned to (" + ghostData.savedPos.x.toFixed(1) + ", " + ghostData.savedPos.y.toFixed(1) + ")");
            }
            showAlert("Ghost", "Ghost OFF\nReturned to (" + ghostData.savedPos.x.toFixed(0) + ", " + ghostData.savedPos.y.toFixed(0) + ")");
            return;
        }

        if (!ghostData.uid || ghostData.realX === 0) {
            console.log("[!] No data captured. Move your avatar first!");
            showAlert("Ghost", "Move first!");
            return;
        }

        // Save current position
        ghostData.savedPos.x = ghostData.realX;
        ghostData.savedPos.y = ghostData.realY;

        // Send fake position to server
        sendStatePacket(ghostData.uid, ghostData.fakeX, ghostData.fakeY, ghostData.dir, "", 0);

        // Now enable blocking for moves, ghost faking for states
        ghostData.ghostMode = true;
        blockMoveRequests = true;

        console.log("\n[GHOST MODE ACTIVATED]");
        console.log("=".repeat(50));
        console.log("  Saved position: (" + ghostData.savedPos.x.toFixed(1) + ", " + ghostData.savedPos.y.toFixed(1) + ")");
        console.log("  Fake position:  (" + ghostData.fakeX + ", " + ghostData.fakeY + ")");
        console.log("  All move requests are BLOCKED");
        console.log("  State requests sent with FAKE coordinates");
        console.log("=".repeat(50) + "\n");
        showAlert("Ghost", "Ghost ON!\nYou are invisible\nMoves blocked, states faked");
    };

    global.ghostPos = function(x, y) {
        ghostData.fakeX = x;
        ghostData.fakeY = y;
        console.log("[GHOST] Fake position set: (" + x + ", " + y + ")");
        if (ghostData.ghostMode) {
            sendStatePacket(ghostData.uid, ghostData.fakeX, ghostData.fakeY, ghostData.dir, "", 0);
        }
    };

    // --- Teleport ---
    global.tp = function(x, y) {
        teleportTo(x, y);
    };

    global.tpRel = function(dx, dy) {
        teleportTo(ghostData.realX + dx, ghostData.realY + dy);
    };

    global.save = function() {
        ghostData.savedPos.x = ghostData.realX;
        ghostData.savedPos.y = ghostData.realY;
        console.log("[SAVE] (" + ghostData.realX.toFixed(1) + ", " + ghostData.realY.toFixed(1) + ")");
        showAlert("Ghost", "Position saved\n(" + ghostData.realX.toFixed(0) + ", " + ghostData.realY.toFixed(0) + ")");
    };

    global.back = function() {
        if (ghostData.savedPos.x !== 0 || ghostData.savedPos.y !== 0) {
            teleportTo(ghostData.savedPos.x, ghostData.savedPos.y);
        } else {
            console.log("[!] No saved position");
            showAlert("Ghost", "No saved position");
        }
    };

    global.off = function() {
        if (ghostData.ghostMode) ghost(false);
        showAlert("Ghost", "Everything off");
    };

    // --- Info ---
    global.info = function() {
        console.log("\n" + "=".repeat(50));
        console.log("STATUS");
        console.log("=".repeat(50));
        console.log("UID:            " + ghostData.uid);
        console.log("Real position:  (" + ghostData.realX.toFixed(2) + ", " + ghostData.realY.toFixed(2) + ")");
        console.log("Saved position: (" + ghostData.savedPos.x.toFixed(2) + ", " + ghostData.savedPos.y.toFixed(2) + ")");
        console.log("Direction:      " + ghostData.dir);
        console.log("");
        console.log("GHOST MODE:     " + (ghostData.ghostMode ? "ON" : "OFF"));
        console.log("Block moves:    " + (blockMoveRequests ? "YES" : "NO"));
        console.log("Fake position:  (" + ghostData.fakeX + ", " + ghostData.fakeY + ")");
        console.log("Blocked moves:  " + ghostData.blockedMoves);
        console.log("Faked states:   " + ghostData.blockedStates);
        console.log("");
        console.log("ROOM:           " + currentRoomId);
        console.log("=".repeat(50) + "\n");
    };

    global.help = function() {
        console.log("\n" + "=".repeat(50));
        console.log("Ghost Mode v4.0 - Commands");
        console.log("=".repeat(50));
        console.log("");
        console.log("GHOST:");
        console.log("  ghost()         - Enable (become invisible)");
        console.log("  ghost(false)    - Disable (return to saved pos)");
        console.log("  ghostPos(x,y)   - Change fake position");
        console.log("");
        console.log("TELEPORT:");
        console.log("  tp(x, y)        - Teleport to coordinates");
        console.log("  tpRel(dx, dy)   - Relative teleport");
        console.log("  save()          - Save current position");
        console.log("  back()          - Return to saved position");
        console.log("");
        console.log("INFO:");
        console.log("  info()          - Show status");
        console.log("  off()           - Turn everything off");
        console.log("=".repeat(50) + "\n");
    };

    // =========================================================
    // HOOK: scheduleRequest - REPLACE FOR BLOCKING MOVES
    // =========================================================
    if (scheduleRequestAddr) {
        var originalSchedule = new NativeFunction(scheduleRequestAddr, 'void', ['pointer', 'pointer']);
        schedule = originalSchedule;

        Interceptor.replace(scheduleRequestAddr, new NativeCallback(function(processor, request) {
            // Capture processor
            if (!globalProcessor) {
                globalProcessor = processor;
                console.log("[+] Processor captured!");
            }

            // Extract room from request
            try {
                for (var off = 24; off <= 200; off += 8) {
                    var str = readStdString(request.add(off));
                    if (str && str.indexOf(":") !== -1) currentRoomId = str;
                }
            } catch (e) { }

            // Check if this request is marked for blocking (move requests only)
            var reqKey = request.toString();
            if (blockedRequests[reqKey]) {
                delete blockedRequests[reqKey];
                ghostData.blockedMoves++;
                console.log("[GHOST BLOCKED MOVE #" + ghostData.blockedMoves + "]");
                return; // Don't call original
            }

            // Pass through to original
            originalSchedule(processor, request);

        }, 'void', ['pointer', 'pointer']));

        console.log("[+] scheduleRequest replaced");
    }

    // =========================================================
    // HOOK: RoomAvatarMoveRequest - BLOCK MOVES IN GHOST MODE
    // =========================================================
    if (RoomAvatarMoveRequest_C1) {
        Interceptor.attach(RoomAvatarMoveRequest_C1, {
            onEnter: function(args) {
                this.reqPtr = args[0];

                var uid = readStdString(args[1]);

                // Capture player ID
                if (uid && /^\d{3,20}$/.test(uid) && !myPlayerId) {
                    myPlayerId = uid;
                    ghostData.uid = uid;
                    console.log("[+] My ID: " + myPlayerId);
                }
            },
            onLeave: function() {
                // In ghost mode: mark move requests for blocking
                if (blockMoveRequests && this.reqPtr) {
                    blockedRequests[this.reqPtr.toString()] = true;
                    console.log("[GHOST] Move request marked for blocking");
                }
            }
        });
        console.log("[+] RoomAvatarMoveRequest hooked");
    }

    // =========================================================
    // HOOK: RoomAvatarUpdateStateRequest - FAKE COORDS (NOT BLOCK)
    //
    // FIX: Previously this hook also marked state requests for
    // blocking in onLeave, which meant the faked coordinates
    // never reached the server. Now state requests pass through
    // with faked coords so the server sees the fake position.
    // =========================================================
    if (RoomAvatarUpdateStateRequest_C1) {
        Interceptor.attach(RoomAvatarUpdateStateRequest_C1, {
            onEnter: function(args) {
                this.reqPtr = args[0];
                var stateData = args[1];
                var roomStr = args[2];

                // Capture room string
                if (!ghostData.roomStr) {
                    ghostData.roomStr = Memory.alloc(24);
                    Memory.copy(ghostData.roomStr, roomStr, 24);
                    console.log("[+] Room string captured!");
                }

                // Read real data
                ghostData.uid = readStdString(stateData.add(0));
                ghostData.realX = stateData.add(24).readFloat();
                ghostData.realY = stateData.add(28).readFloat();
                ghostData.dir = stateData.add(32).readS32();
                ghostData.action = readStdString(stateData.add(40));
                ghostData.state = stateData.add(64).readS32();

                // Ghost mode: replace coordinates with fake ones
                // The request will NOT be blocked - it goes to the server with fake coords
                if (ghostData.ghostMode && blockMoveRequests) {
                    stateData.add(24).writeFloat(ghostData.fakeX);
                    stateData.add(28).writeFloat(ghostData.fakeY);
                    ghostData.blockedStates++;
                    console.log("[GHOST FAKE STATE #" + ghostData.blockedStates + "] (" +
                        ghostData.realX.toFixed(0) + "," + ghostData.realY.toFixed(0) + ") -> (" +
                        ghostData.fakeX + "," + ghostData.fakeY + ")");
                }
            }
            // FIX: No onLeave blocking! State requests must reach the server
            // with faked coordinates. Only move requests get blocked.
        });
        console.log("[+] RoomAvatarUpdateStateRequest hooked");
    }

    // =========================================================
    // CHAT HANDLER (for in-game commands)
    // =========================================================
    var clientsendAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
    if (clientsendAddr) {
        Interceptor.attach(clientsendAddr, {
            onEnter: function (args) {
                var msg = readStdString(args[1]).trim();
                var myId = getPlayerID();
                var senderId = "";
                try { senderId = readStdString(args[0]); } catch (e) { }
                if (myId && senderId && senderId !== myId) return;
                if (msg.indexOf("!") === 0) patchExistingString(args[1], "");

                var parts = msg.split(" ");
                var cmd = parts[0];
                var arg1 = parts[1];
                var arg2 = parts[2];

                if (cmd === "!ghost") { ghost(); }
                if (cmd === "!unghost") { ghost(false); }
                if (cmd === "!ghostpos" && arg1 && arg2) { ghostPos(parseFloat(arg1), parseFloat(arg2)); }
                if (cmd === "!tp" && arg1 && arg2) { tp(parseFloat(arg1), parseFloat(arg2)); }
                if (cmd === "!tprel" && arg1 && arg2) { tpRel(parseFloat(arg1), parseFloat(arg2)); }
                if (cmd === "!save") { save(); }
                if (cmd === "!back") { back(); }
                if (cmd === "!off") { off(); }
                if (cmd === "!info") { info(); }
                if (cmd === "!status") {
                    showAlert("Ghost",
                        "Ghost: " + (ghostData.ghostMode ? "ON" : "OFF") + "\n" +
                        "Blocked moves: " + ghostData.blockedMoves + "\n" +
                        "Faked states: " + ghostData.blockedStates + "\n" +
                        "Pos: (" + ghostData.realX.toFixed(0) + "," + ghostData.realY.toFixed(0) + ")");
                }
                if (cmd === "!help") {
                    showAlert("Ghost",
                        "=== GHOST ===\n!ghost !unghost\n!ghostpos x y\n\n" +
                        "=== TP ===\n!tp x y\n!save !back\n\n" +
                        "=== OTHER ===\n!off !info !status");
                }
            }
        });
        console.log("[+] Chat hooked!");
    }

    globalProcessor = getCmdProcessor();

    // =========================================================
    // STARTUP MESSAGE
    // =========================================================
    console.log("\n==========================================================");
    console.log(" Ghost Mode v4.0 - FIXED");
    console.log("==========================================================");
    console.log(" Ghost Mode:  OK (state requests pass with fake coords)");
    console.log(" Teleport:    OK");
    console.log("");
    console.log(" HOW TO USE:");
    console.log("   1. Walk around (captures data)");
    console.log("   2. ghost()      - become invisible");
    console.log("   3. Walk around  - others can't see you");
    console.log("   4. ghost(false) - return to saved position");
    console.log("");
    console.log(" help() - all commands");
    console.log("==========================================================\n");
}

waitForModule();
