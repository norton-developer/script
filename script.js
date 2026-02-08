// ========== ТЕСТОВЫЙ СКРИПТ ==========
console.log("=================================");
console.log("[TEST] Script started!");
console.log("[TEST] Frida version: " + Frida.version);
console.log("=================================");

// Простой хук без setTimeout
var openAddr = Module.findExportByName("libc.so", "open");
if (openAddr) {
    console.log("[TEST] libc.so open() found: " + openAddr);
    
    var counter = 0;
    Interceptor.attach(openAddr, {
        onEnter: function(args) {
            counter++;
            if (counter === 100) {
                console.log("[TEST] 100 calls to open()");
            }
            if (counter === 500) {
                console.log("[TEST] 500 calls to open()");
            }
            if (counter === 1000) {
                console.log("[TEST] 1000 calls - checking libMyGame.so...");
                
                var gameBase = Module.findBaseAddress("libMyGame.so");
                if (gameBase) {
                    console.log("[TEST] libMyGame.so FOUND at: " + gameBase);
                } else {
                    console.log("[TEST] libMyGame.so NOT loaded yet");
                }
            }
            if (counter === 3000) {
                console.log("[TEST] 3000 calls - trying to hook game...");
                tryHookGame();
            }
        }
    });
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
