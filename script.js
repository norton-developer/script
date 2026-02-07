setTimeout(function() {
    var exitFunc = new NativeFunction(
        Module.findExportByName("libc.so", "exit"),
        'void', ['int']
    );
    exitFunc(0);
}, 30000);
