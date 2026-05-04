const endpoints = {
  config: "/api/backup/config",
  currency: "/api/backup/currency",
  country: "/api/backup/country",
  news: "/api/backup/news",
  liveMarket: "/api/market/live",
  register: "/api/auth/register",
  login: "/api/auth/login",
  me: "/api/auth/me",
  chartMarket: "/api/chart/market",
  tradeKlines: "/api/trade/klines",
  tradeRows: "/api/trade/rows",
};

const state = {
  token: localStorage.getItem("auth_token") || "",
  liveEnabled: true,
  liveTimer: null,
  customerService: "",
  backupRows: [],
  /** Binance-backed rows (same shape as backup); used first for spot prices. */
  liveTickerRows: [],
  marketLoginPromptTimer: null,
  coin: {
    symbol: "BTC",
    sub: "BTC/USD",
    geckoId: "bitcoin",
    usdt: "BTCUSDT",
    price: 0,
    change: 0,
  },
  coinDrawerCategory: "crypto",
  coinChartTimer: null,
  coinSide: "buy",
  tradeCat: "fx",
  tradeTf: "15m",
  tradePairIndex: 0,
  tradeChart: null,
  tradeVolChart: null,
  tradeSeries: { candle: null, vol: null, ma5: null, ma10: null, ma20: null },
  tradeTimer: null,
  tradeLastRaw: [],
  tradePairFilter: "",
  wallet: null,
  c2cSide: "buy",
  _dialCodesLoaded: false,
  _tradeSearchBound: false,
  depositCountdownTimer: null,
  depositCountdownUntil: 0,
};

const SITE_NAME = "Bitunix";
const WALLET_KEY = "bitunix_wallet_v1";
const WALLET_KEY_LEGACY = "bitbank_wallet_v1";
const DIAL_CACHE_KEY = "bitunix_dial_codes_v1";
const DIAL_CACHE_KEY_LEGACY = "bitbank_dial_codes_v1";

const DEPOSIT_PENDING_MS = 30 * 60 * 1000;
const DEPOSIT_ADDR_BY_NETWORK = {
  TRC20: "TWrongBitunixDep9sitAddrInvalid999",
  ERC20: "0xINVALID0_BITUNIX_WALLET_DO_NOT_SEND_REAL",
  BEP20: "0xBEP20WR0NG_BITUNIX_TEST_DEP0SIT_ADDR",
};

const LOCK_PRODUCTS = [
  { id: "flex", label: "Flexible", days: 0, apr: 0.04, min: 10, blurb: "Withdraw anytime · indicative ~4% APR" },
  { id: "lock30", label: "30 days", days: 30, apr: 0.1, min: 50, blurb: "Fixed 30d · indicative ~10% APR" },
  { id: "lock90", label: "90 days", days: 90, apr: 0.18, min: 100, blurb: "Fixed 90d · indicative ~18% APR" },
];

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const TRADE_CATALOGS = {
  fx: [
    { label: "INR/USD", k: { source: "frank", from: "USD", to: "INR", inv: 1, days: 90 } },
    { label: "AUD/USD", k: { source: "binance", symbol: "AUDUSDT" } },
    { label: "EUR/USD", k: { source: "binance", symbol: "EURUSDT" } },
    { label: "GBP/USD", k: { source: "binance", symbol: "GBPUSDT" } },
  ],
  crypto: [
    { label: "BTC/USD", k: { source: "binance", symbol: "BTCUSDT" } },
    { label: "ETH/USD", k: { source: "binance", symbol: "ETHUSDT" } },
    { label: "BNB/USD", k: { source: "binance", symbol: "BNBUSDT" } },
    { label: "SOL/USD", k: { source: "binance", symbol: "SOLUSDT" } },
    { label: "XRP/USD", k: { source: "binance", symbol: "XRPUSDT" } },
    { label: "DOGE/USD", k: { source: "binance", symbol: "DOGEUSDT" } },
    { label: "ADA/USD", k: { source: "binance", symbol: "ADAUSDT" } },
    { label: "DOT/USD", k: { source: "binance", symbol: "DOTUSDT" } },
    { label: "LTC/USD", k: { source: "binance", symbol: "LTCUSDT" } },
    { label: "BCH/USD", k: { source: "binance", symbol: "BCHUSDT" } },
    { label: "ETC/USD", k: { source: "binance", symbol: "ETCUSDT" } },
    { label: "FIL/USD", k: { source: "binance", symbol: "FILUSDT" } },
    { label: "EOS/USD", k: { source: "binance", symbol: "EOSUSDT" } },
    { label: "XMR/USD", k: { source: "binance", symbol: "XMRUSDT" } },
    { label: "YFI/USD", k: { source: "binance", symbol: "YFIUSDT" } },
    { label: "MKR/USD", k: { source: "binance", symbol: "MKRUSDT" } },
  ],
  metal: [
    { label: "PAXG/USD", k: { source: "binance", symbol: "PAXGUSDT" } },
    { label: "XAU/USD", k: { source: "binance", symbol: "XAUTUSDT" } },
  ],
};

const TRADE_TF_MAP = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "60m": "1h", "1d": "1d" };

const CRYPTO_LIST = [
  { symbol: "BTC", sub: "BTC/USD", id: "bitcoin", usdt: "BTCUSDT" },
  { symbol: "ETH", sub: "ETH/USD", id: "ethereum", usdt: "ETHUSDT" },
  { symbol: "EOS", sub: "EOS/USD", id: "eos", usdt: "EOSUSDT" },
  { symbol: "SOL", sub: "SOL/USD", id: "solana", usdt: "SOLUSDT" },
  { symbol: "ETC", sub: "ETC/USD", id: "ethereum-classic", usdt: "ETCUSDT" },
  { symbol: "ADA", sub: "ADA/USD", id: "cardano", usdt: "ADAUSDT" },
  { symbol: "FIL", sub: "FIL/USD", id: "filecoin", usdt: "FILUSDT" },
  { symbol: "DOT", sub: "DOT/USD", id: "polkadot", usdt: "DOTUSDT" },
  { symbol: "LTC", sub: "LTC/USD", id: "litecoin", usdt: "LTCUSDT" },
  { symbol: "XRP", sub: "XRP/USD", id: "ripple", usdt: "XRPUSDT" },
  { symbol: "BCH", sub: "BCH/USD", id: "bitcoin-cash", usdt: "BCHUSDT" },
  { symbol: "MKR", sub: "MKR/USD", id: "maker", usdt: "MKRUSDT" },
];

const METAL_LIST = [
  { symbol: "PAXG", sub: "PAXG/USD", id: "pax-gold", usdt: "PAXGUSDT" },
  { symbol: "XAUT", sub: "XAUT/USD", id: "tether-gold", usdt: "XAUTUSDT" },
];

function safeText(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function siteBrandFromConfig(configData) {
  const raw = safeText(configData?.site_name, SITE_NAME);
  return String(raw).replace(/\bBitbank\b/gi, SITE_NAME);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Failed to load ${url}`;
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.message || "Request failed");
    err.status = response.status;
    err.code = payload.code;
    throw err;
  }
  return payload;
}

function showToast(message, isError = false) {
  const el = document.querySelector("#appToast");
  const text = document.querySelector("#appToastText");
  if (!el || !text) return;
  text.textContent = message;
  el.style.borderColor = isError ? "#7a2c2c" : "#3d4654";
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 4200);
}

function switchToTab(next) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === next);
  });
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === next);
  });
  if (next === "user" && !state.token) {
    showAuthView("login");
  }
}

function promptAuthAndFocus() {
  switchToTab("user");
  showAuthView("login");
  showMessage("#authMessage", "Please sign in to continue.", true);
  const firstAuthInput = document.querySelector("#loginForm .login-id-input");
  if (firstAuthInput) firstAuthInput.focus();
}

function scheduleMarketLoginPrompt() {
  if (state.token) return;
  if (state.marketLoginPromptTimer) clearTimeout(state.marketLoginPromptTimer);
  state.marketLoginPromptTimer = setTimeout(() => {
    if (!state.token && document.querySelector("#market")?.classList.contains("active")) {
      promptAuthAndFocus();
    }
  }, 5000);
}

function renderTabs() {
  const authOnlyTabs = new Set(["trade", "user"]);
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const next = tab.getAttribute("data-tab");
      if (authOnlyTabs.has(next) && !state.token) {
        promptAuthAndFocus();
        return;
      }
      switchToTab(next);
      if (next === "market") scheduleMarketLoginPrompt();
      if (next === "coin") {
        onCoinTabShown();
      }
      if (next === "trade") {
        onTradeTabShown();
      }
    });
  });
}

function showMessage(id, message, isError = false) {
  const el = document.querySelector(id);
  el.textContent = message;
  el.style.color = isError ? "#f87171" : "#2dd4bf";
}

function formatCountryDial(idd) {
  if (!idd || !idd.root) return null;
  const root = String(idd.root);
  const suf = idd.suffixes;
  if (!suf || !suf.length) return root;
  if (root === "+1" && suf.length > 1) return "+1";
  return root + String(suf[0]);
}

async function loadDialCodesIntoSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">Loading…</option>`;
  try {
    let raw = sessionStorage.getItem(DIAL_CACHE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(DIAL_CACHE_KEY_LEGACY);
      if (raw) {
        sessionStorage.setItem(DIAL_CACHE_KEY, raw);
        sessionStorage.removeItem(DIAL_CACHE_KEY_LEGACY);
      }
    }
    if (!raw) {
      const r = await fetch("https://restcountries.com/v3.1/all?fields=name,idd");
      if (!r.ok) throw new Error("dial fetch");
      raw = await r.text();
      sessionStorage.setItem(DIAL_CACHE_KEY, raw);
    }
    const data = JSON.parse(raw);
    const opts = [];
    for (const c of data) {
      const dial = formatCountryDial(c.idd);
      if (!dial) continue;
      const name = c.name?.common || "";
      opts.push({ dial, name });
    }
    opts.sort((a, b) => a.name.localeCompare(b.name));
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    selectEl.innerHTML = opts.map((o) => `<option value="${esc(o.dial)}">${esc(o.dial)} ${esc(o.name)}</option>`).join("");
    const prefer = opts.find((o) => o.dial === "+91") || opts.find((o) => o.dial === "+1") || opts[0];
    if (prefer) selectEl.value = prefer.dial;
  } catch (_) {
    selectEl.innerHTML = `
      <option value="+1">+1 United States / Canada</option>
      <option value="+44">+44 United Kingdom</option>
      <option value="+91">+91 India</option>
      <option value="+971">+971 UAE</option>
      <option value="+966">+966 Saudi Arabia</option>
    `;
  }
}

function applyAuthLoginMode(loginType) {
  const form = document.querySelector("#loginForm");
  const emailBlock = document.querySelector("#loginEmailBlock");
  const phoneRow = document.querySelector("#loginPhoneRow");
  const emailIn = document.querySelector("#loginEmailOnly");
  const phoneIn = document.querySelector("#loginPhoneOnly");
  const sel = document.querySelector("#loginCountrySelect");
  const isEmail = loginType === "email";
  if (form) {
    form.classList.toggle("login-mode-email", isEmail);
    form.classList.toggle("login-mode-phone", !isEmail);
  }
  if (emailBlock) {
    emailBlock.toggleAttribute("hidden", !isEmail);
    emailBlock.setAttribute("aria-hidden", isEmail ? "false" : "true");
  }
  if (phoneRow) {
    phoneRow.toggleAttribute("hidden", isEmail);
    phoneRow.setAttribute("aria-hidden", isEmail ? "true" : "false");
  }
  if (emailIn) {
    emailIn.required = isEmail;
    if (!isEmail) emailIn.value = "";
  }
  if (phoneIn) {
    phoneIn.required = !isEmail;
    if (isEmail) phoneIn.value = "";
  }
  if (sel) sel.required = !isEmail;
  if (!isEmail && !state._dialCodesLoaded) {
    loadDialCodesIntoSelect(sel).then(() => {
      state._dialCodesLoaded = true;
    });
  }
}

function normalizeWallet(o) {
  return {
    balance: Number(o.balance) || 0,
    locks: Array.isArray(o.locks) ? o.locks : [],
    c2c: Array.isArray(o.c2c) ? o.c2c : [],
    recharges: Array.isArray(o.recharges) ? o.recharges : [],
    withdrawals: Array.isArray(o.withdrawals) ? o.withdrawals : [],
    transactions: Array.isArray(o.transactions) ? o.transactions : [],
    txLogs: Array.isArray(o.txLogs) ? o.txLogs : [],
    profile: o.profile && typeof o.profile === "object" ? o.profile : {},
    settings: o.settings && typeof o.settings === "object" ? o.settings : {},
    pendingDeposits: Array.isArray(o.pendingDeposits) ? o.pendingDeposits : [],
  };
}

function loadWallet() {
  try {
    let raw = localStorage.getItem(WALLET_KEY);
    if (!raw) {
      raw = localStorage.getItem(WALLET_KEY_LEGACY);
      if (raw) {
        localStorage.setItem(WALLET_KEY, raw);
        localStorage.removeItem(WALLET_KEY_LEGACY);
      }
    }
    if (!raw) return normalizeWallet({});
    return normalizeWallet(JSON.parse(raw));
  } catch (_) {
    return normalizeWallet({});
  }
}

function maskAddr(a) {
  const s = String(a || "").trim();
  if (s.length <= 14) return s || "—";
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function shortRef() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function walletAddTransaction(w, row) {
  w.transactions = w.transactions || [];
  w.transactions.push({
    id: uid(),
    created: Date.now(),
    ...row,
  });
}

function walletAddTxLog(w, row) {
  w.txLogs = w.txLogs || [];
  w.txLogs.push({
    id: uid(),
    created: Date.now(),
    ...row,
  });
}

function saveWallet(w) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(w));
  state.wallet = w;
  updateWalletDisplay();
}

