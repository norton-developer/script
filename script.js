Java.perform(function () {
    console.log("[BloodMoon] Mod Menu loaded - простой вариант");

    var context = null;
    var wm = null;
    var menuView = null;
    var triggerBtn = null;

    // Получаем контекст
    var ActivityThread = Java.use('android.app.ActivityThread');
    var currentActivity = ActivityThread.currentActivity();
    if (currentActivity) {
        context = currentActivity.getApplicationContext();
        wm = Java.use('android.view.WindowManager').$new(context.getSystemService("window"));
    }

    // === ПЛАВАЮЩАЯ КНОПКА "BM" ===
    function createTriggerButton() {
        var Button = Java.use('android.widget.Button');
        var WindowManager$LayoutParams = Java.use('android.view.WindowManager$LayoutParams');

        triggerBtn = Button.$new(context);
        triggerBtn.setText("BM");
        triggerBtn.setTextColor(-1); // белый
        triggerBtn.setBackgroundColor(Java.use('android.graphics.Color').parseColor("#B40000")); // красный Blood Moon

        var params = WindowManager$LayoutParams.$new(150, 150, 
            Java.use('android.os.Build$VERSION').SDK_INT.value >= 26 ? 2038 : 2002, 
            40, -3);
        params.gravity = 85; // правый нижний угол
        params.x = 30;
        params.y = 200;

        triggerBtn.setOnClickListener(Java.registerClass({
            name: 'com.hack.TriggerListener',
            implements: [Java.use('android.view.View$OnClickListener')],
            methods: {
                onClick: function(v) {
                    toggleMenu();
                }
            }
        }).$new());

        wm.addView(triggerBtn, params);
    }

    // === ПОЛНОЕ МЕНЮ (как на скрине) ===
    function createFullMenu() {
        if (menuView) return;

        var LinearLayout = Java.use('android.widget.LinearLayout');
        var ScrollView = Java.use('android.widget.ScrollView');
        var Button = Java.use('android.widget.Button');
        var WindowManager$LayoutParams = Java.use('android.view.WindowManager$LayoutParams');

        var root = LinearLayout.$new(context);
        root.setOrientation(0); // горизонтально
        root.setBackgroundColor(Java.use('android.graphics.Color').argb(240, 20, 20, 20));

        // Левая панель (категории)
        var left = LinearLayout.$new(context);
        left.setOrientation(1);
        left.setLayoutParams(LinearLayout.LayoutParams.$new(240, -1));
        left.setBackgroundColor(Java.use('android.graphics.Color').argb(255, 50, 0, 0));

        var cats = ["Перемещение", "Персонаж", "Машины", "Боты", "Визуал", "Оружие", "Другое"];
        for (var i = 0; i < cats.length; i++) {
            var b = Button.$new(context);
            b.setText(cats[i]);
            b.setTextColor(-1);
            b.setBackgroundColor(cats[i] === "Машины" ? Java.use('android.graphics.Color').RED.value : 0);
            b.setOnClickListener(Java.registerClass({
                name: 'CatListener' + i,
                implements: [Java.use('android.view.View$OnClickListener')],
                methods: { onClick: function() { showCategory(cats[i]); } }
            }).$new());
            left.addView(b);
        }

        // Правая панель
        var scroll = ScrollView.$new(context);
        var right = LinearLayout.$new(context);
        right.setOrientation(1);
        scroll.addView(right);

        root.addView(left);
        root.addView(scroll);

        // Параметры
        var params = WindowManager$LayoutParams.$new(-2, -2, 
            Java.use('android.os.Build$VERSION').SDK_INT.value >= 26 ? 2038 : 2002, 
            40, -3);
        params.gravity = 17;
        params.x = 100;
        params.y = 100;

        wm.addView(root, params);
        menuView = root;
        showCategory("Машины"); // по умолчанию как на скрине
    }

    function showCategory(cat) {
        // Здесь добавляй свои кнопки (пример для "Машины")
        // rightPanel.removeAllViews(); // нужно сохранить ссылку на right, но для простоты я упростил
        console.log("Открыта категория: " + cat);
        // Добавь здесь свои toggle через Features
        // Например: Java.use("com.hack.Features").toggleFlyCar();
    }

    function toggleMenu() {
        if (!menuView) createFullMenu();
        else {
            menuView.setVisibility(menuView.getVisibility() === 0 ? 8 : 0);
        }
    }

    // Запуск
    setTimeout(function () {
        createTriggerButton();
        console.log("[BloodMoon] Кнопка BM добавлена! Нажми на неё");
    }, 3000);
});
