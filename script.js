Java.perform(function () {
    console.log("[BloodMoon] Загрузка...");

    var context = null;
    var wm = null;
    var menuView = null;
    var rightPanel = null;
    var currentCat = null;

    // ==========================================
    // ПОЛУЧЕНИЕ КОНТЕКСТА И WINDOW MANAGER
    // ==========================================
    function getContext() {
        try {
            var ActivityThread = Java.use('android.app.ActivityThread');
            var app = ActivityThread.currentApplication();
            if (app) {
                context = app.getApplicationContext();
                console.log("[BloodMoon] Контекст получен: " + context);
                return true;
            }
        } catch(e) {
            console.log("[BloodMoon] Ошибка контекста: " + e);
        }
        return false;
    }

    function getWindowManager() {
        try {
            // ПРАВИЛЬНЫЙ способ получения WindowManager
            wm = Java.cast(
                context.getSystemService("window"),
                Java.use('android.view.WindowManager')
            );
            console.log("[BloodMoon] WindowManager получен");
            return true;
        } catch(e) {
            console.log("[BloodMoon] Ошибка WM: " + e);
        }
        return false;
    }

    // ==========================================
    // ЗАПУСК В UI ПОТОКЕ
    // ==========================================
    function runOnUiThread(func) {
        try {
            var Handler = Java.use('android.os.Handler');
            var Looper = Java.use('android.os.Looper');
            var handler = Handler.$new(Looper.getMainLooper());
            
            var Runnable = Java.use('java.lang.Runnable');
            var runnable = Java.registerClass({
                name: 'com.bloodmoon.UiRunnable_' + Date.now(),
                implements: [Runnable],
                methods: {
                    run: function() {
                        try {
                            func();
                        } catch(e) {
                            console.log("[BloodMoon] UI ошибка: " + e);
                        }
                    }
                }
            });
            handler.post(runnable.$new());
        } catch(e) {
            console.log("[BloodMoon] runOnUiThread ошибка: " + e);
        }
    }

    // ==========================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ==========================================
    function getColor(hex) {
        return Java.use('android.graphics.Color').parseColor(hex);
    }

    function argb(a, r, g, b) {
        return Java.use('android.graphics.Color').argb(a, r, g, b);
    }

    function getSDK() {
        return Java.use('android.os.Build$VERSION').SDK_INT.value;
    }

    function getOverlayType() {
        // TYPE_APPLICATION_OVERLAY = 2038 (API 26+)
        // TYPE_PHONE = 2002 (старые версии)
        return getSDK() >= 26 ? 2038 : 2002;
    }

    // ==========================================
    // ПЛАВАЮЩАЯ КНОПКА "BM"
    // ==========================================
    function createTriggerButton() {
        try {
            var Button = Java.use('android.widget.Button');
            var WLP = Java.use('android.view.WindowManager$LayoutParams');
            var Gravity = Java.use('android.view.Gravity');
            var TypedValue = Java.use('android.util.TypedValue');

            var btn = Button.$new(context);
            btn.setText("BM");
            btn.setTextSize(0, 14); // px
            btn.setTextColor(-1); // белый
            btn.setBackgroundColor(getColor("#8B0000"));
            btn.setPadding(10, 10, 10, 10);

            var params = WLP.$new(
                150,  // width
                150,  // height
                getOverlayType(),
                // FLAG_NOT_FOCUSABLE | FLAG_NOT_TOUCH_MODAL
                0x00000008 | 0x00000020,
                -3    // TRANSLUCENT
            );

            // Правый нижний угол
            params.gravity.value = 0x55; // RIGHT | BOTTOM = 85
            params.x.value = 30;
            params.y.value = 200;

            // OnClickListener для кнопки BM
            var OnClickListener = Java.use('android.view.View$OnClickListener');
            var BtnListener = Java.registerClass({
                name: 'com.bloodmoon.BtnListener',
                implements: [OnClickListener],
                methods: {
                    onClick: function(v) {
                        runOnUiThread(function() {
                            toggleMenu();
                        });
                    }
                }
            });
            btn.setOnClickListener(BtnListener.$new());

            wm.addView(btn, params);
            console.log("[BloodMoon] Кнопка BM добавлена!");

        } catch(e) {
            console.log("[BloodMoon] Ошибка кнопки: " + e);
            console.log(e.stack);
        }
    }

    // ==========================================
    // СОЗДАНИЕ ПОЛНОГО МЕНЮ
    // ==========================================
    function createFullMenu() {
        try {
            var LinearLayout = Java.use('android.widget.LinearLayout');
            var ScrollView = Java.use('android.widget.ScrollView');
            var Button = Java.use('android.widget.Button');
            var TextView = Java.use('android.widget.TextView');
            var WLP = Java.use('android.view.WindowManager$LayoutParams');
            var LLWH = Java.use('android.widget.LinearLayout$LayoutParams');

            // === КОРНЕВОЙ КОНТЕЙНЕР ===
            var root = LinearLayout.$new(context);
            root.setOrientation(0); // HORIZONTAL
            root.setBackgroundColor(argb(245, 15, 15, 15));

            // === ЛЕВАЯ ПАНЕЛЬ (категории) ===
            var leftParams = LLWH.$new(220, -1); // -1 = MATCH_PARENT
            var left = LinearLayout.$new(context);
            left.setOrientation(1); // VERTICAL
            left.setLayoutParams(leftParams);
            left.setBackgroundColor(argb(255, 40, 0, 0));
            left.setPadding(5, 5, 5, 5);

            // Заголовок левой панели
            var title = TextView.$new(context);
            title.setText("BloodMoon");
            title.setTextColor(getColor("#FF4444"));
            title.setTextSize(0, 16);
            title.setPadding(10, 15, 10, 15);
            left.addView(title);

            // Категории
            var categories = [
                "Машины",
                "Персонаж", 
                "Перемещение",
                "Оружие",
                "Боты",
                "Визуал",
                "Другое"
            ];

            for (var i = 0; i < categories.length; i++) {
                (function(catName, index) {
                    var catBtn = Button.$new(context);
                    catBtn.setText(catName);
                    catBtn.setTextColor(-1);
                    catBtn.setBackgroundColor(
                        index === 0 ? getColor("#8B0000") : 0x00000000
                    );
                    catBtn.setPadding(15, 12, 15, 12);

                    var catParams = LLWH.$new(-1, -2);
                    catBtn.setLayoutParams(catParams);

                    var CatOnClick = Java.use('android.view.View$OnClickListener');
                    var CatListener = Java.registerClass({
                        name: 'com.bloodmoon.Cat_' + index + '_' + Date.now(),
                        implements: [CatOnClick],
                        methods: {
                            onClick: function(v) {
                                showCategory(catName);
                            }
                        }
                    });
                    catBtn.setOnClickListener(CatListener.$new());
                    left.addView(catBtn);
                })(categories[i], i);
            }

            // === ПРАВАЯ ПАНЕЛЬ (контент) ===
            var rightParams = LLWH.$new(0, -1);
            rightParams.weight.value = 1;

            var scroll = ScrollView.$new(context);
            scroll.setLayoutParams(rightParams);
            scroll.setBackgroundColor(argb(245, 20, 20, 20));

            rightPanel = LinearLayout.$new(context);
            rightPanel.setOrientation(1); // VERTICAL
            rightPanel.setPadding(10, 10, 10, 10);

            var rpParams = LLWH.$new(-1, -2);
            rightPanel.setLayoutParams(rpParams);
            scroll.addView(rightPanel);

            // Кнопка закрытия (X)
            var closeBtn = Button.$new(context);
            closeBtn.setText("✕ Закрыть");
            closeBtn.setTextColor(-1);
            closeBtn.setBackgroundColor(getColor("#8B0000"));
            closeBtn.setPadding(10, 8, 10, 8);

            var CloseOnClick = Java.use('android.view.View$OnClickListener');
            var CloseListener = Java.registerClass({
                name: 'com.bloodmoon.CloseListener',
                implements: [CloseOnClick],
                methods: {
                    onClick: function(v) {
                        toggleMenu();
                    }
                }
            });
            closeBtn.setOnClickListener(CloseListener.$new());

            // Добавляем в корень
            root.addView(left);
            root.addView(scroll);

            // === ПАРАМЕТРЫ ОКНА ===
            var menuParams = WLP.$new(
                600,  // width
                800,  // height
                getOverlayType(),
                0x00000008 | 0x00000020,
                -3
            );
            menuParams.gravity.value = 17; // CENTER
            menuParams.x.value = 0;
            menuParams.y.value = 0;

            wm.addView(root, menuParams);
            menuView = root;

            // Загружаем дефолтную категорию
            showCategory("Машины");
            console.log("[BloodMoon] Меню создано!");

        } catch(e) {
            console.log("[BloodMoon] Ошибка меню: " + e);
            console.log(e.stack);
        }
    }

    // ==========================================
    // ОТОБРАЖЕНИЕ КАТЕГОРИИ
    // ==========================================
    function showCategory(cat) {
        if (!rightPanel) return;
        if (currentCat === cat) return;
        currentCat = cat;

        try {
            rightPanel.removeAllViews();
            
            var TextView = Java.use('android.widget.TextView');
            var header = TextView.$new(context);
            header.setText("— " + cat + " —");
            header.setTextColor(getColor("#FF4444"));
            header.setTextSize(0, 18);
            header.setPadding(5, 10, 5, 15);
            rightPanel.addView(header);

            // Получаем фичи для категории
            var features = getFeatures(cat);
            for (var i = 0; i < features.length; i++) {
                addFeatureButton(features[i]);
            }

            console.log("[BloodMoon] Категория: " + cat);
        } catch(e) {
            console.log("[BloodMoon] Ошибка категории: " + e);
        }
    }

    // ==========================================
    // ДОБАВЛЕНИЕ КНОПКИ ФИЧИ
    // ==========================================
    function addFeatureButton(feature) {
        try {
            var LinearLayout = Java.use('android.widget.LinearLayout');
            var LLWH = Java.use('android.widget.LinearLayout$LayoutParams');
            var Button = Java.use('android.widget.Button');

            var btn = Button.$new(context);
            btn.setText((feature.enabled ? "✓ " : "✗ ") + feature.name);
            btn.setTextColor(feature.enabled ? getColor("#00FF44") : getColor("#FF4444"));
            btn.setBackgroundColor(
                feature.enabled ? argb(180, 0, 100, 0) : argb(180, 80, 0, 0)
            );
            btn.setPadding(15, 12, 15, 12);

            var params = LLWH.$new(-1, -2);
            params.setMargins(0, 4, 0, 4);
            btn.setLayoutParams(params);

            var FeatureClick = Java.use('android.view.View$OnClickListener');
            var featureName = feature.name;
            var featureCallback = feature.callback;
            
            var FeatureListener = Java.registerClass({
                name: 'com.bloodmoon.Feat_' + featureName.replace(/\s/g, '_') + '_' + Date.now(),
                implements: [FeatureClick],
                methods: {
                    onClick: function(v) {
                        feature.enabled = !feature.enabled;
                        // Обновляем кнопку
                        var jBtn = Java.cast(v, Button);
                        jBtn.setText((feature.enabled ? "✓ " : "✗ ") + featureName);
                        jBtn.setTextColor(
                            feature.enabled ? getColor("#00FF44") : getColor("#FF4444")
                        );
                        jBtn.setBackgroundColor(
                            feature.enabled ? argb(180, 0, 100, 0) : argb(180, 80, 0, 0)
                        );
                        // Вызываем callback
                        if (featureCallback) {
                            featureCallback(feature.enabled);
                        }
                    }
                }
            });
            btn.setOnClickListener(FeatureListener.$new());
            rightPanel.addView(btn);

        } catch(e) {
            console.log("[BloodMoon] Ошибка кнопки фичи: " + e);
        }
    }

    // ==========================================
    // ФИЧИ ПО КАТЕГОРИЯМ
    // ==========================================
    function getFeatures(cat) {
        var features = {

            "Машины": [
                {
                    name: "Fly Car",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Fly Car: " + state);
                        // Твой хук здесь
                    }
                },
                {
                    name: "God Mode Car",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] God Mode Car: " + state);
                    }
                },
                {
                    name: "Speed Boost",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Speed Boost: " + state);
                    }
                },
                {
                    name: "No Damage",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] No Damage: " + state);
                    }
                }
            ],

            "Персонаж": [
                {
                    name: "God Mode",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] God Mode: " + state);
                    }
                },
                {
                    name: "Infinite HP",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Infinite HP: " + state);
                    }
                },
                {
                    name: "No Ragdoll",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] No Ragdoll: " + state);
                    }
                }
            ],

            "Перемещение": [
                {
                    name: "Speed Hack",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Speed Hack: " + state);
                    }
                },
                {
                    name: "Super Jump",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Super Jump: " + state);
                    }
                },
                {
                    name: "No Clip",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] No Clip: " + state);
                    }
                },
                {
                    name: "Fly Mode",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Fly Mode: " + state);
                    }
                }
            ],

            "Оружие": [
                {
                    name: "Infinite Ammo",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Infinite Ammo: " + state);
                    }
                },
                {
                    name: "No Reload",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] No Reload: " + state);
                    }
                },
                {
                    name: "Rapid Fire",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Rapid Fire: " + state);
                    }
                }
            ],

            "Боты": [
                {
                    name: "Freeze Bots",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Freeze Bots: " + state);
                    }
                },
                {
                    name: "Delete Bots",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Delete Bots: " + state);
                    }
                }
            ],

            "Визуал": [
                {
                    name: "ESP / Wallhack",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] ESP: " + state);
                    }
                },
                {
                    name: "No Fog",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] No Fog: " + state);
                    }
                }
            ],

            "Другое": [
                {
                    name: "Unlock All",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Unlock All: " + state);
                    }
                },
                {
                    name: "Anti Ban",
                    enabled: false,
                    callback: function(state) {
                        console.log("[BloodMoon] Anti Ban: " + state);
                    }
                }
            ]
        };

        return features[cat] || [];
    }

    // ==========================================
    // ПЕРЕКЛЮЧЕНИЕ МЕНЮ
    // ==========================================
    function toggleMenu() {
        try {
            if (!menuView) {
                createFullMenu();
            } else {
                var VISIBLE = 0;
                var GONE = 8;
                var vis = menuView.getVisibility();
                menuView.setVisibility(vis === VISIBLE ? GONE : VISIBLE);
            }
        } catch(e) {
            console.log("[BloodMoon] toggleMenu ошибка: " + e);
        }
    }

    // ==========================================
    // СТАРТ
    // ==========================================
    setTimeout(function() {
        try {
            if (!getContext()) {
                console.log("[BloodMoon] ОШИБКА: Контекст не получен!");
                return;
            }
            if (!getWindowManager()) {
                console.log("[BloodMoon] ОШИБКА: WindowManager не получен!");
                return;
            }

            // Запуск UI в главном потоке
            runOnUiThread(function() {
                createTriggerButton();
                console.log("[BloodMoon] Готово! Нажми кнопку BM");
            });

        } catch(e) {
            console.log("[BloodMoon] Ошибка старта: " + e);
            console.log(e.stack);
        }
    }, 3000);

});
