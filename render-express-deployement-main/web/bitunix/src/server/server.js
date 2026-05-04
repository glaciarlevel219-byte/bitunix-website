const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/* ── Configuration (override via .env or environment variables) ── */
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 5600;
const JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret";

/* ── Paths relative to project root (bitunix/) ── */
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ROOT = path.join(PROJECT_ROOT, "public");          // static files served from here
const FALLBACK_DIR = path.join(PROJECT_ROOT, "data", "fallback");  // API fallback JSON
const USERS_FILE = path.join(PROJECT_ROOT, "data", "users.json");

function ensureUsersFile() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

function readUsers() {
  ensureUsersFile();
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, hash) {
  const [salt, digest] = hash.split(":");
  const verifyDigest = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(verifyDigest));
}

function signToken(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(raw).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(raw).digest("base64url");
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
}

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        resolve(body);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function readBackupJson(file) {
  const full = path.join(FALLBACK_DIR, `${file}.json`);
  const raw = fs
    .readFileSync(full, "utf8")
    .replace(/[\r\n]+/g, "")
    .replace(/[\u0000-\u0019]/g, "");
  return JSON.parse(raw);
}

/** Binance spot USDT pairs — same venue as /api/trade/rows for consistent “market” numbers. */
const LIVE_USDT_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT",
  "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT", "XMRUSDT", "YFIUSDT", "MKRUSDT",
  "TRXUSDT", "LINKUSDT", "AVAXUSDT", "ATOMUSDT", "NEARUSDT", "APTUSDT", "UNIUSDT", "AAVEUSDT",
  "SUSHIUSDT", "GALAUSDT", "CVCUSDT", "CRVUSDT", "LDOUSDT", "ARBUSDT", "OPUSDT", "INJUSDT",
  "SUIUSDT", "TIAUSDT", "SEIUSDT", "PAXGUSDT", "XAUTUSDT", "SHIBUSDT", "TONUSDT",
];

