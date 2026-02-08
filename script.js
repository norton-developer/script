// ======================================
// ТЕСТ СКРИПТ - ПРОВЕРКА FRIDA GADGET
// ======================================

console.log("==============================");
console.log("[START] Script loaded!");
console.log("[START] Frida v" + Frida.version);
console.log("[START] Timestamp: " + Date.now());
console.log("==============================");

// ШАГ 1: Ждём загрузки libMyGame.so
var moduleName = "libMyGame.so";
var checkCount = 0;

var waiter = setInterval(function() {
    checkCount++;
    var base = Module.findBaseAddress(moduleName);
    
    if (checkCount % 10 === 0) {
        console.log("[WAIT] Check #" + checkCount + " - libMyGame.so: " + (base ? "FOUND" : "not yet"));
    }
    
    if (base) {
        clearInterval(waiter);
        console.log("[OK] libMyGame.so loaded at: " + base);
        hookGame();
    }
    
    if (checkCount > 120) {
        clearInterval(waiter);
        console.log("[FAIL] libMyGame.so not found after 120 checks");
    }
}, 1000);


function readStdString(addr) {
    if (!addr || addr.isNull()) return "";
    try {
        var isLong = addr.readU8() & 1;
        return isLong ? addr.add(16).readPointer().readUtf8String() : addr.add(1).readUtf8String();
    } catch (e) { return ""; }
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


function hookGame() {
    console.log("[HOOK] Starting hooks...");
    
    var hooked = 0;
    
    // ==========================================
    // ХВАТ 1: ПЕРЕХВАТ ЧАТА
    // ==========================================
    var chatSym = "_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE";
    var chatAddr = Module.findExportByName(moduleName, chatSym);
    
    if (chatAddr) {
        console.log("[HOOK] Chat function found: " + chatAddr);
        
        Interceptor.attach(chatAddr, {
            onEnter: function(args) {
                var msg = readStdString(args[1]);
                console.log("[CHAT] >>> " + msg);
                
                // ==========================================
                // КОМАНДА !test - заменяет сообщение
                // ==========================================
                if (msg === "!test") {
                    patchExistingString(args[1], "FRIDA WORKS!");
                    console.log("[CHAT] Replaced with: FRIDA WORKS!");
                }
                
                // ==========================================
                // КОМАНДА !ping - заменяет на pong
                // ==========================================
                if (msg === "!ping") {
                    patchExistingString(args[1], "pong!");
                    console.log("[CHAT] PONG!");
                }
                
                // ==========================================
                // КОМАНДА !time - показывает время
                // ==========================================
                if (msg === "!time") {
                    var now = new Date();
                    var timeStr = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
                    patchExistingString(args[1], "Time: " + timeStr);
                    console.log("[CHAT] Time: " + timeStr);
                }
                
                // ==========================================
                // КОМАНДА !reverse - переворачивает текст
                // ==========================================
                if (msg.indexOf("!reverse ") === 0) {
                    var text = msg.substring(9);
                    var reversed = text.split("").reverse().join("");
                    patchExistingString(args[1], reversed);
                    console.log("[CHAT] Reversed: " + reversed);
                }
                
                // ==========================================
                // КОМАНДА !spam - дублирует текст
                // ==========================================
                if (msg.indexOf("!spam ") === 0) {
                    var text2 = msg.substring(6);
                    var spammed = text2 + " " + text2 + " " + text2;
                    patchExistingString(args[1], spammed);
                    console.log("[CHAT] Spammed: " + spammed);
                }
                
                // ==========================================
                // КОМАНДА !upper - в верхний регистр
                // ==========================================
                if (msg.indexOf("!upper ") === 0) {
                    var text3 = msg.substring(7).toUpperCase();
                    patchExistingString(args[1], text3);
                    console.log("[CHAT] Upper: " + text3);
                }
                
                // ==========================================
                // КОМАНДА !info - инфо о системе
                // ==========================================
                if (msg === "!info") {
                    var info = "Frida " + Frida.version + " | " + Process.arch;
                    patchExistingString(args[1], info);
                    console.log("[CHAT] Info: " + info);
                }
                
                // ==========================================
                // КОМАНДА !help - список команд
                // ==========================================
                if (msg === "!help") {
                    patchExistingString(args[1], "Commands: !test !ping !time !info !reverse !spam !upper");
                    console.log("[CHAT] Help shown");
                }
            }
        });
        
        hooked++;
        console.log("[HOOK] Chat hook OK!");
    } else {
        console.log("[HOOK] Chat function NOT FOUND!");
    }
    
    // ==========================================
    // ХВАТ 2: КЛИК ЗВУК (проверка)
    // ==========================================
    var clickSym = "_ZN12SoundManager14playClickSoundEv";
    var clickAddr = Module.findExportByName(moduleName, clickSym);
    
    if (clickAddr) {
        Interceptor.attach(clickAddr, {
            onEnter: function() {
                console.log("[SOUND] Click!");
            }
        });
        hooked++;
        console.log("[HOOK] Sound hook OK!");
    } else {
        console.log("[HOOK] Sound function not found");
    }
    
    // ==========================================
    // ИТОГ
    // ==========================================
    console.log("==============================");
    console.log("[DONE] Hooks installed: " + hooked);
    console.log("[DONE] Try typing !test in chat");
    console.log("[DONE] Or !help for all commands");
    console.log("==============================");
}    });
} else {
    console.log("[TEST] ERROR: open() not found!");
}

function tryHookGame() {
    var moduleName = "libMyGame.so";
    var gameBase = Module.findBaseAddress(moduleName);
    
    if (!gameBase) {
        console.log("[HOOK] libMyGame.so still not loaded!");
        return;
    }
    
    console.log("[HOOK] libMyGame.so base: " + gameBase);
    
    // Тест - ищем функцию чата
    var chatFunc = Module.findExportByName(moduleName, "_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
    
    if (chatFunc) {
        console.log("[HOOK] Chat function FOUND: " + chatFunc);
        
        Interceptor.attach(chatFunc, {
            onEnter: function(args) {
                console.log("[CHAT] Message sent!");
            }
        });
        
        console.log("[HOOK] Chat hook installed!");
    } else {
        console.log("[HOOK] Chat function NOT found");
        
        // Попробуем найти любые экспорты
        var exports = Module.enumerateExports(moduleName);
        console.log("[HOOK] Total exports in libMyGame.so: " + exports.length);
        
        // Покажем первые 5
        for (var i = 0; i < Math.min(5, exports.length); i++) {
            console.log("[HOOK] Export " + i + ": " + exports[i].name);
        }
    }
}

console.log("[TEST] Initial setup complete, waiting for open() calls...");