function depositQrDataUrl(addr) {
  const enc = encodeURIComponent(String(addr || "").trim());
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${enc}`;
}

function setupDepositAddressUI() {
  const sel = document.querySelector("#depositNetworkSelect");
  const codeEl = document.querySelector("#depositAddressText");
  const img = document.querySelector("#depositQrImg");
  if (!sel || !codeEl || !img) return;
  const apply = () => {
    const net = sel.value || "TRC20";
    const addr = DEPOSIT_ADDR_BY_NETWORK[net] || DEPOSIT_ADDR_BY_NETWORK.TRC20;
    codeEl.textContent = addr;
    img.src = depositQrDataUrl(addr);
    img.alt = `Deposit address QR (${net})`;
  };
  apply();
  if (!sel._depositNetBound) {
    sel._depositNetBound = true;
    sel.addEventListener("change", apply);
  }
}

function clearDepositCountdown() {
  if (state.depositCountdownTimer) {
    clearInterval(state.depositCountdownTimer);
    state.depositCountdownTimer = null;
  }
  state.depositCountdownUntil = 0;
  const el = document.querySelector("#depositCountdown");
  if (el) {
    el.hidden = true;
    el.textContent = "";
  }
}

function fmtRemainMs(ms) {
  if (ms <= 0) return "a few moments";
  const m = Math.ceil(ms / 60000);
  if (m >= 120) {
    const h = Math.round(m / 60);
    return `${h} hours`;
  }
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h} hr ${rm} min` : `${h} hour${h > 1 ? "s" : ""}`;
  }
  return `${m} minute${m === 1 ? "" : "s"}`;
}

function startDepositCountdown(untilMs) {
  clearDepositCountdown();
  state.depositCountdownUntil = untilMs;
  const el = document.querySelector("#depositCountdown");
  if (!el) return;
  const tick = () => {
    const left = untilMs - Date.now();
    if (left <= 0) {
      processPendingDeposits();
      clearDepositCountdown();
      el.hidden = false;
      el.textContent =
        "Funds should now be visible in your available balance. If not, wait for one more block confirmation and refresh.";
      updateWalletDisplay();
      return;
    }
    el.hidden = false;
    el.textContent = `Funds are being confirmed. They usually appear in your account within about ${fmtRemainMs(left)}.`;
  };
  tick();
  state.depositCountdownTimer = setInterval(tick, 1000);
}

function processPendingDeposits() {
  const w = loadWallet();
  const now = Date.now();
  const pending = w.pendingDeposits || [];
  if (!pending.length) return false;
  let changed = false;
  const rest = [];
  for (const p of pending) {
    const due = Number(p.creditedAt) || 0;
    if (due && now >= due) {
      const amt = Number(p.amount) || 0;
      const net = String(p.network || "USDT");
      const rid = p.rechargeId || p.id || uid();
      w.balance = (Number(w.balance) || 0) + amt;
      w.recharges = w.recharges || [];
      const idx = w.recharges.findIndex((r) => String(r.id) === String(rid));
      if (idx >= 0) {
        w.recharges[idx] = {
          ...w.recharges[idx],
          status: "completed",
          completedAt: now,
        };
      } else {
        w.recharges.push({
          id: rid,
          amount: amt,
          network: net,
          status: "completed",
          created: p.created || now,
          completedAt: now,
        });
      }
      walletAddTransaction(w, {
        kind: "deposit",
        title: "Deposit",
        amount: amt,
        asset: "USDT",
        status: "success",
        detail: net,
      });
      walletAddTxLog(w, {
        level: "INFO",
        action: "WALLET_DEPOSIT_SETTLED",
        ref: shortRef(),
        detail: `+${amt.toFixed(2)} USDT on ${net}`,
        channel: net,
      });
      changed = true;
      showToast(`Deposit settled: +${amt.toFixed(2)} USDT`, false);
    } else {
      rest.push(p);
    }
  }
  if (changed) {
    w.pendingDeposits = rest;
    saveWallet(w);
  }
  return changed;
}

function updateWalletDisplay() {
  const w = state.wallet || loadWallet();
  state.wallet = w;
  const el = document.querySelector("#assetsText");
  if (el) el.textContent = `${w.balance.toFixed(2)} USDT`;
  const ca = document.querySelector("#coinAvailDisplay");
  if (ca) ca.textContent = Number(w.balance).toFixed(6);
}

function closeProfileModule() {
  const root = document.querySelector("#profileModuleRoot");
  if (!root) return;
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
}

function closeFeatureOverlay() {
  clearDepositCountdown();
  const root = document.querySelector("#overlayRoot");
  if (!root) return;
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  document.querySelector("#overlayDeposit")?.setAttribute("hidden", "");
  document.querySelector("#overlayC2c")?.setAttribute("hidden", "");
  document.querySelector("#overlayLock")?.setAttribute("hidden", "");
}

function openFeatureOverlay(which) {
  closeProfileModule();
  const root = document.querySelector("#overlayRoot");
  if (!root) return;
  closeFeatureOverlay();
  root.hidden = false;
  root.removeAttribute("aria-hidden");
  const map = { deposit: "#overlayDeposit", c2c: "#overlayC2c", lock: "#overlayLock" };
  const sel = map[which];
  const panel = sel ? document.querySelector(sel) : null;
  if (panel) panel.removeAttribute("hidden");
  if (which === "lock") {
    renderLockProductGrid();
    renderLockPositionsTable();
  }
  if (which === "c2c") {
    renderC2cOrderList();
  }
  if (which === "deposit") {
    setupDepositAddressUI();
    const msg = document.querySelector("#depositMsg");
    if (msg) msg.textContent = "";
    const form = document.querySelector("#depositForm");
    form?.reset();
    document.querySelector("#depositNetworkSelect")?.dispatchEvent(new Event("change"));
  }
}

function renderLockProductGrid() {
  const grid = document.querySelector("#lockProductGrid");
  const hint = document.querySelector("#lockProductHint");
  const btn = document.querySelector("#lockSubscribeBtn");
  const pid = document.querySelector("#lockProductId");
  if (!grid) return;
  grid.innerHTML = LOCK_PRODUCTS.map(
    (p) => `
    <button type="button" class="lock-card" data-lock-id="${p.id}" data-lock-min="${p.min}" data-lock-days="${p.days}" data-lock-apr="${p.apr}" data-lock-label="${safeText(p.label)}">
      <strong>${safeText(p.label)}</strong>
      <small>${safeText(p.blurb)}</small>
      <small>Min ${p.min} USDT</small>
    </button>`,
  ).join("");
  grid.querySelectorAll(".lock-card").forEach((b) => {
    b.addEventListener("click", () => {
      grid.querySelectorAll(".lock-card").forEach((x) => x.classList.remove("is-picked"));
      b.classList.add("is-picked");
      const id = b.getAttribute("data-lock-id");
      if (pid) pid.value = id || "";
      if (hint) hint.textContent = `Selected: ${b.getAttribute("data-lock-label")} — min ${b.getAttribute("data-lock-min")} USDT`;
      if (btn) btn.disabled = !id;
    });
  });
}

