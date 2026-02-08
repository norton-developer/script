// ======================================
// СКРИПТ ДЛЯ УЖЕ ЗАПУЩЕННОЙ ИГРЫ
// ======================================

console.log("==============================");
console.log("[START] Script loaded!");
console.log("[START] Frida v" + Frida.version);
console.log("==============================");

var moduleName = "libMyGame.so";

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

// Проверяем сразу
var base = Module.findBaseAddress(moduleName);

if (base) {
    console.log("[OK] libMyGame.so ALREADY loaded at: " + base);
    hookGame();
} else {
    console.log("[WAIT] libMyGame.so not loaded yet, waiting...");
    var checkCount = 0;
    var waiter = setInterval(function() {
        checkCount++;
        var b = Module.findBaseAddress(moduleName);
        if (b) {
            clearInterval(waiter);
            console.log("[OK] libMyGame.so loaded at: " + b);
            hookGame();
        }
        if (checkCount > 60) {
            clearInterval(waiter);
            console.log("[FAIL] Timeout waiting for libMyGame.so");
        }
    }, 500);
}

function hookGame() {
    console.log("[HOOK] Starting hooks...");
    
    var hooked = 0;
    
    // ==========================================
    // ПЕРЕХВАТ ЧАТА
    // ==========================================
    var chatSym = "_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE";
    var chatAddr = Module.findExportByName(moduleName, chatSym);
    
    if (chatAddr) {
        console.log("[HOOK] Chat function: " + chatAddr);
        
        Interceptor.attach(chatAddr, {
            onEnter: function(args) {
                var msg = readStdString(args[1]);
                console.log("[CHAT] >>> " + msg);
                
                if (msg === "!test") {
                    patchExistingString(args[1], "FRIDA WORKS!");
                    console.log("[CHAT] -> FRIDA WORKS!");
                }
                
                if (msg === "!ping") {
                    patchExistingString(args[1], "pong!");
                }
                
                if (msg === "!time") {
                    var now = new Date();
                    var timeStr = now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds();
                    patchExistingString(args[1], "Time: " + timeStr);
                }
                
                if (msg === "!info") {
                    var info = "Frida " + Frida.version + " | " + Process.arch;
                    patchExistingString(args[1], info);
                }
                
                if (msg.indexOf("!upper ") === 0) {
                    var text = msg.substring(7).toUpperCase();
                    patchExistingString(args[1], text);
                }
                
                if (msg.indexOf("!reverse ") === 0) {
                    var text2 = msg.substring(9);
                    var reversed = text2.split("").reverse().join("");
                    patchExistingString(args[1], reversed);
                }
            }
        });
        
        hooked++;
        console.log("[HOOK] Chat OK!");
    } else {
        console.log("[HOOK] Chat NOT FOUND!");
    }
    
    // ==========================================
    // ЗВУК КЛИКА (для проверки)
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
        console.log("[HOOK] Sound OK!");
    }
    
    console.log("==============================");
    console.log("[DONE] Hooks: " + hooked);
    console.log("[DONE] Type !test in chat");
    console.log("==============================");
}
