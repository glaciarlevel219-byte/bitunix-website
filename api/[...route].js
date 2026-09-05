const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { MongoClient, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");

const MONGODB_URI = process.env.MONGODB_URI;
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  if (!MONGODB_URI || MONGODB_URI.includes("USER:PASS")) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000,
      maxPoolSize: 10,
    });
    try {
      await cachedClient.connect();
      cachedDb = cachedClient.db();
    } catch (err) {
      console.error("MongoDB connect failed:", err.message);
      cachedClient = null;
      cachedDb = null;
      return null;
    }
  }
  return cachedDb;
}

const DATA_DIR = path.join(os.tmpdir(), "bitunix-data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SITE_CONFIG_FILE = path.join(DATA_DIR, "site_config.json");
const JWT_SECRET = process.env.JWT_SECRET || "local-secret";

const apiCache = new Map();

async function withCache(key, ttlMs, fn) {
  const hit = apiCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await fn();
  apiCache.set(key, { at: Date.now(), data });
  return data;
}

async function fetchBinanceTickers(symbols) {
  const list = [...new Set(symbols.map((s) => String(s).toUpperCase()))].filter(Boolean);
  if (!list.length) return new Map();
  const param = encodeURIComponent(JSON.stringify(list));
  const opts = {};
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    opts.signal = AbortSignal.timeout(6000);
  }
  const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${param}`, opts);
  if (!r.ok) throw new Error("Binance unavailable");
  const arr = await r.json();
  const map = new Map();
  if (Array.isArray(arr)) {
    for (const t of arr) map.set(t.symbol, t);
  }
  return map;
}

const CRYPTO_BINANCE_SYMS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT",
  "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT", "LINKUSDT", "AVAXUSDT", "MATICUSDT",
  "TRXUSDT", "SHIBUSDT", "ATOMUSDT", "NEARUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "HYPEUSDT",
];

const CRYPTO_PAIR_NAMES = {
  BTCUSDT: "Bitcoin", ETHUSDT: "Ethereum", BNBUSDT: "BNB", SOLUSDT: "Solana", XRPUSDT: "XRP",
  DOGEUSDT: "Dogecoin", ADAUSDT: "Cardano", DOTUSDT: "Polkadot", LTCUSDT: "Litecoin", BCHUSDT: "Bitcoin Cash",
  ETCUSDT: "Ethereum Classic", FILUSDT: "Filecoin", EOSUSDT: "EOS", LINKUSDT: "Chainlink", AVAXUSDT: "Avalanche",
  MATICUSDT: "Polygon", TRXUSDT: "TRON", SHIBUSDT: "Shiba Inu", ATOMUSDT: "Cosmos", NEARUSDT: "NEAR",
  ARBUSDT: "Arbitrum", OPUSDT: "Optimism", SUIUSDT: "Sui", HYPEUSDT: "Hyperliquid",
};

const FX_PAIRS = [
  { l: "INR/USD", t: "INR" }, { l: "EUR/USD", s: "EURUSDT" }, { l: "GBP/USD", s: "GBPUSDT" },
  { l: "AUD/USD", s: "AUDUSDT" }, { l: "JPY/USD", t: "JPY" }, { l: "AED/USD", t: "AED" },
  { l: "SAR/USD", t: "SAR" }, { l: "PKR/USD", t: "PKR" }, { l: "TRY/USD", t: "TRY" },
  { l: "CAD/USD", t: "CAD" }, { l: "CHF/USD", t: "CHF" }, { l: "NZD/USD", t: "NZD" },
  { l: "SGD/USD", t: "SGD" }, { l: "HKD/USD", t: "HKD" }, { l: "CNY/USD", t: "CNY" },
];

async function fetchSparklineForSymbol(symbol) {
  return withCache(`spark:${symbol}`, 60000, async () => {
    const opts = {};
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) opts.signal = AbortSignal.timeout(5000);
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=24`, opts);
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data.map((k) => Number(k[4])) : [];
  });
}

async function fetchTradeRows(cat) {
  const toRow = (label, last, chg) => ({ label, last: Number(last || 0), chg: String(chg || "0.00") });
  const rows = [];
  if (cat === "crypto") {
    const syms = CRYPTO_BINANCE_SYMS;
    try {
      const tickerMap = await fetchBinanceTickers(syms);
      for (const s of syms) {
        const t = tickerMap.get(s);
        if (t) rows.push(toRow(s.replace("USDT", "/USD"), t.lastPrice, t.priceChangePercent));
      }
    } catch (_) {}
    if (!rows.length) {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,ripple,dogecoin,cardano,polkadot,litecoin,bitcoin-cash,ethereum-classic,filecoin,eos&vs_currencies=usd&include_24hr_change=true");
        const d = await r.json();
        const map = { bitcoin: "BTC/USD", ethereum: "ETH/USD", binancecoin: "BNB/USD", solana: "SOL/USD", ripple: "XRP/USD", dogecoin: "DOGE/USD", cardano: "ADA/USD", polkadot: "DOT/USD", litecoin: "LTC/USD", "bitcoin-cash": "BCH/USD", "ethereum-classic": "ETC/USD", filecoin: "FIL/USD", eos: "EOS/USD" };
        for (const [id, label] of Object.entries(map)) {
          if (d[id]) rows.push(toRow(label, d[id].usd, d[id].usd_24h_change));
        }
      } catch (_) {}
    }
  } else if (cat === "metal") {
    try {
      const tickerMap = await fetchBinanceTickers(["PAXGUSDT", "XAUTUSDT"]);
      const pax = tickerMap.get("PAXGUSDT");
      const xau = tickerMap.get("XAUTUSDT");
      if (pax) rows.push(toRow("PAXG/USD", pax.lastPrice, pax.priceChangePercent));
      if (xau) rows.push(toRow("XAU/USD", xau.lastPrice, xau.priceChangePercent));
    } catch (_) {}
    if (!rows.length) rows.push(toRow("PAXG/USD", 2320.5, 0.45), toRow("XAU/USD", 2325.1, -0.12));
  } else if (cat === "fx") {
    let fxData = null;
    try {
      const fr = await fetch("https://open.er-api.com/v6/latest/USD");
      if (fr.ok) fxData = await fr.json();
    } catch (_) {}
    let tickerMap = new Map();
    try {
      tickerMap = await fetchBinanceTickers(FX_PAIRS.filter((p) => p.s).map((p) => p.s));
    } catch (_) {}
    for (const p of FX_PAIRS) {
      if (p.s) {
        const t = tickerMap.get(p.s);
        if (t) {
          rows.push(toRow(p.l, t.lastPrice, t.priceChangePercent));
          continue;
        }
      }
      const rate = fxData?.rates?.[p.t];
      if (rate) rows.push(toRow(p.l, (1 / rate).toFixed(6), (Math.random() * 0.2 - 0.1).toFixed(2)));
      else rows.push(toRow(p.l, "0.00", "0.00"));
    }
  }
  return rows;
}

async function fetchTradingBoard(cat) {
  if (cat === "crypto" || cat === "metal") {
    const syms = cat === "crypto" ? CRYPTO_BINANCE_SYMS : ["PAXGUSDT", "XAUTUSDT"];
    let tickerMap = new Map();
    try { tickerMap = await fetchBinanceTickers(syms); } catch (_) {}
    const active = syms.filter((s) => tickerMap.has(s));
    const sparkEntries = await Promise.all(
      active.slice(0, 18).map(async (sym) => [sym, await fetchSparklineForSymbol(sym)])
    );
    const sparkMap = new Map(sparkEntries);
    return active.map((sym) => {
      const t = tickerMap.get(sym);
      const base = sym.replace("USDT", "");
      return {
        label: `${base}/USD`,
        pair: `${base}/USDT`,
        symbol: sym,
        name: CRYPTO_PAIR_NAMES[sym] || base,
        price: Number(t.lastPrice),
        change: Number(t.priceChangePercent),
        high: Number(t.highPrice),
        volume: Number(t.quoteVolume || t.volume || 0),
        sparkline: sparkMap.get(sym) || [],
        cat,
      };
    });
  }
  const rows = await fetchTradeRows("fx");
  return rows.map((r) => {
    const price = Number(r.last) || 0;
    const chg = Number(r.chg) || 0;
    const parts = String(r.label || "").split("/");
    return {
      label: r.label,
      pair: r.label,
      symbol: r.label,
      name: parts[0] || r.label,
      price,
      change: chg,
      high: price * (1 + Math.abs(chg) / 200),
      volume: 0,
      sparkline: [],
      cat: "fx",
    };
  });
}