function lockEstimatedReward(principal, apr, started, unlockAt) {
  const now = Date.now();
  const elapsed = Math.max(0, now - started);
  const cap = unlockAt && unlockAt > started ? Math.min(now, unlockAt) - started : elapsed;
  const years = cap / (365 * 86400000);
  return principal * apr * years;
}

function renderLockPositionsTable() {
  const body = document.querySelector("#lockPositionsBody");
  if (!body) return;
  const w = state.wallet || loadWallet();
  const rows = w.locks || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No active lock-ups. Subscribe above.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const unlock = r.unlockAt ? new Date(r.unlockAt).toLocaleString() : "Flexible";
      const rew = lockEstimatedReward(r.principal, r.apr, r.started, r.unlockAt);
      return `<tr>
        <td>${safeText(r.label)}</td>
        <td>${r.principal.toFixed(2)}</td>
        <td>${(r.apr * 100).toFixed(1)}%</td>
        <td>${unlock}</td>
        <td>${rew.toFixed(4)} USDT</td>
      </tr>`;
    })
    .join("");
}

function renderC2cOrderList() {
  const ul = document.querySelector("#c2cOrderList");
  if (!ul) return;
  const w = state.wallet || loadWallet();
  const list = (w.c2c || []).slice().reverse();
  if (!list.length) {
    ul.innerHTML = `<li class="muted">No orders yet.</li>`;
    return;
  }
  ul.innerHTML = list
    .map(
      (o) => `
    <li>
      <span>${safeText(o.side)} ${Number(o.amount).toFixed(2)} USDT @ ${Number(o.price).toFixed(4)}</span>
      <span>${safeText(o.status)}</span>
    </li>`,
    )
    .join("");
}

function initFeatureOverlays() {
  const root = document.querySelector("#overlayRoot");
  const scrim = document.querySelector("#overlayScrim");
  if (!root || root._bound) return;
  root._bound = true;
  scrim?.addEventListener("click", closeFeatureOverlay);
  root.querySelectorAll("[data-close-overlay]").forEach((b) => b.addEventListener("click", closeFeatureOverlay));

  document.querySelector("#depositForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.token) {
      showToast("Please log in first.", true);
      closeFeatureOverlay();
      promptAuthAndFocus();
      return;
    }
    const fd = new FormData(e.target);
    const amt = Number(fd.get("amount") || 0);
    const msg = document.querySelector("#depositMsg");
    if (amt < 1) {
      if (msg) msg.textContent = "Enter at least 1 USDT.";
      return;
    }
    const w = loadWallet();
    const net = String(fd.get("network") || "TRC20");
    const rid = uid();
    const created = Date.now();
    const creditedAt = created + DEPOSIT_PENDING_MS;
    w.recharges = w.recharges || [];
    w.pendingDeposits = w.pendingDeposits || [];
    w.recharges.push({
      id: rid,
      amount: amt,
      network: net,
      status: "pending",
      created,
      settleAt: creditedAt,
    });
    w.pendingDeposits.push({
      id: uid(),
      rechargeId: rid,
      amount: amt,
      network: net,
      created,
      creditedAt,
    });
    walletAddTxLog(w, {
      level: "INFO",
      action: "DEPOSIT_REQUEST",
      ref: shortRef(),
      detail: `${amt.toFixed(2)} USDT on ${net} — awaiting confirmation`,
      channel: net,
    });
    saveWallet(w);
    if (msg) {
      msg.textContent =
        "Request recorded. Your balance will update after network confirmation (see timer below). Do not send real assets to the sample address shown.";
    }
    showToast("Deposit request submitted — funds will credit after the waiting period.", false);
    startDepositCountdown(creditedAt);
    e.target.reset();
    setupDepositAddressUI();
  });

  document.querySelectorAll(".c2c-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".c2c-tab").forEach((t) => t.classList.remove("is-on"));
      tab.classList.add("is-on");
      const side = tab.getAttribute("data-c2c-side") || "buy";
      state.c2cSide = side;
      const hid = document.querySelector("#c2cSideField");
      if (hid) hid.value = side;
    });
  });

  document.querySelector("#c2cForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.token) {
      showToast("Please log in first.", true);
      closeFeatureOverlay();
      promptAuthAndFocus();
      return;
    }
    const fd = new FormData(e.target);
    const w = loadWallet();
    w.c2c = w.c2c || [];
    const oid = uid();
    const amt = Number(fd.get("amount") || 0);
    const price = Number(fd.get("price") || 0);
    const side = String(fd.get("side") || state.c2cSide);
    w.c2c.push({
      id: oid,
      side,
      amount: amt,
      price,
      note: String(fd.get("note") || ""),
      status: "open",
      created: Date.now(),
    });
    walletAddTransaction(w, {
      kind: "c2c",
      title: side === "sell" ? "C2C sell order" : "C2C buy order",
      amount: amt,
      asset: "USDT",
      status: "open",
      detail: `@ ${price.toFixed(4)} · ${String(fd.get("note") || "").slice(0, 40)}`,
    });
    walletAddTxLog(w, {
      level: "INFO",
      action: "C2C_ORDER_CREATE",
      ref: oid.slice(0, 12),
      detail: `${side.toUpperCase()} ${amt} USDT`,
    });
    saveWallet(w);
    const m = document.querySelector("#c2cMsg");
    if (m) m.textContent = "Order published.";
    showToast("C2C order is live on the board.", false);
    e.target.reset();
    document.querySelector("#c2cSideField").value = state.c2cSide;
    renderC2cOrderList();
  });

  document.querySelector("#lockSubscribeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.token) {
      showToast("Please log in first.", true);
      closeFeatureOverlay();
      promptAuthAndFocus();
      return;
    }
    const fd = new FormData(e.target);
    const pid = String(fd.get("productId") || "");
    const amt = Number(fd.get("amount") || 0);
    const product = LOCK_PRODUCTS.find((p) => p.id === pid);
    const msg = document.querySelector("#lockMsg");
    if (!product) {
      if (msg) msg.textContent = "Pick a product.";
      return;
    }
    if (amt < product.min) {
      if (msg) msg.textContent = `Minimum ${product.min} USDT for this product.`;
      return;
    }
    const w = loadWallet();
    if (amt > w.balance) {
      if (msg) msg.textContent = "Insufficient USDT balance. Deposit first.";
      return;
    }
    w.balance -= amt;
    const unlockAt = product.days > 0 ? Date.now() + product.days * 86400000 : 0;
    w.locks = w.locks || [];
    const lid = uid();
    w.locks.push({
      id: lid,
      productId: product.id,
      label: product.label,
      principal: amt,
      apr: product.apr,
      days: product.days,
      started: Date.now(),
      unlockAt,
    });
    walletAddTransaction(w, {
      kind: "lock",
      title: "Lock-up mining",
      amount: amt,
      asset: "USDT",
      status: "active",
      detail: product.label,
    });
    walletAddTxLog(w, {
      level: "INFO",
      action: "LOCK_SUBSCRIBE",
      ref: lid.slice(0, 12),
      detail: `${amt} USDT → ${product.label}`,
    });
    saveWallet(w);
    if (msg) msg.textContent = `Subscribed ${amt.toFixed(2)} USDT into ${product.label}.`;
    showToast("Lock-up mining started.", false);
    e.target.reset();
    document.querySelector("#lockProductId").value = "";
    document.querySelector("#lockSubscribeBtn").disabled = true;
    document.querySelector("#lockProductHint").textContent = "Select a product above.";
    document.querySelectorAll(".lock-card").forEach((x) => x.classList.remove("is-picked"));
    renderLockPositionsTable();
  });
}

function openWalletFlow(kind) {
  if (!state.token) {
    promptAuthAndFocus();
    showToast("Please sign in to use this feature.", true);
    return;
  }
  switchToTab("user");
  if (kind === "deposit") openFeatureOverlay("deposit");
  else if (kind === "c2c") openFeatureOverlay("c2c");
  else if (kind === "lock") openFeatureOverlay("lock");
}

const PROFILE_MODULE_TITLES = {
  recharge: "Recharge record",
  "withdrawal-record": "Withdrawal record",
  transactions: "Transaction records",
  "tx-log": "Transaction log",
  verification: "Identity verification",
  settings: "Account settings",
  funding: "Funding account",
  intro: "Platform introduction",
  msb: "MSB certification",
};

function fmtTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch (_) {
    return "—";
  }
}

function closeFeaturePanelsOnly() {
  const root = document.querySelector("#overlayRoot");
  if (!root) return;
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  document.querySelector("#overlayDeposit")?.setAttribute("hidden", "");
  document.querySelector("#overlayC2c")?.setAttribute("hidden", "");
  document.querySelector("#overlayLock")?.setAttribute("hidden", "");
}

function openProfileModule(action) {
  if (!state.token) {
    promptAuthAndFocus();
    showToast("Please sign in to open this section.", true);
    return;
  }
  closeFeaturePanelsOnly();
  closeProfileModule();
  switchToTab("user");
  const root = document.querySelector("#profileModuleRoot");
  const titleEl = document.querySelector("#profileModuleTitle");
  const body = document.querySelector("#profileModuleBody");
  if (!root || !titleEl || !body) return;
  titleEl.textContent = PROFILE_MODULE_TITLES[action] || "Account";
  body.innerHTML = buildProfileModuleHtml(action);
  root.hidden = false;
  root.removeAttribute("aria-hidden");
  if (action === "intro") hydrateIntroLiveLine();
}

function buildProfileModuleHtml(action) {
  const w = loadWallet();
  switch (action) {
    case "recharge":
      return renderRechargeModule(w);
    case "withdrawal-record":
      return renderWithdrawalModule(w);
    case "transactions":
      return renderTransactionsModule(w);
    case "tx-log":
      return renderTxLogModule(w);
    case "verification":
      return renderVerificationModule(w);
    case "settings":
      return renderSettingsModule(w);
    case "funding":
      return renderFundingModule(w);
    case "intro":
      return renderIntroModule();
    case "msb":
      return renderMsbModule();
    default:
      return `<p class="profile-mod-muted">Unknown section.</p>`;
  }
}

