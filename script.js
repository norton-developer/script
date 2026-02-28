/**
 * Frida Script: Ghost Mode v5.1
 * Target: libMyGame.so
 *
 * v5.1 фиксы:
 *   - FIX: sendStatePacket больше не перезаписывает realX/realY фейковыми координатами
 *   - FIX: pin buffer восстановлен до 3000 (было 1000 — могло вызвать краш при GC)
 *   - FIX: createStdString корректно пишет capacity для длинных строк
 *   - FIX: state faking пропускается для наших внутренних пакетов
 *   - Добавлена команда debug() для диагностики
 *   - Логи блокировок и фейков (первые 3 + каждый 50-й)
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
    // ПЕРЕМЕННЫЕ
    // =========================================================
    var globalProcessor = null;
    var schedule = null;
    var myPlayerId = "";
    var currentRoomId = "";

    var pinnedMemory = [];
    function pin(ptr) {
        pinnedMemory.push(ptr);
        if (pinnedMemory.length > 3000) pinnedMemory.shift();
        return ptr;
    }

    // =========================================================
    // ДАННЫЕ GHOST MODE
    // =========================================================
    var ghost = {
        uid: "",
        // Реальная позиция (обновляется всегда из хуков)
        realX: 0, realY: 0,
        // Позиция назначения из MoveRequest (куда идём)
        destX: 0, destY: 0,
        // Фейковая позиция для сервера
        fakeX: -9999, fakeY: -9999,
        dir: 1,
        roomStr: null,
        active: false,
        // Позиция при включении ghost (для save/back)
        startX: 0, startY: 0,
        // Счётчики
        blockedMoves: 0,
        fakedStates: 0
    };

    var blockedRequests = {};
    var blockMoves = false;
    var internalPacket = false; // флаг: наш пакет, не обновлять realX/realY

    // =========================================================
    // АДРЕСА ФУНКЦИЙ
    // =========================================================
    const StateRequestCtor = Module.findExportByName(moduleName,
        "_ZN3ags11RoomCommand28RoomAvatarUpdateStateRequestC1ERKNS0_21AvatarUpdateStateDataERKNSt6__ndk112basic_stringIcNS5_11char_traitsIcEENS5_9allocatorIcEEEE");

    const MoveRequestCtor = Module.findExportByName(moduleName,
        "_ZN3ags11RoomCommand21RoomAvatarMoveRequestC1ERKNSt6__ndk112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEN7cocos2d4Vec2ESC_SA_");

    const scheduleRequestAddr = Module.findExportByName(moduleName,
        "_ZN3ags16CommandProcessor15scheduleRequestERKNS_10AGSRequestE");

    console.log("[*] StateRequest: " + StateRequestCtor);
    console.log("[*] MoveRequest:  " + MoveRequestCtor);
    console.log("[*] schedule:     " + scheduleRequestAddr);

    // =========================================================
    // АЛЕРТЫ
    // =========================================================
    var pendingTasks = [];
    var mainLoopAddr = Module.findExportByName(moduleName, "_ZN7cocos2d8Director8mainLoopEv");
    if (mainLoopAddr) {
        Interceptor.attach(mainLoopAddr, {
            onEnter: function () {
                while (pendingTasks.length > 0) {
                    try { pendingTasks.shift()(); } catch (e) { }
                }
            }
        });
    }

    var dmSingleton = Module.findExportByName(moduleName, "_ZN9SingletonI13DialogManagerE10m_instanceE");
    var showAlertBox = Module.findExportByName(moduleName, "_ZN13DialogManager12showAlertBoxERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_RKNS0_8functionIFvvEEE");
    var alertKeep = [];

    function makeAlertStr(str) {
        var encoded = Memory.allocUtf8String(str);
        var byteLen = 0;
        while (encoded.add(byteLen).readU8() !== 0) byteLen++;
        var cap = byteLen + 32;
        var buf = Memory.alloc(cap);
        Memory.copy(buf, encoded, byteLen);
        buf.add(byteLen).writeU8(0);
        alertKeep.push(buf);
        var mem = Memory.alloc(24);
        mem.writeU64(cap | 1);
        mem.add(8).writeU64(byteLen);
        mem.add(16).writePointer(buf);
        alertKeep.push(mem);
        return mem;
    }

    function showAlert(title, message) {
        if (!dmSingleton || !showAlertBox) return;
        pendingTasks.push(function () {
            try {
                var dm = dmSingleton.readPointer();
                if (dm.isNull()) return;
                alertKeep = [];
                var t = makeAlertStr(title || "");
                var m = makeAlertStr(message || "");
                var e = Memory.alloc(48);
                for (var i = 0; i < 48; i += 8) e.add(i).writeU64(0);
                alertKeep.push(e);
                new NativeFunction(showAlertBox, 'void', ['pointer', 'pointer', 'pointer', 'pointer'])(dm, t, m, e);
            } catch (e) { }
        });
    }

    // =========================================================
    // УТИЛИТЫ
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
            for (var i = 0; i < len; i++) mem.add(1 + i).writeU8(str.charCodeAt(i));
            mem.add(1 + len).writeU8(0);
        } else {
            var strData = Memory.allocUtf8String(str);
            var cap = len + 1; // capacity = len + null terminator
            mem.writeU64((cap << 1) | 1); // libc++ long string: (cap*2)|1
            mem.add(8).writeU64(len);
            mem.add(16).writePointer(strData);
            pin(strData);
        }
        return pin(mem);
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

    // Для чтения Vec2 из аргументов MoveRequest (два float упакованы в uint64)
    function intBitsToFloat(bits) {
        var buf = new ArrayBuffer(4);
        new Uint32Array(buf)[0] = bits >>> 0;
        return new Float32Array(buf)[0];
    }

    function unpackVec2(arg) {
        try {
            var bigInt = uint64(arg.toString());
            var low32 = Number(bigInt.and(0xFFFFFFFF));
            var high32 = Number(bigInt.shr(32).and(0xFFFFFFFF));
            return { x: intBitsToFloat(low32), y: intBitsToFloat(high32) };
        } catch (e) { return null; }
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
    // ОТПРАВКА ПАКЕТА (телепорт/фейк позиция)
    // =========================================================
    function sendStatePacket(uid, x, y, dir, action, state) {
        var cp = getCmdProcessor();
        if (!cp) { console.log("[!] Нет CommandProcessor"); return false; }
        if (!ghost.roomStr) { console.log("[!] Нет roomStr, походи!"); return false; }
        if (!StateRequestCtor) { console.log("[!] Нет StateRequest конструктора"); return false; }

        // Временно отключаем ghost чтобы наш пакет прошёл без фейка
        var wasBlock = blockMoves;
        var wasGhost = ghost.active;
        blockMoves = false;
        ghost.active = false;

        var stateData = pin(Memory.alloc(128));
        for (var i = 0; i < 128; i++) stateData.add(i).writeU8(0);
        Memory.copy(stateData, createStdString(String(uid)), 24);
        stateData.add(24).writeFloat(x);
        stateData.add(28).writeFloat(y);
        stateData.add(32).writeS32(dir);
        Memory.copy(stateData.add(40), createStdString(String(action)), 24);
        stateData.add(64).writeS32(state);

        var req = pin(Memory.alloc(512));
        for (var i = 0; i < 512; i++) req.add(i).writeU8(0);

        var ctor = new NativeFunction(StateRequestCtor, 'void', ['pointer', 'pointer', 'pointer']);

        try {
            internalPacket = true;
            ctor(req, stateData, ghost.roomStr);
            internalPacket = false;
            schedule(cp, req);
            blockMoves = wasBlock;
            ghost.active = wasGhost;
            return true;
        } catch (e) {
            internalPacket = false;
            console.log("[!] Ошибка: " + e.message);
            blockMoves = wasBlock;
            ghost.active = wasGhost;
            return false;
        }
    }

    function teleportTo(x, y) {
        if (!ghost.uid) { console.log("[!] Нет UID, походи!"); return; }
        if (sendStatePacket(ghost.uid, x, y, ghost.dir, "", 0)) {
            console.log("[TP] -> (" + x.toFixed(1) + ", " + y.toFixed(1) + ")");
        }
    }

    // =========================================================
    // КОНСОЛЬНЫЕ КОМАНДЫ
    // =========================================================

    global.ghost = function(enable) {
        if (enable === false) {
            // === ВЫКЛЮЧЕНИЕ ===
            // Запоминаем последнюю реальную позицию ПЕРЕД отключением
            var returnX = ghost.realX;
            var returnY = ghost.realY;

            ghost.active = false;
            blockMoves = false;

            console.log("\n[GHOST OFF]");
            console.log("  Заблокировано ходьбы: " + ghost.blockedMoves);
            console.log("  Подменено состояний: " + ghost.fakedStates);

            ghost.blockedMoves = 0;
            ghost.fakedStates = 0;

            // Телепорт ТУДА ГДЕ ТЫ БЫЛ ПОСЛЕДНИЙ РАЗ
            if (returnX !== 0 || returnY !== 0) {
                teleportTo(returnX, returnY);
                console.log("  Телепорт -> (" + returnX.toFixed(1) + ", " + returnY.toFixed(1) + ")");
            }
            showAlert("Ghost", "Ghost OFF\nТелепорт -> (" + returnX.toFixed(0) + ", " + returnY.toFixed(0) + ")");
            return;
        }

        // === ВКЛЮЧЕНИЕ ===
        if (!ghost.uid) {
            console.log("[!] Нет данных. Сделай один шаг!");
            showAlert("Ghost", "Сделай один шаг!");
            return;
        }
        if (!ghost.roomStr) {
            console.log("[!] Нет roomStr. Сделай один шаг!");
            showAlert("Ghost", "Сделай один шаг!");
            return;
        }

        // Запоминаем стартовую позицию
        ghost.startX = ghost.realX;
        ghost.startY = ghost.realY;

        // Отправляем фейковую позицию на сервер
        sendStatePacket(ghost.uid, ghost.fakeX, ghost.fakeY, ghost.dir, "", 0);

        // Включаем блокировку ходьбы и фейк состояний
        ghost.active = true;
        blockMoves = true;

        console.log("\n[GHOST ON]");
        console.log("=".repeat(50));
        console.log("  Стартовая позиция: (" + ghost.startX.toFixed(1) + ", " + ghost.startY.toFixed(1) + ")");
        console.log("  Фейк позиция:     (" + ghost.fakeX + ", " + ghost.fakeY + ")");
        console.log("  Ходьба БЛОКИРУЕТСЯ (сервер не видит)");
        console.log("  Состояния ПОДМЕНЯЮТСЯ (фейк координаты)");
        console.log("");
        console.log("  Ходи куда хочешь - другие не видят!");
        console.log("  ghost(false) - телепорт на последнюю позицию");
        console.log("  ghostBack()  - вернуться на стартовую");
        console.log("=".repeat(50));
        showAlert("Ghost", "Ghost ON!\nТы невидим!\nghost(false) = телепорт туда где ты");
    };

    global.ghostPos = function(x, y) {
        ghost.fakeX = x;
        ghost.fakeY = y;
        console.log("[GHOST] Фейк позиция: (" + x + ", " + y + ")");
        if (ghost.active) {
            sendStatePacket(ghost.uid, ghost.fakeX, ghost.fakeY, ghost.dir, "", 0);
        }
    };

    // Вернуться на СТАРТОВУЮ позицию (где включил ghost)
    global.ghostBack = function() {
        if (ghost.startX !== 0 || ghost.startY !== 0) {
            ghost.active = false;
            blockMoves = false;
            ghost.blockedMoves = 0;
            ghost.fakedStates = 0;
            teleportTo(ghost.startX, ghost.startY);
            console.log("[GHOST OFF] Вернулся на старт (" + ghost.startX.toFixed(1) + ", " + ghost.startY.toFixed(1) + ")");
            showAlert("Ghost", "Ghost OFF\nВернулся на старт");
        } else {
            console.log("[!] Нет стартовой позиции");
        }
    };

    global.tp = function(x, y) { teleportTo(x, y); };

    global.tpRel = function(dx, dy) {
        teleportTo(ghost.realX + dx, ghost.realY + dy);
    };

    global.save = function() {
        ghost.startX = ghost.realX;
        ghost.startY = ghost.realY;
        console.log("[SAVE] (" + ghost.realX.toFixed(1) + ", " + ghost.realY.toFixed(1) + ")");
        showAlert("Ghost", "Сохранено\n(" + ghost.realX.toFixed(0) + ", " + ghost.realY.toFixed(0) + ")");
    };

    global.back = function() {
        if (ghost.startX !== 0 || ghost.startY !== 0) {
            teleportTo(ghost.startX, ghost.startY);
        } else {
            console.log("[!] Нет сохранённой позиции");
        }
    };

    global.off = function() {
        if (ghost.active) global.ghost(false);
    };

    global.info = function() {
        console.log("\n" + "=".repeat(50));
        console.log("СТАТУС");
        console.log("=".repeat(50));
        console.log("UID:            " + ghost.uid);
        console.log("Реальная поз:   (" + ghost.realX.toFixed(2) + ", " + ghost.realY.toFixed(2) + ")");
        console.log("Стартовая поз:  (" + ghost.startX.toFixed(2) + ", " + ghost.startY.toFixed(2) + ")");
        console.log("Направление:    " + ghost.dir);
        console.log("");
        console.log("GHOST:          " + (ghost.active ? "ВКЛ" : "ВЫКЛ"));
        console.log("Блокировка:     " + (blockMoves ? "ДА" : "НЕТ"));
        console.log("Фейк позиция:   (" + ghost.fakeX + ", " + ghost.fakeY + ")");
        console.log("Заблокировано:  " + ghost.blockedMoves + " ходьбы, " + ghost.fakedStates + " состояний");
        console.log("");
        console.log("Комната:        " + currentRoomId);
        console.log("=".repeat(50));
    };

    global.pos = function() {
        console.log("[POS] Реальная: (" + ghost.realX.toFixed(2) + ", " + ghost.realY.toFixed(2) + ") | Старт: (" + ghost.startX.toFixed(2) + ", " + ghost.startY.toFixed(2) + ")");
    };

    global.debug = function() {
        console.log("\n" + "=".repeat(50));
        console.log("DEBUG INFO");
        console.log("=".repeat(50));
        console.log("ghost.uid:       " + JSON.stringify(ghost.uid));
        console.log("ghost.roomStr:   " + (ghost.roomStr ? ghost.roomStr.toString() : "null"));
        console.log("ghost.active:    " + ghost.active);
        console.log("blockMoves:      " + blockMoves);
        console.log("internalPacket:  " + internalPacket);
        console.log("ghost.realX/Y:   " + ghost.realX + ", " + ghost.realY);
        console.log("ghost.fakeX/Y:   " + ghost.fakeX + ", " + ghost.fakeY);
        console.log("ghost.startX/Y:  " + ghost.startX + ", " + ghost.startY);
        console.log("ghost.destX/Y:   " + ghost.destX + ", " + ghost.destY);
        console.log("ghost.dir:       " + ghost.dir);
        console.log("myPlayerId:      " + myPlayerId);
        console.log("currentRoomId:   " + currentRoomId);
        console.log("globalProcessor: " + (globalProcessor ? "OK" : "null"));
        console.log("schedule:        " + (schedule ? "OK" : "null"));
        console.log("pinnedMemory:    " + pinnedMemory.length + " items");
        console.log("blockedRequests: " + Object.keys(blockedRequests).length + " pending");
        console.log("StateRequestCtor: " + StateRequestCtor);
        console.log("MoveRequestCtor:  " + MoveRequestCtor);
        console.log("=".repeat(50));
    };

    global.help = function() {
        console.log("\n" + "=".repeat(50));
        console.log("Ghost Mode v5.1 - Команды");
        console.log("=".repeat(50));
        console.log("");
        console.log("GHOST:");
        console.log("  ghost()         - включить (стать невидимым)");
        console.log("  ghost(false)    - выключить -> телепорт ТУДА ГДЕ СТОИШЬ");
        console.log("  ghostBack()     - выключить -> телепорт НА СТАРТ");
        console.log("  ghostPos(x,y)   - изменить фейк позицию");
        console.log("");
        console.log("ТЕЛЕПОРТ:");
        console.log("  tp(x, y)        - телепорт на координаты");
        console.log("  tpRel(dx, dy)   - относительный телепорт");
        console.log("  save()          - сохранить позицию");
        console.log("  back()          - вернуться на сохранённую");
        console.log("");
        console.log("ИНФО:");
        console.log("  info()          - полный статус");
        console.log("  pos()           - текущая позиция");
        console.log("  debug()         - отладочная информация");
        console.log("=".repeat(50));
    };

    // =========================================================
    // ХУК: scheduleRequest - БЛОКИРОВКА ХОДЬБЫ
    // =========================================================
    if (scheduleRequestAddr) {
        var originalSchedule = new NativeFunction(scheduleRequestAddr, 'void', ['pointer', 'pointer']);
        schedule = originalSchedule;

        Interceptor.replace(scheduleRequestAddr, new NativeCallback(function(processor, request) {
            if (!globalProcessor) {
                globalProcessor = processor;
                console.log("[+] Processor захвачен!");
            }

            // Извлекаем room
            try {
                for (var off = 24; off <= 200; off += 8) {
                    var str = readStdString(request.add(off));
                    if (str && str.indexOf(":") !== -1) currentRoomId = str;
                }
            } catch (e) { }

            // Проверяем блокировку (только move requests)
            var key = request.toString();
            if (blockedRequests[key]) {
                delete blockedRequests[key];
                ghost.blockedMoves++;
                if (ghost.blockedMoves <= 3 || ghost.blockedMoves % 50 === 0) {
                    console.log("[GHOST] Блок ходьбы #" + ghost.blockedMoves);
                }
                return; // Не отправляем
            }

            originalSchedule(processor, request);
        }, 'void', ['pointer', 'pointer']));

        console.log("[+] scheduleRequest заменён");
    }

    // =========================================================
    // ХУК: MoveRequest - ЗАХВАТ ДАННЫХ + БЛОКИРОВКА
    //
    // Сигнатура: C1(this, const string& uid, Vec2 dest, Vec2 source, const string& room)
    // ARM64: args[0]=this, args[1]=&uid, args[2]=&room (Vec2 в float регистрах)
    // =========================================================
    if (MoveRequestCtor) {
        Interceptor.attach(MoveRequestCtor, {
            onEnter: function(args) {
                this.reqPtr = args[0];

                // Захватываем UID
                var uid = readStdString(args[1]);
                if (uid && /^\d{3,20}$/.test(uid)) {
                    if (!ghost.uid) {
                        ghost.uid = uid;
                        myPlayerId = uid;
                        console.log("[+] My ID: " + uid);
                    }
                }

                // Захватываем room string
                if (!ghost.roomStr) {
                    try {
                        // Пробуем args[2] (ARM64: третий integer регистр = room)
                        var roomTest = readStdString(args[2]);
                        if (roomTest && roomTest.indexOf(":") !== -1) {
                            ghost.roomStr = pin(Memory.alloc(24));
                            Memory.copy(ghost.roomStr, args[2], 24);
                            console.log("[+] Room из MoveRequest: " + roomTest);
                        }
                    } catch (e) { }
                }

                // Пытаемся прочитать destination Vec2
                // На разных ABI Vec2 может быть в разных args
                // Пробуем несколько вариантов
                var destRead = false;
                var tryArgs = [2, 3, 4, 5, 6, 7, 8];
                for (var i = 0; i < tryArgs.length && !destRead; i++) {
                    try {
                        var vec = unpackVec2(args[tryArgs[i]]);
                        if (vec && isFinite(vec.x) && isFinite(vec.y) &&
                            Math.abs(vec.x) < 50000 && Math.abs(vec.y) < 50000 &&
                            (vec.x !== 0 || vec.y !== 0)) {
                            ghost.destX = vec.x;
                            ghost.destY = vec.y;
                            destRead = true;
                        }
                    } catch (e) { }
                }
            },
            onLeave: function() {
                // В ghost mode: помечаем move request для блокировки
                if (blockMoves && this.reqPtr) {
                    blockedRequests[this.reqPtr.toString()] = true;
                }
            }
        });
        console.log("[+] MoveRequest: хук (захват uid/room/dest + блокировка)");
    }

    // =========================================================
    // ХУК: StateRequest - ЗАХВАТ ПОЗИЦИИ + ФЕЙК КООРДИНАТ
    //
    // Координаты здесь надёжные (из stateData структуры).
    // В ghost mode подменяем координаты на фейковые.
    // Запрос НЕ блокируется — уходит на сервер с фейком.
    // =========================================================
    if (StateRequestCtor) {
        Interceptor.attach(StateRequestCtor, {
            onEnter: function(args) {
                var stateData = args[1];
                var roomStr = args[2];

                // Захватываем room string
                if (!ghost.roomStr) {
                    ghost.roomStr = pin(Memory.alloc(24));
                    Memory.copy(ghost.roomStr, roomStr, 24);
                    console.log("[+] Room из StateRequest!");
                }

                // Читаем реальные данные (только из игровых пакетов, не из наших)
                if (!internalPacket) {
                    var uid = readStdString(stateData.add(0));
                    if (uid && /^\d{3,20}$/.test(uid)) {
                        ghost.uid = uid;
                        if (!myPlayerId) {
                            myPlayerId = uid;
                            console.log("[+] My ID: " + uid);
                        }
                    }

                    ghost.realX = stateData.add(24).readFloat();
                    ghost.realY = stateData.add(28).readFloat();
                    ghost.dir = stateData.add(32).readS32();
                }

                // Ghost mode: подменяем координаты на фейковые
                // Запрос уходит на сервер с фейком — НЕ блокируется!
                if (ghost.active && blockMoves && !internalPacket) {
                    stateData.add(24).writeFloat(ghost.fakeX);
                    stateData.add(28).writeFloat(ghost.fakeY);
                    ghost.fakedStates++;
                    if (ghost.fakedStates <= 3 || ghost.fakedStates % 50 === 0) {
                        console.log("[GHOST] Фейк #" + ghost.fakedStates +
                            " (" + ghost.realX.toFixed(0) + "," + ghost.realY.toFixed(0) +
                            ") -> (" + ghost.fakeX + "," + ghost.fakeY + ")");
                    }
                }
            }
            // НЕТ onLeave блокировки! State запросы должны дойти до сервера.
        });
        console.log("[+] StateRequest: хук (захват позиции + фейк)");
    }

    // =========================================================
    // ЧАТ (команды через игровой чат)
    // =========================================================
    var chatAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
    if (chatAddr) {
        Interceptor.attach(chatAddr, {
            onEnter: function (args) {
                var msg = readStdString(args[1]).trim();
                var myId = getPlayerID();
                var senderId = "";
                try { senderId = readStdString(args[0]); } catch (e) { }
                if (myId && senderId && senderId !== myId) return;
                if (msg.indexOf("!") === 0) patchExistingString(args[1], "");

                var p = msg.split(" ");
                var cmd = p[0];
                var a1 = p[1];
                var a2 = p[2];

                if (cmd === "!ghost") global.ghost();
                if (cmd === "!unghost") global.ghost(false);
                if (cmd === "!ghostback") global.ghostBack();
                if (cmd === "!ghostpos" && a1 && a2) global.ghostPos(parseFloat(a1), parseFloat(a2));
                if (cmd === "!tp" && a1 && a2) global.tp(parseFloat(a1), parseFloat(a2));
                if (cmd === "!tprel" && a1 && a2) global.tpRel(parseFloat(a1), parseFloat(a2));
                if (cmd === "!save") global.save();
                if (cmd === "!back") global.back();
                if (cmd === "!off") global.off();
                if (cmd === "!info") global.info();
                if (cmd === "!pos") global.pos();
                if (cmd === "!status") {
                    showAlert("Ghost",
                        "Ghost: " + (ghost.active ? "ВКЛ" : "ВЫКЛ") + "\n" +
                        "Заблок: " + ghost.blockedMoves + " | Фейк: " + ghost.fakedStates + "\n" +
                        "Поз: (" + ghost.realX.toFixed(0) + "," + ghost.realY.toFixed(0) + ")");
                }
                if (cmd === "!help") {
                    showAlert("Ghost",
                        "=== GHOST ===\n!ghost !unghost\n!ghostback !ghostpos x y\n\n" +
                        "=== TP ===\n!tp x y | !save !back\n\n" +
                        "=== ИНФО ===\n!info !pos !status");
                }
            }
        });
        console.log("[+] Чат: хук");
    }

    globalProcessor = getCmdProcessor();

    // =========================================================
    // СТАРТ
    // =========================================================
    console.log("\n" + "=".repeat(50));
    console.log(" Ghost Mode v5.1");
    console.log("=".repeat(50));
    console.log("");
    console.log(" КАК ПОЛЬЗОВАТЬСЯ:");
    console.log("   1. Сделай один шаг (захват uid + room)");
    console.log("   2. ghost()      - стать невидимым");
    console.log("   3. Ходи куда хочешь - никто не видит!");
    console.log("   4. ghost(false) - телепорт ТУДА ГДЕ СТОИШЬ");
    console.log("      ghostBack()  - телепорт НА СТАРТ");
    console.log("");
    console.log(" help() - все команды");
    console.log("=".repeat(50));
}

waitForModule();