async function fetchLiveMarketRows() {
  const toRow = (label, now_price, change) => ({
    label,
    legal_name: label.split("/")[0],
    currency_name: label.split("/")[1] || "USD",
    now_price: Number(now_price || 0),
    change: Number(change || 0),
  });
  const cryptoSyms = CRYPTO_BINANCE_SYMS;
  const fxPairs = FX_PAIRS;
  const metalSyms = ["PAXGUSDT", "XAUTUSDT"];
  const binanceSyms = [...cryptoSyms, ...fxPairs.filter((p) => p.s).map((p) => p.s), ...metalSyms];
  const results = [];
  let tickerMap = new Map();
  try {
    tickerMap = await fetchBinanceTickers(binanceSyms);
  } catch (_) {}

  for (const s of cryptoSyms) {
    const t = tickerMap.get(s);
    if (t) results.push(toRow(s.replace("USDT", "/USD"), t.lastPrice, t.priceChangePercent));
  }

  if (!results.length) {
    try {
      const cgUrl = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,ripple,dogecoin,cardano,polkadot,litecoin,bitcoin-cash,ethereum-classic,filecoin,eos&vs_currencies=usd&include_24hr_change=true";
      const cg = await fetch(cgUrl);
      if (cg.ok) {
        const d = await cg.json();
        const map = { bitcoin: "BTC", ethereum: "ETH", binancecoin: "BNB", solana: "SOL", ripple: "XRP", dogecoin: "DOGE", cardano: "ADA", polkadot: "DOT", litecoin: "LTC", "bitcoin-cash": "BCH", "ethereum-classic": "ETC", filecoin: "FIL", eos: "EOS" };
        for (const [id, sym] of Object.entries(map)) {
          const price = Number(d?.[id]?.usd || 0);
          const chg = Number(d?.[id]?.usd_24h_change || 0);
          if (price > 0) results.push(toRow(`${sym}/USD`, price, chg));
        }
      }
    } catch (_) {}
  }

  let fxData = null;
  try {
    const fr = await fetch("https://open.er-api.com/v6/latest/USD");
    if (fr.ok) fxData = await fr.json();
  } catch (_) {}

  for (const p of fxPairs) {
    if (p.s) {
      const t = tickerMap.get(p.s);
      if (t) {
        results.push(toRow(p.l, t.lastPrice, t.priceChangePercent));
        continue;
      }
    }
    const rate = fxData?.rates?.[p.t];
    if (rate) results.push(toRow(p.l, (1 / rate).toFixed(6), (Math.random() * 0.2 - 0.1).toFixed(2)));
  }

  for (const s of metalSyms) {
    const t = tickerMap.get(s);
    if (t) results.push(toRow(s === "PAXGUSDT" ? "PAXG/USD" : "XAU/USD", t.lastPrice, t.priceChangePercent));
  }

  return results;
}

// --- UTILS ---
function sendJson(res, status, data) {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// Sequential ID counter - uses database for atomic operations
async function getNextUserId() {
  const db = await connectToDatabase();
  const START_ID = 854694;
  
  // Use database counters collection for atomic increment
  if (db) {
    try {
      const result = await db.collection("counters").findOneAndUpdate(
        { _id: "userId" },
        { $inc: { seq: 1 } },
        { upsert: false, returnDocument: "after" }
      );
      
      if (!result) {
        // Initialize counter
        await db.collection("counters").insertOne({ _id: "userId", seq: START_ID });
        return START_ID.toString();
      }
      
      const counter = result.seq || result.value?.seq;
      if (counter < START_ID) {
         // Force start at START_ID
         await db.collection("counters").updateOne({ _id: "userId" }, { $set: { seq: START_ID } });
         return START_ID.toString();
      }
      return counter.toString();
    } catch (e) {
      console.error("Counter error:", e);
    }
  }
  
  // Fallback: Find highest existing ID and increment
  try {
    const users = await db.collection("users").find({}).toArray();
    let maxId = START_ID - 1;
    for (const user of users) {
      if (/^\d+$/.test(user.id)) {
        const num = parseInt(user.id, 10);
        if (num > maxId) maxId = num;
      }
    }
    const newId = (maxId + 1).toString();
    
    // Double-check this ID doesn't exist
    const exists = await db.collection("users").findOne({ id: newId });
    if (exists) {
      // Find next available
      let checkId = maxId + 2;
      while (await db.collection("users").findOne({ id: checkId.toString() })) {
        checkId++;
      }
      return checkId.toString();
    }
    
    return newId;
  } catch (e) {
    console.error("Fallback ID error:", e);
    // Last resort
    return Date.now().toString();
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if(!storedHash || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return hash === verifyHash;
}

function signToken(payload) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [head, body, sig] = token.split(".");
    const check = crypto.createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
    if (sig !== check) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch { return null; }
}

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD_HASH =
  "6a04a72813611322e3848469ed2299fc:3043d576147f9b99e110d39da99d4649677943302a8606a1f621a90ab4b8f61d634efb30349b45b93d94a5184b7886758d3dd83f00e2efeb6924157afd81bb2d";

const adminLoginAttempts = new Map();
const ADMIN_MAX_LOGIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000;
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

function isAdminLoginLocked(ip) {
  const rec = adminLoginAttempts.get(ip);
  if (!rec?.lockedUntil) return false;
  if (Date.now() >= rec.lockedUntil) {
    adminLoginAttempts.delete(ip);
    return false;
  }
  return true;
}

function recordAdminLoginFailure(ip) {
  const rec = adminLoginAttempts.get(ip) || { fails: 0 };
  rec.fails += 1;
  if (rec.fails >= ADMIN_MAX_LOGIN_ATTEMPTS) {
    rec.lockedUntil = Date.now() + ADMIN_LOCKOUT_MS;
    rec.fails = 0;
  }
  adminLoginAttempts.set(ip, rec);
}

function clearAdminLoginFailures(ip) {
  adminLoginAttempts.delete(ip);
}

function isStrongAdminPassword(password) {
  const s = String(password || "");
  return (
    s.length >= 12 &&
    /[A-Z]/.test(s) &&
    /[a-z]/.test(s) &&
    /[0-9]/.test(s) &&
    /[^A-Za-z0-9]/.test(s)
  );
}

async function getAdminRecord() {
  const db = await connectToDatabase();
  if (db) {
    const doc = await db.collection("admin_users").findOne({ role: "admin" });
    if (doc?.passwordHash) {
      return { username: String(doc.username || DEFAULT_ADMIN_USERNAME), passwordHash: doc.passwordHash, fromDb: true };
    }
  }
  const username = String(process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
  if (process.env.ADMIN_PASSWORD_HASH) {
    return { username, passwordHash: process.env.ADMIN_PASSWORD_HASH, fromDb: false };
  }
  if (process.env.ADMIN_PASSWORD) {
    return { username, passwordHash: hashPassword(process.env.ADMIN_PASSWORD), fromDb: false };
  }
  return { username: DEFAULT_ADMIN_USERNAME, passwordHash: DEFAULT_ADMIN_PASSWORD_HASH, fromDb: false };
}

async function saveAdminPassword(username, passwordHash) {
  const db = await connectToDatabase();
  if (!db) return false;
  await db.collection("admin_users").updateOne(
    { role: "admin" },
    { $set: { username, passwordHash, role: "admin", updatedAt: Date.now() }, $setOnInsert: { createdAt: Date.now() } },
    { upsert: true }
  );
  return true;
}

function verifyAdminSession(token) {
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== "admin") return null;
  if (decoded.exp && Date.now() > decoded.exp) return null;
  return decoded;
}

// --- DB HELPERS ---
async function writeWallet(userId, wallet) {
  const db = await connectToDatabase();
  if (!db) return;
  const existing = await findWalletDoc(userId);
  const key = existing?.userId ?? normalizeUserId(userId);
  wallet.userId = key;
  await db.collection("wallets").updateOne({ userId: key }, { $set: wallet }, { upsert: true });
}

function normalizeUserId(userId) {
  if (userId === null || userId === undefined || userId === "") return userId;
  const s = String(userId).trim();
  const n = Number(s);
  if (!Number.isNaN(n) && String(n) === s) return n;
  return s;
}

async function findWalletDoc(userId) {
  const db = await connectToDatabase();
  if (!db) return null;
  const candidates = new Set([userId, String(userId).trim()]);
  const n = Number(userId);
  if (!Number.isNaN(n)) candidates.add(n);
  for (const c of candidates) {
    const w = await db.collection("wallets").findOne({ userId: c });
    if (w) return w;
  }
  return null;
}

async function readWallet(userId) {
  const w = await findWalletDoc(userId);
  if (w) return w;
  return {
    userId: normalizeUserId(userId),
    balance: 0,
    pendingDeposits: [],
    pendingWithdrawals: [],
    transactions: [],
  };
}

async function clearAllPendingRequests() {
  const db = await connectToDatabase();
  if (!db) return { clearedDeposits: 0, clearedWithdrawals: 0 };
  const wallets = await db.collection("wallets").find({}).toArray();
  let clearedDeposits = 0;
  let clearedWithdrawals = 0;
  for (const w of wallets) {
    const pendingDeposits = w.pendingDeposits || [];
    const pendingList = collectPendingWithdrawals(w);
    if (!pendingDeposits.length && !pendingList.length) continue;

    const wallet = { ...w };
    wallet.pendingDeposits = [];
    wallet.pendingWithdrawals = [];
    wallet.deposits = wallet.deposits || [];
    wallet.withdrawals = wallet.withdrawals || [];

    for (const dep of pendingDeposits) {
      wallet.deposits.push({
        ...dep,
        status: "cancelled",
        processedAt: Date.now(),
        cancelledReason: "cleared_by_admin",
      });
      clearedDeposits++;
    }

    const processed = new Set();
    for (const wd of pendingList) {
      const key = withdrawalKey(wd);
      if (processed.has(key)) continue;
      processed.add(key);
      finalizeWithdrawalRecord(wallet, { ...wd }, "clear");
      clearedWithdrawals++;
    }
    wallet.pendingWithdrawals = [];

    await db.collection("wallets").updateOne(
      { userId: wallet.userId },
      {
        $set: {
          pendingDeposits: [],
          pendingWithdrawals: [],
          balance: wallet.balance,
          deposits: wallet.deposits,
          withdrawals: wallet.withdrawals,
        },
      }
    );
  }
  return { clearedDeposits, clearedWithdrawals };
}

function isPendingWithdrawalStatus(status) {
  const s = String(status || "pending").toLowerCase();
  return s === "pending" || s === "";
}

function withdrawalKey(wd) {
  if (!wd) return "";
  if (wd.id) return String(wd.id);
  return `${wd.created || 0}:${wd.amount || 0}:${wd.address || ""}`;
}

function collectPendingWithdrawals(wallet) {
  const out = [];
  const seen = new Set();
  const add = (wd, stuck) => {
    const key = withdrawalKey(wd);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ ...wd, stuck: Boolean(stuck) });
  };
  for (const wd of wallet.pendingWithdrawals || []) add(wd, false);
  for (const wd of wallet.withdrawals || []) {
    if (!isPendingWithdrawalStatus(wd.status)) continue;
    const inPending = (wallet.pendingWithdrawals || []).some((p) => withdrawalKey(p) === withdrawalKey(wd));
    add(wd, !inPending);
  }
  return out;
}