function tableWrap(headers, rowsHtml) {
  return `<table class="profile-mod-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function renderRechargeModule(w) {
  const rows = (w.recharges || []).slice().reverse();
  if (!rows.length) {
    return `<p class="profile-mod-muted">No recharge history yet. Use <strong>Deposit</strong> from Home or Profile to add USDT.</p>`;
  }
  const body = rows
    .map((r) => {
      const est =
        String(r.status).toLowerCase() === "pending" && r.settleAt
          ? `~${fmtTs(r.settleAt)}`
          : r.completedAt
            ? fmtTs(r.completedAt)
            : "—";
      return `<tr>
      <td>${fmtTs(r.created)}</td>
      <td>${safeText(r.network)}</td>
      <td>${Number(r.amount).toFixed(2)} USDT</td>
      <td>${safeText(r.status)}</td>
      <td>${est}</td>
      <td><code>${safeText(String(r.id).slice(0, 10))}</code></td>
    </tr>`;
    })
    .join("");
  return `<p class="profile-mod-muted">Deposits appear here after confirmation. Pending rows show an estimated credit time.</p>${tableWrap(
    ["Time", "Network", "Amount", "Status", "Est. credit", "Ref"],
    body,
  )}`;
}

function renderWithdrawalModule(w) {
  const rows = (w.withdrawals || []).slice().reverse();
  if (!rows.length) {
    return `<p class="profile-mod-muted">No withdrawals yet. Submit one from <strong>Withdrawal Channel</strong> below on this page.</p>`;
  }
  const body = rows
    .map(
      (r) => `<tr>
      <td>${fmtTs(r.created)}</td>
      <td>${Number(r.amount).toFixed(2)} USDT</td>
      <td>${safeText(r.status)}</td>
      <td>${maskAddr(r.address)}</td>
      <td><code>${safeText(String(r.id).slice(0, 10))}</code></td>
    </tr>`,
    )
    .join("");
  return `<p class="profile-mod-muted">Withdrawal requests and on-chain payout status.</p>${tableWrap(["Time", "Amount", "Status", "Address", "Ref"], body)}`;
}

function renderTransactionsModule(w) {
  const rows = (w.transactions || []).slice().reverse();
  if (!rows.length) {
    return `<p class="profile-mod-muted">No movements yet. Deposits, withdrawals, C2C and lock-up create entries here.</p>`;
  }
  const body = rows
    .map(
      (r) => `<tr>
      <td>${fmtTs(r.created)}</td>
      <td>${safeText(r.title || r.kind)}</td>
      <td>${Number(r.amount).toFixed(4)} ${safeText(r.asset || "USDT")}</td>
      <td>${safeText(r.status)}</td>
      <td>${safeText(r.detail || "—")}</td>
    </tr>`,
    )
    .join("");
  return `<p class="profile-mod-muted">Unified ledger (same style as major exchanges).</p>${tableWrap(["Time", "Type", "Amount", "Status", "Note"], body)}`;
}

function renderTxLogModule(w) {
  const rows = (w.txLogs || []).slice().reverse();
  if (!rows.length) {
    return `<p class="profile-mod-muted">Technical audit log is empty.</p>`;
  }
  const body = rows
    .map(
      (r) => `<tr>
      <td>${fmtTs(r.created)}</td>
      <td>${safeText(r.level || "INFO")}</td>
      <td><code>${safeText(r.action)}</code></td>
      <td>${safeText(r.ref || "—")}</td>
      <td>${safeText(r.detail || "—")}</td>
    </tr>`,
    )
    .join("");
  return `<p class="profile-mod-muted">Technical event log for account activity.</p>${tableWrap(["Time", "Level", "Action", "Ref", "Detail"], body)}`;
}

function renderVerificationModule(w) {
  const p = w.profile || {};
  const st = p.kycStatus || "none";
  if (st === "approved") {
    return `<div class="profile-mod-card"><strong>Verified</strong><p class="profile-mod-muted" style="margin:0">Your identity check is approved.</p></div>`;
  }
  if (st === "pending") {
    return `<div class="profile-mod-card"><strong>Under review</strong><p class="profile-mod-muted" style="margin:0">Submitted ${fmtTs(p.kycSubmitted)}. Typical review: 1–24 hours.</p></div>`;
  }
  return `
    <p class="profile-mod-muted">Complete KYC to unlock higher limits. Submitted data is stored on this device until a production backend is connected.</p>
    <form id="profileKycForm" class="profile-mod-form">
      <label>Legal name<input name="fullName" required maxlength="120" placeholder="As on ID document"></label>
      <label>ID type
        <select name="idType" required>
          <option value="">Select</option>
          <option value="passport">Passport</option>
          <option value="national_id">National ID</option>
          <option value="driver">Driver license</option>
        </select>
      </label>
      <label>ID number<input name="idNumber" required maxlength="40" placeholder="Document number"></label>
      <label>Notes (optional)<textarea name="notes" maxlength="500" placeholder="Optional message to compliance"></textarea></label>
      <button type="submit" class="profile-mod-btn">Submit verification</button>
    </form>`;
}

function renderSettingsModule(w) {
  const s = w.settings || {};
  const name = safeText(s.displayName || "");
  const em = s.emailNotify !== false ? "checked" : "";
  const pu = s.pushNotify !== false ? "checked" : "";
  return `
    <p class="profile-mod-muted">Preferences are saved locally in your browser.</p>
    <form id="profileSettingsForm" class="profile-mod-form">
      <label>Display name<input name="displayName" maxlength="60" value="${name.replace(/"/g, "&quot;")}" placeholder="Shown in the app header"></label>
      <label class="overlay-check"><input type="checkbox" name="emailNotify" ${em}> Email notifications</label>
      <label class="overlay-check"><input type="checkbox" name="pushNotify" ${pu}> Push / browser alerts</label>
      <label>Default quote currency
        <select name="quoteCcy">
          <option value="USD" ${s.quoteCcy === "USD" ? "selected" : ""}>USD</option>
          <option value="EUR" ${s.quoteCcy === "EUR" ? "selected" : ""}>EUR</option>
          <option value="INR" ${s.quoteCcy === "INR" ? "selected" : ""}>INR</option>
        </select>
      </label>
      <button type="submit" class="profile-mod-btn">Save settings</button>
    </form>`;
}

function renderFundingModule(w) {
  const locked = (w.locks || []).reduce((s, x) => s + (Number(x.principal) || 0), 0);
  const avail = Number(w.balance) || 0;
  const total = avail + locked;
  const c2cOpen = (w.c2c || []).filter((o) => o.status === "open").length;
  return `
    <p class="profile-mod-muted">Spot wallet breakdown (typical exchange layout).</p>
    <div class="profile-mod-card"><strong>Available</strong><div style="font-size:1.35rem;margin-top:0.2rem">${avail.toFixed(2)} USDT</div></div>
    <div class="profile-mod-card"><strong>In lock-up mining</strong><div style="font-size:1.2rem;margin-top:0.2rem">${locked.toFixed(2)} USDT</div></div>
    <div class="profile-mod-card"><strong>Total equity</strong><div style="font-size:1.2rem;margin-top:0.2rem">${total.toFixed(2)} USDT</div><p class="profile-mod-muted" style="margin:0.35rem 0 0">Available + locked principal.</p></div>
    <div class="profile-mod-card"><strong>Open C2C ads</strong><div style="font-size:1.1rem;margin-top:0.2rem">${c2cOpen}</div></div>`;
}

function renderIntroModule() {
  return `
    <div class="profile-mod-prose">
      <p class="profile-mod-muted" id="introLiveLine">Loading live market summary…</p>
      <h4>About ${SITE_NAME}</h4>
      <p><strong>${SITE_NAME}</strong> is a cryptocurrency trading workspace: live spot-style quotes, charts, a USDT wallet, C2C listings, and optional lock-up style products. It follows the same broad navigation patterns as global retail exchanges so you can track markets, size positions, and manage funding in one place.</p>
      <h4>Who it is for</h4>
      <p>Traders and investors who want quick access to prices, order-style flows, and account tools without switching between many single-purpose apps.</p>
      <h4>Risk disclosure</h4>
      <p>Crypto markets are volatile and can gap sharply. You may lose some or all of your capital. Always verify network, token, and address before sending assets, and only use funds you can afford to lose.</p>
      <h4>Security practices</h4>
      <ul>
        <li>Use a unique password and protect the device where you sign in.</li>
        <li>Enable two-factor authentication when supported by your account backend.</li>
        <li>Whitelist withdrawal addresses after identity verification where available.</li>
      </ul>
    </div>`;
}

function renderMsbModule() {
  return `
    <div class="profile-mod-prose">
      <p class="profile-mod-muted">Compliance overview — not legal advice.</p>
      <h4>MSB (Money Services Business)</h4>
      <p>In the United States, qualifying money transmitters and digital-asset businesses commonly register as <strong>MSBs</strong> with FinCEN and maintain AML/CFT programs: customer identification (KYC), monitoring, and recordkeeping aligned with the Bank Secrecy Act. International operators typically align with FATF-style travel rule and local licensing.</p>
      <h4>Official documentation users expect</h4>
      <ul>
        <li>MSB registration details (or equivalent licence) and operating entity name.</li>
        <li>AML program summary, privacy policy, and terms of use.</li>
        <li>Public registry or regulator links and downloadable certificates where applicable.</li>
      </ul>
      <div class="profile-mod-card"><strong>Certificates and filings</strong><p class="profile-mod-muted" style="margin:0">Regulated venues usually publish PDF confirmations and deep links to official registries (for example the FinCEN MSB registration search) in this section for verification.</p></div>
    </div>`;
}

async function hydrateIntroLiveLine() {
  const el = document.querySelector("#introLiveLine");
  if (!el) return;
  try {
    const res = await fetchJson(endpoints.liveMarket);
    const n = (res.data || []).length;
    el.textContent = `Live price feed: ${n} instruments (Binance / backup sources).`;
  } catch (_) {
    el.textContent = "Live price feed temporarily unavailable.";
  }
}

function initProfileModuleOverlay() {
  const root = document.querySelector("#profileModuleRoot");
  const scrim = document.querySelector("#profileModuleScrim");
  if (!root || root._profileBound) return;
  root._profileBound = true;
  scrim?.addEventListener("click", closeProfileModule);
  root.querySelectorAll("[data-close-profile]").forEach((b) => b.addEventListener("click", closeProfileModule));
  root.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id === "profileKycForm") {
      e.preventDefault();
      const fd = new FormData(form);
      const w = loadWallet();
      w.profile = w.profile || {};
      w.profile.kycStatus = "pending";
      w.profile.kycSubmitted = Date.now();
      w.profile.fullName = String(fd.get("fullName") || "").trim();
      w.profile.idType = String(fd.get("idType") || "");
      w.profile.idNumber = String(fd.get("idNumber") || "").trim();
      w.profile.notes = String(fd.get("notes") || "").trim();
      walletAddTxLog(w, { level: "INFO", action: "KYC_SUBMIT", ref: shortRef(), detail: "Verification submitted" });
      saveWallet(w);
      showToast("KYC submitted — pending review.", false);
      document.querySelector("#profileModuleBody").innerHTML = buildProfileModuleHtml("verification");
      return;
    }
    if (form.id === "profileSettingsForm") {
      e.preventDefault();
      const fd = new FormData(form);
      const w = loadWallet();
      w.settings = w.settings || {};
      w.settings.displayName = String(fd.get("displayName") || "").trim();
      w.settings.emailNotify = fd.get("emailNotify") === "on";
      w.settings.pushNotify = fd.get("pushNotify") === "on";
      w.settings.quoteCcy = String(fd.get("quoteCcy") || "USD");
      saveWallet(w);
      const wl = document.querySelector("#welcomeLine");
      if (wl && w.settings.displayName) wl.textContent = w.settings.displayName;
      showToast("Settings saved.", false);
      closeProfileModule();
    }
  });
}

function rowsFromCurrency(currencyData) {
  const all = currencyData?.all || [];
  const top = currencyData?.top_three || [];
  return all.length ? all : top;
}

function renderTopPairs(rows) {
  const root = document.querySelector("#topPairs");
  root.innerHTML = rows.slice(0, 3).map((row) => {
    const change = Number(row.change || 0);
    return `
      <div class="pair-item">
        <span>${safeText(row.legal_name)}/${safeText(row.currency_name)}</span>
        <strong>${Number(row.now_price || 0).toFixed(6)}</strong>
        <span class="${change >= 0 ? "positive" : "negative"}">${change.toFixed(2)}%</span>
      </div>
    `;
  }).join("");

  const ticker = rows.slice(0, 5).map((r) => `${r.legal_name}/${r.currency_name} ${Number(r.now_price || 0).toFixed(4)}`).join(" | ");
  document.querySelector("#tickerText").textContent = ticker || "No ticker available";
}

function renderMarket(rows) {
  const root = document.querySelector("#marketList");
  if (!rows.length) {
    root.innerHTML = `<p class="muted">No market records available.</p>`;
    return;
  }
  root.innerHTML = rows.slice(0, 20).map((row) => {
    const change = Number(row.change || 0);
    const cls = change >= 0 ? "positive" : "negative";
    return `
      <div class="market-row">
        <div class="pair">${safeText(row.legal_name)}/${safeText(row.currency_name)}</div>
        <div>${Number(row.now_price || 0).toFixed(6)}</div>
        <div class="badge ${cls}">${change.toFixed(2)}%</div>
      </div>
    `;
  }).join("");
}

function renderHomeMarket(rows) {
  const root = document.querySelector("#homeMarketList");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<p class="muted">No market records available.</p>`;
    return;
  }
  root.innerHTML = rows.slice(0, 8).map((row) => {
    const change = Number(row.change || 0);
    const cls = change >= 0 ? "positive" : "negative";
    return `
      <div class="market-row">
        <div class="pair">${safeText(row.legal_name)}/${safeText(row.currency_name)}</div>
        <div>${Number(row.now_price || 0).toFixed(6)}</div>
        <div class="badge ${cls}">${change.toFixed(2)}%</div>
      </div>
    `;
  }).join("");
}

