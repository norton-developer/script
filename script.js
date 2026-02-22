Java.perform(function() {
    console.log("[BM] Старт на Android 14");

    // Состояние фич
    var Features = {
        godMode: false,
        speedHack: false,
        flyCar: false,
        infiniteAmmo: false,
        noReload: false,
        rapidFire: false,
        superJump: false,
        noClip: false,
        freezeBots: false,
        esp: false,
        antiBan: false,
        unlockAll: false
    };

    // ==========================================
    // ХУКАЕМ Activity.onResume - безопасный вход в UI
    // ==========================================
    var Activity = Java.use('android.app.Activity');
    
    Activity.onResume.implementation = function() {
        this.onResume();
        
        var activity = this;
        console.log("[BM] onResume: " + activity.getClass().getName());
        
        // Запускаем меню через runOnUiThread самой активности
        activity.runOnUiThread(Java.registerClass({
            name: 'com.bm.MenuRunnable_' + Date.now(),
            implements: [Java.use('java.lang.Runnable')],
            methods: {
                run: function() {
                    try {
                        injectMenu(activity);
                    } catch(e) {
                        console.log("[BM] inject error: " + e);
                    }
                }
            }
        }).$new());
    };

    // ==========================================
    // ИНЖЕКТ МЕНЮ В АКТИВНОСТЬ
    // ==========================================
    var menuInjected = false;

    function injectMenu(activity) {
        if (menuInjected) return;
        menuInjected = true;
        console.log("[BM] Инжектируем меню...");

        try {
            var context = activity.getApplicationContext();
            
            // Получаем декор вью
            var window = activity.getWindow();
            var decorView = window.getDecorView();
            var rootView = Java.cast(
                decorView,
                Java.use('android.view.ViewGroup')
            );

            buildMenu(context, rootView, activity);
            console.log("[BM] Меню добавлено в DecorView!");

        } catch(e) {
            console.log("[BM] injectMenu error: " + e);
            console.log(e.stack);
        }
    }

    // ==========================================
    // ПОСТРОЕНИЕ МЕНЮ
    // ==========================================
    var menuContainer = null;
    var rightPanel = null;
    var menuVisible = false;

    function buildMenu(ctx, rootView, activity) {
        try {
            var FrameLayout = Java.use('android.widget.FrameLayout');
            var LinearLayout = Java.use('android.widget.LinearLayout');
            var ScrollView = Java.use('android.widget.ScrollView');
            var Button = Java.use('android.widget.Button');
            var TextView = Java.use('android.widget.TextView');
            var FrameLP = Java.use('android.widget.FrameLayout$LayoutParams');
            var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
            var Color = Java.use('android.graphics.Color');
            var Gravity = Java.use('android.view.Gravity');
            var View = Java.use('android.view.View');

            // === КНОПКА BM (поверх всего) ===
            var triggerFrame = FrameLayout.$new(ctx);
            var triggerParams = FrameLP.$new(130, 130);
            triggerParams.gravity.value = 0x55; // RIGHT | BOTTOM
            triggerParams.setMargins(0, 0, 20, 200);
            triggerFrame.setLayoutParams(triggerParams);

            var triggerBtn = Button.$new(ctx);
            triggerBtn.setText("BM");
            triggerBtn.setTextColor(-1);
            triggerBtn.setTextSize(0, 14);
            triggerBtn.setBackgroundColor(Color.parseColor("#8B0000"));

            var TrigLP = LinearLP.$new(-1, -1);
            triggerBtn.setLayoutParams(TrigLP);

            // Клик по BM
            setClick(triggerBtn, 'TriggerBM', function() {
                toggleMenu(ctx, rootView, activity);
            });

            triggerFrame.addView(triggerBtn);
            rootView.addView(triggerFrame);

            console.log("[BM] Кнопка BM добавлена");

        } catch(e) {
            console.log("[BM] buildMenu error: " + e);
            console.log(e.stack);
        }
    }

    function toggleMenu(ctx, rootView, activity) {
        try {
            var View = Java.use('android.view.View');
            
            if (!menuContainer) {
                createMainMenu(ctx, rootView);
                menuVisible = true;
            } else {
                menuVisible = !menuVisible;
                menuContainer.setVisibility(menuVisible ? 0 : 8);
            }
        } catch(e) {
            console.log("[BM] toggleMenu error: " + e);
        }
    }

    function createMainMenu(ctx, rootView) {
        try {
            var FrameLayout = Java.use('android.widget.FrameLayout');
            var LinearLayout = Java.use('android.widget.LinearLayout');
            var ScrollView = Java.use('android.widget.ScrollView');
            var Button = Java.use('android.widget.Button');
            var TextView = Java.use('android.widget.TextView');
            var FrameLP = Java.use('android.widget.FrameLayout$LayoutParams');
            var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
            var Color = Java.use('android.graphics.Color');

            // Внешний контейнер (фрейм)
            var outerFrame = FrameLayout.$new(ctx);
            var outerParams = FrameLP.$new(650, 850);
            outerParams.gravity.value = 17; // CENTER
            outerFrame.setLayoutParams(outerParams);
            outerFrame.setBackgroundColor(Color.argb(250, 10, 10, 10));

            // Горизонтальный layout (лево + право)
            var horizontal = LinearLayout.$new(ctx);
            horizontal.setOrientation(0);
            horizontal.setLayoutParams(LinearLP.$new(-1, -1));

            // === ЛЕВАЯ ПАНЕЛЬ ===
            var leftPanel = LinearLayout.$new(ctx);
            leftPanel.setOrientation(1);
            var leftLP = LinearLP.$new(200, -1);
            leftPanel.setLayoutParams(leftLP);
            leftPanel.setBackgroundColor(Color.argb(255, 35, 0, 0));
            leftPanel.setPadding(5, 5, 5, 5);

            // Лого
            var logo = TextView.$new(ctx);
            logo.setText("🩸 BloodMoon");
            logo.setTextColor(Color.parseColor("#FF3333"));
            logo.setTextSize(0, 13);
            logo.setPadding(8, 12, 8, 12);
            leftPanel.addView(logo);

            // Разделитель
            var divider = TextView.$new(ctx);
            divider.setText("─────────");
            divider.setTextColor(Color.parseColor("#8B0000"));
            divider.setTextSize(0, 10);
            divider.setPadding(5, 2, 5, 8);
            leftPanel.addView(divider);

            // Категории
            var cats = [
                "Машины",
                "Персонаж",
                "Перемещение",
                "Оружие",
                "Боты",
                "Визуал",
                "Другое"
            ];

            for (var i = 0; i < cats.length; i++) {
                (function(name, idx) {
                    var catBtn = Button.$new(ctx);
                    catBtn.setText(name);
                    catBtn.setTextColor(-1);
                    catBtn.setTextSize(0, 11);
                    catBtn.setBackgroundColor(
                        idx === 0 
                            ? Color.argb(200, 139, 0, 0) 
                            : Color.argb(100, 60, 0, 0)
                    );
                    catBtn.setPadding(10, 10, 10, 10);

                    var catLP = LinearLP.$new(-1, -2);
                    catLP.setMargins(2, 2, 2, 2);
                    catBtn.setLayoutParams(catLP);

                    setClick(catBtn, 'Cat_' + idx, function() {
                        showCategory(ctx, name);
                    });

                    leftPanel.addView(catBtn);
                })(cats[i], i);
            }

            // Кнопка закрыть
            var closeBtn = Button.$new(ctx);
            closeBtn.setText("✕ Закрыть");
            closeBtn.setTextColor(-1);
            closeBtn.setTextSize(0, 11);
            closeBtn.setBackgroundColor(Color.parseColor("#8B0000"));
            closeBtn.setPadding(10, 10, 10, 10);

            var closeLP = LinearLP.$new(-1, -2);
            closeLP.setMargins(2, 10, 2, 2);
            closeBtn.setLayoutParams(closeLP);

            setClick(closeBtn, 'CloseMenu', function() {
                menuVisible = false;
                outerFrame.setVisibility(8);
            });
            leftPanel.addView(closeBtn);

            // === ПРАВАЯ ПАНЕЛЬ ===
            var scroll = ScrollView.$new(ctx);
            var scrollLP = LinearLP.$new(0, -1);
            scrollLP.weight.value = 1;
            scroll.setLayoutParams(scrollLP);
            scroll.setBackgroundColor(Color.argb(255, 18, 18, 18));

            rightPanel = LinearLayout.$new(ctx);
            rightPanel.setOrientation(1);
            rightPanel.setPadding(8, 8, 8, 8);
            rightPanel.setLayoutParams(LinearLP.$new(-1, -2));
            scroll.addView(rightPanel);

            // Сборка
            horizontal.addView(leftPanel);
            horizontal.addView(scroll);
            outerFrame.addView(horizontal);

            rootView.addView(outerFrame);
            menuContainer = outerFrame;

            // Загружаем первую категорию
            showCategory(ctx, "Машины");

        } catch(e) {
            console.log("[BM] createMainMenu error: " + e);
            console.log(e.stack);
        }
    }

    // ==========================================
    // ПОКАЗ КАТЕГОРИИ
    // ==========================================
    var currentCat = "";

    function showCategory(ctx, cat) {
        if (!rightPanel) return;
        if (currentCat === cat) return;
        currentCat = cat;

        try {
            rightPanel.removeAllViews();

            var TextView = Java.use('android.widget.TextView');
            var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
            var Color = Java.use('android.graphics.Color');

            // Заголовок
            var header = TextView.$new(ctx);
            header.setText("— " + cat + " —");
            header.setTextColor(Color.parseColor("#FF4444"));
            header.setTextSize(0, 15);
            header.setPadding(5, 8, 5, 12);
            rightPanel.addView(header);

            // Фичи
            var feats = getFeatures(cat);
            for (var i = 0; i < feats.length; i++) {
                addToggleButton(ctx, feats[i]);
            }

        } catch(e) {
            console.log("[BM] showCategory error: " + e);
        }
    }

    // ==========================================
    // КНОПКА ФИЧИ
    // ==========================================
    function addToggleButton(ctx, feat) {
        try {
            var Button = Java.use('android.widget.Button');
            var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
            var Color = Java.use('android.graphics.Color');

            var btn = Button.$new(ctx);
            updateBtnState(btn, feat);

            var lp = LinearLP.$new(-1, -2);
            lp.setMargins(2, 3, 2, 3);
            btn.setLayoutParams(lp);
            btn.setPadding(12, 10, 12, 10);
            btn.setTextSize(0, 11);

            setClick(btn, 'Feat_' + feat.key + '_' + Date.now(), function() {
                Features[feat.key] = !Features[feat.key];
                feat.enabled = Features[feat.key];
                updateBtnState(btn, feat);
                if (feat.onToggle) feat.onToggle(feat.enabled);
                console.log("[BM] " + feat.name + ": " + feat.enabled);
            });

            rightPanel.addView(btn);
        } catch(e) {
            console.log("[BM] addToggleButton error: " + e);
        }
    }

    function updateBtnState(btn, feat) {
        try {
            var Color = Java.use('android.graphics.Color');
            var on = feat.enabled;
            btn.setText((on ? "✓  " : "✗  ") + feat.name);
            btn.setTextColor(on ? Color.parseColor("#00FF66") : Color.parseColor("#FF4444"));
            btn.setBackgroundColor(
                on ? Color.argb(200, 0, 100, 30) : Color.argb(200, 80, 0, 0)
            );
        } catch(e) {}
    }

    // ==========================================
    // HELPER: setClick без дублирования имён
    // ==========================================
    var clickCounter = 0;
    function setClick(view, name, callback) {
        clickCounter++;
        var OnClick = Java.use('android.view.View$OnClickListener');
        var Listener = Java.registerClass({
            name: 'com.bm.' + name + '_' + clickCounter,
            implements: [OnClick],
            methods: {
                onClick: function(v) {
                    try { callback(); } catch(e) {
                        console.log("[BM] click error: " + e);
                    }
                }
            }
        });
        view.setOnClickListener(Listener.$new());
    }

    // ==========================================
    // ФИЧИ + РЕАЛЬНЫЕ ХУКИ
    // ==========================================
    function getFeatures(cat) {
        var all = {
            "Машины": [
                { key: "flyCar",    name: "Fly Car",     enabled: false, onToggle: hook_FlyCar },
                { key: "godMode",   name: "God Car",     enabled: false, onToggle: hook_GodCar },
                { key: "speedHack", name: "Speed x5",    enabled: false, onToggle: hook_Speed  }
            ],
            "Персонаж": [
                { key: "godMode",      name: "God Mode",    enabled: false, onToggle: hook_GodMode },
                { key: "infiniteAmmo", name: "Inf HP",      enabled: false, onToggle: hook_InfHP   }
            ],
            "Перемещение": [
                { key: "speedHack", name: "Speed Hack",  enabled: false, onToggle: hook_Speed    },
                { key: "superJump", name: "Super Jump",  enabled: false, onToggle: hook_Jump     },
                { key: "noClip",    name: "No Clip",     enabled: false, onToggle: hook_NoClip   }
            ],
            "Оружие": [
                { key: "infiniteAmmo", name: "Inf Ammo",  enabled: false, onToggle: hook_Ammo    },
                { key: "noReload",     name: "No Reload", enabled: false, onToggle: hook_Reload  },
                { key: "rapidFire",    name: "Rapid Fire",enabled: false, onToggle: hook_Rapid   }
            ],
            "Боты": [
                { key: "freezeBots", name: "Freeze Bots", enabled: false, onToggle: hook_Freeze  }
            ],
            "Визуал": [
                { key: "esp", name: "ESP", enabled: false, onToggle: hook_ESP }
            ],
            "Другое": [
                { key: "antiBan",   name: "Anti Ban",   enabled: false, onToggle: hook_AntiBan  },
                { key: "unlockAll", name: "Unlock All", enabled: false, onToggle: hook_Unlock   }
            ]
        };
        return all[cat] || [];
    }

    // ==========================================
    // ХУКИ ФИЧ (заглушки - замени на свои)
    // ==========================================
    function hook_FlyCar(state) {
        console.log("[BM] Fly Car = " + state);
        // Java.use("твой.класс").метод.implementation = ...
    }
    function hook_GodCar(state) {
        console.log("[BM] God Car = " + state);
    }
    function hook_Speed(state) {
        console.log("[BM] Speed = " + state);
    }
    function hook_GodMode(state) {
        console.log("[BM] God Mode = " + state);
    }
    function hook_InfHP(state) {
        console.log("[BM] Inf HP = " + state);
    }
    function hook_Jump(state) {
        console.log("[BM] Super Jump = " + state);
    }
    function hook_NoClip(state) {
        console.log("[BM] No Clip = " + state);
    }
    function hook_Ammo(state) {
        console.log("[BM] Inf Ammo = " + state);
    }
    function hook_Reload(state) {
        console.log("[BM] No Reload = " + state);
    }
    function hook_Rapid(state) {
        console.log("[BM] Rapid Fire = " + state);
    }
    function hook_Freeze(state) {
        console.log("[BM] Freeze Bots = " + state);
    }
    function hook_ESP(state) {
        console.log("[BM] ESP = " + state);
    }
    function hook_AntiBan(state) {
        console.log("[BM] Anti Ban = " + state);
    }
    function hook_Unlock(state) {
        console.log("[BM] Unlock All = " + state);
    }

    console.log("[BM] Хуки установлены, ждём Activity...");
});
