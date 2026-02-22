// =====================================================
// BLOODMOON MOD MENU — UI поверх игры (Android 14)
// Инжектируется через Activity.onResume в DecorView
// =====================================================

Java.perform(function() {
    console.log("[BM-UI] Запуск UI меню...");

    // ==========================================
    // СОСТОЯНИЕ — синхронизируется с native скриптом
    // через глобальные переменные
    // ==========================================
    var State = {
        // Читается из native скрипта через global.*
        getSilent:    function() { try { return global.SILENT_COMMAND || ""; } catch(e) { return ""; } },
        getTP:        function() { try { return global.TP_COMMAND || ""; } catch(e) { return ""; } },
        getProcessor: function() { try { return !!global.globalProcessor; } catch(e) { return false; } },
        getRoom:      function() { try { return global.currentRoomId || "?"; } catch(e) { return "?"; } },
        getMyId:      function() { try { return global.myPlayerId || "?"; } catch(e) { return "?"; } },
        getZoneKick:  function() { try { return !!global.zoneKickActive; } catch(e) { return false; } }
    };

    var menuContainer = null;
    var rightPanel = null;
    var menuVisible = false;
    var currentCat = "";
    var clickCounter = 0;

    // ==========================================
    // ХУКИ ACTIVITY — вход в UI поток
    // ==========================================
    var Activity = Java.use('android.app.Activity');
    var injected = false;

    Activity.onResume.implementation = function() {
        this.onResume();
        if (injected) return;
        var act = this;

        act.runOnUiThread(Java.registerClass({
            name: 'com.bm.Inject_' + Date.now(),
            implements: [Java.use('java.lang.Runnable')],
            methods: {
                run: function() {
                    try {
                        buildOverlay(act);
                        injected = true;
                    } catch(e) {
                        console.log("[BM-UI] inject error: " + e);
                    }
                }
            }
        }).$new());
    };

    // ==========================================
    // ПОСТРОЕНИЕ OVERLAY ЧЕРЕЗ DECORVIEW
    // ==========================================
    function buildOverlay(activity) {
        var ctx = activity.getApplicationContext();
        var decorView = Java.cast(
            activity.getWindow().getDecorView(),
            Java.use('android.view.ViewGroup')
        );

        var Color   = Java.use('android.graphics.Color');
        var FrameLP = Java.use('android.widget.FrameLayout$LayoutParams');
        var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
        var FrameLayout = Java.use('android.widget.FrameLayout');
        var Button = Java.use('android.widget.Button');

        // === КНОПКА BM ===
        var trigFrame = FrameLayout.$new(ctx);
        var trigParams = FrameLP.$new(120, 120);
        trigParams.gravity.value = 0x55; // RIGHT | BOTTOM
        trigParams.setMargins(0, 0, 16, 180);
        trigFrame.setLayoutParams(trigParams);
        trigFrame.setBackgroundColor(0x00000000);

        var trigBtn = Button.$new(ctx);
        trigBtn.setText("BM");
        trigBtn.setTextColor(-1);
        trigBtn.setTextSize(0, 13);
        trigBtn.setBackgroundColor(Color.parseColor("#8B0000"));
        trigBtn.setLayoutParams(LinearLP.$new(-1, -1));

        onClick(trigBtn, 'TrigBM', function() {
            if (!menuContainer) {
                buildMenu(ctx, decorView);
                menuVisible = true;
            } else {
                menuVisible = !menuVisible;
                menuContainer.setVisibility(menuVisible ? 0 : 8);
            }
        });

        trigFrame.addView(trigBtn);
        decorView.addView(trigFrame);
        console.log("[BM-UI] Кнопка BM добавлена!");
    }

    // ==========================================
    // ГЛАВНОЕ МЕНЮ
    // ==========================================
    function buildMenu(ctx, root) {
        var Color    = Java.use('android.graphics.Color');
        var FrameLP  = Java.use('android.widget.FrameLayout$LayoutParams');
        var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
        var FrameLayout  = Java.use('android.widget.FrameLayout');
        var LinearLayout = Java.use('android.widget.LinearLayout');
        var ScrollView   = Java.use('android.widget.ScrollView');
        var TextView     = Java.use('android.widget.TextView');
        var Button       = Java.use('android.widget.Button');

        // Внешний контейнер
        var outer = FrameLayout.$new(ctx);
        var outerLP = FrameLP.$new(680, 860);
        outerLP.gravity.value = 17; // CENTER
        outer.setLayoutParams(outerLP);
        outer.setBackgroundColor(Color.argb(250, 10, 10, 10));

        // Горизонтальная раскладка
        var horiz = LinearLayout.$new(ctx);
        horiz.setOrientation(0); // HORIZONTAL
        horiz.setLayoutParams(LinearLP.$new(-1, -1));

        // === ЛЕВАЯ ПАНЕЛЬ ===
        var left = LinearLayout.$new(ctx);
        left.setOrientation(1);
        left.setLayoutParams(LinearLP.$new(210, -1));
        left.setBackgroundColor(Color.argb(255, 35, 0, 0));
        left.setPadding(5, 5, 5, 5);

        // Лого
        var logo = TextView.$new(ctx);
        logo.setText("\uD83E\uDE78 BloodMoon");
        logo.setTextColor(Color.parseColor("#FF3333"));
        logo.setTextSize(0, 13);
        logo.setPadding(8, 12, 8, 8);
        left.addView(logo);

        var sep = TextView.$new(ctx);
        sep.setText("─────────");
        sep.setTextColor(Color.parseColor("#8B0000"));
        sep.setTextSize(0, 9);
        sep.setPadding(5, 2, 5, 8);
        left.addView(sep);

        // Категории
        var cats = [
            "Анимации",
            "Silent Action",
            "Телепорт",
            "Appearance",
            "Zone Kick",
            "Relations",
            "Другое"
        ];

        for (var ci = 0; ci < cats.length; ci++) {
            (function(name, idx) {
                var btn = Button.$new(ctx);
                btn.setText(name);
                btn.setTextColor(-1);
                btn.setTextSize(0, 10);
                btn.setBackgroundColor(
                    idx === 0
                        ? Color.argb(220, 139, 0, 0)
                        : Color.argb(100, 60, 0, 0)
                );
                btn.setPadding(10, 10, 10, 10);
                var lp = LinearLP.$new(-1, -2);
                lp.setMargins(2, 2, 2, 2);
                btn.setLayoutParams(lp);

                onClick(btn, 'Cat_' + idx, function() {
                    showCat(ctx, name);
                });
                left.addView(btn);
            })(cats[ci], ci);
        }

        // Кнопка ЗАКРЫТЬ
        var closeBtn = Button.$new(ctx);
        closeBtn.setText("✕ Закрыть");
        closeBtn.setTextColor(-1);
        closeBtn.setTextSize(0, 10);
        closeBtn.setBackgroundColor(Color.parseColor("#8B0000"));
        closeBtn.setPadding(10, 10, 10, 10);
        var closeLp = LinearLP.$new(-1, -2);
        closeLp.setMargins(2, 12, 2, 2);
        closeBtn.setLayoutParams(closeLp);
        onClick(closeBtn, 'CloseBtn', function() {
            menuVisible = false;
            outer.setVisibility(8);
        });
        left.addView(closeBtn);

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

        horiz.addView(left);
        horiz.addView(scroll);
        outer.addView(horiz);
        root.addView(outer);

        menuContainer = outer;
        showCat(ctx, "Анимации");
        console.log("[BM-UI] Меню создано!");
    }

    // ==========================================
    // ОТОБРАЖЕНИЕ КАТЕГОРИИ
    // ==========================================
    function showCat(ctx, cat) {
        if (!rightPanel || currentCat === cat) return;
        currentCat = cat;

        var Color    = Java.use('android.graphics.Color');
        var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
        var TextView = Java.use('android.widget.TextView');
        var Button   = Java.use('android.widget.Button');

        rightPanel.removeAllViews();

        // Заголовок
        var hdr = TextView.$new(ctx);
        hdr.setText("— " + cat + " —");
        hdr.setTextColor(Color.parseColor("#FF4444"));
        hdr.setTextSize(0, 14);
        hdr.setPadding(5, 8, 5, 12);
        rightPanel.addView(hdr);

        // Кнопки категории
        var items = getCatItems(cat);
        for (var i = 0; i < items.length; i++) {
            addItem(ctx, items[i]);
        }
    }

    // ==========================================
    // ДОБАВЛЕНИЕ ЭЛЕМЕНТА
    // ==========================================
    function addItem(ctx, item) {
        var Color    = Java.use('android.graphics.Color');
        var LinearLP = Java.use('android.widget.LinearLayout$LayoutParams');
        var Button   = Java.use('android.widget.Button');

        if (item.type === "button") {
            var btn = Button.$new(ctx);
            btn.setText(item.label);
            btn.setTextColor(-1);
            btn.setTextSize(0, 10);
            btn.setBackgroundColor(Color.argb(200, 80, 0, 0));
            btn.setPadding(12, 10, 12, 10);
            var lp = LinearLP.$new(-1, -2);
            lp.setMargins(2, 3, 2, 3);
            btn.setLayoutParams(lp);
            var cb = item.action;
            onClick(btn, 'Btn_' + item.label.replace(/\s/g, '_') + '_' + clickCounter, function() {
                cb();
            });
            rightPanel.addView(btn);
        }

        if (item.type === "toggle") {
            var tBtn = Button.$new(ctx);
            var state = { on: item.getState ? item.getState() : false };

            function updateToggle() {
                state.on = item.getState ? item.getState() : state.on;
                tBtn.setText((state.on ? "✓  " : "✗  ") + item.label);
                tBtn.setTextColor(
                    state.on ? Color.parseColor("#00FF66") : Color.parseColor("#FF4444")
                );
                tBtn.setBackgroundColor(
                    state.on ? Color.argb(200, 0, 100, 30) : Color.argb(200, 80, 0, 0)
                );
            }

            updateToggle();
            tBtn.setTextSize(0, 10);
            tBtn.setPadding(12, 10, 12, 10);
            var tlp = LinearLP.$new(-1, -2);
            tlp.setMargins(2, 3, 2, 3);
            tBtn.setLayoutParams(tlp);

            var tItem = item;
            var tState = state;
            onClick(tBtn, 'Toggle_' + item.label.replace(/\s/g, '_') + '_' + clickCounter, function() {
                tState.on = !tState.on;
                if (tItem.action) tItem.action(tState.on);
                updateToggle();
            });
            rightPanel.addView(tBtn);
        }
    }

    // ==========================================
    // КАТЕГОРИИ И ИХ КНОПКИ
    // ==========================================
    function getCatItems(cat) {
        var items = {

            // ─────────────────────────────────────
            "Анимации": [
                {
                    type: "button",
                    label: "🎸 Гитара",
                    action: function() { sendChat("!guitar"); }
                },
                {
                    type: "button",
                    label: "🤖 КиберТанец",
                    action: function() { sendChat("!cyber"); }
                },
                {
                    type: "button",
                    label: "🎧 DJ",
                    action: function() { sendChat("!dj"); }
                },
                {
                    type: "button",
                    label: "📋 Статус анимации",
                    action: function() { sendChat("!status"); }
                },
                {
                    type: "button",
                    label: "🔁 Дублировать x10",
                    action: function() { sendChat("!dupe 10"); }
                },
                {
                    type: "button",
                    label: "🔁 Дублировать x50",
                    action: function() { sendChat("!dupe 50"); }
                },
                {
                    type: "button",
                    label: "⏹ Выключить ВСЁ",
                    action: function() { sendChat("!off"); }
                }
            ],

            // ─────────────────────────────────────
            "Silent Action": [
                {
                    type: "toggle",
                    label: "💋 Поцелуй (подход)",
                    getState: function() { return State.getSilent() === "r.ks"; },
                    action: function(on) {
                        if (on) sendChat("!kiss");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "💋💋 Долгий поцелуй",
                    getState: function() { return State.getSilent() === "r.kl"; },
                    action: function(on) {
                        if (on) sendChat("!kisslong");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "🤗 Обнять",
                    getState: function() { return State.getSilent() === "r.hg"; },
                    action: function(on) {
                        if (on) sendChat("!hug");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "💃 Парный танец",
                    getState: function() { return State.getSilent() === "r.pd"; },
                    action: function(on) {
                        if (on) sendChat("!danceaction");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "🖐 Дай пять",
                    getState: function() { return State.getSilent() === "r.hf"; },
                    action: function(on) {
                        if (on) sendChat("!fiveaction");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "button",
                    label: "⏹ Выключить silent",
                    action: function() { sendChat("!silentoff"); }
                }
            ],

            // ─────────────────────────────────────
            "Телепорт": [
                {
                    type: "toggle",
                    label: "⚡ TP Поцелуй",
                    getState: function() { return State.getTP() === "r.ks"; },
                    action: function(on) {
                        if (on) sendChat("!tpkiss");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "⚡ TP Долгий поцелуй",
                    getState: function() { return State.getTP() === "r.kl"; },
                    action: function(on) {
                        if (on) sendChat("!tpkisslong");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "⚡ TP Обнять",
                    getState: function() { return State.getTP() === "r.hg"; },
                    action: function(on) {
                        if (on) sendChat("!tphug");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "⚡ TP Танец",
                    getState: function() { return State.getTP() === "r.pd"; },
                    action: function(on) {
                        if (on) sendChat("!tpdance");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "⚡ TP Дай пять",
                    getState: function() { return State.getTP() === "r.hf"; },
                    action: function(on) {
                        if (on) sendChat("!tpfive");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "toggle",
                    label: "⚡ TP Пнуть",
                    getState: function() { return State.getTP() === "r.ka"; },
                    action: function(on) {
                        if (on) sendChat("!tpkick");
                        else sendChat("!silentoff");
                    }
                },
                {
                    type: "button",
                    label: "⏹ Выключить TP",
                    action: function() { sendChat("!silentoff"); }
                }
            ],

            // ─────────────────────────────────────
            "Appearance": [
                {
                    type: "button",
                    label: "📋 Показать внешность",
                    action: function() { sendChat("!look"); }
                },
                {
                    type: "button",
                    label: "🔑 Показать ключи",
                    action: function() { sendChat("!keys"); }
                },
                {
                    type: "button",
                    label: "👱 Волосы тип +1",
                    action: function() {
                        try {
                            var ht = (global.appearanceData && global.appearanceData.appearance.ht) || 0;
                            sendChat("!hairtype " + (ht + 1));
                        } catch(e) { sendChat("!hairtype 1"); }
                    }
                },
                {
                    type: "button",
                    label: "🎨 Цвет волос +1",
                    action: function() {
                        try {
                            var hc = (global.appearanceData && global.appearanceData.appearance.hc) || 0;
                            sendChat("!haircolor " + (hc + 1));
                        } catch(e) { sendChat("!haircolor 1"); }
                    }
                },
                {
                    type: "button",
                    label: "👁 Тип глаз +1",
                    action: function() {
                        try {
                            var et = (global.appearanceData && global.appearanceData.appearance.et) || 0;
                            sendChat("!eyetype " + (et + 1));
                        } catch(e) { sendChat("!eyetype 1"); }
                    }
                },
                {
                    type: "button",
                    label: "🎨 Цвет глаз +1",
                    action: function() {
                        try {
                            var ec = (global.appearanceData && global.appearanceData.appearance.ec) || 0;
                            sendChat("!eyes " + (ec + 1));
                        } catch(e) { sendChat("!eyes 1"); }
                    }
                },
                {
                    type: "button",
                    label: "🔀 Random Combo",
                    action: function() {
                        sendChat("!random hc:1,2,3,4,5,6,7,8 ec:1,2,3,4,5 brc:1,2,3 2000");
                    }
                },
                {
                    type: "button",
                    label: "⏹ Стоп",
                    action: function() { sendChat("!stop"); }
                }
            ],

            // ─────────────────────────────────────
            "Zone Kick": [
                {
                    type: "toggle",
                    label: "🔴 Zone Kick ВСЕХ",
                    getState: function() { return State.getZoneKick(); },
                    action: function(on) {
                        if (on) sendChat("!kickall");
                        else sendChat("!stopkickall");
                    }
                },
                {
                    type: "button",
                    label: "👥 Список игроков",
                    action: function() { sendChat("!players"); }
                },
                {
                    type: "button",
                    label: "🚪 Кикнуть всех сейчас",
                    action: function() { sendChat("!kickall"); }
                },
                {
                    type: "button",
                    label: "⏹ Остановить кик",
                    action: function() { sendChat("!stopkickall"); }
                },
                {
                    type: "button",
                    label: "🗑 Очистить список",
                    action: function() { sendChat("!clearplayers"); }
                },
                {
                    type: "button",
                    label: "📍 Текущая комната",
                    action: function() { sendChat("!room"); }
                },
                {
                    type: "button",
                    label: "🆔 Мой ID",
                    action: function() { sendChat("!myid"); }
                }
            ],

            // ─────────────────────────────────────
            "Relations": [
                {
                    type: "button",
                    label: "❤ В друзья (нужен ID)",
                    action: function() {
                        try {
                            var tid = global.lastTarget || "";
                            if (tid) sendChat("!tofriend " + tid);
                            else console.log("[BM-UI] Нет цели! Нажми на игрока");
                        } catch(e) {}
                    }
                },
                {
                    type: "button",
                    label: "📊 Статус системы",
                    action: function() { sendChat("!who"); }
                }
            ],

            // ─────────────────────────────────────
            "Другое": [
                {
                    type: "button",
                    label: "🎓 Пропустить туториал",
                    action: function() { sendChat("!skip"); }
                },
                {
                    type: "button",
                    label: "💼 Собрать работу",
                    action: function() { sendChat("!work"); }
                },
                {
                    type: "button",
                    label: "🐛 Debug меню",
                    action: function() { sendChat("!debug"); }
                },
                {
                    type: "button",
                    label: "📊 Полный статус",
                    action: function() { sendChat("!status"); }
                },
                {
                    type: "button",
                    label: "❓ Помощь",
                    action: function() { sendChat("!help"); }
                },
                {
                    type: "button",
                    label: "⏹ Выключить ВСЁ",
                    action: function() { sendChat("!off"); }
                }
            ]
        };

        return items[cat] || [];
    }

    // ==========================================
    // ОТПРАВКА КОМАНДЫ В ЧАТ (через native скрипт)
    // ==========================================
    function sendChat(cmd) {
        try {
            // Способ 1: через глобальный обработчик native скрипта
            // Эмулируем команду чата напрямую
            console.log("[BM-UI CMD] " + cmd);

            // Парсим команду и вызываем напрямую
            var parts = cmd.trim().split(" ");
            var c = parts[0];
            var a1 = parts[1];
            var a2 = parts[2];

            // Анимации
            if (c === "!guitar")   { try { global.nextNet = { gr: "skygacha26_guitar_off", at: "PlayGuitNew1" }; global.isLocked = true; global.validVTable = null; } catch(e) {} }
            if (c === "!cyber")    { try { global.nextNet = { gr: "myAvatar", at: "est23solodnc" }; global.isLocked = true; global.validVTable = null; } catch(e) {} }
            if (c === "!dj")       { try { global.nextNet = { gr: "danceroom_djpult_off", at: "Dj" }; global.isLocked = true; global.validVTable = null; } catch(e) {} }
            if (c === "!off")      { try { global.nextNet = null; global.isLocked = false; global.SILENT_COMMAND = ""; global.TP_COMMAND = ""; global.pendingSilentReplace = ""; global.stopAllTimers(); } catch(e) {} }
            if (c === "!stop")     { try { global.stopAllTimers(); } catch(e) {} }

            // Silent
            if (c === "!kiss")        { try { global.SILENT_COMMAND = "r.ks"; global.TP_COMMAND = ""; } catch(e) {} }
            if (c === "!kisslong")    { try { global.SILENT_COMMAND = "r.kl"; global.TP_COMMAND = ""; } catch(e) {} }
            if (c === "!hug")         { try { global.SILENT_COMMAND = "r.hg"; global.TP_COMMAND = ""; } catch(e) {} }
            if (c === "!danceaction") { try { global.SILENT_COMMAND = "r.pd"; global.TP_COMMAND = ""; } catch(e) {} }
            if (c === "!fiveaction")  { try { global.SILENT_COMMAND = "r.hf"; global.TP_COMMAND = ""; } catch(e) {} }
            if (c === "!silentoff")   { try { global.SILENT_COMMAND = ""; global.TP_COMMAND = ""; global.pendingSilentReplace = ""; } catch(e) {} }

            // Teleport
            if (c === "!tpkiss")     { try { global.TP_COMMAND = "r.ks"; global.SILENT_COMMAND = ""; } catch(e) {} }
            if (c === "!tpkisslong") { try { global.TP_COMMAND = "r.kl"; global.SILENT_COMMAND = ""; } catch(e) {} }
            if (c === "!tphug")      { try { global.TP_COMMAND = "r.hg"; global.SILENT_COMMAND = ""; } catch(e) {} }
            if (c === "!tpdance")    { try { global.TP_COMMAND = "r.pd"; global.SILENT_COMMAND = ""; } catch(e) {} }
            if (c === "!tpfive")     { try { global.TP_COMMAND = "r.hf"; global.SILENT_COMMAND = ""; } catch(e) {} }
            if (c === "!tpkick")     { try { global.TP_COMMAND = "r.ka"; global.SILENT_COMMAND = ""; } catch(e) {} }

            // Zone Kick
            if (c === "!kickall")     { try { global.startZoneKick(); } catch(e) {} }
            if (c === "!stopkickall") { try { global.stopZoneKick(); } catch(e) {} }
            if (c === "!clearplayers"){ try { global.foundPlayers = {}; global.kickQueue = []; } catch(e) {} }

            // Другое
            if (c === "!skip")   { try { global.skipTutorial(); } catch(e) {} }
            if (c === "!work")   { try { global.smartFinishAll(); } catch(e) {} }
            if (c === "!debug")  { try { global.openDebugMenu(); } catch(e) {} }
            if (c === "!status") { try { global.who(); } catch(e) {} }
            if (c === "!who")    { try { global.who(); } catch(e) {} }

            // Appearance
            if (c === "!hairtype" && a1)  { try { global.sendAppearance({"ht": parseInt(a1)}); } catch(e) {} }
            if (c === "!haircolor" && a1) { try { global.sendAppearance({"hc": parseInt(a1)}); } catch(e) {} }
            if (c === "!eyes" && a1)      { try { global.sendAppearance({"ec": parseInt(a1)}); } catch(e) {} }
            if (c === "!eyetype" && a1)   { try { global.sendAppearance({"et": parseInt(a1)}); } catch(e) {} }
            if (c === "!look")  { try { global.showAppearance(); } catch(e) {} }
            if (c === "!keys")  { try { global.showKeys(); } catch(e) {} }
            if (c === "!stop")  { try { global.stopAllTimers(); } catch(e) {} }
            if (c === "!random" && a1) { parseAndRunRandom(parts.slice(1)); }

            // Relations
            if (c === "!tofriend" && a1) { try { global.chainToFriend(a1, 2500); } catch(e) {} }

            // Dupe
            if (c === "!dupe" && a1) { try { global.duplicateRequest(parseInt(a1) || 20, 200); } catch(e) {} }

        } catch(e) {
            console.log("[BM-UI] sendChat error: " + e);
        }
    }

    function parseAndRunRandom(args) {
        try {
            var config = {};
            var interval = 2000;
            for (var i = 0; i < args.length; i++) {
                var p = args[i];
                if (p.indexOf(":") !== -1) {
                    var kv = p.split(":");
                    config[kv[0]] = kv[1].split(",").map(function(x) { return parseInt(x); });
                } else {
                    interval = parseInt(p) || 2000;
                }
            }
            if (Object.keys(config).length > 0) global.randomAppearance(config, interval);
        } catch(e) {}
    }

    // ==========================================
    // HELPER: onClick с уникальным именем
    // ==========================================
    function onClick(view, name, cb) {
        clickCounter++;
        var Listener = Java.registerClass({
            name: 'com.bm.L_' + name + '_' + clickCounter,
            implements: [Java.use('android.view.View$OnClickListener')],
            methods: {
                onClick: function(v) {
                    try { cb(); } catch(e) {
                        console.log("[BM-UI] click error: " + e);
                    }
                }
            }
        });
        view.setOnClickListener(Listener.$new());
    }

    console.log("[BM-UI] Хуки Activity установлены, ждём запуска...");
});