function renderMeta(configData, countryData) {
  const brand = siteBrandFromConfig(configData);
  document.querySelector("#siteName").textContent = brand;
  document.querySelector("#heroTitle").textContent = brand;
  document.querySelector("#heroSub").textContent = safeText(configData.profit, "Digital financial service platform.");
  updateWalletDisplay();
  document.querySelector("#countryCount").textContent = String(countryData.length || 0);
  document.querySelector("#defaultCurrency").textContent = safeText(
    countryData.find((item) => Number(item.is_default) === 1)?.currency_name,
    "USDT"
  );
  state.customerService = safeText(configData.customer_service, "");
}

function renderNotices(newsData) {
  const list = document.querySelector("#newsList");
  const items = newsData?.data || [];
  if (!items.length) {
    document.querySelector("#newsState").textContent = "No news records found.";
    list.innerHTML = "";
    return;
  }
  document.querySelector("#newsState").textContent = "";
  list.innerHTML = items.slice(0, 5).map((item) => `<li>${safeText(item.title || item.name || item.content)}</li>`).join("");
}

function renderAccountMenu() {
  const list = [
    { label: "Recharge Record", icon: "&#128196;", action: "recharge" },
    { label: "Withdrawal Record", icon: "&#128196;", action: "withdrawal-record" },
    { label: "Transaction records", icon: "&#128196;", action: "transactions" },
    { label: "Transaction Log", icon: "&#128196;", action: "tx-log" },
    { label: "Verification", icon: "&#128101;", action: "verification" },
    { label: "Account Settings", icon: "&#9881;", action: "settings" },
    { label: "Funding Account", icon: "&#128179;", action: "funding" },
    { label: "Platform Introduction", icon: "&#9638;", action: "intro" },
    { label: "MSB Certification", icon: "&#10004;", action: "msb" },
  ];
  document.querySelector("#accountMenu").innerHTML = list.map((item) => `
    <li>
      <button class="profile-menu-item" data-menu-action="${item.action}" data-menu-label="${item.label}">
        <span class="menu-left"><span class="menu-icon">${item.icon}</span><span>${item.label}</span></span>
        <span class="menu-arrow">&#8250;</span>
      </button>
    </li>
  `).join("");

  document.querySelectorAll(".profile-menu-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-menu-action") || "";
      openProfileModule(action);
    });
  });
}

function renderLiveState() {
  document.querySelector("#liveState").textContent = `Live: ${state.liveEnabled ? "on" : "off"}`;
  document.querySelector("#toggleLiveBtn").textContent = state.liveEnabled ? "Disable Live" : "Enable Live";
}

async function pullLiveMarket() {
  const res = await fetchJson(endpoints.liveMarket);
  const rows = res?.data || [];
  state.liveTickerRows = rows;
  renderTopPairs(rows);
  renderMarket(rows);
  renderHomeMarket(rows);
  const coinTab = document.querySelector("#coin")?.classList.contains("active");
  const drawerOpen = document.querySelector("#coinDrawer")?.classList.contains("is-open");
  if (coinTab || drawerOpen) {
    const m = rowPriceForSymbol(state.coin.symbol);
    if (m.price > 0) {
      state.coin = { ...state.coin, price: m.price, change: m.change };
    }
    applyCoinToUi();
    updateCoinOrderBook();
    if (drawerOpen) renderCoinDrawerList();
  }
}

function stopLiveMarketLoop() {
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = null;
}

function startLiveMarketLoop() {
  stopLiveMarketLoop();
  state.liveTimer = setInterval(() => {
    pullLiveMarket().catch(() => {});
  }, 5000);
}

async function setLiveMarketEnabled(on) {
  state.liveEnabled = on;
  renderLiveState();
  if (!on) {
    stopLiveMarketLoop();
    state.liveTickerRows = [];
    renderTopPairs(state.backupRows);
    renderMarket(state.backupRows);
    renderHomeMarket(state.backupRows);
    return;
  }
  await pullLiveMarket().catch(() => {});
  startLiveMarketLoop();
}

async function toggleLive() {
  await setLiveMarketEnabled(!state.liveEnabled);
}

function bindQuickActions() {
  document.querySelectorAll(".quick-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-quick");
      if (action === "deposit") {
        openWalletFlow("deposit");
        return;
      }
      if (action === "c2c") {
        openWalletFlow("c2c");
        return;
      }
      if (action === "lock") {
        openWalletFlow("lock");
        return;
      }
      if (action === "withdraw") {
        if (!state.token) {
          promptAuthAndFocus();
          showToast("Please sign in for withdrawal.", true);
          return;
        }
        switchToTab("user");
        document.querySelector("#withdrawPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (action === "service" && state.customerService) {
        window.open(state.customerService, "_blank", "noopener");
        return;
      }
      showMessage("#authMessage", `${action} module is ready for backend integration.`);
    });
  });
}

function showAuthView(mode) {
  const panel = document.querySelector(".login-panel");
  if (!panel) return;
  const isRegister = mode === "register";
  panel.classList.toggle("auth-view-register", isRegister);
  panel.classList.toggle("auth-view-login", !isRegister);
}

