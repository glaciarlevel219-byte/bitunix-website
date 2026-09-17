(function (global) {
  const LOCALES = [
    { code: "en", label: "English (US)", short: "EN" },
    { code: "en-GB", label: "English (UK)", short: "UK" },
    { code: "ur", label: "اردو (Urdu)", short: "UR" },
    { code: "hi", label: "हिन्दी (Hindi)", short: "HI" },
    { code: "zh", label: "中文 (Chinese)", short: "ZH" },
    { code: "ja", label: "日本語 (Japanese)", short: "JA" },
    { code: "it", label: "Italiano", short: "IT" },
    { code: "fr", label: "Français", short: "FR" },
    { code: "el", label: "Ελληνικά (Greek)", short: "EL" },
  ];

  const STR = {
    en: {
      nav_home: "Home",
      nav_market: "Market",
      nav_trade: "Trade",
      nav_coin: "Coin",
      nav_user: "User",
      market_broadcast: "Market broadcast",
      quick_services: "Quick Services",
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      vip_levels: "VIP Levels",
      c2c: "C2C",
      customer_service: "Customer service",
      help_center: "Help Center",
      lock_mining: "Lock-up mining",
      top_snapshot: "Top Snapshot",
      live_trading: "Live Trading",
      cat_crypto: "Cryptocurrency",
      cat_fx: "Foreign Exchange",
      cat_metal: "Precious Metals",
      cat_fav: "★ Favorites",
      trade: "Trade",
      login_welcome: "Welcome to login",
      lang_title: "Choose language",
      lang_apply: "Apply",
      customer_support: "Customer Support",
      hero_sub: "Digital financial service platform with live rates, secure trading, and account management in one place.",
      loading_market: "Loading live market data...",
    },
    "en-GB": {
      nav_home: "Home",
      nav_market: "Market",
      nav_trade: "Trade",
      nav_coin: "Coin",
      nav_user: "User",
      market_broadcast: "Market broadcast",
      quick_services: "Quick Services",
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      vip_levels: "VIP Levels",
      c2c: "C2C",
      customer_service: "Customer service",
      help_center: "Help Centre",
      lock_mining: "Lock-up mining",
      top_snapshot: "Top Snapshot",
      live_trading: "Live Trading",
      cat_crypto: "Cryptocurrency",
      cat_fx: "Foreign Exchange",
      cat_metal: "Precious Metals",
      cat_fav: "★ Favourites",
      trade: "Trade",
      login_welcome: "Welcome to log in",
      lang_title: "Choose language",
      lang_apply: "Apply",
      customer_support: "Customer Support",
      hero_sub: "Digital financial services platform with live rates, secure trading, and account management in one place.",
      loading_market: "Loading live market data...",
    },
    ur: {
      nav_home: "ہوم",
      nav_market: "مارکیٹ",
      nav_trade: "ٹریڈ",
      nav_coin: "کوائن",
      nav_user: "صارف",
      market_broadcast: "مارکیٹ براڈکاسٹ",
      quick_services: "فوری سروسز",
      deposit: "ڈپازٹ",
      withdrawal: "نکاسی",
      vip_levels: "VIP لیول",
      c2c: "C2C",
      customer_service: "کسٹمر سروس",
      help_center: "ہیلپ سینٹر",
      lock_mining: "لاک-اپ مائننگ",
      top_snapshot: "ٹاپ سنیپ شاٹ",
      live_trading: "لائیو ٹریڈنگ",
      cat_crypto: "کرپٹو کرنسی",
      cat_fx: "فارن ایکسچینج",
      cat_metal: "قیمتی دھاتیں",
      cat_fav: "★ پسندیدہ",
      trade: "ٹریڈ",
      login_welcome: "لاگ ان میں خوش آمدید",
      lang_title: "زبان منتخب کریں",
      lang_apply: "لاگو کریں",
      customer_support: "کسٹمر سپورٹ",
      hero_sub: "لائیو ریٹس، محفوظ ٹریڈنگ اور اکاؤنٹ مینجمنٹ — سب ایک جگہ۔",
      loading_market: "مارکیٹ ڈیٹا لوڈ ہو رہا ہے...",
    },
    hi: {
      nav_home: "होम",
      nav_market: "मार्केट",
      nav_trade: "ट्रेड",
      nav_coin: "कॉइन",
      nav_user: "यूज़र",
      market_broadcast: "मार्केट प्रसारण",
      quick_services: "त्वरित सेवाएँ",
      deposit: "जमा",
      withdrawal: "निकासी",
      vip_levels: "VIP स्तर",
      c2c: "C2C",
      customer_service: "ग्राहक सेवा",
      help_center: "सहायता केंद्र",
      lock_mining: "लॉक-अप माइनिंग",
      top_snapshot: "शीर्ष सारांश",
      live_trading: "लाइव ट्रेडिंग",
      cat_crypto: "क्रिप्टोकरेंसी",
      cat_fx: "विदेशी मुद्रा",
      cat_metal: "कीमती धात",
      cat_fav: "★ पसंदीदा",
      trade: "ट्रेड",
      login_welcome: "लॉगिन में आपका स्वागत है",
      lang_title: "भाषा चुनें",
      lang_apply: "लागू करें",
      customer_support: "ग्राहक सहायता",
      hero_sub: "लाइव दरें, सुरक्षित ट्रेडिंग और खाता प्रबंधन — एक ही प्लेटफ़ॉर्म पर।",
      loading_market: "मार्केट डेटा लोड हो रहा है...",
    },
    zh: {
      nav_home: "首页",
      nav_market: "市场",
      nav_trade: "交易",
      nav_coin: "币种",
      nav_user: "用户",
      market_broadcast: "行情播报",
      quick_services: "快捷服务",
      deposit: "充值",
      withdrawal: "提现",
      vip_levels: "VIP 等级",
      c2c: "C2C",
      customer_service: "客服",
      help_center: "帮助中心",
      lock_mining: "锁仓挖矿",
      top_snapshot: "热门概览",
      live_trading: "实时交易",
      cat_crypto: "加密货币",
      cat_fx: "外汇",
      cat_metal: "贵金属",
      cat_fav: "★ 收藏",
      trade: "交易",
      login_welcome: "欢迎登录",
      lang_title: "选择语言",
      lang_apply: "应用",
      customer_support: "客户支持",
      hero_sub: "数字金融平台：实时行情、安全交易与账户管理。",
      loading_market: "正在加载行情...",
    },
    ja: {
      nav_home: "ホーム",
      nav_market: "マーケット",
      nav_trade: "取引",
      nav_coin: "コイン",
      nav_user: "ユーザー",
      market_broadcast: "マーケット速報",
      quick_services: "クイックサービス",
      deposit: "入金",
      withdrawal: "出金",
      vip_levels: "VIPレベル",
      c2c: "C2C",
      customer_service: "カスタマーサービス",
      help_center: "ヘルプセンター",
      lock_mining: "ロックアップマイニング",
      top_snapshot: "トップ概要",
      live_trading: "ライブ取引",
      cat_crypto: "暗号資産",
      cat_fx: "外国為替",
      cat_metal: "貴金属",
      cat_fav: "★ お気に入り",
      trade: "取引",
      login_welcome: "ログインへようこそ",
      lang_title: "言語を選択",
      lang_apply: "適用",
      customer_support: "カスタマーサポート",
      hero_sub: "リアルタイム相場、安全な取引、アカウント管理を一つのプラットフォームで。",
      loading_market: "相場を読み込み中...",
    },
    it: {
      nav_home: "Home",
      nav_market: "Mercato",
      nav_trade: "Trading",
      nav_coin: "Coin",
      nav_user: "Utente",
      market_broadcast: "Broadcast di mercato",
      quick_services: "Servizi rapidi",
      deposit: "Deposito",
      withdrawal: "Prelievo",
      vip_levels: "Livelli VIP",
      c2c: "C2C",
      customer_service: "Assistenza clienti",
      help_center: "Centro assistenza",
      lock_mining: "Lock-up mining",
      top_snapshot: "Panoramica top",
      live_trading: "Trading live",
      cat_crypto: "Criptovalute",
      cat_fx: "Forex",
      cat_metal: "Metalli preziosi",
      cat_fav: "★ Preferiti",
      trade: "Trading",
      login_welcome: "Benvenuto al login",
      lang_title: "Scegli la lingua",
      lang_apply: "Applica",
      customer_support: "Assistenza clienti",
      hero_sub: "Piattaforma finanziaria con prezzi live, trading sicuro e gestione account.",
      loading_market: "Caricamento dati di mercato...",
    },
    fr: {
      nav_home: "Accueil",
      nav_market: "Marché",
      nav_trade: "Trading",
      nav_coin: "Coin",
      nav_user: "Utilisateur",
      market_broadcast: "Flash marché",
      quick_services: "Services rapides",
      deposit: "Dépôt",
      withdrawal: "Retrait",
      vip_levels: "Niveaux VIP",
      c2c: "C2C",
      customer_service: "Service client",
      help_center: "Centre d'aide",
      lock_mining: "Minage verrouillé",
      top_snapshot: "Aperçu top",
      live_trading: "Trading en direct",
      cat_crypto: "Cryptomonnaies",
      cat_fx: "Forex",
      cat_metal: "Métaux précieux",
      cat_fav: "★ Favoris",
      trade: "Trader",
      login_welcome: "Bienvenue — connexion",
      lang_title: "Choisir la langue",
      lang_apply: "Appliquer",
      customer_support: "Support client",
      hero_sub: "Plateforme financière : cours en direct, trading sécurisé et gestion de compte.",
      loading_market: "Chargement du marché...",
    },
    el: {
      nav_home: "Αρχική",
      nav_market: "Αγορά",
      nav_trade: "Συναλλαγές",
      nav_coin: "Coin",
      nav_user: "Χρήστης",
      market_broadcast: "Ενημέρωση αγοράς",
      quick_services: "Γρήγορες υπηρεσίες",
      deposit: "Κατάθεση",
      withdrawal: "Ανάληψη",
      vip_levels: "Επίπεδα VIP",
      c2c: "C2C",
      customer_service: "Εξυπηρέτηση",
      help_center: "Κέντρο βοήθειας",
      lock_mining: "Lock-up mining",
      top_snapshot: "Κορυφαία στιγμιότυπα",
      live_trading: "Ζωντανές συναλλαγές",
      cat_crypto: "Κρυpto",
      cat_fx: "Συνάλλαγμα",
      cat_metal: "Μέταλλα",
      cat_fav: "★ Αγαπημένα",
      trade: "Συναλλαγή",
      login_welcome: "Καλώς ήρθατε",
      lang_title: "Επιλογή γλώσσας",
      lang_apply: "Εφαρμογή",
      customer_support: "Υποστήριξη",
      hero_sub: "Ψηφιακή πλατφόρμα με ζωντανές τιμές, ασφαλές trading και διαχείριση λογαριασμού.",
      loading_market: "Φόρτωση αγοράς...",
    },
  };

  let current = localStorage.getItem("site_locale") || "en";

  function t(key) {
    return STR[current]?.[key] ?? STR.en[key] ?? key;
  }

  function localeMeta(code) {
    return LOCALES.find((l) => l.code === code) || LOCALES[0];
  }

  function updateLangButtons() {
    const meta = localeMeta(current);
    document.querySelectorAll("[data-lang-short]").forEach((el) => {
      el.textContent = meta.short;
    });
  }

  function apply() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    const heroSub = document.getElementById("heroSub");
    if (heroSub && !heroSub.dataset.customHero) heroSub.textContent = t("hero_sub");
    document.documentElement.lang = current.startsWith("en") ? "en" : current.split("-")[0];
    document.documentElement.dir = current === "ur" ? "rtl" : "ltr";
    updateLangButtons();
    const title = document.getElementById("langPickerTitle");
    if (title) title.textContent = t("lang_title");
    const applyBtn = document.getElementById("langPickerApply");
    if (applyBtn) applyBtn.textContent = t("lang_apply");
  }

  function setLocale(code, persist) {
    if (!STR[code]) code = "en";
    current = code;
    if (persist !== false) localStorage.setItem("site_locale", code);
    apply();
  }

  function getLocale() {
    return current;
  }

  function renderPickerList(selected) {
    return LOCALES.map(
      (loc) =>
        `<button type="button" class="lang-picker-option${loc.code === selected ? " is-selected" : ""}" data-locale="${loc.code}">${loc.label}</button>`,
    ).join("");
  }

  global.BitunixI18n = {
    LOCALES,
    t,
    apply,
    setLocale,
    getLocale,
    renderPickerList,
    localeMeta,
  };
})(window);