async function fetchBinance24hrChunk(symbols) {
  const param = encodeURIComponent(JSON.stringify(symbols));
  const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${param}`);
  if (!r.ok) throw new Error("binance 24hr");
  return r.json();
}

async function liveMarketFromBinance() {
  const uniq = [...new Set(LIVE_USDT_SYMBOLS)];
  const chunkSize = 45;
  const chunks = [];
  for (let i = 0; i < uniq.length; i += chunkSize) {
    chunks.push(uniq.slice(i, i + chunkSize));
  }
  const settled = await Promise.allSettled(chunks.map((c) => fetchBinance24hrChunk(c)));
  const flat = settled.filter((s) => s.status === "fulfilled").flatMap((s) => s.value);
  if (!flat.length) throw new Error("binance empty");
  const rows = flat.map((t) => ({
    legal_name: String(t.symbol || "").replace(/USDT$/i, ""),
    currency_name: "USD",
    now_price: String(t.lastPrice ?? "0"),
    change: String(t.priceChangePercent ?? "0"),
  }));
  rows.unshift({
    legal_name: "USDT",
    currency_name: "USD",
    now_price: "1",
    change: "0",
  });
  return rows;
}

async function liveMarketFromCoinGecko() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,ripple,solana,cardano,dogecoin,polkadot,litecoin&vs_currencies=usd&include_24hr_change=true";
  const response = await fetch(url);
  const data = await response.json();
  const map = [
    ["bitcoin", "BTC"],
    ["ethereum", "ETH"],
    ["tether", "USDT"],
    ["binancecoin", "BNB"],
    ["ripple", "XRP"],
    ["solana", "SOL"],
    ["cardano", "ADA"],
    ["dogecoin", "DOGE"],
    ["polkadot", "DOT"],
    ["litecoin", "LTC"],
  ];
  return map.map(([id, symbol]) => ({
    legal_name: symbol,
    currency_name: "USD",
    now_price: String(data[id]?.usd ?? 0),
    change: String(data[id]?.usd_24h_change ?? 0),
  }));
}

async function liveMarket() {
  try {
    return await liveMarketFromBinance();
  } catch (_) {
    try {
      return await liveMarketFromCoinGecko();
    } catch (__) {
      const fallback = readBackupJson("currency");
      const rows = fallback?.data?.top_three?.length ? fallback.data.top_three : fallback?.data?.all || [];
      return rows;
    }
  }
}

/** Binance kline close prices as CoinGecko-style `prices: [[ms, close], ...]` for the coin chart. */
function binanceIntervalForChart(days) {
  const d = Math.min(90, Math.max(1, Number(days) || 1));
  if (d <= 1) return { interval: "5m", limit: 288 };
  if (d <= 7) return { interval: "1h", limit: Math.min(1000, d * 24) };
  if (d <= 30) return { interval: "4h", limit: Math.min(1000, Math.ceil((d * 24) / 4)) };
  return { interval: "1d", limit: Math.min(1000, d) };
}

async function chartMarketBinance(symbol, days) {
  const sym = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;
  const { interval, limit } = binanceIntervalForChart(days);
  const burl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
  const r = await fetch(burl);
  if (!r.ok) return null;
  const raw = await r.json();
  const prices = raw.map((k) => [k[0], Number(k[4])]);
  return { prices, source: "binance" };
}

function serveFile(reqPath, res) {
  let filePath = path.join(ROOT, reqPath === "/" ? "index.html" : reqPath.slice(1));
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { message: "Forbidden" });

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { message: "Not found" });
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/backup/config") {
      return sendJson(res, 200, readBackupJson("config"));
    }
    if (req.method === "GET" && url.pathname === "/api/backup/currency") {
      return sendJson(res, 200, readBackupJson("currency"));
    }
    if (req.method === "GET" && url.pathname === "/api/backup/country") {
      return sendJson(res, 200, readBackupJson("country"));
    }
    if (req.method === "GET" && url.pathname === "/api/backup/news") {
      return sendJson(res, 200, readBackupJson("news"));
    }
    if (req.method === "GET" && url.pathname === "/api/market/live") {
      const data = await liveMarket();
      return sendJson(res, 200, { code: 0, message: "success", data });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email || password.length < 6) {
        return sendJson(res, 400, { message: "Provide name, email and password(min 6)." });
      }
      const users = readUsers();
      if (users.some((u) => u.email === email)) {
        return sendJson(res, 409, { message: "Email already registered." });
      }
      const user = { id: crypto.randomUUID(), name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      users.push(user);
      writeUsers(users);
      return sendJson(res, 201, { message: "Registered successfully." });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const users = readUsers();
      const user = users.find((u) => u.email === email);
      if (!user) {
        return sendJson(res, 404, {
          code: "USER_NOT_FOUND",
          message: "No account found with this email or phone. Please register first.",
        });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { code: "INVALID_PASSWORD", message: "Invalid password." });
      }
      const token = signToken({ id: user.id, email: user.email, name: user.name, iat: Date.now() });
      return sendJson(res, 200, { token, user: { id: user.id, name: user.name, email: user.email } });
    }
    if (req.method === "GET" && url.pathname === "/api/trade/klines") {
      const source = String(url.searchParams.get("source") || "binance");
      if (source === "binance") {
        const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const interval = String(url.searchParams.get("interval") || "5m");
        const limit = Math.min(1000, Math.max(10, Number(url.searchParams.get("limit")) || 200));
        const burl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
        const r = await fetch(burl);
        if (!r.ok) return sendJson(res, 502, { message: "Binance klines unavailable (region or symbol)." });
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
      }
      if (source === "frank") {
        const fromC = String(url.searchParams.get("from") || "USD");
        const toC = String(url.searchParams.get("to") || "INR");
        const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days")) || 60));
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - days);
        const fmt = (d) => d.toISOString().slice(0, 10);
        const furl = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=${encodeURIComponent(fromC)}&to=${encodeURIComponent(toC)}`;
        const r = await fetch(furl);
        if (!r.ok) return sendJson(res, 502, { message: "FX history unavailable (Frankfurter)." });
        const data = await r.json();
        const rates = data.rates || {};
        const inv = String(url.searchParams.get("inv") || "1") === "1";
        const entries = Object.keys(rates)
          .sort()
          .map((d) => {
            const m = rates[d] && rates[d][toC];
            if (m == null) return null;
            const p = inv ? 1 / Number(m) : Number(m);
            return { t: new Date(d).getTime(), o: p, h: p, l: p, c: p, v: 1 };
          })
          .filter(Boolean);
        if (!entries.length) return sendJson(res, 404, { message: "No FX data." });
        return sendJson(res, 200, { source: "frank", candles: entries });
      }
      if (source === "gecko_ohlc") {
        const id = String(url.searchParams.get("id") || "bitcoin")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "");
        const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 7));
        const gurl = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`;
        const r = await fetch(gurl);
        if (!r.ok) return sendJson(res, 502, { message: "CoinGecko OHLC failed." });
        const ohlc = await r.json();
        const list = Array.isArray(ohlc) ? ohlc : [];
        const candles = list.map((row) => {
          const [ts, o, h, l, c] = row;
          return { t: ts, o: String(o), h: String(h), l: String(l), c: String(c), v: 0 };
        });
        return sendJson(res, 200, { source: "gecko_ohlc", candles });
      }
      return sendJson(res, 400, { message: "Unknown klines source." });
    }
    if (req.method === "GET" && url.pathname === "/api/trade/rows") {
      const cat = String(url.searchParams.get("cat") || "crypto");
      const toRow = (label, last, chg) => ({ label, last, chg: String(chg) });
      if (cat === "crypto") {
        const syms = [
          "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT",
          "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT", "XMRUSDT", "YFIUSDT", "MKRUSDT", "CVCUSDT", "SUSHIUSDT", "GALAUSDT",
        ];
        const rows = await Promise.all(
          syms.map(async (symbol) => {
            try {
              const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
              if (!r.ok) return null;
              const t = await r.json();
              const base = symbol.replace("USDT", "");
              return toRow(`${base}/USD`, t.lastPrice, t.priceChangePercent);
            } catch {
              return null;
            }
          }),
        );
        return sendJson(res, 200, { rows: rows.filter(Boolean) });
      }
      if (cat === "fx") {
        const rows = [];
        const bi = [
          { label: "AUD/USD", symbol: "AUDUSDT" },
          { label: "EUR/USD", symbol: "EURUSDT" },
          { label: "GBP/USD", symbol: "GBPUSDT" },
        ];
        for (const p of bi) {
          try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${p.symbol}`);
            if (r.ok) {
              const t = await r.json();
              rows.push(toRow(p.label, t.lastPrice, t.priceChangePercent));
            }
          } catch { /* continue */ }
        }
        try {
          const r0 = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
          const d0 = await r0.json();
          const inr = Number(d0.rates && d0.rates.INR);
          if (inr > 0) {
            const usdPerInr = 1 / inr;
            const end = new Date();
            const st = new Date();
            st.setDate(st.getDate() - 3);
            const furl = `https://api.frankfurter.app/${st.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}?from=USD&to=INR`;
            const r1 = await fetch(furl);
            let chg = "0.0000";
            if (r1.ok) {
              const t = await r1.json();
              const days = Object.keys(t.rates || {}).sort();
              if (days.length >= 2) {
                const a = 1 / t.rates[days[days.length - 2]].INR;
                const b = 1 / t.rates[days[days.length - 1]].INR;
                chg = (((b - a) / a) * 100).toFixed(4);
              }
            }
            rows.unshift(toRow("INR/USD", usdPerInr.toFixed(6), chg));
          }
        } catch { /* */ }
        return sendJson(res, 200, { rows: rows.length ? rows : [toRow("EUR/USD", "0", "0")] });
      }
      if (cat === "metal") {
        const syms = ["PAXGUSDT", "XAUTUSDT"];
        const rows = await Promise.all(
          syms.map(async (symbol) => {
            try {
              const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
              if (!r.ok) return null;
              const t = await r.json();
              const lab = symbol === "PAXGUSDT" ? "PAXG/USD" : "XAU/USD";
              return toRow(lab, t.lastPrice, t.priceChangePercent);
            } catch {
              return null;
            }
          }),
        );
        return sendJson(res, 200, { rows: rows.filter(Boolean) });
      }
      return sendJson(res, 400, { message: "Unknown cat" });
    }
    if (req.method === "GET" && url.pathname === "/api/trade/quote") {
      const fromC = String(url.searchParams.get("from") || "USD");
      const toC = String(url.searchParams.get("to") || "INR");
      const r = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(fromC)}&to=${encodeURIComponent(toC)}`);
      if (!r.ok) return sendJson(res, 502, { message: "Quote failed" });
      const d = await r.json();
      const m = d.rates && d.rates[toC];
      if (m == null) return sendJson(res, 404, { message: "Pair not found" });
      return sendJson(res, 200, { rate: Number(m) });
    }
    if (req.method === "GET" && url.pathname === "/api/chart/market") {
      const id = String(url.searchParams.get("id") || "bitcoin").toLowerCase().replace(/[^a-z0-9-]/g, "");
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 1));
      const symbol = String(url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      try {
        if (symbol) {
          const b = await chartMarketBinance(symbol, days);
          if (b?.prices?.length) {
            return sendJson(res, 200, { code: 0, data: { prices: b.prices, source: b.source } });
          }
        }
        const gurl = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
        const chartRes = await fetch(gurl);
        if (!chartRes.ok) {
          return sendJson(res, 502, { message: "Price feed unavailable." });
        }
        const data = await chartRes.json();
        return sendJson(res, 200, { code: 0, data: { prices: data.prices || [], source: "coingecko" } });
      } catch (e) {
        return sendJson(res, 502, { message: "Chart data error." });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      return sendJson(res, 200, { user: decoded });
    }

    return serveFile(url.pathname, res);
  } catch (err) {
    return sendJson(res, 500, { message: "Server error", detail: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  ensureUsersFile();
  console.log(`Server running at http://${HOST}:${PORT}`);
});