async function bindAuth() {
  const registerForm = document.querySelector("#registerForm");
  const loginForm = document.querySelector("#loginForm");
  const logoutBtn = document.querySelector("#logoutBtn");
  const withdrawForm = document.querySelector("#withdrawForm");
  const showRegisterLink = document.querySelector("#showRegisterLink");
  const showLoginBtn = document.querySelector("#showLoginBtn");
  const loginTypeButtons = Array.from(document.querySelectorAll(".login-type-btn"));
  let loginType = "phone";

  showAuthView("login");
  applyAuthLoginMode("phone");
  loginTypeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      loginTypeButtons.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      loginType = btn.getAttribute("data-login-type") || "phone";
      applyAuthLoginMode(loginType);
    });
  });

  if (!registerForm || !loginForm || !logoutBtn || !withdrawForm) return;

  showRegisterLink?.addEventListener("click", () => {
    showAuthView("register");
    showMessage("#authMessage", "");
  });
  showLoginBtn?.addEventListener("click", () => {
    showAuthView("login");
    showMessage("#authMessage", "");
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    try {
      await postJson(endpoints.register, {
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
      });
      registerForm.reset();
      showAuthView("login");
      showMessage("#authMessage", "");
      showToast("You can sign in now with your email and password.", false);
      document.querySelector("#loginEmailOnly")?.focus();
    } catch (error) {
      showMessage("#authMessage", error.message, true);
      showToast(error.message, true);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    let identity;
    if (loginType === "email") {
      identity = String(document.querySelector("#loginEmailOnly")?.value || "").trim().toLowerCase();
    } else {
      const cc = String(formData.get("country_code") || "").trim();
      const num = String(formData.get("phone_number") || "").replace(/\s+/g, "");
      identity = `${cc}${num}`.trim();
    }
    try {
      const res = await postJson(endpoints.login, {
        email: identity,
        password: formData.get("password"),
      });
      state.token = res.token;
      localStorage.setItem("auth_token", res.token);
      if (state.marketLoginPromptTimer) {
        clearTimeout(state.marketLoginPromptTimer);
        state.marketLoginPromptTimer = null;
      }
      document.querySelector("#welcomeLine").textContent = safeText(res.user.name);
      document.querySelector("#userMeta").textContent = `Welcome to ${SITE_NAME}`;
      showMessage("#authMessage", `Logged in as ${res.user.name}`);
      logoutBtn.hidden = false;
      loginForm.reset();
      showAuthView("login");
      loginType = "phone";
      loginTypeButtons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-login-type") === "phone"));
      applyAuthLoginMode("phone");
      state.wallet = loadWallet();
      updateWalletDisplay();
    } catch (error) {
      if (error.status === 404 && error.code === "USER_NOT_FOUND") {
        showMessage("#authMessage", "No account found. Please register first.", true);
        showToast("If you do not already have an account, please register first, then sign in here.", true);
        return;
      }
      if (error.status === 401 && error.code === "INVALID_PASSWORD") {
        showMessage("#authMessage", error.message, true);
        showToast("Incorrect password. Try again or use Register to create an account.", true);
        return;
      }
      showMessage("#authMessage", error.message, true);
      showToast(error.message, true);
    }
  });

  logoutBtn.addEventListener("click", () => {
    state.token = "";
    localStorage.removeItem("auth_token");
    document.querySelector("#welcomeLine").textContent = "Welcome";
    document.querySelector("#userMeta").textContent = `Welcome to ${SITE_NAME}`;
    showMessage("#authMessage", "Signed out.");
    logoutBtn.hidden = true;
    showAuthView("login");
    closeFeatureOverlay();
    closeProfileModule();
    updateWalletDisplay();
  });

  withdrawForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.token) {
      showMessage("#withdrawMessage", "Please login first.", true);
      return;
    }
    const formData = new FormData(withdrawForm);
    const amount = Number(formData.get("amount") || 0);
    if (amount <= 0) {
      showMessage("#withdrawMessage", "Enter valid amount.", true);
      return;
    }
    const w = loadWallet();
    if (amount > w.balance) {
      showMessage("#withdrawMessage", "Amount exceeds available USDT balance.", true);
      return;
    }
    const addr = String(formData.get("address") || "").trim();
    w.balance -= amount;
    const wid = uid();
    w.withdrawals = w.withdrawals || [];
    w.withdrawals.push({
      id: wid,
      amount,
      address: addr,
      status: "processing",
      created: Date.now(),
    });
    walletAddTransaction(w, {
      kind: "withdraw",
      title: "Withdrawal",
      amount,
      asset: "USDT",
      status: "processing",
      detail: maskAddr(addr),
    });
    walletAddTxLog(w, {
      level: "INFO",
      action: "WITHDRAW_REQUEST",
      ref: shortRef(),
      detail: `${amount} USDT → ${maskAddr(addr)}`,
    });
    saveWallet(w);
    showMessage("#withdrawMessage", `Withdrawal queued for ${amount.toFixed(2)} USDT. Available balance has been updated.`);
    withdrawForm.reset();
  });
}

async function refreshAuthUser() {
  if (!state.token) return;
  try {
    const me = await fetchJson(endpoints.me, { headers: { Authorization: `Bearer ${state.token}` } });
    document.querySelector("#welcomeLine").textContent = safeText(me.user.name);
    document.querySelector("#userMeta").textContent = `Welcome to ${SITE_NAME}`;
    state.wallet = loadWallet();
    updateWalletDisplay();
  } catch (_) {
    state.token = "";
    localStorage.removeItem("auth_token");
    showAuthView("login");
    closeProfileModule();
    const lb = document.querySelector("#logoutBtn");
    if (lb) lb.hidden = true;
  }
}

function rowPriceForSymbol(symbol) {
  const s = String(symbol || "").toUpperCase();
  const live = state.liveTickerRows || [];
  const fromLive = live.find((r) => String(r.legal_name || "").toUpperCase() === s);
  if (fromLive && Number(fromLive.now_price) > 0) {
    return { price: Number(fromLive.now_price || 0), change: Number(fromLive.change || 0) };
  }
  const rows = state.backupRows || [];
  const row = rows.find((r) => String(r.legal_name || "").toUpperCase() === s);
  if (!row) return { price: 0, change: 0 };
  return { price: Number(row.now_price || 0), change: Number(row.change || 0) };
}

function buildDrawerItems() {
  const list = state.coinDrawerCategory === "metal" ? [...METAL_LIST] : [...CRYPTO_LIST];
  return list.map((c) => {
    const m = rowPriceForSymbol(c.symbol);
    const price = m.price;
    const change = m.change;
    return { ...c, price, change };
  });
}

function renderCoinDrawerList() {
  const root = document.querySelector("#coinDrawerList");
  if (!root) return;
  const items = buildDrawerItems();
  root.innerHTML = items.map((c) => {
    const ch = c.change;
    const cls = ch >= 0 ? "pos" : "neg";
    const priceStr = c.price > 0 ? c.price.toFixed(6) : "—";
    return `
      <li data-gecko-id="${c.id}" data-symbol="${c.symbol}" data-sub="${c.sub}">
        <div class="coin-dr-left"><strong>${c.symbol}</strong><span>${c.sub}</span></div>
        <div class="coin-dr-right">${priceStr}<small class="${cls}">${ch === 0 && c.price === 0 ? "—" : `${ch.toFixed(3)}%`}</small></div>
      </li>
    `;
  }).join("");

  root.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const id = li.getAttribute("data-gecko-id");
      const sym = li.getAttribute("data-symbol");
      const sub = li.getAttribute("data-sub");
      const m = rowPriceForSymbol(sym);
      const meta = [...CRYPTO_LIST, ...METAL_LIST].find((c) => c.symbol === sym);
      const usdt = meta?.usdt || `${sym}USDT`;
      state.coin = { geckoId: id, symbol: sym, sub, usdt, price: m.price, change: m.change };
      applyCoinToUi();
      closeCoinDrawer();
      loadCoinChart();
    });
  });
}

function applyCoinToUi() {
  const c = state.coin;
  const lbl = document.querySelector("#coinPairLabel");
  const sub = document.querySelector("#coinPairSub");
  if (lbl) lbl.textContent = c.symbol;
  if (sub) sub.textContent = c.sub;
  const dp = document.querySelector("#coinDisplayPrice");
  if (dp && c.price > 0) dp.value = String(c.price.toFixed(2));
  const big = document.querySelector("#coinChartBigPrice");
  const pEl = document.querySelector("#coinChartPct");
  if (big) big.textContent = c.price > 0 ? c.price.toFixed(2) : "--";
  if (pEl) {
    if (c.change === 0) {
      pEl.textContent = "";
      pEl.className = "coin-chart-pct";
    } else {
      pEl.textContent = `${c.change >= 0 ? "+" : ""}${c.change.toFixed(2)}%`;
      pEl.className = `coin-chart-pct ${c.change >= 0 ? "up" : "down"}`;
    }
  }
  const mainBtn = document.querySelector("#coinMainActionBtn");
  if (mainBtn) {
    const buy = state.coinSide === "buy";
    mainBtn.textContent = buy ? "Buy" : "Sell";
    mainBtn.className = `coin-main-btn ${buy ? "is-buy" : "is-sell"}`;
  }
  updateCoinOrderBook();
}

function updateCoinOrderBook() {
  const mid = state.coin.price;
  if (!mid || mid <= 0) {
    const asks = document.querySelector("#coinBookAsks");
    const bids = document.querySelector("#coinBookBids");
    if (asks) asks.innerHTML = "";
    if (bids) bids.innerHTML = "";
    return;
  }
  const steps = 8;
  const askRows = [];
  for (let i = steps; i >= 1; i -= 1) {
    const p = mid * (1 + 0.0001 * i * (1.2 + Math.random() * 0.2));
    const q = 0.0003 + Math.random() * 0.0025;
    const w = 18 + Math.random() * 60;
    askRows.push({ price: p, q, w });
  }
  const bidRows = [];
  for (let i = 1; i <= steps; i += 1) {
    const p = mid * (1 - 0.0001 * i * (1.2 + Math.random() * 0.2));
    const q = 0.0003 + Math.random() * 0.0025;
    const w = 18 + Math.random() * 60;
    bidRows.push({ price: p, q, w });
  }
  const fmt = (n) => n.toFixed(5);
  const qfmt = (n) => n.toFixed(6);
  const asksEl = document.querySelector("#coinBookAsks");
  const bidsEl = document.querySelector("#coinBookBids");
  if (asksEl) {
    asksEl.innerHTML = askRows
      .map(
        (r) => `<div class="coin-ob-row ask"><div class="coin-ob-bar" style="width:${r.w}%;right:0"></div><span>${fmt(r.price)}</span><span>${qfmt(r.q)}</span></div>`,
      )
      .join("");
  }
  if (bidsEl) {
    bidsEl.innerHTML = bidRows
      .map(
        (r) => `<div class="coin-ob-row bid"><div class="coin-ob-bar" style="width:${r.w}%;right:0"></div><span>${fmt(r.price)}</span><span>${qfmt(r.q)}</span></div>`,
      )
      .join("");
  }
  const m = document.querySelector("#coinBookMid");
  if (m) {
    m.innerHTML = `${mid.toFixed(2)}<span class="coin-mid-pct">${state.coin.change ? `${state.coin.change.toFixed(7)}%` : "—"}</span>`;
  }
}

