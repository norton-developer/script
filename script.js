console.log("[SERVER] === TEST SCRIPT LOADED V1 ===");

var moduleName = "libMyGame.so";
var workObjects = [];

// Вспомогательные функции
function get_func(name) { return Module.findExportByName(moduleName, name); }

function readStdString(addr) {
    if (!addr || addr.isNull()) return "";
    try {
        var isLong = addr.readU8() & 1;
        return isLong ? addr.add(16).readPointer().readUtf8String() : addr.add(1).readUtf8String();
    } catch (e) { return ""; }
}

// Функция сбора
function doWork() {
    console.log("[SERVER] Starting Work...");
    var finishAddr = get_func("_ZN10WorkObject10finishWorkEv");
    
    if (!finishAddr) {
        console.log("[SERVER] Error: finishWork not found");
        return;
    }
    
    var finishWork = new NativeFunction(finishAddr, 'void', ['pointer']);
    var count = 0;
    
    // Перебираем собранные объекты
    for (var i = 0; i < workObjects.length; i++) {
        try {
            var obj = workObjects[i];
            if (!obj.isNull() && obj.readPointer() !== null) { 
                finishWork(obj);
                count++;
            }
        } catch (e) {}
    }
    console.log("[SERVER] Collected objects: " + count);
    workObjects = []; // Очищаем после сбора
}

// Ждем библиотеку
var interval = setInterval(function() {
    var addr = Module.findBaseAddress(moduleName);
    if (addr) {
        clearInterval(interval);
        console.log("[SERVER] Lib found at: " + addr);
        initHooks();
    }
}, 1000);

function initHooks() {
    // 1. Хук чата
    var chatAddr = get_func("_ZN3ags6Client15sendChatMessageERKNSt6__ndk112basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES9_RKN7cocos2d5ValueE");
    
    if (chatAddr) {
        Interceptor.attach(chatAddr, {
            onEnter: function(args) {
                var msg = readStdString(args[1]);
                console.log("[CHAT LOG] " + msg);
                
                if (msg.indexOf("!work") !== -1) {
                    doWork();
                }
            }
        });
        console.log("[SERVER] Chat Hook Installed!");
    }

    // 2. Хук для сбора объектов (чтобы работала !work)
    var touchAddr = get_func("_ZN10WorkObject15isTouchOnObjectEPN7cocos2d5TouchE");
    if (touchAddr) {
        Interceptor.attach(touchAddr, {
            onEnter: function(args) {
                // Сохраняем объекты, по которым кликаем или ходим
                if (workObjects.indexOf(args[0]) === -1) {
                    workObjects.push(args[0]);
                }
            }
        });
    }
    
    // 3. Очистка при смене локации
    var locAddr = get_func("_ZN13WorkGameScene14changeLocationERKNSt6__ndk112basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEES8_S8_");
    if (locAddr) {
        Interceptor.attach(locAddr, {
            onEnter: function() {
                workObjects = [];
            }
        });
    }
}