function getStuckWithdrawals(wallet) {
  return collectPendingWithdrawals(wallet).filter((w) => w.stuck);
}

function markWithdrawalCancelledInHistory(wallet, withdrawal) {
  wallet.withdrawals = wallet.withdrawals || [];
  let matched = false;
  wallet.withdrawals = wallet.withdrawals.map((w) => {
    if (withdrawalKey(w) === withdrawalKey(withdrawal) && isPendingWithdrawalStatus(w.status)) {
      matched = true;
      return { ...w, ...withdrawal };
    }
    return w;
  });
  if (!matched) wallet.withdrawals.push({ ...withdrawal });
}

function finalizeWithdrawalRecord(wallet, withdrawal, action) {
  const amount = Number(withdrawal.amount || 0);
  if (action === "reject" || action === "clear") {
    wallet.balance = (wallet.balance || 0) + amount;
  }
  withdrawal.status = action === "approve" ? "completed" : action === "reject" ? "rejected" : "cancelled";
  withdrawal.processedAt = Date.now();
  if (action === "clear") withdrawal.cancelledReason = "cleared_by_admin";

  const key = withdrawalKey(withdrawal);
  wallet.pendingWithdrawals = (wallet.pendingWithdrawals || []).filter((w) => withdrawalKey(w) !== key);
  markWithdrawalCancelledInHistory(wallet, withdrawal);
}

async function forceClearAllPendingWithdrawals() {
  const db = await connectToDatabase();
  if (!db) return { clearedWithdrawals: 0 };
  const wallets = await db.collection("wallets").find({}).toArray();
  let clearedWithdrawals = 0;
  for (const w of wallets) {
    const pendingList = collectPendingWithdrawals(w);
    if (!pendingList.length) continue;
    const wallet = { ...w };
    wallet.pendingWithdrawals = wallet.pendingWithdrawals || [];
    wallet.withdrawals = wallet.withdrawals || [];
    const processed = new Set();
    for (const wd of pendingList) {
      const key = withdrawalKey(wd);
      if (processed.has(key)) continue;
      processed.add(key);
      finalizeWithdrawalRecord(wallet, { ...wd }, "clear");
      clearedWithdrawals++;
    }
    await db.collection("wallets").updateOne(
      { userId: w.userId },
      {
        $set: {
          pendingWithdrawals: wallet.pendingWithdrawals,
          balance: wallet.balance,
          withdrawals: wallet.withdrawals,
        },
      }
    );
  }
  return { clearedWithdrawals };
}

async function clearStuckWithdrawalsOnly() {
  const db = await connectToDatabase();
  if (!db) return { clearedWithdrawals: 0 };
  const wallets = await db.collection("wallets").find({}).toArray();
  let clearedWithdrawals = 0;
  for (const w of wallets) {
    const stuck = getStuckWithdrawals(w);
    if (!stuck.length) continue;
    const wallet = { ...w };
    wallet.pendingWithdrawals = wallet.pendingWithdrawals || [];
    wallet.withdrawals = wallet.withdrawals || [];
    for (const wd of stuck) {
      finalizeWithdrawalRecord(wallet, { ...wd }, "clear");
      clearedWithdrawals++;
    }
    await db.collection("wallets").updateOne(
      { userId: wallet.userId },
      {
        $set: {
          pendingWithdrawals: wallet.pendingWithdrawals,
          balance: wallet.balance,
          withdrawals: wallet.withdrawals,
        },
      }
    );
  }
  return { clearedWithdrawals };
}

let adminMigrationPromise = null;

async function runAdminPasswordResetMigration() {
  const db = await connectToDatabase();
  if (!db) return { skipped: true };
  const flag = "adminPasswordReset20260905";
  const meta = await db.collection("meta").findOne({ _id: "migrations" });
  if (meta?.[flag]) return { skipped: true };
  await db.collection("admin_users").updateOne(
    { role: "admin" },
    {
      $set: {
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
        role: "admin",
        updatedAt: Date.now(),
      },
      $setOnInsert: { createdAt: Date.now() },
    },
    { upsert: true }
  );
  await db.collection("meta").updateOne(
    { _id: "migrations" },
    { $set: { [flag]: true, resetAt: Date.now() } },
    { upsert: true }
  );
  return { reset: true };
}

async function runAdminPendingResetMigration() {
  const db = await connectToDatabase();
  if (!db) return { skipped: true };
  const flag = "adminPendingReset20260903";
  const meta = await db.collection("meta").findOne({ _id: "migrations" });
  if (meta?.[flag]) return { skipped: true };
  const result = await clearAllPendingRequests();
  await db.collection("meta").updateOne(
    { _id: "migrations" },
    { $set: { [flag]: true, clearedAt: Date.now(), result } },
    { upsert: true }
  );
  return result;
}

function ensureAdminMigrations() {
  if (!adminMigrationPromise) {
    adminMigrationPromise = Promise.all([
      runAdminPendingResetMigration(),
      runAdminPasswordResetMigration(),
    ]).catch((err) => {
      console.error("Admin migration failed:", err);
      adminMigrationPromise = null;
    });
  }
  return adminMigrationPromise;
}

function findPendingWithdrawal(wallet, withdrawalId) {
  const target = String(withdrawalId || "");
  const fromPending = (wallet.pendingWithdrawals || []).find(
    (w) => String(w.id || "") === target || withdrawalKey(w) === target
  );
  if (fromPending) return { withdrawal: fromPending, source: "pending" };
  const fromHistory = (wallet.withdrawals || []).find(
    (w) => isPendingWithdrawalStatus(w.status) && (String(w.id || "") === target || withdrawalKey(w) === target)
  );
  if (fromHistory) return { withdrawal: fromHistory, source: "history" };
  return null;
}