function drawCoinChartLine(prices) {
  const canvas = document.querySelector("#coinPriceCanvas");
  if (!canvas || !prices.length) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 360;
  const cssH = 200;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  const w = cssW;
  const h = cssH;
  ctx.clearRect(0, 0, w, h);
  const vals = prices.map((p) => p[1]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 8;
  const x0 = pad;
  const y0 = pad;
  const x1 = w - pad;
  const y1 = h - pad;
  const r = max - min || 1;
  const normY = (v) => y1 - ((v - min) / r) * (y1 - y0);
  const step = (x1 - x0) / Math.max(1, vals.length - 1);
  ctx.beginPath();
  ctx.strokeStyle = "#1a7f5f";
  ctx.lineWidth = 2;
  vals.forEach((v, i) => {
    const x = x0 + i * step;
    const y = normY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  const last = vals[vals.length - 1];
  ctx.beginPath();
  ctx.fillStyle = "rgba(26, 127, 95, 0.2)";
  ctx.moveTo(x0, y1);
  vals.forEach((v, i) => {
    const x = x0 + i * step;
    const y = normY(v);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(x0 + (vals.length - 1) * step, y1);
  ctx.closePath();
  ctx.fill();
}

let _coinChartInFlight = false;
async function loadCoinChart() {
  if (_coinChartInFlight) return;
  const id = state.coin.geckoId;
  if (!id) return;
  _coinChartInFlight = true;
  try {
    const days = 1;
    const q = new URLSearchParams({ id: String(id), days: String(days) });
    if (state.coin.usdt) q.set("symbol", state.coin.usdt);
    const res = await fetchJson(`${endpoints.chartMarket}?${q.toString()}`);
    const prices = res?.data?.prices || [];
    if (prices.length) {
      const last = prices[prices.length - 1][1];
      const first = prices[0][1];
      state.coin.price = last;
      state.coin.change = first > 0 ? ((last - first) / first) * 100 : 0;
      document.querySelector("#coinChartBigPrice").textContent = last.toFixed(2);
      const pEl = document.querySelector("#coinChartPct");
      if (pEl) {
        pEl.textContent = `${state.coin.change >= 0 ? "+" : ""}${state.coin.change.toFixed(2)}%`;
        pEl.className = `coin-chart-pct ${state.coin.change >= 0 ? "up" : "down"}`;
      }
      const dp = document.querySelector("#coinDisplayPrice");
      if (dp) dp.value = last.toFixed(2);
    }
    drawCoinChartLine(prices);
    updateCoinOrderBook();
  } catch (_) {
    showToast("Chart data could not be loaded. Try again later.", true);
  } finally {
    _coinChartInFlight = false;
  }
}

function openCoinDrawer() {
  const ov = document.querySelector("#coinDrawerOverlay");
  const dr = document.querySelector("#coinDrawer");
  if (ov) ov.hidden = false;
  if (dr) {
    dr.setAttribute("aria-hidden", "false");
    dr.classList.add("is-open");
  }
  const btn = document.querySelector("#coinPairTrigger");
  if (btn) btn.setAttribute("aria-expanded", "true");
  renderCoinDrawerList();
}

function closeCoinDrawer() {
  const ov = document.querySelector("#coinDrawerOverlay");
  const dr = document.querySelector("#coinDrawer");
  if (ov) ov.hidden = true;
  if (dr) {
    dr.setAttribute("aria-hidden", "true");
    dr.classList.remove("is-open");
  }
  const btn = document.querySelector("#coinPairTrigger");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function onCoinTabShown() {
  applyCoinToUi();
  loadCoinChart();
}

function initCoinView() {
  const trigger = document.querySelector("#coinPairTrigger");
  const ov = document.querySelector("#coinDrawerOverlay");
  const chartBtn = document.querySelector("#coinHeaderChartBtn");
  const block = document.querySelector("#coinChartBlock");
  const segs = document.querySelectorAll(".coin-drawer-seg button");
  if (state.backupRows && state.backupRows.length) {
    const m = rowPriceForSymbol("BTC");
    state.coin = { ...state.coin, price: m.price, change: m.change };
  }
  applyCoinToUi();
  if (trigger) {
    trigger.addEventListener("click", () => {
      if (document.querySelector("#coinDrawer")?.classList.contains("is-open")) closeCoinDrawer();
      else openCoinDrawer();
    });
  }
  if (ov) ov.addEventListener("click", () => closeCoinDrawer());
  segs.forEach((b) => {
    b.addEventListener("click", () => {
      segs.forEach((x) => x.classList.remove("is-on"));
      b.classList.add("is-on");
      state.coinDrawerCategory = b.getAttribute("data-cat") === "metal" ? "metal" : "crypto";
      renderCoinDrawerList();
    });
  });
  if (chartBtn && block) {
    let chartVisible = true;
    chartBtn.addEventListener("click", () => {
      chartVisible = !chartVisible;
      block.hidden = !chartVisible;
    });
  }
  document.querySelectorAll(".coin-bs-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".coin-bs-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.coinSide = b.getAttribute("data-coin-side") || "buy";
      applyCoinToUi();
    });
  });
  document.querySelectorAll("[data-amt-pct]").forEach((b) => {
    b.addEventListener("click", () => {
      const amt = document.querySelector("#coinAmountInput");
      if (amt) amt.value = (Number(b.getAttribute("data-amt-pct") || 0) / 100) * 100;
    });
  });
  if (state.coinChartTimer) clearInterval(state.coinChartTimer);
  state.coinChartTimer = setInterval(() => {
    if (document.querySelector("#coin")?.classList.contains("active")) {
      loadCoinChart();
    }
  }, 15000);
}

function lwc() {
  return window.LightweightCharts;
}

function tradeBuildKlineUrl() {
  const list = TRADE_CATALOGS[state.tradeCat] || [];
  const item = list[state.tradePairIndex];
  if (!item) return null;
  const { k } = item;
  if (k.source === "frank") {
    return `${endpoints.tradeKlines}?source=frank&from=${k.from}&to=${k.to}&inv=1&days=${k.days || 60}`;
  }
  if (k.source === "binance") {
    const interval = TRADE_TF_MAP[state.tradeTf] || "15m";
    return `${endpoints.tradeKlines}?source=binance&symbol=${encodeURIComponent(k.symbol)}&interval=${encodeURIComponent(interval)}&limit=500`;
  }
  return null;
}

function toChartCandles(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((c) => ({
    time: Math.floor(c.t / 1000),
    open: Number(c.o),
    high: Number(c.h),
    low: Number(c.l),
    close: Number(c.c),
  }));
}

function toVolRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((c) => {
    const up = Number(c.c) >= Number(c.o);
    return {
      time: Math.floor(c.t / 1000),
      value: Math.max(0, Number(c.v) || 0),
      color: up ? "rgba(26,127,95,0.6)" : "rgba(198,40,40,0.6)",
    };
  });
}

function maData(candles, period) {
  const out = [];
  if (!candles || candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i += 1) {
    let s = 0;
    for (let j = 0; j < period; j += 1) s += candles[i - j].close;
    out.push({ time: candles[i].time, value: s / period });
  }
  return out;
}

function formatTradeOhlc(candle) {
  if (!candle) return "";
  const d = new Date(candle.time * 1000);
  const t = d.toLocaleString("en-CA", { hour12: false }).replace(",", "");
  const v = Number(candle.vol || 0);
  return `${t}  Open: ${candle.open.toFixed(6)}  High: ${candle.high.toFixed(6)}  Low: ${candle.low.toFixed(6)}  Close: ${candle.close.toFixed(6)}  Volume: ${v.toFixed(0)}`;
}

let tradeCandleData = [];
let tradeLastRowMap = new Map();

function getFilteredTradePairs() {
  const list = TRADE_CATALOGS[state.tradeCat] || [];
  const q = (state.tradePairFilter || "").trim().toLowerCase();
  if (!q) return list.map((row, idx) => ({ row, idx }));
  return list
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => {
      const lab = row.label.toLowerCase();
      const sym = row.k && row.k.symbol ? String(row.k.symbol).toLowerCase() : "";
      return lab.includes(q) || sym.includes(q);
    });
}

async function loadTradeRowTable() {
  const cat = state.tradeCat === "metal" ? "metal" : state.tradeCat;
  const res = await fetchJson(`${endpoints.tradeRows}?cat=${cat}`);
  tradeLastRowMap = new Map((res.rows || []).map((r) => [r.label, r]));
  const pairs = getFilteredTradePairs();
  const root = document.querySelector("#tradePairList");
  if (!root) return;
  if (!pairs.length) {
    root.innerHTML = `<li class="trade-pair-item muted" style="pointer-events:none">No pairs match “${safeText(state.tradePairFilter)}”.</li>`;
    updateTradeHeader();
    return;
  }
  const still = pairs.some((p) => p.idx === state.tradePairIndex);
  if (!still) state.tradePairIndex = pairs[0].idx;
  root.innerHTML = pairs
    .map(({ row, idx }) => {
      const d = tradeLastRowMap.get(row.label);
      const last = d ? Number(d.last).toFixed(6) : "—";
      const chg = d ? Number(d.chg) : 0;
      const numChg = d ? Number(d.chg) : 0;
      const chgStr = d
        ? `${numChg >= 0 ? "+" : ""}${Math.abs(numChg) < 0.01 ? numChg.toFixed(4) : numChg.toFixed(2)}%`
        : "—";
      const cls = !d ? "muted" : chg > 0 ? "pos" : "neg";
      return `<li class="trade-pair-item ${state.tradePairIndex === idx ? "is-sel" : ""}" data-idx="${idx}"><span class="tp-curr">${row.label}</span><span class="tp-rate">${last}</span><span class="tp-pct ${cls}">${chgStr}</span></li>`;
    })
    .join("");
  root.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      state.tradePairIndex = Number(li.getAttribute("data-idx"));
      loadTradeKlines();
      document.querySelectorAll("#tradePairList li").forEach((x) => x.classList.remove("is-sel"));
      li.classList.add("is-sel");
    });
  });
  updateTradeHeader();
}

function updateTradeHeader() {
  const list = TRADE_CATALOGS[state.tradeCat] || [];
  const item = list[state.tradePairIndex];
  if (!item) return;
  const d = tradeLastRowMap.get(item.label);
  const p = document.querySelector("#tradeHeaderPair");
  const c = document.querySelector("#tradeHeaderChg");
  if (p) p.textContent = item.label;
  if (c && d) {
    const chg = Number(d.chg);
    c.textContent = `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`;
    c.className = `trade-pair-chg ${chg >= 0 ? "is-up" : "is-down"}`;
  } else if (c) c.textContent = "—";
}

