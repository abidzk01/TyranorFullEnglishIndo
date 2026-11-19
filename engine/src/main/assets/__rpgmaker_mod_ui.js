(function () {
  "use strict";
  if (window.TyranorModUI || !window.TyranorMod) return;
  var mod = window.TyranorMod;
  var root = null;
  var launcher = null;
  var dragState = null; // { startX, startY, startLeft, startTop, moved }
  var justDragged = false; // set on pointerup, reset after click consumes it
  var userDragged = false; // user dragged manually; positionLauncher must not override
  var LAUNCHER_POS_KEY = "tyranor_mod_fab_pos";
  var activeTab = "quick";
  var context = { actorId: 0, itemKind: "item", systemKind: "switch" };

  // UI language follows the launcher language passed through the native bridge.
  var locale = (function () {
    var tag = "";
    try {
      var bridge = window.TyranorModNative;
      if (bridge && bridge.uiLanguage) tag = String(bridge.uiLanguage() || "");
    } catch (e) { tag = ""; }
    tag = tag.toLowerCase();
    if (tag.indexOf("id") === 0) return "id";
    if (tag.indexOf("zh") === 0) return "zh";
    if (tag.indexOf("ja") === 0) return "ja";
    return "en";
  })();

  var STRINGS = {
    en: {
      tabQuick: "Quick", tabItems: "Items", tabActors: "Actors", tabSystem: "System",
      tabMap: "Map", tabBattle: "Battle", tabSave: "Save", tabKeys: "Keys", tabAbout: "About",
      flagGodMode: "God mode", flagOneHit: "One-hit kill", flagAlwaysCrit: "Always critical",
      flagNoclip: "No clip", flagEventSpeed: "Faster events", flagMsgSkip: "Skip messages",
      toastFailed: "Action failed", toastDone: "Done",
      readyNote: "Start or load a game first; the modifier is waiting for the RPG Maker runtime.",
      goldCurrent: "Current gold", setBtn: "Set", maxBtn: "Max",
      recoverParty: "Heal party", refreshPage: "Refresh page",
      runtimeToggles: "Runtime toggles", gold: "Gold", party: "Party",
      kindItem: "Items", kindWeapon: "Weapons", kindArmor: "Armor",
      searchName: "Search name", searchBtn: "Search", itemDb: "Item database",
      loading: "Loading...", noMatch: "No matching entries", applyBtn: "Apply",
      noPartyActors: "The current party has no actors", recoverBtn: "Heal",
      none: "None", slot: "Slot ", listSep: ", ",
      skillId: "Skill ID", learnBtn: "Learn", forgetBtn: "Forget",
      stateId: "State ID", addStateBtn: "Add", removeStateBtn: "Remove",
      equipSlot: "Slot", equipId: "Equip ID, 0 = unequip", changeEquipBtn: "Change",
      attributes: "Attributes", skills: "Skills", states: "States", equipment: "Equipment",
      kindSwitch: "Switches", kindVariable: "Variables",
      switchAndVariable: "Switches and variables", nameOrId: "Name or ID",
      mapPosPrefix: "Map", coords: ", coords (", notOnMap: "Not on a map",
      currentPos: "Current position", mapId: "Map ID", teleportBtn: "Teleport",
      mapList: "Map list", selectBtn: "Select",
      notInBattle: "Not in battle", killAll: "Defeat all enemies", forceVictory: "Force victory",
      forceEscape: "Force escape", battleOps: "Battle actions", enemies: "Enemies", allies: "Allies",
      saveMgmt: "Save management", reading: "Reading...", saveSlot: "Save",
      hasData: "Existing data", empty: "Empty",
      saveBtn: "Save", loadBtn: "Load", deleteBtn: "Delete",
      modTitle: "RPG Maker modifier", version: "Version ",
      aboutDesc: "The modifier only touches runtime objects of the current RPG Maker MV/MZ game. Deeply customized plugins may override standard engine APIs; if something breaks, disable the modifier in the per-game settings.",
      aboutWarn: "Faster events and message skipping may skip scenes or waits. Save the game first.",
      keysTitle: "Virtual pad",
      keysIntro: "The pad layer is implemented natively; you can customize each button's position, label, size and output key. In edit mode:",
      keysBullet1: "Tap a button to select it, drag to move it",
      keysBullet2: "Use the side panel to change label / size / keys",
      keysBullet3: "Copy or delete buttons, or restore defaults",
      keysBullet4: "Changes take effect right after saving",
      enterEdit: "Edit buttons", resetDefault: "Restore defaults",
      keysDisabled: "The virtual pad is disabled. Enable it in the app's engine settings.",
      launcherAria: "Open RPG Maker modifier", closeAria: "Close",
      savedToast: "Settings saved", goldChanged: "Gold updated", goldMaxed: "Gold maximized",
      partyRecovered: "Party healed", countChanged: "Count updated", actorRecovered: "Actor healed",
      statChanged: "Stat updated", equipChanged: "Equipment changed", systemChanged: "System value updated",
      teleportQueued: "Teleport queued", savedDone: "Save complete", loadDone: "Load complete",
      saveDeleted: "Save deleted", padDisabled: "The virtual pad is disabled", defaultsRestored: "Defaults restored"
    },
    id: {
      tabQuick: "Cepat", tabItems: "Item", tabActors: "Aktor", tabSystem: "Sistem",
      tabMap: "Peta", tabBattle: "Pertarungan", tabSave: "Save", tabKeys: "Tombol", tabAbout: "Tentang",
      flagGodMode: "Mode dewa", flagOneHit: "Sekali hantam", flagAlwaysCrit: "Selalu kritis",
      flagNoclip: "Tembus dinding", flagEventSpeed: "Percepat event", flagMsgSkip: "Lewati dialog",
      toastFailed: "Tindakan gagal", toastDone: "Selesai",
      readyNote: "Mulai atau muat game terlebih dahulu; pengubah sedang menunggu runtime RPG Maker.",
      goldCurrent: "Emas saat ini", setBtn: "Atur", maxBtn: "Maksimum",
      recoverParty: "Pulihkan tim", refreshPage: "Muat ulang halaman",
      runtimeToggles: "Sakelar runtime", gold: "Emas", party: "Tim",
      kindItem: "Item", kindWeapon: "Senjata", kindArmor: "Armor",
      searchName: "Cari nama", searchBtn: "Cari", itemDb: "Basis data item",
      loading: "Memuat...", noMatch: "Tidak ada entri yang cocok", applyBtn: "Terapkan",
      noPartyActors: "Tim saat ini tidak memiliki aktor", recoverBtn: "Pulihkan",
      none: "Tidak ada", slot: "Slot ", listSep: ", ",
      skillId: "ID keterampilan", learnBtn: "Pelajari", forgetBtn: "Lupakan",
      stateId: "ID status", addStateBtn: "Tambahkan", removeStateBtn: "Hapus",
      equipSlot: "Slot", equipId: "ID equipment, 0 = lepas", changeEquipBtn: "Ganti",
      attributes: "Atribut", skills: "Keterampilan", states: "Status", equipment: "Equipment",
      kindSwitch: "Sakelar", kindVariable: "Variabel",
      switchAndVariable: "Sakelar dan variabel", nameOrId: "Nama atau ID",
      mapPosPrefix: "Peta", coords: ", koordinat (", notOnMap: "Tidak di peta",
      currentPos: "Posisi saat ini", mapId: "ID peta", teleportBtn: "Teleportasi",
      mapList: "Daftar peta", selectBtn: "Pilih",
      notInBattle: "Tidak dalam pertarungan", killAll: "Kalahkan semua musuh", forceVictory: "Paksa menang",
      forceEscape: "Paksa kabur", battleOps: "Aksi pertarungan", enemies: "Musuh", allies: "Sekutu",
      saveMgmt: "Pengelolaan save", reading: "Membaca...", saveSlot: "Save",
      hasData: "Ada data", empty: "Kosong",
      saveBtn: "Simpan", loadBtn: "Muat", deleteBtn: "Hapus",
      modTitle: "Pengubah RPG Maker", version: "Versi ",
      aboutDesc: "Pengubah hanya menyentuh objek runtime game RPG Maker MV/MZ saat ini. Plugin yang sangat dikustomisasi dapat menimpa API mesin standar; bila terjadi masalah, nonaktifkan pengubah di pengaturan per game.",
      aboutWarn: "Percepat event dan lewati dialog dapat melewati adegan atau penantian. Simpan game terlebih dahulu.",
      keysTitle: "Pad virtual",
      keysIntro: "Lapisan tombol diimplementasikan secara native; posisi, label, ukuran, dan tombol keluaran tiap tombol dapat disesuaikan. Saat mengedit:",
      keysBullet1: "Ketuk tombol untuk memilih, seret untuk memindahkan",
      keysBullet2: "Panel samping mengubah label / ukuran / tombol",
      keysBullet3: "Salin atau hapus tombol, atau kembalikan bawaan",
      keysBullet4: "Perubahan langsung berlaku setelah disimpan",
      enterEdit: "Edit tombol", resetDefault: "Kembalikan bawaan",
      keysDisabled: "Pad virtual belum diaktifkan. Aktifkan di pengaturan mesin aplikasi.",
      launcherAria: "Buka pengubah RPG Maker", closeAria: "Tutup",
      savedToast: "Pengaturan tersimpan", goldChanged: "Emas diperbarui", goldMaxed: "Emas dimaksimalkan",
      partyRecovered: "Tim dipulihkan", countChanged: "Jumlah diperbarui", actorRecovered: "Aktor dipulihkan",
      statChanged: "Atribut diperbarui", equipChanged: "Equipment diganti", systemChanged: "Nilai sistem diperbarui",
      teleportQueued: "Teleportasi dijadwalkan", savedDone: "Penyimpanan selesai", loadDone: "Pemuatan selesai",
      saveDeleted: "Save dihapus", padDisabled: "Pad virtual belum diaktifkan", defaultsRestored: "Bawaan dipulihkan"
    },
    zh: {
      tabQuick: "快捷", tabItems: "物品", tabActors: "角色", tabSystem: "系统",
      tabMap: "地图", tabBattle: "战斗", tabSave: "存档", tabKeys: "键盘", tabAbout: "说明",
      flagGodMode: "无敌", flagOneHit: "一击必杀", flagAlwaysCrit: "必定暴击",
      flagNoclip: "穿墙", flagEventSpeed: "事件加速", flagMsgSkip: "对话快进",
      toastFailed: "操作失败", toastDone: "完成",
      readyNote: "请先进入游戏存档或开始新游戏,修改器正在等待 RPG Maker 运行时就绪。",
      goldCurrent: "当前金币", setBtn: "设置", maxBtn: "拉满",
      recoverParty: "全体恢复", refreshPage: "刷新页面",
      runtimeToggles: "运行时开关", gold: "金币", party: "队伍",
      kindItem: "物品", kindWeapon: "武器", kindArmor: "护甲",
      searchName: "搜索名称", searchBtn: "搜索", itemDb: "物品数据库",
      loading: "加载中...", noMatch: "没有匹配项目", applyBtn: "应用",
      noPartyActors: "当前队伍没有角色", recoverBtn: "恢复",
      none: "无", slot: "槽位", listSep: "、",
      skillId: "技能 ID", learnBtn: "学习", forgetBtn: "遗忘",
      stateId: "状态 ID", addStateBtn: "附加", removeStateBtn: "移除",
      equipSlot: "槽位", equipId: "装备 ID,0=卸下", changeEquipBtn: "更换",
      attributes: "属性", skills: "技能", states: "状态", equipment: "装备",
      kindSwitch: "开关", kindVariable: "变量",
      switchAndVariable: "开关与变量", nameOrId: "名称或 ID",
      mapPosPrefix: "地图", coords: ",坐标 (", notOnMap: "当前不在地图",
      currentPos: "当前位置", mapId: "地图 ID", teleportBtn: "传送",
      mapList: "地图列表", selectBtn: "选择",
      notInBattle: "当前不在战斗中", killAll: "消灭全部敌人", forceVictory: "强制胜利",
      forceEscape: "强制逃跑", battleOps: "战斗操作", enemies: "敌方", allies: "我方",
      saveMgmt: "存档管理", reading: "读取中...", saveSlot: "存档",
      hasData: "已有数据", empty: "空",
      saveBtn: "保存", loadBtn: "读取", deleteBtn: "删除",
      modTitle: "RPG Maker 修改器", version: "版本 ",
      aboutDesc: "修改器只操作当前 RPG Maker MV/MZ 游戏的运行时对象。部分深度定制插件可能覆盖标准引擎 API;遇到异常时可在单游戏设置中关闭修改器。",
      aboutWarn: "事件加速和对话快进可能跳过演出或等待,建议先保存游戏。",
      keysTitle: "虚拟按键",
      keysIntro: "按键层由应用原生实现,可自定义按键的位置、文字、大小与输出键位。进入编辑后:",
      keysBullet1: "点按按键选中,拖拽调整位置",
      keysBullet2: "右侧面板改文字 / 尺寸 / 键位",
      keysBullet3: "可复制、删除按键,或恢复默认",
      keysBullet4: "保存后立即生效",
      enterEdit: "进入按键编辑", resetDefault: "恢复默认",
      keysDisabled: "当前未启用虚拟按键。可在应用的引擎设置中开启。",
      launcherAria: "打开 RPG Maker 修改器", closeAria: "关闭",
      savedToast: "设置已保存", goldChanged: "金币已修改", goldMaxed: "金币已拉满",
      partyRecovered: "队伍已恢复", countChanged: "数量已修改", actorRecovered: "角色已恢复",
      statChanged: "属性已修改", equipChanged: "装备已更换", systemChanged: "系统值已修改",
      teleportQueued: "已预约传送", savedDone: "保存完成", loadDone: "读取完成",
      saveDeleted: "存档已删除", padDisabled: "当前未启用虚拟按键", defaultsRestored: "已恢复默认"
    },
    ja: {
      tabQuick: "クイック", tabItems: "アイテム", tabActors: "アクター", tabSystem: "システム",
      tabMap: "マップ", tabBattle: "バトル", tabSave: "セーブ", tabKeys: "キーボード", tabAbout: "説明",
      flagGodMode: "無敵", flagOneHit: "一撃必殺", flagAlwaysCrit: "必ずクリティカル",
      flagNoclip: "壁抜け", flagEventSpeed: "イベント加速", flagMsgSkip: "メッセージ早送り",
      toastFailed: "操作に失敗しました", toastDone: "完了",
      readyNote: "先にゲームを開始するかセーブを読み込んでください。改造ツールは RPG Maker ランタイムの準備を待っています。",
      goldCurrent: "現在の所持金", setBtn: "設定", maxBtn: "最大化",
      recoverParty: "全員回復", refreshPage: "ページを再読み込み",
      runtimeToggles: "ランタイムスイッチ", gold: "所持金", party: "パーティ",
      kindItem: "アイテム", kindWeapon: "武器", kindArmor: "防具",
      searchName: "名前で検索", searchBtn: "検索", itemDb: "アイテムデータベース",
      loading: "読み込み中...", noMatch: "一致する項目がありません", applyBtn: "適用",
      noPartyActors: "現在のパーティにアクターがいません", recoverBtn: "回復",
      none: "なし", slot: "スロット", listSep: "、",
      skillId: "スキル ID", learnBtn: "習得", forgetBtn: "忘却",
      stateId: "状態 ID", addStateBtn: "付与", removeStateBtn: "解除",
      equipSlot: "スロット", equipId: "装備 ID、0 = 外す", changeEquipBtn: "変更",
      attributes: "能力値", skills: "スキル", states: "状態", equipment: "装備",
      kindSwitch: "スイッチ", kindVariable: "変数",
      switchAndVariable: "スイッチと変数", nameOrId: "名前または ID",
      mapPosPrefix: "マップ", coords: "、座標 (", notOnMap: "マップ上にいません",
      currentPos: "現在位置", mapId: "マップ ID", teleportBtn: "移動",
      mapList: "マップ一覧", selectBtn: "選択",
      notInBattle: "バトル中ではありません", killAll: "敵を全滅", forceVictory: "強制勝利",
      forceEscape: "強制逃走", battleOps: "バトル操作", enemies: "敵", allies: "味方",
      saveMgmt: "セーブ管理", reading: "読み込み中...", saveSlot: "セーブ",
      hasData: "データあり", empty: "空き",
      saveBtn: "保存", loadBtn: "読み込み", deleteBtn: "削除",
      modTitle: "RPG Maker 改造ツール", version: "バージョン ",
      aboutDesc: "改造ツールは現在の RPG Maker MV/MZ ゲームのランタイムオブジェクトだけを操作します。深度にカスタマイズされたプラグインは標準 API を上書きする場合があります。異常が起きたらゲーム別設定で改造ツールをオフにしてください。",
      aboutWarn: "イベント加速とメッセージ早送りは演出や待機を飛ばす場合があります。先にゲームを保存してください。",
      keysTitle: "バーチャルパッド",
      keysIntro: "ボタン層はアプリ側のネイティブ実装です。各ボタンの位置、ラベル、サイズ、出力キーを変更できます。編集モードでは:",
      keysBullet1: "ボタンをタップして選択し、ドラッグで移動",
      keysBullet2: "右パネルでラベル / サイズ / キーを変更",
      keysBullet3: "ボタンの複製・削除、または初期化",
      keysBullet4: "保存するとすぐに反映",
      enterEdit: "ボタンを編集", resetDefault: "初期化",
      keysDisabled: "バーチャルパッドは無効です。アプリのエンジン設定で有効にしてください。",
      launcherAria: "RPG Maker 改造ツールを開く", closeAria: "閉じる",
      savedToast: "設定を保存しました", goldChanged: "所持金を変更しました", goldMaxed: "所持金を最大化しました",
      partyRecovered: "パーティを回復しました", countChanged: "数量を変更しました", actorRecovered: "アクターを回復しました",
      statChanged: "能力値を変更しました", equipChanged: "装備を変更しました", systemChanged: "システム値を変更しました",
      teleportQueued: "移動を予約しました", savedDone: "セーブしました", loadDone: "ロードしました",
      saveDeleted: "セーブを削除しました", padDisabled: "バーチャルパッドは無効です", defaultsRestored: "初期化しました"
    }
  };

  function L(key) {
    var pack = STRINGS[locale] || STRINGS.en;
    return pack[key] || STRINGS.en[key] || key;
  }

  var tabs = [
    ["quick", "tabQuick"], ["items", "tabItems"], ["actors", "tabActors"], ["system", "tabSystem"],
    ["map", "tabMap"], ["battle", "tabBattle"], ["save", "tabSave"], ["keys", "tabKeys"], ["about", "tabAbout"]
  ];
  var flags = [
    ["godMode", "flagGodMode"], ["oneHit", "flagOneHit"], ["alwaysCrit", "flagAlwaysCrit"],
    ["noclip", "flagNoclip"], ["eventSpeed", "flagEventSpeed"], ["msgSkip", "flagMsgSkip"]
  ];
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>'"]/g, function (c) { return ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]; }); }
  function inputValue(id) { var node = root && root.querySelector("#" + id); return node ? node.value : ""; }
  function checked(id) { var node = root && root.querySelector("#" + id); return !!(node && node.checked); }
  function toast(message, error) {
    if (!root) return;
    var old = root.querySelector(".tm-toast"); if (old) old.remove();
    var node = document.createElement("div"); node.className = "tm-toast"; node.textContent = message || (error ? L("toastFailed") : L("toastDone"));
    if (error) node.style.background = "#8c1d18";
    root.appendChild(node); setTimeout(function () { if (node.parentNode) node.remove(); }, 2200);
  }
  function run(operation, success) {
    try {
      return Promise.resolve(operation()).then(function (value) { if (success) success(value); return value; }).catch(function (error) { console.error(error); toast(error.message || String(error), true); });
    } catch (error) { console.error(error); toast(error.message || String(error), true); return Promise.resolve(); }
  }
  function card(title, body) { return '<section class="tm-card"><h3>' + escapeHtml(title) + '</h3>' + body + '</section>'; }
  function row(label, control) { return '<div class="tm-row"><label>' + escapeHtml(label) + '</label>' + control + '</div>'; }
  function button(text, action, extra, data) { return '<button class="tm-btn ' + (extra || "") + '" data-action="' + action + '" ' + (data || "") + '>' + escapeHtml(text) + '</button>'; }
  function textInput(id, value, type, attrs) { return '<input class="tm-input" id="' + id + '" type="' + (type || "text") + '" value="' + escapeHtml(value == null ? "" : value) + '" ' + (attrs || "") + '>'; }
  function render() {
    if (!root) return;
    var content = root.querySelector(".tm-content");
    root.querySelectorAll(".tm-tab").forEach(function (node) { node.classList.toggle("active", node.dataset.tab === activeTab); });
    if (!mod.isReady()) { content.innerHTML = '<div class="tm-note">' + escapeHtml(L("readyNote")) + '</div>'; return; }
    if (activeTab === "quick") renderQuick(content);
    else if (activeTab === "items") renderItems(content);
    else if (activeTab === "actors") renderActors(content);
    else if (activeTab === "system") renderSystem(content);
    else if (activeTab === "map") renderMap(content);
    else if (activeTab === "battle") renderBattle(content);
    else if (activeTab === "save") renderSave(content);
    else if (activeTab === "keys") renderKeys(content);
    else renderAbout(content);
  }
  function renderQuick(content) {
    var state = mod.getState();
    var toggles = flags.map(function (entry) {
      return row(L(entry[1]), '<input class="tm-switch" type="checkbox" data-action="flag" data-flag="' + entry[0] + '" ' + (state[entry[0]] ? "checked" : "") + '>');
    }).join("");
    var gold = row(L("goldCurrent"), '<span class="tm-badge">' + mod.getGold() + '</span>') + '<div class="tm-row">' + textInput("tm-gold", mod.getGold(), "number", 'min="0"') + button(L("setBtn"), "set-gold", "primary") + button(L("maxBtn"), "max-gold") + '</div>';
    var party = '<div class="tm-row">' + button(L("recoverParty"), "recover-party", "primary") + button(L("refreshPage"), "render") + '</div>';
    content.innerHTML = '<div class="tm-grid">' + card(L("runtimeToggles"), toggles) + card(L("gold"), gold) + card(L("party"), party) + '</div>';
  }
  function renderItems(content) {
    var kinds = '<select class="tm-select" id="tm-item-kind" data-action="item-kind"><option value="item">' + escapeHtml(L("kindItem")) + '</option><option value="weapon">' + escapeHtml(L("kindWeapon")) + '</option><option value="armor">' + escapeHtml(L("kindArmor")) + '</option></select>';
    var tools = '<div class="tm-row">' + kinds + textInput("tm-item-query", "", "search", 'placeholder="' + escapeHtml(L("searchName")) + '"') + button(L("searchBtn"), "render-items", "primary") + '</div>';
    content.innerHTML = card(L("itemDb"), tools + '<div id="tm-item-list" class="tm-list"><div class="tm-note">' + escapeHtml(L("loading")) + '</div></div>');
    root.querySelector("#tm-item-kind").value = context.itemKind;
    loadItems();
  }
  function loadItems() {
    context.itemKind = inputValue("tm-item-kind") || context.itemKind;
    var result = mod.listDatabase(context.itemKind, inputValue("tm-item-query"), 0, 200);
    var list = root.querySelector("#tm-item-list");
    list.innerHTML = result.values.length ? result.values.map(function (item) {
      return '<div class="tm-item"><span class="tm-name" title="' + escapeHtml(item.description) + '">#' + item.id + ' ' + escapeHtml(item.name) + '</span>' +
        textInput("tm-count-" + item.id, item.count, "number", 'min="0" style="width:72px"') + button(L("applyBtn"), "set-item", "", 'data-id="' + item.id + '"') + '</div>';
    }).join("") : '<div class="tm-note">' + escapeHtml(L("noMatch")) + '</div>';
  }
  function actorSelect(actors) {
    return '<select class="tm-select" id="tm-actor" data-action="actor-select">' + actors.map(function (actor) { return '<option value="' + actor.id + '">' + escapeHtml(actor.name) + '</option>'; }).join("") + '</select>';
  }
  function renderActors(content) {
    var actors = mod.listActors();
    if (!actors.length) { content.innerHTML = '<div class="tm-note">' + escapeHtml(L("noPartyActors")) + '</div>'; return; }
    if (!context.actorId || !actors.some(function (a) { return a.id === context.actorId; })) context.actorId = actors[0].id;
    content.innerHTML = '<div class="tm-row">' + actorSelect(actors) + button(L("recoverBtn"), "recover-actor", "primary") + '</div><div id="tm-actor-body"></div>';
    root.querySelector("#tm-actor").value = String(context.actorId); renderActorBody();
  }
  function renderActorBody() {
    var actor = mod.listActors().filter(function (a) { return a.id === context.actorId; })[0];
    if (!actor) return;
    var stats = ["level","hp","mp","mhp","mmp","atk","def","mat","mdf","agi","luk"].map(function (key) {
      return '<div class="tm-item"><span class="tm-name">' + key.toUpperCase() + '</span>' + textInput("tm-stat-" + key, actor[key], "number", 'style="width:94px"') + button(L("setBtn"), "set-stat", "", 'data-key="' + key + '"') + '</div>';
    }).join("");
    var skillIds = mod.actorSkills(actor.id).map(function (s) { return '#' + s.id + ' ' + escapeHtml(s.name); }).join(L("listSep")) || L("none");
    var stateIds = mod.actorStates(actor.id).map(function (s) { return '#' + s.id + ' ' + escapeHtml(s.name); }).join(L("listSep")) || L("none");
    var equips = mod.actorEquips(actor.id).map(function (e) { return L("slot") + e.slot + ':' + escapeHtml(e.name); }).join('<br>') || L("none");
    var skillControls = '<div class="tm-row">' + textInput("tm-skill-id", "", "number", 'placeholder="' + escapeHtml(L("skillId")) + '"') + button(L("learnBtn"), "learn-skill", "primary") + button(L("forgetBtn"), "forget-skill") + '</div><small>' + skillIds + '</small>';
    var stateControls = '<div class="tm-row">' + textInput("tm-state-id", "", "number", 'placeholder="' + escapeHtml(L("stateId")) + '"') + button(L("addStateBtn"), "add-state", "primary") + button(L("removeStateBtn"), "remove-state") + '</div><small>' + stateIds + '</small>';
    var equipControls = '<div class="tm-row">' + textInput("tm-equip-slot", "0", "number", 'placeholder="' + escapeHtml(L("equipSlot")) + '"') + '<select id="tm-equip-kind" class="tm-select"><option value="weapon">' + escapeHtml(L("kindWeapon")) + '</option><option value="armor">' + escapeHtml(L("kindArmor")) + '</option></select>' + textInput("tm-equip-id", "0", "number", 'placeholder="' + escapeHtml(L("equipId")) + '"') + button(L("changeEquipBtn"), "change-equip", "primary") + '</div><small>' + equips + '</small>';
    root.querySelector("#tm-actor-body").innerHTML = '<div class="tm-grid">' + card(L("attributes"), '<div class="tm-list">' + stats + '</div>') + card(L("skills"), skillControls) + card(L("states"), stateControls) + card(L("equipment"), equipControls) + '</div>';
  }
  function renderSystem(content) {
    var kind = '<select class="tm-select" id="tm-system-kind" data-action="system-kind"><option value="switch">' + escapeHtml(L("kindSwitch")) + '</option><option value="variable">' + escapeHtml(L("kindVariable")) + '</option></select>';
    content.innerHTML = card(L("switchAndVariable"), '<div class="tm-row">' + kind + textInput("tm-system-query", "", "search", 'placeholder="' + escapeHtml(L("nameOrId")) + '"') + button(L("searchBtn"), "render-system", "primary") + '</div><div id="tm-system-list" class="tm-list"></div>');
    root.querySelector("#tm-system-kind").value = context.systemKind; loadSystem();
  }
  function loadSystem() {
    context.systemKind = inputValue("tm-system-kind") || context.systemKind;
    var result = context.systemKind === "switch" ? mod.listSwitches(inputValue("tm-system-query"), 0, 200) : mod.listVariables(inputValue("tm-system-query"), 0, 200);
    root.querySelector("#tm-system-list").innerHTML = result.values.map(function (item) {
      var control = context.systemKind === "switch" ? '<input class="tm-switch" id="tm-system-' + item.id + '" type="checkbox" ' + (item.value ? "checked" : "") + '>' : textInput("tm-system-" + item.id, typeof item.value === "object" ? JSON.stringify(item.value) : item.value, "text");
      return '<div class="tm-item"><span class="tm-name">#' + item.id + ' ' + escapeHtml(item.name) + '</span>' + control + button(L("setBtn"), "set-system", "", 'data-id="' + item.id + '"') + '</div>';
    }).join("") || '<div class="tm-note">' + escapeHtml(L("noMatch")) + '</div>';
  }
  function renderMap(content) {
    var pos = mod.currentPosition();
    var current = pos ? L("mapPosPrefix") + ' #' + pos.mapId + L("coords") + pos.x + ', ' + pos.y + ')' : L("notOnMap");
    var form = row(L("currentPos"), '<span class="tm-badge">' + escapeHtml(current) + '</span>') + '<div class="tm-row">' + textInput("tm-map-id", pos && pos.mapId, "number", 'placeholder="' + escapeHtml(L("mapId")) + '"') + textInput("tm-map-x", pos && pos.x, "number", 'placeholder="X"') + textInput("tm-map-y", pos && pos.y, "number", 'placeholder="Y"') + button(L("teleportBtn"), "teleport", "primary") + '</div>';
    var maps = mod.listMaps("", 0, 200).values.map(function (map) { return '<div class="tm-item"><span class="tm-name">#' + map.id + ' ' + escapeHtml(map.name) + '</span>' + button(L("selectBtn"), "pick-map", "", 'data-id="' + map.id + '"') + '</div>'; }).join("");
    content.innerHTML = '<div class="tm-grid">' + card(L("teleportBtn"), form) + card(L("mapList"), '<div class="tm-list">' + maps + '</div>') + '</div>';
  }
  function renderBattle(content) {
    var snapshot = mod.battleSnapshot();
    if (!snapshot.inBattle) { content.innerHTML = '<div class="tm-note">' + escapeHtml(L("notInBattle")) + '</div>'; return; }
    var enemies = snapshot.enemies.map(function (enemy) { return '<div class="tm-item"><span class="tm-name">' + escapeHtml(enemy.name) + ' HP ' + enemy.hp + '/' + enemy.mhp + '</span>' + textInput("tm-enemy-" + enemy.index, enemy.hp, "number", 'style="width:86px"') + button(L("setBtn"), "set-enemy", "", 'data-index="' + enemy.index + '"') + '</div>'; }).join("");
    var actors = snapshot.actors.map(function (actor) { return '<div class="tm-item"><span class="tm-name">' + escapeHtml(actor.name) + '</span><span class="tm-badge">HP ' + actor.hp + '/' + actor.mhp + '</span></div>'; }).join("");
    var actions = '<div class="tm-row">' + button(L("killAll"), "kill-enemies", "danger") + button(L("forceVictory"), "victory", "primary") + button(L("forceEscape"), "escape") + '</div>';
    content.innerHTML = '<div class="tm-grid">' + card(L("battleOps"), actions) + card(L("enemies"), '<div class="tm-list">' + enemies + '</div>') + card(L("allies"), '<div class="tm-list">' + actors + '</div>') + '</div>';
  }
  function renderSave(content) {
    content.innerHTML = card(L("saveMgmt"), '<div id="tm-save-list" class="tm-list"><div class="tm-note">' + escapeHtml(L("reading")) + '</div></div>');
    run(function () { return mod.listSaveSlots(); }, function (slots) {
      root.querySelector("#tm-save-list").innerHTML = slots.map(function (slot) {
        return '<div class="tm-item"><span class="tm-name">' + escapeHtml(L("saveSlot")) + ' ' + slot.id + (slot.exists ? ' · ' + escapeHtml(slot.playtime || slot.title || L("hasData")) : ' · ' + escapeHtml(L("empty"))) + '</span>' + button(L("saveBtn"), "save", "primary", 'data-id="' + slot.id + '"') + (slot.exists ? button(L("loadBtn"), "load", "", 'data-id="' + slot.id + '"') + button(L("deleteBtn"), "delete-save", "danger", 'data-id="' + slot.id + '"') : '') + '</div>';
      }).join("");
    });
  }
  function renderAbout(content) {
    content.innerHTML = card(L("modTitle"), '<p>' + escapeHtml(L("version")) + escapeHtml(mod.version) + '</p><p>' + escapeHtml(L("aboutDesc")) + '</p><p>' + escapeHtml(L("aboutWarn")) + '</p>');
  }
  function inputBridge() {
    return window.TyranorInputNative || null;
  }
  function renderKeys(content) {
    var bridge = inputBridge();
    var hasPad = false;
    try { hasPad = !!(bridge && bridge.isAvailable()); } catch (e) { hasPad = false; }
    content.innerHTML = card(L("keysTitle"), hasPad
      ? '<p>' + escapeHtml(L("keysIntro")) + '</p><ul style="margin:6px 0 10px;padding-left:18px;font-size:12px"><li>' + escapeHtml(L("keysBullet1")) + '</li><li>' + escapeHtml(L("keysBullet2")) + '</li><li>' + escapeHtml(L("keysBullet3")) + '</li><li>' + escapeHtml(L("keysBullet4")) + '</li></ul><div class="tm-row">' + button(L("enterEdit"), "enter-keys", "primary") + button(L("resetDefault"), "reset-keys") + '</div>'
      : '<p>' + escapeHtml(L("keysDisabled")) + '</p>');
  }
  function handleAction(action, node) {
    if (action === "close") return close();
    if (action === "render") return render();
    if (action === "flag") return run(function () { mod.setFlag(node.dataset.flag, node.checked); }, function () { toast(L("savedToast")); });
    if (action === "set-gold") return run(function () { mod.setGold(inputValue("tm-gold")); }, function () { toast(L("goldChanged")); render(); });
    if (action === "max-gold") return run(function () { mod.setGold(99999999); }, function () { toast(L("goldMaxed")); render(); });
    if (action === "recover-party") return run(mod.recoverParty, function () { toast(L("partyRecovered")); render(); });
    if (action === "item-kind" || action === "render-items") return loadItems();
    if (action === "set-item") return run(function () { mod.setItemCount(context.itemKind, node.dataset.id, inputValue("tm-count-" + node.dataset.id)); }, function () { toast(L("countChanged")); loadItems(); });
    if (action === "actor-select") { context.actorId = Number(node.value); return renderActorBody(); }
    if (action === "recover-actor") return run(function () { mod.recoverActor(context.actorId); }, function () { toast(L("actorRecovered")); renderActorBody(); });
    if (action === "set-stat") return run(function () { mod.setActorStat(context.actorId, node.dataset.key, inputValue("tm-stat-" + node.dataset.key)); }, function () { toast(L("statChanged")); renderActorBody(); });
    if (action === "learn-skill" || action === "forget-skill") return run(function () { return action === "learn-skill" ? mod.learnSkill(context.actorId, inputValue("tm-skill-id")) : mod.forgetSkill(context.actorId, inputValue("tm-skill-id")); }, renderActorBody);
    if (action === "add-state" || action === "remove-state") return run(function () { return action === "add-state" ? mod.addState(context.actorId, inputValue("tm-state-id")) : mod.removeState(context.actorId, inputValue("tm-state-id")); }, renderActorBody);
    if (action === "change-equip") return run(function () { mod.changeEquip(context.actorId, inputValue("tm-equip-slot"), inputValue("tm-equip-kind"), inputValue("tm-equip-id")); }, function () { toast(L("equipChanged")); renderActorBody(); });
    if (action === "system-kind" || action === "render-system") return loadSystem();
    if (action === "set-system") return run(function () { var id = node.dataset.id; if (context.systemKind === "switch") mod.setSwitch(id, checked("tm-system-" + id)); else { var raw = inputValue("tm-system-" + id); var value; try { value = JSON.parse(raw); } catch (_) { value = raw; } mod.setVariable(id, value); } }, function () { toast(L("systemChanged")); loadSystem(); });
    if (action === "pick-map") { root.querySelector("#tm-map-id").value = node.dataset.id; return; }
    if (action === "teleport") return run(function () { return mod.teleport(inputValue("tm-map-id"), inputValue("tm-map-x"), inputValue("tm-map-y"), 2, 0); }, function () { toast(L("teleportQueued")); close(); });
    if (action === "set-enemy") return run(function () { mod.setEnemyHp(node.dataset.index, inputValue("tm-enemy-" + node.dataset.index)); }, render);
    if (action === "kill-enemies") return run(mod.killAllEnemies, render);
    if (action === "victory") return run(mod.forceVictory, close);
    if (action === "escape") return run(mod.forceEscape, close);
    if (action === "save") return run(function () { return mod.saveGame(node.dataset.id); }, function () { toast(L("savedDone")); renderSave(root.querySelector(".tm-content")); });
    if (action === "load") return run(function () { return mod.loadGame(node.dataset.id); }, function () { toast(L("loadDone")); close(); });
    if (action === "delete-save") return run(function () { return mod.deleteSave(node.dataset.id); }, function () { toast(L("saveDeleted")); renderSave(root.querySelector(".tm-content")); });
    if (action === "enter-keys") {
      var bridge = inputBridge();
      if (!bridge) { toast(L("padDisabled"), true); return; }
      var available = true;
      try { available = !!bridge.isAvailable(); } catch (e) { available = false; }
      if (!available) { toast(L("padDisabled"), true); return; }
      close();
      setTimeout(function () { try { bridge.enterEdit(); } catch (e) { toast(String(e && e.message || e), true); } }, 50);
      return;
    }
    if (action === "reset-keys") {
      var rbridge = inputBridge();
      if (!rbridge) { toast(L("padDisabled"), true); return; }
      try {
        rbridge.resetToDefaults();
        toast(L("defaultsRestored"));
      } catch (e) { toast(String(e && e.message || e), true); }
      return;
    }
  }
  function block(event) {
    if (!root) return;
    if (event.target && (event.target.closest && event.target.closest("#tyranor-mod-root"))) event.stopPropagation();
  }
  function open() {
    if (root) return;
    root = document.createElement("div"); root.id = "tyranor-mod-root";
    root.innerHTML = '<div class="tm-panel" role="dialog" aria-modal="true"><div class="tm-head"><strong>' + escapeHtml(L("modTitle")) + '</strong><span class="tm-badge">MV / MZ</span><button class="tm-close" data-action="close" aria-label="' + escapeHtml(L("closeAria")) + '">×</button></div><div class="tm-tabs">' + tabs.map(function (tab) { return '<button class="tm-tab" data-tab="' + tab[0] + '">' + escapeHtml(L(tab[1])) + '</button>'; }).join("") + '</div><main class="tm-content"></main></div>';
    document.documentElement.appendChild(root);
    root.addEventListener("click", function (event) {
      event.stopPropagation();
      var tab = event.target.closest("[data-tab]"); if (tab) { activeTab = tab.dataset.tab; render(); return; }
      var action = event.target.closest("[data-action]"); if (action) handleAction(action.dataset.action, action);
    });
    root.addEventListener("change", function (event) { var action = event.target.closest("[data-action]"); if (action) handleAction(action.dataset.action, action); event.stopPropagation(); });
    ["touchstart","touchmove","touchend","pointerdown","pointerup","mousedown","mouseup","keydown","keyup","wheel"].forEach(function (name) { root.addEventListener(name, block); });
    render();
  }
  function close() { if (!root) return false; root.remove(); root = null; return true; }
  function toggle() { if (root) close(); else open(); }
  function isOpen() { return !!root; }
  function installLauncher() {
    if (launcher || !document.body) return;
    launcher = document.createElement("button"); launcher.id = "tyranor-mod-launcher"; launcher.innerHTML = '<span class="tm-launcher-icon" aria-hidden="true"></span>'; launcher.setAttribute("aria-label", L("launcherAria"));
    // Click: ignore the click that follows a drag (pointerup -> click ordering).
    launcher.addEventListener("click", function (event) {
      event.preventDefault(); event.stopPropagation();
      if (justDragged) { justDragged = false; return; }
      toggle();
    });
    // Stop touch/pointer events from bubbling into the WebView.
    ["touchstart","touchend","pointerdown","pointerup"].forEach(function (name) { launcher.addEventListener(name, function (event) { event.stopPropagation(); }); });
    // Drag support: track from pointerdown, treat movement over 8px as a drag.
    launcher.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      var rect = launcher.getBoundingClientRect();
      dragState = { startX: event.clientX, startY: event.clientY, startLeft: rect.left, startTop: rect.top, moved: false };
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener("pointermove", function (event) {
      if (!dragState) return;
      var dx = event.clientX - dragState.startX;
      var dy = event.clientY - dragState.startY;
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) < 8) return;
      dragState.moved = true;
      launcher.style.left = Math.max(0, Math.min(window.innerWidth - launcher.offsetWidth, dragState.startLeft + dx)) + "px";
      launcher.style.top = Math.max(0, Math.min(window.innerHeight - launcher.offsetHeight, dragState.startTop + dy)) + "px";
      launcher.style.right = "auto";
    });
    var endDrag = function (event) {
      if (dragState && dragState.moved) {
        justDragged = true;
        userDragged = true;
        setTimeout(function () { justDragged = false; }, 100);
        launcher.style.left = launcher.offsetLeft + "px";
        launcher.style.top = launcher.offsetTop + "px";
        try { localStorage.setItem(LAUNCHER_POS_KEY, launcher.offsetLeft + "," + launcher.offsetTop); } catch (e) {}
      }
      dragState = null;
    };
    launcher.addEventListener("pointerup", endDrag);
    launcher.addEventListener("pointercancel", function () { dragState = null; });
    document.body.appendChild(launcher);
    // Restore the last dragged position.
    try {
      var saved = localStorage.getItem(LAUNCHER_POS_KEY);
      if (saved) {
        var parts = saved.split(",");
        var sx = parseInt(parts[0], 10), sy = parseInt(parts[1], 10);
        if (sx >= 0 && sy >= 0 && sx < window.innerWidth && sy < window.innerHeight) {
          launcher.style.left = sx + "px";
          launcher.style.top = sy + "px";
          launcher.style.right = "auto";
          userDragged = true;
        }
      }
    } catch (e) {}
    positionLauncher();
    window.addEventListener("resize", positionLauncher);
  }
  // The virtual pad is now native (left FAB + overlay), so __touchPadMetrics is no longer published;
  // the floating ball docks on the right by default and the user can drag it anywhere.
  function positionLauncher() {
    if (!launcher || userDragged) return;
    launcher.style.left = "";
    launcher.style.right = "10px";
  }
  window.TyranorModUI = { open: open, close: close, toggle: toggle, isOpen: isOpen };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installLauncher); else installLauncher();
})();