// --- HANDLER ---
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = url.pathname;
    // Handle Vercel internal rewrites (where pathname becomes /api/[...route].js)
    const originalUrl = req.headers['x-original-url'] || req.headers['x-forwarded-path'];
    if (originalUrl && pathname.includes('[...route]')) {
        try {
            pathname = new URL(originalUrl, `http://${req.headers.host}`).pathname;
        } catch (e) {}
    }
    if (pathname.endsWith("/") && pathname.length > 1) pathname = pathname.slice(0, -1);

    // One-time VPS migration helper (Vercel has production secrets). Remove after Hostinger connected.
    if (pathname === "/api/vps-sync-env" && req.method === "GET") {
      const key = String(url.searchParams.get("key") || "");
      if (key !== "BitunixVpsSync20260905") return sendJson(res, 403, { message: "Forbidden" });
      return sendJson(res, 200, {
        MONGODB_URI: process.env.MONGODB_URI || "",
        JWT_SECRET: process.env.JWT_SECRET || "",
        SMTP_HOST: process.env.SMTP_HOST || "",
        SMTP_PORT: process.env.SMTP_PORT || "",
        SMTP_USER: process.env.SMTP_USER || "",
        SMTP_PASS: process.env.SMTP_PASS || "",
      });
    }

    if (pathname === "/api/health-db" && req.method === "GET") {
      const db = await connectToDatabase();
      if (!db) return sendJson(res, 503, { ok: false, error: "no_db" });
      const users = await db.collection("users").countDocuments();
      const wallets = await db.collection("wallets").countDocuments();
      return sendJson(res, 200, { ok: true, users, wallets });
    }
    
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const decoded = verifyToken(token);

    // --- AUTH ---
    if (pathname === "/api/auth/register" && req.method === "POST") {
      const { name, email, password } = await parseBody(req);
      const db = await connectToDatabase();
      const existing = await db.collection("users").findOne({ email });
      if (existing) return sendJson(res, 400, { message: "Email already registered" });
      const userId = await getNextUserId();
      const newUser = { id: userId, name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      await db.collection("users").insertOne(newUser);
      return sendJson(res, 201, { message: "Success", userId: newUser.id });
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const { email, password } = await parseBody(req);
      const db = await connectToDatabase();
      const u = await db.collection("users").findOne({ email });
      if (!u || !verifyPassword(password, u.passwordHash)) return sendJson(res, 401, { message: "Invalid credentials" });
      if (u.accountFrozen) return sendJson(res, 403, { message: "Your account has been frozen. Please contact customer support." });
      const token = signToken({ id: u.id, name: u.name, email: u.email });
      return sendJson(res, 200, { token, user: { id: u.id, name: u.name, email: u.email } });
    }

    if (pathname === "/api/auth/forgot-password" && req.method === "POST") {
      const { email } = await parseBody(req);
      const db = await connectToDatabase();
      const user = await db.collection("users").findOne({ email });
      if (!user) return sendJson(res, 400, { message: "Email not registered" });

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await db.collection("reset_codes").updateOne({ email }, { $set: { code, expires: Date.now() + 15 * 60000 } }, { upsert: true });

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "mail.bitunixpk.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER || "support@bitunixpk.com",
          pass: process.env.SMTP_PASS || "Bitunix@123"
        }
      });

      try {
        if (!process.env.SMTP_PASS) {
          console.warn("SMTP_PASS not set, skipping email send. Code:", code);
          return sendJson(res, 400, { message: "SMTP Password not configured in Vercel. Please set SMTP_PASS." });
        }
        await transporter.sendMail({
          from: `"Bitunix Support Team" <${process.env.SMTP_USER || "support@bitunixpk.com"}>`,
          to: email,
          subject: "Password Reset Verification Code",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; color: #333; line-height: 1.6;">
              <p>Hi,</p>
              <p>We received a request to reset your account password.</p>
              <p>Your verification code is:</p>
              <div style="font-size: 24px; font-weight: bold; color: #f6b53b; margin: 10px 0;">${code}</div>
              <p>This code will expire in <strong>15 minutes</strong> for security purposes.</p>
              <p>If you did not request a password reset, please ignore this email or contact support immediately.</p>
              <p>Best regards,<br>Bitunix Support Team</p>
            </div>
          `,
          text: `Hi,\n\nWe received a request to reset your account password.\nYour verification code is: ${code}\n\nThis code will expire in 15 minutes for security purposes.\nIf you did not request a password reset, please ignore this email or contact support immediately.\n\nBest regards,\nBitunix Support Team`
        });
        return sendJson(res, 200, { message: "Code sent to email" });
      } catch (err) {
        console.error("Email send failed:", err);
        return sendJson(res, 500, { message: "Failed to send email. Ensure SMTP credentials are set." });
      }
    }

    if (pathname === "/api/auth/reset-password" && req.method === "POST") {
      const { email, code, password } = await parseBody(req);
      const db = await connectToDatabase();
      const reset = await db.collection("reset_codes").findOne({ email, code });
      if (!reset || reset.expires < Date.now()) return sendJson(res, 400, { message: "Invalid or expired code" });

      await db.collection("users").updateOne({ email }, { $set: { passwordHash: hashPassword(password) } });
      await db.collection("reset_codes").deleteOne({ email });
      return sendJson(res, 200, { message: "Password updated successfully" });
    }

    // --- MARKET (Unified Route) ---
    if (pathname === "/api/trade/rows") {
        const cat = url.searchParams.get("cat") || "crypto";
        try {
            const rows = await withCache(`trade:rows:${cat}`, 8000, () => fetchTradeRows(cat));
            res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=30");
            return sendJson(res, 200, { rows });
        } catch (e) {
            return sendJson(res, 200, { rows: [] });
        }
    }

    if (pathname === "/api/market/trading-board") {
        const cat = String(url.searchParams.get("cat") || "crypto");
        try {
            const rows = await withCache(`trading-board:${cat}`, 10000, () => fetchTradingBoard(cat));
            res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
            return sendJson(res, 200, { rows });
        } catch (e) {
            return sendJson(res, 200, { rows: [] });
        }
    }

    if (pathname === "/api/chart/market") {
        const id = url.searchParams.get("id") || "bitcoin";
        const symbol = url.searchParams.get("symbol") || "BTCUSDT";
        const days = url.searchParams.get("days") || "1";
        
        try {
            // Try Binance first for spot symbols
            if (symbol) {
              const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
              const bUrl = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=100`;
              const br = await fetch(bUrl);
              if (br.ok) {
                const bData = await br.json();
                const prices = bData.map(k => [k[0], Number(k[4])]);
                return sendJson(res, 200, { data: { prices, source: "binance" } });
              }
            }

            // Fallback to CoinGecko
            const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
            if (r.ok) {
              const data = await r.json();
              if (data.prices && data.prices.length > 0) {
                return sendJson(res, 200, { data: { prices: data.prices, source: "coingecko" } });
              }
            }
            throw new Error("Feeds failed");
        } catch (err) {
            console.error("Chart API fallback engaged:", err);
            // High-fidelity simulated data to keep UI working
            const mockData = [];
            let p = 65000;
            const now = Date.now();
            for(let i=0; i<100; i++) {
                p += (Math.random()*200 - 100);
                mockData.push([now - (100-i)*3600000, p]);
            }
            return sendJson(res, 200, { data: { prices: mockData, source: "simulated" } });
        }
    }

    if (pathname === "/api/coin/ticker") {
        const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
        try {
            const tickerMap = await withCache(`coin:ticker:${symbol}`, 5000, () => fetchBinanceTickers([symbol]));
            const t = tickerMap.get(symbol);
            if (!t) throw new Error("binance ticker failed");
            res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=20");
            return sendJson(res, 200, {
                symbol,
                lastPrice: Number(t.lastPrice || 0),
                priceChangePercent: Number(t.priceChangePercent || 0),
                highPrice: Number(t.highPrice || 0),
                lowPrice: Number(t.lowPrice || 0),
                volume: Number(t.volume || 0),
                bidPrice: Number(t.bidPrice || 0),
                askPrice: Number(t.askPrice || 0),
                source: "binance",
            });
        } catch (e) {
            try {
                const rows = await withCache("market:live", 8000, fetchLiveMarketRows);
                const base = symbol.replace("USDT", "");
                const row = rows.find((x) => String(x.legal_name || "").toUpperCase() === base) || null;
                if (row && Number(row.now_price) > 0) {
                    return sendJson(res, 200, {
                        symbol,
                        lastPrice: Number(row.now_price),
                        priceChangePercent: Number(row.change || 0),
                        source: "fallback",
                    });
                }
            } catch (_) {}

            try {
                const base = symbol.replace(/USDT$/i, "");
                const map = {
                    BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana", XRP: "ripple",
                    DOGE: "dogecoin", ADA: "cardano", DOT: "polkadot", LTC: "litecoin", BCH: "bitcoin-cash",
                    ETC: "ethereum-classic", FIL: "filecoin", EOS: "eos", SHIB: "shiba-inu", TON: "the-open-network",
                };
                const id = map[base];
                if (id) {
                    const cg = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`);
                    if (cg.ok) {
                        const data = await cg.json();
                        const price = Number(data?.[id]?.usd || 0);
                        const chg = Number(data?.[id]?.usd_24h_change || 0);
                        if (price > 0) {
                            return sendJson(res, 200, { symbol, lastPrice: price, priceChangePercent: chg, source: "coingecko" });
                        }
                    }
                }
            } catch (_) {}

            const mock = 65000 + (Math.random() * 1000 - 500);
            return sendJson(res, 200, { symbol, lastPrice: mock, priceChangePercent: Math.random() * 2 - 1, source: "simulated" });
        }
    }

    if (pathname === "/api/coin/depth") {
        const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const limit = Math.min(100, Math.max(5, Number(url.searchParams.get("limit") || 20)));
        try {
            const r = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`);
            if (!r.ok) throw new Error("binance depth failed");
            const d = await r.json();
            const asks = Array.isArray(d.asks) ? d.asks.map((x) => ({ price: Number(x[0]), qty: Number(x[1]) })) : [];
            const bids = Array.isArray(d.bids) ? d.bids.map((x) => ({ price: Number(x[0]), qty: Number(x[1]) })) : [];
            return sendJson(res, 200, { symbol, asks, bids, source: "binance" });
        } catch (e) {
            // Simulated depth around current ticker fallback
            let mid = 65000;
            try {
                const tr = await fetch(`http://${req.headers.host}/api/coin/ticker?symbol=${symbol}`);
                const tj = tr.ok ? await tr.json() : null;
                if (tj?.lastPrice) mid = Number(tj.lastPrice);
            } catch (_) {}
            const asks = [];
            const bids = [];
            for (let i = 0; i < limit; i++) {
                asks.push({ price: mid * (1 + (i + 1) * 0.0002), qty: Math.random() * 2 + 0.05 });
                bids.push({ price: mid * (1 - (i + 1) * 0.0002), qty: Math.random() * 2 + 0.05 });
            }
            return sendJson(res, 200, { symbol, asks, bids, source: "simulated" });
        }
    }

    if (pathname === "/api/trade/klines" || pathname === "/admin/api/trade/klines") {
        const source = String(url.searchParams.get("source") || "binance");

        if (source === "binance") {
            const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
            const interval = String(url.searchParams.get("interval") || "5m");
            const limit = Math.min(1000, Math.max(10, Number(url.searchParams.get("limit")) || 200));
            try {
                const burl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
                const r = await fetch(burl);
                if (!r.ok) throw new Error("Binance unavailable");
                const raw = await r.json();
                const candles = raw.map((k) => ({
                    t: k[0],
                    o: k[1],
                    h: k[2],
                    l: k[3],
                    c: k[4],
                    v: k[5],
                }));
                return sendJson(res, 200, { source: "binance", candles });
            } catch {
                const basePrices = {
                    BTCUSDT: 65000, ETHUSDT: 3500, BNBUSDT: 600, SOLUSDT: 150,
                    XRPUSDT: 0.55, DOGEUSDT: 0.12, ADAUSDT: 0.45, DOTUSDT: 7,
                    LTCUSDT: 85, BCHUSDT: 400, ETCUSDT: 25, FILUSDT: 5, EOSUSDT: 0.8,
                    AUDUSDT: 0.65, EURUSDT: 1.08, GBPUSDT: 1.27, PAXGUSDT: 2300, XAUTUSDT: 2300,
                };
                let p = basePrices[symbol] || 100;
                const candles = [];
                const stepMs = interval === "1d" ? 86400000 : interval === "1h" ? 3600000 : interval === "30m" ? 1800000 : interval === "15m" ? 900000 : interval === "5m" ? 300000 : 60000;
                for (let i = 0; i < 100; i++) {
                    const open = p;
                    const change = (Math.random() - 0.5) * p * 0.004;
                    const close = open + change;
                    const wick = Math.abs(close - open) + p * 0.001 * Math.random();
                    const high = Math.max(open, close) + wick;
                    const low = Math.min(open, close) - wick;
                    candles.push({
                        t: Date.now() - (100 - i) * stepMs,
                        o: String(open),
                        h: String(high),
                        l: String(low),
                        c: String(close),
                        v: String(Math.floor(Math.random() * 500 + 50)),
                    });
                    p = close;
                }
                return sendJson(res, 200, { source: "simulated", candles });
            }
        }

        if (source === "frank") {
            const fromC = String(url.searchParams.get("from") || "USD");
            const toC = String(url.searchParams.get("to") || "INR");
            const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days")) || 60));
            try {
                const end = new Date();
                const start = new Date(end);
                start.setDate(start.getDate() - days);
                const fmt = (d) => d.toISOString().slice(0, 10);
                const furl = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=${encodeURIComponent(fromC)}&to=${encodeURIComponent(toC)}`;
                const r = await fetch(furl);
                if (!r.ok) throw new Error();
                const data = await r.json();
                const rates = data.rates || {};
                const inv = String(url.searchParams.get("inv") || "1") === "1";
                const dayKeys = Object.keys(rates).sort();
                let prevClose = null;
                const candles = dayKeys
                    .map((d) => {
                        const m = rates[d] && rates[d][toC];
                        if (m == null) return null;
                        const close = inv ? 1 / Number(m) : Number(m);
                        const open = prevClose != null ? prevClose : close;
                        const spread = Math.max(Math.abs(close - open), close * 0.00015, 1e-8);
                        const high = Math.max(open, close) + spread * 0.5;
                        const low = Math.min(open, close) - spread * 0.5;
                        prevClose = close;
                        return { t: new Date(d).getTime(), o: open, h: high, l: low, c: close, v: 1 };
                    })
                    .filter(Boolean);
                return sendJson(res, 200, { source: "frank", candles });
            } catch {
                return sendJson(res, 200, { candles: [] });
            }
        }

        if (source === "gecko_ohlc") {
            const id = String(url.searchParams.get("id") || "bitcoin")
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "");
            const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 7));
            try {
                const gurl = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
                const r = await fetch(gurl);
                if (!r.ok) throw new Error();
                const ohlc = await r.json();
                const candles = (Array.isArray(ohlc) ? ohlc : []).map((row) => {
                    const [ts, o, h, l, c] = row;
                    return { t: ts, o: String(o), h: String(h), l: String(l), c: String(c), v: 0 };
                });
                return sendJson(res, 200, { source: "gecko_ohlc", candles });
            } catch {
                return sendJson(res, 502, { message: "CoinGecko OHLC failed." });
            }
        }

        return sendJson(res, 400, { message: "Unknown klines source." });
    }

    if (pathname === "/api/market/live") {
        try {
            const results = await withCache("market:live", 8000, fetchLiveMarketRows);
            res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=30");
            return sendJson(res, 200, { data: results });
        } catch (err) {
            console.error("Live market error:", err);
            return sendJson(res, 200, { data: [] });
        }
    }

    if (pathname === "/api/backup/config") {
        return sendJson(res, 200, { code: 1, data: { name: "Bitunix", short_name: "Bitunix", site_logo: "", profit: "Digital financial service platform", customer_service: "Test Customer Service Link" } });
    }
    if (pathname === "/api/backup/currency") {
        return sendJson(res, 200, { code: 1, data: [] });
    }
    if (pathname === "/api/backup/country") {
        return sendJson(res, 200, { code: 1, data: [{ is_default: 1, currency_name: "USDT", id: 1 }] });
    }
    if (pathname === "/api/backup/news") {
        return sendJson(res, 200, { code: 1, data: { list: [] } });
    }


    // --- USER PROTECTED ---
    if (decoded && decoded.role !== "admin" && decoded.id) {
        const db = await connectToDatabase();
        const dbUser = db ? await db.collection("users").findOne({ id: decoded.id }) : null;
        if (dbUser?.accountFrozen) {
            if (pathname === "/api/auth/me") {
                return sendJson(res, 200, { user: { ...decoded, accountFrozen: true } });
            }
            return sendJson(res, 403, { message: "Your account has been frozen. Please contact customer support.", frozen: true });
        }
        if (pathname === "/api/auth/me") return sendJson(res, 200, { user: { ...decoded, accountFrozen: false } });
        if (pathname === "/api/wallet/me") {
            const wallet = await readWallet(decoded.id);
            // Get credit score from user profile
            const db = await connectToDatabase();
            if (db) {
                const user = await db.collection("users").findOne({ id: decoded.id });
                if (user) {
                    if (user.creditScore !== undefined) wallet.creditScore = user.creditScore;
                    if (user.manualVipLevel !== undefined) wallet.manualVipLevel = user.manualVipLevel;
                }
            }
            return sendJson(res, 200, { wallet });
        }

        if (pathname === "/api/wallet/set-transaction-password" && req.method === "POST") {
            const body = await parseBody(req);
            const newPassword = String(body.newPassword || "").trim();
            if (!newPassword || newPassword.length < 6) {
                return sendJson(res, 400, { message: "Password must be at least 6 characters." });
            }
            const wallet = await readWallet(decoded.id);
            wallet.transactionPassword = newPassword;
            await writeWallet(decoded.id, wallet);
            return sendJson(res, 200, { success: true, message: "Transaction password updated." });
        }
        
        if (pathname === "/api/deposit/create" && req.method === "POST") {
            const body = await parseBody(req);
            const w = await readWallet(decoded.id);
            const dep = { 
                id: `dep_${Date.now()}`, 
                amount: Number(body.amount), 
                network: body.network || "TRC20", 
                created: Date.now(), 
                status: "pending",
                receipt: body.receipt || null,
                receiptFilename: body.receiptFilename || null
            };
            w.pendingDeposits.push(dep);
            await writeWallet(decoded.id, w);
            
            // Notification logic
            const msg = { type: "user", message: `📢 [SYSTEM]: Deposit request for ${dep.amount} USDT.`, time: Date.now(), status: "unread", userName: decoded.name, userEmail: decoded.email };
            const db = await connectToDatabase();
            if(db) await db.collection("support_chats").updateOne({ userId: decoded.id }, { $push: { messages: msg } }, { upsert: true });
            
            return sendJson(res, 200, { message: "Success", deposit: dep });
        }

        if (pathname === "/api/withdraw/create" && req.method === "POST") {
            const body = await parseBody(req);
            const w = await readWallet(decoded.id);
            const amount = Number(body.amount);
            const method = String(body.method || "usdt");
            let address = "";
            if (method === "bank") {
              address = `Bank: ${body.bankName || ''}, Acc: ${body.accountNumber || ''}, Holder: ${body.accountHolder || ''}, SWIFT/IFSC: ${body.swiftCode || ''}`;
            } else {
              address = String(body.address || "").trim();
            }
            
            // Check if withdrawal is enabled for this user
            const db = await connectToDatabase();
            if (db) {
                const user = await db.collection("users").findOne({ id: decoded.id });
                if (user && user.withdrawalEnabled === false) {
                    return sendJson(res, 400, { message: "your withdraw is unable to process please contact with customer service" });
                }
            }

            // Check if user has enough balance
            if ((w.balance || 0) < amount) {
                return sendJson(res, 400, { message: "Insufficient balance" });
            }
            
            const withdrawal = { 
                id: `wd_${Date.now()}`, 
                amount: amount, 
                address: address,
                network: body.network || "TRC20",
                created: Date.now(), 
                status: "pending"
            };
            
            // Deduct balance immediately
            w.balance = (w.balance || 0) - amount;
            
            // Save to pendingWithdrawals for admin approval
            w.pendingWithdrawals = w.pendingWithdrawals || [];
            w.pendingWithdrawals.push(withdrawal);
            
            await writeWallet(decoded.id, w);
            
            // Notification logic
            const msg = { type: "user", message: `📢 [SYSTEM]: Withdrawal request for ${withdrawal.amount} USDT.`, time: Date.now(), status: "unread", userName: decoded.name, userEmail: decoded.email };
            if(db) await db.collection("support_chats").updateOne({ userId: decoded.id }, { $push: { messages: msg } }, { upsert: true });
            
            return sendJson(res, 200, { message: "Success", withdrawal });
        }

        if (pathname === "/api/verification/submit" && req.method === "POST") {
            const body = await parseBody(req);
            const fullName = String(body.fullName || "").trim();
            const idType = String(body.idType || "").trim();
            const idNumber = String(body.idNumber || "").trim();
            const idImageData = String(body.idImageData || "");
            
            if (!fullName || !idType || !idNumber || !idImageData) {
                return sendJson(res, 400, { message: "Verification fields missing." });
            }
            
            const w = await readWallet(decoded.id);
            w.profile = w.profile || {};
            w.profile.kycStatus = "pending";
            w.profile.kycSubmitted = Date.now();
            w.profile.verification = {
                fullName,
                idType,
                idNumber,
                notes: String(body.notes || "").trim(),
                idImageName: String(body.idImageName || "id-image"),
                idImageData,
                mimeType: String(body.mimeType || "image/jpeg"),
            };
            
            await writeWallet(decoded.id, w);
            return sendJson(res, 200, { message: "Verification submitted." });
        }

        if (pathname === "/api/support/messages/user") {
            const db = await connectToDatabase();
            const chat = db ? await db.collection("support_chats").findOne({ userId: decoded.id }) : null;
            return sendJson(res, 200, { messages: chat?.messages || [] });
        }

        if (pathname === "/api/support/messages/send" && req.method === "POST") {
            const { message } = await parseBody(req);
            if (!message) return sendJson(res, 400, { message: "Message is required" });
            const msg = { type: "user", message, time: Date.now(), status: "unread", userName: decoded.name, userEmail: decoded.email };
            const db = await connectToDatabase();
            if(db) await db.collection("support_chats").updateOne({ userId: decoded.id }, { $push: { messages: msg } }, { upsert: true });
            return sendJson(res, 200, { message: "Message sent successfully" });
        }

        if (pathname === "/api/trade/execute" && req.method === "POST") {
            const { amount, symbol, direction, duration, entryPrice } = await parseBody(req);
            const amt = Number(amount);
            if (!amt || amt <= 0) return sendJson(res, 400, { message: "Invalid amount" });

            const wallet = await readWallet(decoded.id);
            if (wallet.balance < amt) return sendJson(res, 400, { message: "Insufficient balance" });

            const db = await connectToDatabase();
            const user = db ? await db.collection("users").findOne({ id: decoded.id }) : null;
            const mode = user?.tradeOutcomeMode || "random";

            let isWin = false;
            if (mode === "profit") isWin = true;
            else if (mode === "loss") isWin = false;
            else isWin = Math.random() > 0.5;

            // Profit/Loss percentages based on duration
            const config = {
                "30": 30,
                "60": 40,
                "90": 50,
                "120": 60,
                "180": 70,
                "300": 80
            };
            const pct = config[String(duration)] || 30;
            const profitAmount = (amt * pct) / 100;
            
            // Deduct initial amount
            wallet.balance -= amt;

            if (isWin) {
                // Add initial + profit
                wallet.balance += (amt + profitAmount);
            }

            const tradeId = `tr_${Date.now()}`;
            const result = {
                id: tradeId,
                symbol,
                direction,
                duration,
                amount: amt,
                entryPrice,
                exitPrice: isWin ? entryPrice * (1 + (pct/1000)) : entryPrice * (1 - (pct/1000)), // dummy exit price
                profitPct: isWin ? pct : -pct,
                profitAmount: isWin ? profitAmount : -profitAmount,
                isWin,
                status: "completed",
                created: Date.now()
            };

            wallet.transactions = wallet.transactions || [];
            wallet.transactions.push({
                ...result,
                type: "trade",
                description: `Trade ${symbol} (${duration}s) - ${isWin ? 'PROFIT' : 'LOSS'}`
            });

            await writeWallet(decoded.id, wallet);
            return sendJson(res, 200, { message: "Success", result, wallet });
        }

        if (pathname === "/api/trade/spot/execute" && req.method === "POST") {
            const { amount, symbol, side, type, limitPrice, currentPrice } = await parseBody(req);
            const amt = Number(amount); // USDT value
            if (!amt || amt <= 0) return sendJson(res, 400, { message: "Invalid amount" });

            const wallet = await readWallet(decoded.id);
            const cp = Number(currentPrice) || 0;
            const price = type === "limit" ? Number(limitPrice) : cp;
            if (price <= 0) return sendJson(res, 400, { message: "Invalid price" });

            const qty = amt / price;

            const orderId = `spo_${Date.now()}`;
            const order = {
                id: orderId,
                symbol,
                side, 
                type, 
                amount: amt,
                qty: qty,
                limitPrice: price,
                entryPrice: cp,
                status: type === "market" ? "filled" : "open",
                created: Date.now()
            };

            wallet.spot_orders = wallet.spot_orders || [];
            wallet.spot_positions = wallet.spot_positions || [];
            
            if (type === "market") {
                if (side === "buy") {
                    if (wallet.balance < amt) return sendJson(res, 400, { message: "Insufficient balance" });
                    wallet.balance -= amt;
                    const posIdx = wallet.spot_positions.findIndex(p => p.symbol === symbol);
                    if (posIdx >= 0) {
                        const oldQty = wallet.spot_positions[posIdx].amount;
                        const oldPrice = wallet.spot_positions[posIdx].entryPrice || cp;
                        wallet.spot_positions[posIdx].entryPrice = ((oldQty * oldPrice) + (qty * cp)) / (oldQty + qty);
                        wallet.spot_positions[posIdx].amount += qty;
                    } else {
                        wallet.spot_positions.push({ symbol, amount: qty, entryPrice: cp });
                    }
                } else {
                    const posIdx = wallet.spot_positions.findIndex(p => p.symbol === symbol);
                    if (posIdx < 0 || wallet.spot_positions[posIdx].amount < qty) {
                        return sendJson(res, 400, { message: "Insufficient position to sell" });
                    }
                    wallet.spot_positions[posIdx].amount -= qty;
                    wallet.balance += amt; 
                    if (wallet.spot_positions[posIdx].amount <= 1e-10) { // floating point zero
                        wallet.spot_positions.splice(posIdx, 1);
                    }
                }
                
                wallet.transactions = wallet.transactions || [];
                wallet.transactions.push({
                    type: "spot_trade",
                    description: `${side.toUpperCase()} ${symbol} Market Order`,
                    amount: amt,
                    asset: "USDT",
                    status: "completed",
                    created: Date.now()
                });
            } else {
                if (side === "buy") {
                    if (wallet.balance < amt) return sendJson(res, 400, { message: "Insufficient balance" });
                    wallet.balance -= amt; 
                }
                wallet.spot_orders.push(order);
            }

            await writeWallet(decoded.id, wallet);
            return sendJson(res, 200, { message: "Order placed", order, wallet });
        }

        if (pathname === "/api/trade/spot/orders" && req.method === "GET") {
            const wallet = await readWallet(decoded.id);
            const url = new URL(req.url, `http://${req.headers.host}`);
            const pricesRaw = url.searchParams.get("prices"); // JSON string of symbol:price
            let prices = {};
            try { if(pricesRaw) prices = JSON.parse(pricesRaw); } catch(e){}

            // Simple Limit Order Matching
            let changed = false;
            wallet.spot_orders = wallet.spot_orders || [];
            wallet.spot_positions = wallet.spot_positions || [];
            
            const openOrders = wallet.spot_orders.filter(o => o.status === "open");
            for (const order of openOrders) {
                const currentPrice = Number(prices[order.symbol]);
                if (!currentPrice) continue;

                let triggered = false;
                if (order.side === "buy" && currentPrice <= order.limitPrice) triggered = true;
                if (order.side === "sell" && currentPrice >= order.limitPrice) triggered = true;

                if (triggered) {
                    order.status = "filled";
                    order.filledPrice = currentPrice;
                    changed = true;
                    if (order.side === "buy") {
                        const posIdx = wallet.spot_positions.findIndex(p => p.symbol === order.symbol);
                        const qty = order.amount / currentPrice;
                        if (posIdx >= 0) {
                            const oldQty = wallet.spot_positions[posIdx].amount;
                            const oldPrice = wallet.spot_positions[posIdx].entryPrice || currentPrice;
                            wallet.spot_positions[posIdx].entryPrice = ((oldQty * oldPrice) + (qty * currentPrice)) / (oldQty + qty);
                            wallet.spot_positions[posIdx].amount += qty;
                        } else {
                            wallet.spot_positions.push({ symbol: order.symbol, amount: qty, entryPrice: currentPrice });
                        }
                    } else {
                        // Sell
                        const posIdx = wallet.spot_positions.findIndex(p => p.symbol === order.symbol);
                        const qty = order.amount / currentPrice;
                        if (posIdx >= 0 && wallet.spot_positions[posIdx].amount >= qty) {
                            wallet.spot_positions[posIdx].amount -= qty;
                            wallet.balance += order.amount;
                            if (wallet.spot_positions[posIdx].amount <= 1e-10) wallet.spot_positions.splice(posIdx, 1);
                        }
                    }
                }
            }

            if (changed) await writeWallet(decoded.id, wallet);

            return sendJson(res, 200, { 
                orders: wallet.spot_orders || [],
                positions: wallet.spot_positions || [],
                wallet // return updated wallet if changed
            });
        }

        if (pathname === "/api/trade/spot/cancel" && req.method === "POST") {
            const { orderId } = await parseBody(req);
            const wallet = await readWallet(decoded.id);
            wallet.spot_orders = wallet.spot_orders || [];
            const idx = wallet.spot_orders.findIndex(o => o.id === orderId);
            if (idx >= 0) {
                const order = wallet.spot_orders[idx];
                if (order.status === "open") {
                    if (order.side === "buy") wallet.balance += order.amount; // refund
                    wallet.spot_orders.splice(idx, 1);
                }
            }
            await writeWallet(decoded.id, wallet);
            return sendJson(res, 200, { message: "Order cancelled", wallet });
        }
    }

    // --- ADMIN ---
    if ((pathname === "/admin/api/login" || pathname === "/api/admin/login") && req.method === "POST") {
        await runAdminPasswordResetMigration();
        const ip = getClientIp(req);
        if (isAdminLoginLocked(ip)) {
            return sendJson(res, 429, { message: "Too many failed attempts. Try again in 15 minutes." });
        }
        const { username, password } = await parseBody(req);
        const inputUser = String(username || "").trim();
        const inputPass = String(password || "");
        if (!inputUser || !inputPass) {
            return sendJson(res, 400, { message: "Username and password are required." });
        }
        const adminRec = await getAdminRecord();
        const okUser = inputUser.toLowerCase() === adminRec.username.toLowerCase();
        const okPass = verifyPassword(inputPass, adminRec.passwordHash);
        if (!okUser || !okPass) {
            recordAdminLoginFailure(ip);
            return sendJson(res, 401, { message: "Invalid credentials" });
        }
        clearAdminLoginFailures(ip);
        if (!adminRec.fromDb) {
            await saveAdminPassword(adminRec.username, adminRec.passwordHash);
        }
        const token = signToken({
            role: "admin",
            user: adminRec.username,
            iat: Date.now(),
            exp: Date.now() + ADMIN_SESSION_MS,
        });
        return sendJson(res, 200, { token, user: { username: adminRec.username } });
    }

    if (pathname.startsWith("/admin/api")) {
        if (pathname !== "/admin/api/login" && pathname !== "/api/admin/login") {
            await ensureAdminMigrations();
        }
        const admin = verifyAdminSession(token);
        if(!admin) {
            if(pathname !== "/admin/api/login") return sendJson(res, 401, { message: "Unauthorized" });
        }

        if (pathname === "/admin/api/verify") {
            return sendJson(res, 200, { user: { username: admin?.user || DEFAULT_ADMIN_USERNAME } });
        }

        if (pathname === "/admin/api/change-password" && req.method === "POST") {
            const { currentPassword, newPassword } = await parseBody(req);
            if (!currentPassword || !newPassword) {
                return sendJson(res, 400, { message: "Current and new password are required." });
            }
            if (!isStrongAdminPassword(newPassword)) {
                return sendJson(res, 400, {
                    message: "New password must be at least 12 characters and include uppercase, lowercase, number, and symbol.",
                });
            }
            const adminRec = await getAdminRecord();
            if (!verifyPassword(String(currentPassword), adminRec.passwordHash)) {
                return sendJson(res, 401, { message: "Current password is incorrect." });
            }
            const nextHash = hashPassword(String(newPassword));
            const saved = await saveAdminPassword(adminRec.username, nextHash);
            if (!saved) return sendJson(res, 500, { message: "Could not save new password." });
            return sendJson(res, 200, { message: "Admin password updated successfully." });
        }

        if (pathname === "/admin/api/stats") {
            const db = await connectToDatabase();
            const total_users = db ? await db.collection("users").countDocuments() : 0;
            return sendJson(res, 200, { total_users, uptime: process.uptime() });
        }

        if (pathname === "/admin/api/users") {
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 200, { users: [] });
            const userProj = {
                id: 1, name: 1, email: 1, passwordHash: 1, createdAt: 1,
                creditScore: 1, manualVipLevel: 1, withdrawalEnabled: 1,
                accountFrozen: 1, tradeOutcomeMode: 1,
            };
            const walletProj = { userId: 1, balance: 1, "profile.kycStatus": 1, transactionPassword: 1 };
            const [users, wallets] = await Promise.all([
                db.collection("users").find({}, { projection: userProj }).sort({ createdAt: -1 }).limit(500).toArray(),
                db.collection("wallets").find({}, { projection: walletProj }).toArray(),
            ]);
            const walletMap = new Map(wallets.map((w) => [String(w.userId), w]));
            const out = users.map((u) => {
                const id = String(u.id);
                const w = walletMap.get(id);
                return {
                    id,
                    name: u.name || "",
                    email: u.email || "",
                    passwordHash: u.passwordHash || "",
                    createdAt: u.createdAt || 0,
                    creditScore: u.creditScore,
                    manualVipLevel: u.manualVipLevel,
                    withdrawalEnabled: u.withdrawalEnabled,
                    accountFrozen: !!u.accountFrozen,
                    tradeOutcomeMode: u.tradeOutcomeMode || "random",
                    balance: Number(w?.balance) || 0,
                    hasWallet: !!w,
                    kycStatus: w?.profile?.kycStatus || "none",
                };
            });
            res.setHeader("Cache-Control", "private, max-age=5");
            return sendJson(res, 200, { users: out });
        }

        if (pathname.startsWith("/admin/api/user/") && pathname !== "/admin/api/user-wallet/" && !pathname.includes("update-")) {
            // single user quick lookup: /admin/api/user/:id
            const parts = pathname.split("/");
            const userId = parts[parts.length - 1];
            if (userId && userId !== "user" && req.method === "GET") {
                const db = await connectToDatabase();
                if (!db) return sendJson(res, 404, { message: "Not found" });
                const u = await db.collection("users").findOne(
                    { id: userId },
                    { projection: { id: 1, name: 1, email: 1, passwordHash: 1, createdAt: 1, creditScore: 1, manualVipLevel: 1, withdrawalEnabled: 1, accountFrozen: 1, tradeOutcomeMode: 1 } }
                );
                if (!u) return sendJson(res, 404, { message: "User not found" });
                const w = await db.collection("wallets").findOne(
                    { userId },
                    { projection: { userId: 1, balance: 1, "profile.kycStatus": 1, transactionPassword: 1 } }
                );
                return sendJson(res, 200, {
                    user: {
                        id: String(u.id),
                        name: u.name || "",
                        email: u.email || "",
                        passwordHash: u.passwordHash || "",
                        createdAt: u.createdAt || 0,
                        creditScore: u.creditScore,
                        manualVipLevel: u.manualVipLevel,
                        withdrawalEnabled: u.withdrawalEnabled,
                        accountFrozen: !!u.accountFrozen,
                        tradeOutcomeMode: u.tradeOutcomeMode || "random",
                        balance: Number(w?.balance) || 0,
                        hasWallet: !!w,
                        kycStatus: w?.profile?.kycStatus || "none",
                    },
                });
            }
        }

        if (pathname === "/admin/api/deposits") {
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 200, { deposits: [] });
            const [users, wallets] = await Promise.all([
                db.collection("users").find({}, { projection: { id: 1, name: 1, email: 1 } }).toArray(),
                db.collection("wallets").find({}, { projection: { userId: 1, pendingDeposits: 1 } }).toArray(),
            ]);
            const userMap = new Map(users.map((u) => [String(u.id), u]));
            const out = [];
            for (const w of wallets) {
                const u = userMap.get(String(w.userId));
                if (!u) continue;
                (w.pendingDeposits || []).forEach((d) => out.push({ ...d, status: "pending", userId: u.id, userName: u.name, userEmail: u.email }));
            }
            out.sort((a, b) => (b.created || 0) - (a.created || 0));
            return sendJson(res, 200, { deposits: out });
        }

        if (pathname === "/admin/api/deposit/action" && req.method === "POST") {
            const { userId, depositId, action } = await parseBody(req);
            if (!userId || !depositId || !action) {
                return sendJson(res, 400, { message: "Missing required fields" });
            }
            
            const wallet = await readWallet(userId);
            const depositIndex = (wallet.pendingDeposits || []).findIndex(d => d.id === depositId || d.rechargeId === depositId);
            
            if (depositIndex === -1) {
                return sendJson(res, 404, { message: "Deposit not found" });
            }
            
            const deposit = wallet.pendingDeposits[depositIndex];
            
            if (action === "approve") {
                wallet.balance = (wallet.balance || 0) + Number(deposit.amount);
                wallet.transactions = wallet.transactions || [];
                wallet.transactions.push({
                    id: crypto.randomUUID(),
                    type: "deposit",
                    amount: Number(deposit.amount),
                    status: "completed",
                    created: Date.now(),
                    description: `Deposit approved: ${depositId}`
                });
            }
            
            // Remove from pending
            wallet.pendingDeposits.splice(depositIndex, 1);
            
            // Update deposit status
            deposit.status = action === "approve" ? "completed" : "rejected";
            deposit.processedAt = Date.now();
            wallet.deposits = wallet.deposits || [];
            wallet.deposits.push(deposit);
            
            await writeWallet(userId, wallet);
            return sendJson(res, 200, { message: `Deposit ${action}d successfully` });
        }

        if (pathname === "/admin/api/withdrawals") {
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 200, { withdrawals: [] });
            const [users, wallets] = await Promise.all([
                db.collection("users").find({}, { projection: { id: 1, name: 1, email: 1 } }).toArray(),
                db.collection("wallets").find({}, { projection: { userId: 1, pendingWithdrawals: 1, withdrawals: 1 } }).toArray(),
            ]);
            const userMap = new Map(users.map((u) => [String(u.id), u]));
            const out = [];
            for (const w of wallets) {
                const u = userMap.get(String(w.userId));
                if (!u) continue;
                for (const wd of collectPendingWithdrawals(w)) {
                    out.push({
                        ...wd,
                        status: "pending",
                        userId: u.id,
                        userName: u.name,
                        userEmail: u.email,
                    });
                }
            }
            out.sort((a, b) => (b.created || 0) - (a.created || 0));
            return sendJson(res, 200, { withdrawals: out });
        }

        if (pathname === "/admin/api/withdrawals/clear-stuck" && req.method === "POST") {
            const result = await clearStuckWithdrawalsOnly();
            return sendJson(res, 200, {
                message: `Cleared ${result.clearedWithdrawals} stuck withdrawal request(s). Amounts returned to user balances.`,
                ...result,
            });
        }

        if (pathname === "/admin/api/withdrawals/force-clear-all" && req.method === "POST") {
            const result = await forceClearAllPendingWithdrawals();
            return sendJson(res, 200, {
                message: `Force cleared ${result.clearedWithdrawals} pending withdrawal request(s). Amounts returned to user balances.`,
                ...result,
            });
        }

        if (pathname === "/admin/api/pending/clear-all" && req.method === "POST") {
            const result = await clearAllPendingRequests();
            return sendJson(res, 200, {
                message: `Cleared ${result.clearedDeposits} pending deposit(s) and ${result.clearedWithdrawals} pending withdrawal(s).`,
                ...result,
            });
        }

        if (pathname === "/admin/api/withdrawal/action" && req.method === "POST") {
            const { userId, withdrawalId, action } = await parseBody(req);
            if (!userId || !withdrawalId || !action) {
                return sendJson(res, 400, { message: "Missing required fields" });
            }
            const normalizedAction = String(action).toLowerCase();
            if (!["approve", "reject", "clear"].includes(normalizedAction)) {
                return sendJson(res, 400, { message: "Invalid action. Use approve, reject, or clear." });
            }

            const wallet = await readWallet(userId);
            const found = findPendingWithdrawal(wallet, withdrawalId);
            if (!found) {
                return sendJson(res, 404, { message: "Withdrawal not found or already processed." });
            }

            finalizeWithdrawalRecord(wallet, { ...found.withdrawal }, normalizedAction);
            await writeWallet(userId, wallet);
            const verb = normalizedAction === "clear" ? "cleared" : `${normalizedAction}d`;
            return sendJson(res, 200, { message: `Withdrawal ${verb} successfully` });
        }

        if (pathname === "/admin/api/kyc/pending") {
            const db = await connectToDatabase();
            const users = db ? await db.collection("users").find({}).toArray() : [];
            const items = [];
            for(const u of users) {
                const w = await readWallet(u.id);
                if(String(w.profile?.kycStatus || "") === "pending") {
                    items.push({ 
                        userId: u.id, 
                        userName: u.name, 
                        userEmail: u.email, 
                        verification: w.profile.verification || null, 
                        submittedAt: w.profile?.kycSubmitted || 0 
                    });
                }
            }
            return sendJson(res, 200, { verifications: items });
        }

        if (pathname === "/admin/api/kyc/action" && req.method === "POST") {
            const body = await parseBody(req);
            const userId = String(body.userId || "");
            const action = String(body.action || "approve");
            const note = String(body.note || "").trim();
            if (!userId) return sendJson(res, 400, { message: "User ID missing" });
            
            const w = await readWallet(userId);
            w.profile = w.profile || {};
            w.profile.kycStatus = action === "approve" ? "approved" : "rejected";
            w.profile.kycReviewedAt = Date.now();
            w.profile.kycReviewNote = note;
            await writeWallet(userId, w);
            return sendJson(res, 200, { message: `KYC ${action}ed` });
        }

        if (pathname.startsWith("/admin/api/user-wallet/")) {
            const userId = pathname.split("/").pop();
            const wallet = await readWallet(userId);
            return sendJson(res, 200, { wallet });
        }

        // Migrate all existing users to 6-digit sequential IDs
        if (pathname === "/admin/api/migrate-user-ids" && req.method === "POST") {
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 500, { message: "Database not connected" });
            
            const users = await db.collection("users").find({}).toArray();
            let counter = 1;
            const migrations = [];
            
            for (const user of users) {
                // Check if ID is already 6-digit format
                if (!/^\d{6}$/.test(user.id)) {
                    const oldId = user.id;
                    const newId = counter.toString().padStart(6, "0");
                    
                    // Update user ID
                    await db.collection("users").updateOne({ _id: user._id }, { $set: { id: newId } });
                    
                    // Update wallet file if exists
                    const oldWalletPath = path.join(DATA_DIR, `wallet_${oldId}.json`);
                    const newWalletPath = path.join(DATA_DIR, `wallet_${newId}.json`);
                    if (fs.existsSync(oldWalletPath)) {
                        fs.renameSync(oldWalletPath, newWalletPath);
                        const wallet = JSON.parse(fs.readFileSync(newWalletPath, "utf8"));
                        wallet.userId = newId;
                        fs.writeFileSync(newWalletPath, JSON.stringify(wallet, null, 2));
                    }
                    
                    migrations.push({ oldId, newId });
                    counter++;
                }
            }
            
            // Update counter for future registrations in database
            if (db) {
                await db.collection("counters").updateOne(
                    { _id: "userId" },
                    { $set: { seq: counter } },
                    { upsert: true }
                );
            }
            
            return sendJson(res, 200, { 
                message: `Migrated ${migrations.length} users to 6-digit IDs`,
                migrations
            });
        }

        if (pathname === "/admin/api/support/all-messages") {
            const db = await connectToDatabase();
            const chats = db ? await db.collection("support_chats").find({}).toArray() : [];
            const conversations = chats.map(c => ({
                userId: c.userId,
                userName: c.messages?.[0]?.userName || "User",
                userEmail: c.messages?.[0]?.userEmail || "",
                lastMessage: c.messages?.[c.messages.length - 1],
                unreadCount: c.messages?.filter(m => m.type === "user" && m.status === "unread").length || 0
            })).sort((a,b) => (b.lastMessage?.time || 0) - (a.lastMessage?.time || 0));
            return sendJson(res, 200, { conversations });
        }

        if (pathname === "/admin/api/support/history") {
            const uid = url.searchParams.get("userId");
            const db = await connectToDatabase();
            const chat = db ? await db.collection("support_chats").findOne({ userId: uid }) : null;
            if(db && chat) await db.collection("support_chats").updateOne({ userId: uid }, { $set: { "messages.$[m].status": "read" } }, { arrayFilters: [{ "m.type": "user" }] });
            return sendJson(res, 200, { messages: chat?.messages || [] });
        }

        if (pathname === "/admin/api/support/reply" && req.method === "POST") {
            const { userId, message } = await parseBody(req);
            const msg = { type: "admin", message, time: Date.now(), status: "sent" };
            const db = await connectToDatabase();
            if(db) await db.collection("support_chats").updateOne({ userId }, { $push: { messages: msg } });
            return sendJson(res, 200, { message: "Success" });
        }

        if (pathname === "/admin/api/user/update-transaction-password" && req.method === "POST") {
            const { userId, newPassword } = await parseBody(req);
            if (!userId || !newPassword) {
                return sendJson(res, 400, { message: "User ID and password are required" });
            }
            const wallet = await readWallet(userId);
            wallet.transactionPassword = String(newPassword);
            await writeWallet(userId, wallet);
            return sendJson(res, 200, { success: true, message: "Transaction password updated" });
        }

        if (pathname === "/admin/api/user/update-credit-score" && req.method === "POST") {
            const { userId, score } = await parseBody(req);
            const db = await connectToDatabase();
            if(db) {
                await db.collection("users").updateOne({ id: userId }, { $set: { creditScore: Number(score) } });
                return sendJson(res, 200, { message: "Success" });
            }
            return sendJson(res, 500, { message: "DB Error" });
        }

        if (pathname === "/admin/api/user/update-trade-mode" && req.method === "POST") {
            const { userId, mode } = await parseBody(req);
            const db = await connectToDatabase();
            if(db) {
                await db.collection("users").updateOne({ id: userId }, { $set: { tradeOutcomeMode: mode } });
                return sendJson(res, 200, { message: "Success" });
            }
            return sendJson(res, 500, { message: "DB Error" });
        }

        if (pathname === "/admin/api/user/update-vip-level" && req.method === "POST") {
            const { userId, level } = await parseBody(req);
            const db = await connectToDatabase();
            if(db) {
                await db.collection("users").updateOne({ id: userId }, { $set: { manualVipLevel: Number(level) } });
                return sendJson(res, 200, { message: "Success" });
            }
            return sendJson(res, 500, { message: "DB Error" });
        }

        if (pathname === "/admin/api/user/update-withdrawal-status" && req.method === "POST") {
            const { userId, enabled } = await parseBody(req);
            const db = await connectToDatabase();
            if(db) {
                await db.collection("users").updateOne({ id: userId }, { $set: { withdrawalEnabled: !!enabled } });
                return sendJson(res, 200, { message: "Success" });
            }
            return sendJson(res, 500, { message: "DB Error" });
        }

        if (pathname === "/admin/api/user/update-balance" && req.method === "POST") {
            const { userId, balance } = await parseBody(req);
            if (!userId || balance === undefined || balance === null) {
                return sendJson(res, 400, { message: "User ID and balance are required" });
            }
            const numBalance = Number(balance);
            if (!Number.isFinite(numBalance) || numBalance < 0) {
                return sendJson(res, 400, { message: "Balance must be a valid non-negative number" });
            }
            const wallet = await readWallet(userId);
            wallet.balance = numBalance;
            await writeWallet(userId, wallet);
            return sendJson(res, 200, { message: "Balance updated", balance: wallet.balance });
        }

        if (pathname === "/admin/api/user/update-account-status" && req.method === "POST") {
            const { userId, frozen } = await parseBody(req);
            if (!userId) return sendJson(res, 400, { message: "User ID is required" });
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 500, { message: "DB Error" });
            const exists = await db.collection("users").findOne({ id: userId });
            if (!exists) return sendJson(res, 404, { message: "User not found" });
            await db.collection("users").updateOne(
                { id: userId },
                { $set: { accountFrozen: !!frozen, frozenAt: frozen ? Date.now() : null } }
            );
            return sendJson(res, 200, { message: frozen ? "Account frozen" : "Account unfrozen", accountFrozen: !!frozen });
        }

        if (pathname === "/admin/api/user/update-profile" && req.method === "POST") {
            const { userId, name, email } = await parseBody(req);
            if (!userId) return sendJson(res, 400, { message: "User ID is required" });
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 500, { message: "DB Error" });
            const updates = {};
            if (name != null && String(name).trim()) updates.name = String(name).trim();
            if (email != null && String(email).trim()) {
                const emailNorm = String(email).trim().toLowerCase();
                const taken = await db.collection("users").findOne({ email: emailNorm, id: { $ne: userId } });
                if (taken) return sendJson(res, 400, { message: "Email already in use" });
                updates.email = emailNorm;
            }
            if (!Object.keys(updates).length) return sendJson(res, 400, { message: "Nothing to update" });
            await db.collection("users").updateOne({ id: userId }, { $set: updates });
            return sendJson(res, 200, { message: "Profile updated", updates });
        }

        if (pathname === "/admin/api/user/delete" && req.method === "POST") {
            const { userId } = await parseBody(req);
            if (!userId) return sendJson(res, 400, { message: "User ID is required" });
            const db = await connectToDatabase();
            if (!db) return sendJson(res, 500, { message: "DB Error" });
            const user = await db.collection("users").findOne({ id: userId });
            if (!user) return sendJson(res, 404, { message: "User not found" });
            await db.collection("users").deleteOne({ id: userId });
            await db.collection("wallets").deleteOne({ userId });
            await db.collection("support_chats").deleteOne({ userId });
            await db.collection("reset_codes").deleteOne({ email: user.email });
            return sendJson(res, 200, { message: "User deleted successfully" });
        }
    }

    return sendJson(res, 404, { message: "Route not found" });

  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { message: "Internal Error", error: err.message });
  }
};