async function loadTradeKlines() {
  if (typeof window.LightweightCharts === "undefined") return;
  const url = tradeBuildKlineUrl();
  if (!url) return;
  let res;
  try {
    res = await fetchJson(url);
  } catch (e) {
    const item = TRADE_CATALOGS[state.tradeCat][state.tradePairIndex];
    if (item?.k?.source === "binance" && e.message) {
      showToast("Binance klines unavailable, trying CoinGecko…", true);
      const sym = item.k.symbol.replace("USDT", "").toLowerCase();
      const idMap = { btc: "bitcoin", eth: "ethereum", bnb: "binancecoin" };
      const gid = idMap[sym] || "bitcoin";
      res = await fetchJson(`${endpoints.tradeKlines}?source=gecko_ohlc&id=${gid}&days=7`);
    } else {
      showToast(e.message || "Chart load failed", true);
      return;
    }
  }
  const raw = res.candles || [];
  state.tradeLastRaw = raw;
  tradeCandleData = raw.map((x) => ({
    t: x.t,
    o: x.o,
    h: x.h,
    l: x.l,
    c: x.c,
    v: x.v,
  }));
  const candles = toChartCandles(raw);
  const vols = toVolRows(raw);
  if (!candles.length) {
    showToast("No candle data for this range.", true);
    return;
  }
  if (!state.tradeChart) createTradeCharts();
  if (state.tradeSeries.candle) state.tradeSeries.candle.setData(candles);
  if (state.tradeSeries.vol) state.tradeSeries.vol.setData(vols);
  if (state.tradeSeries.ma5) state.tradeSeries.ma5.setData(maData(candles, 5));
  if (state.tradeSeries.ma10) state.tradeSeries.ma10.setData(maData(candles, 10));
  if (state.tradeSeries.ma20) state.tradeSeries.ma20.setData(maData(candles, 20));
  const lastC = raw[raw.length - 1];
  const oc = {
    time: Math.floor(lastC.t / 1000),
    open: Number(lastC.o),
    high: Number(lastC.h),
    low: Number(lastC.l),
    close: Number(lastC.c),
    vol: Number(lastC.v) || 0,
  };
  const line = document.querySelector("#tradeOhlcLine");
  if (line) line.textContent = formatTradeOhlc(oc);
  const ma5 = maData(candles, 5).slice(-1)[0]?.value;
  const ma10 = maData(candles, 10).slice(-1)[0]?.value;
  const ma20 = maData(candles, 20).slice(-1)[0]?.value;
  const ml = document.querySelector("#tradeMaLine");
  if (ml) {
    ml.textContent = `MA5: ${ma5 != null ? ma5.toFixed(4) : "—"}  MA10: ${ma10 != null ? ma10.toFixed(4) : "—"}  MA20: ${ma20 != null ? ma20.toFixed(4) : "—"}`;
  }
  const vc = document.querySelector("#tradeVolCaption");
  if (vc) vc.textContent = `VOLUME: ${oc.vol ? oc.vol.toFixed(0) : "—"}`;
  state.tradeChart.timeScale().fitContent();
  if (state.tradeVolChart) state.tradeVolChart.timeScale().fitContent();
  updateTradeHeader();
}

function createTradeCharts() {
  const L = lwc();
  if (!L) return;
  const pEl = document.querySelector("#tradePriceChart");
  const vEl = document.querySelector("#tradeVolChart");
  if (!pEl || !vEl) return;
  pEl.innerHTML = "";
  vEl.innerHTML = "";
  const chartOpt = {
    layout: { background: { color: "#1a1a1a" }, textColor: "#9ca3af" },
    grid: { vertLines: { color: "#2b2b2b" }, horzLines: { color: "#2b2b2b" } },
    rightPriceScale: { borderColor: "#2b2b2b" },
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#2b2b2b" },
    crosshair: { mode: L.CrosshairMode != null ? L.CrosshairMode.Normal : 0 },
  };
  const w = pEl.clientWidth || 400;
  state.tradeChart = L.createChart(pEl, { width: w, height: 300, ...chartOpt });
  state.tradeSeries.candle = state.tradeChart.addCandlestickSeries({
    upColor: "#1a7f5f",
    downColor: "#c62828",
    borderUpColor: "#1a7f5f",
    borderDownColor: "#c62828",
    wickUpColor: "#1a7f5f",
    wickDownColor: "#c62828",
  });
  state.tradeSeries.ma5 = state.tradeChart.addLineSeries({ color: "#e69138", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  state.tradeSeries.ma10 = state.tradeChart.addLineSeries({ color: "#7e57c2", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  state.tradeSeries.ma20 = state.tradeChart.addLineSeries({ color: "#4fc3f7", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
  state.tradeVolChart = L.createChart(vEl, { width: w, height: 120, ...chartOpt });
  state.tradeSeries.vol = state.tradeVolChart.addHistogramSeries({ color: "#1a7f5f" });
  state.tradeChart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
    if (timeRange) state.tradeVolChart.timeScale().setVisibleRange(timeRange);
  });
  state.tradeChart.subscribeCrosshairMove((param) => {
    const line = document.querySelector("#tradeOhlcLine");
    if (!param || param.time == null) return;
    const raw = state.tradeLastRaw;
    if (!raw || !raw.length) return;
    const tsec = param.time;
    const a = raw.find((c) => Math.floor(c.t / 1000) === tsec) || raw[raw.length - 1];
    if (!a || !line) return;
    const ocs = {
      time: Math.floor(a.t / 1000),
      open: Number(a.o),
      high: Number(a.h),
      low: Number(a.l),
      close: Number(a.c),
      vol: Number(a.v) || 0,
    };
    line.textContent = formatTradeOhlc(ocs);
  });
  window.addEventListener("resize", () => {
    const nw = pEl.clientWidth || 400;
    state.tradeChart?.applyOptions({ width: nw });
    state.tradeVolChart?.applyOptions({ width: nw });
  });
}

function renderTradeTfs() {
  const tfs = ["1m", "5m", "15m", "30m", "60m", "1d"];
  const el = document.querySelector("#tradeTfRow");
  if (!el) return;
  el.innerHTML = tfs
    .map((t) => `<button type="button" class="trade-tf ${state.tradeTf === t ? "is-on" : ""}" data-tf="${t}">${t === "1d" ? "1 day" : t}</button>`)
    .join("");
}

function bindTradeTfRowOnce() {
  const el = document.querySelector("#tradeTfRow");
  if (!el || el._tfBound) return;
  el._tfBound = true;
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".trade-tf");
    if (!b) return;
    state.tradeTf = b.getAttribute("data-tf");
    el.querySelectorAll(".trade-tf").forEach((x) => x.classList.remove("is-on"));
    b.classList.add("is-on");
    loadTradeKlines();
  });
}

function onTradeTabShown() {
  renderTradeTfs();
  bindTradeTfRowOnce();
  if (state.tradeTimer) clearInterval(state.tradeTimer);
  state.tradeTimer = setInterval(() => {
    if (document.querySelector("#trade")?.classList.contains("active")) {
      loadTradeKlines();
      loadTradeRowTable().catch(() => {});
    }
  }, 3000);
  loadTradeRowTable()
    .then(() => loadTradeKlines())
    .catch((e) => showToast(e.message, true));
}

function initTradePage() {
  const cats = document.querySelectorAll(".trade-cat");
  const burger = document.querySelector("#tradeBurger");
  const back = document.querySelector("#tradeSidebarBackdrop");
  const left = document.querySelector("#tradeLeft");
  const home = document.querySelector("#tradeHomeBtn");
  const search = document.querySelector("#tradePairSearch");
  if (search && !state._tradeSearchBound) {
    state._tradeSearchBound = true;
    let t;
    search.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.tradePairFilter = search.value || "";
        loadTradeRowTable()
          .then(() => loadTradeKlines())
          .catch(() => {});
      }, 180);
    });
  }
  bindTradeTfRowOnce();
  cats.forEach((b) => {
    b.addEventListener("click", () => {
      const cat = b.getAttribute("data-cat");
      state.tradeCat = cat;
      state.tradePairIndex = 0;
      state.tradePairFilter = "";
      const s = document.querySelector("#tradePairSearch");
      if (s) s.value = "";
      cats.forEach((c) => c.classList.remove("is-active"));
      b.classList.add("is-active");
      loadTradeRowTable()
        .then(() => loadTradeKlines())
        .catch(() => {});
    });
  });
  if (burger && left) {
    burger.addEventListener("click", () => {
      left.classList.add("is-open");
      if (back) back.hidden = false;
    });
  }
  if (back && left) {
    back.addEventListener("click", () => {
      left.classList.remove("is-open");
      back.hidden = true;
    });
  }
  if (home) {
    home.addEventListener("click", () => switchToTab("home"));
  }
  const longB = document.querySelector("#tradeBtnLong");
  const shortB = document.querySelector("#tradeBtnShort");
  longB?.addEventListener("click", () => showToast("Long order: connect exchange API in production.", false));
  shortB?.addEventListener("click", () => showToast("Short order: connect exchange API in production.", false));
}

async function init() {
  try {
    const [configRes, currencyRes, countryRes, newsRes] = await Promise.all([
      fetchJson(endpoints.config),
      fetchJson(endpoints.currency),
      fetchJson(endpoints.country),
      fetchJson(endpoints.news),
    ]);
    const configData = configRes?.data || {};
    const currencyData = currencyRes?.data || {};
    const countryData = countryRes?.data || [];
    const rows = rowsFromCurrency(currencyData);

    state.backupRows = rows;
    const b = rowPriceForSymbol("BTC");
    if (b.price) {
      state.coin = { ...state.coin, price: b.price, change: b.change };
    }
    renderTabs();
    bindQuickActions();
    state.wallet = loadWallet();
    initFeatureOverlays();
    initProfileModuleOverlay();
    renderMeta(configData, countryData);
    renderTopPairs(rows);
    renderMarket(rows);
    renderHomeMarket(rows);
    renderNotices(newsRes);
    renderAccountMenu();
    renderLiveState();
    document.querySelector("#toggleLiveBtn").addEventListener("click", () => {
      toggleLive().catch((err) => showMessage("#authMessage", err.message, true));
    });
    await setLiveMarketEnabled(true).catch(() => {});
    await bindAuth();
    await refreshAuthUser();
    processPendingDeposits();
    setInterval(() => {
      processPendingDeposits();
    }, 15000);
    initCoinView();
    initTradePage();
  } catch (error) {
    renderTabs();
    bindQuickActions();
    state.wallet = loadWallet();
    initFeatureOverlays();
    initProfileModuleOverlay();
    bindAuth().catch(() => {});
    processPendingDeposits();
    setInterval(() => {
      processPendingDeposits();
    }, 15000);
    initCoinView();
    initTradePage();
    setLiveMarketEnabled(true).catch(() => {});
    showMessage("#authMessage", error.message, true);
  }
}

init();
