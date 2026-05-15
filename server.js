const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

// SMTP Config (Update these with your real credentials)
const smtpConfig = {
  host: "smtp.gmail.com", 
  port: 465,
  secure: true,
  auth: {
    user: "support@bitunix-global.com", // Placeholder
    pass: "your-app-password"           // Placeholder
  }
};

const transporter = nodemailer.createTransport(smtpConfig);

async function sendResetEmail(to, code) {
  try {
    await transporter.sendMail({
      from: `"Bitunix Support" <${smtpConfig.auth.user}>`,
      to,
      subject: "Verification Code: " + code,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; border: 1px solid #eee; padding: 20px;">
          <h2 style="color: #f6b53b;">Password Reset</h2>
          <p>Your verification code for password reset is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0;">${code}</div>
          <p>This code will expire in 1 hour. If you didn't request this, please ignore this email.</p>
        </div>
      `
    });
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

const HOST = "127.0.0.1";
const PORT = 5608;
const ROOT = __dirname;
const BACKUP_ROOT = path.join(ROOT, "web", "wwwbitbank.vip", "api.wwwbitop.cc", "api");
const ADMIN_ACCESS_CODE = "secure-admin-2026";
const USERS_FILE = path.join(ROOT, "data", "users.json");
const ADMIN_USERS_FILE = path.join(ROOT, "data", "admin_users.json");

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

function ensureAdminUsersFile() {
  const dir = path.dirname(ADMIN_USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ADMIN_USERS_FILE)) {
    const admin = [{ id: crypto.randomUUID(), username: "admin", passwordHash: hashPassword("rahi0889"), role: "super_admin", createdAt: Date.now() }];
    fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify(admin, null, 2), "utf8");
  }
}

function readAdminUsers() {
  ensureAdminUsersFile();
  return JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, "utf8"));
}

function signAdminToken(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", "admin-secret-key").update(raw).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  const expected = crypto.createHmac("sha256", "admin-secret-key").update(raw).digest("base64url");
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
}

function walletFileForUser(userId) {
  return path.join(ROOT, "data", `wallet_${userId}.json`);
}

function readWalletForUser(userId) {
  const file = walletFileForUser(userId);
  if (!fs.existsSync(file)) {
    return { balance: 0, locks: [], c2c: [], recharges: [], withdrawals: [], transactions: [], txLogs: [], pendingDeposits: [], profile: {}, settings: {} };
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeWalletForUser(userId, wallet) {
  const file = walletFileForUser(userId);
  fs.writeFileSync(file, JSON.stringify(wallet, null, 2), "utf8");
}

function getUserById(userId) {
  return readUsers().find((u) => u.id === userId) || null;
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
  const signature = crypto.createHmac("sha256", "local-dev-secret").update(raw).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  const expected = crypto.createHmac("sha256", "local-dev-secret").update(raw).digest("base64url");
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
  const full = path.join(BACKUP_ROOT, file, "index.html");
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
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === `/${ADMIN_ACCESS_CODE}`) {
      return serveFile("/admin/index.html", res);
    }
    if ((url.pathname === "/admin" || url.pathname === "/admin/") && url.searchParams.get("code") !== ADMIN_ACCESS_CODE) {
      return sendJson(res, 404, { message: "Not found" });
    }
    if (
      req.method === "GET" &&
      (url.pathname === "/admin" || url.pathname === "/admin/") &&
      url.searchParams.get("code") === ADMIN_ACCESS_CODE
    ) {
      return serveFile("/admin/index.html", res);
    }
    if (req.method === "POST" && url.pathname === "/admin/api/login") {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const admin = readAdminUsers().find((u) => u.username === username);
      if (!admin || !verifyPassword(password, admin.passwordHash)) return sendJson(res, 401, { message: "Invalid credentials" });
      const token = signAdminToken({ id: admin.id, username: admin.username, role: admin.role, iat: Date.now() });
      return sendJson(res, 200, { token, user: { id: admin.id, username: admin.username, role: admin.role } });
    }
    if (url.pathname.startsWith("/admin/api/")) {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const adminUser = verifyAdminToken(token);
      if (!adminUser) return sendJson(res, 401, { message: "Unauthorized" });

      if (req.method === "GET" && url.pathname === "/admin/api/verify") return sendJson(res, 200, { user: adminUser });
      if (req.method === "GET" && url.pathname === "/admin/api/stats") {
        const users = readUsers();
        return sendJson(res, 200, { total_users: users.length, uptime: process.uptime(), memory_usage: process.memoryUsage(), node_version: process.version });
      }
      if (req.method === "GET" && url.pathname === "/admin/api/users") {
        const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
        const users = readUsers()
          .map((u) => {
            const w = readWalletForUser(u.id);
            return { ...u, balance: Number(w.balance || 0), wallet: w, transactionsCount: (w.transactions || []).length };
          })
          .filter((u) => !q || u.id.toLowerCase().includes(q) || String(u.name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q));
        return sendJson(res, 200, { users });
      }
      if (req.method === "GET" && url.pathname.startsWith("/admin/api/user-wallet/")) {
        const userId = decodeURIComponent(url.pathname.split("/").pop() || "");
        return sendJson(res, 200, { wallet: readWalletForUser(userId) });
      }
      if (req.method === "GET" && url.pathname === "/admin/api/deposits") {
        const out = [];
        for (const u of readUsers()) {
          const w = readWalletForUser(u.id);
          for (const d of w.pendingDeposits || []) out.push({ ...d, userId: u.id, userName: u.name, userEmail: u.email });
        }
        out.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
        return sendJson(res, 200, { deposits: out });
      }
      if (req.method === "POST" && url.pathname === "/admin/api/deposit/action") {
        const body = await parseBody(req);
        const userId = String(body.userId || "");
        const depositId = String(body.depositId || "");
        const action = String(body.action || "approve");
        const w = readWalletForUser(userId);
        const idx = (w.pendingDeposits || []).findIndex((x) => x.id === depositId);
        if (idx < 0) return sendJson(res, 404, { message: "Deposit not found" });
        const dep = w.pendingDeposits[idx];
        w.pendingDeposits.splice(idx, 1);
        if (action === "approve") {
          w.balance = Number(w.balance || 0) + Number(dep.amount || 0);
          w.recharges = w.recharges || [];
          w.recharges.push({ ...dep, status: "completed", completedAt: Date.now() });
        }
        w.transactions = w.transactions || [];
        w.transactions.push({ id: dep.id, created: Date.now(), kind: "deposit", title: "Deposit Request", amount: Number(dep.amount || 0), asset: "USDT", status: action === "approve" ? "completed" : "rejected", detail: `${dep.network || "TRC20"} Network` });
        writeWalletForUser(userId, w);
        return sendJson(res, 200, { message: `Deposit ${action}ed` });
      }
      if (req.method === "GET" && url.pathname === "/admin/api/withdrawals") {
        const out = [];
        for (const u of readUsers()) {
          const w = readWalletForUser(u.id);
          for (const wd of w.withdrawals || []) {
            if (wd.status === "pending") out.push({ ...wd, userId: u.id, userName: u.name, userEmail: u.email });
          }
        }
        out.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
        return sendJson(res, 200, { withdrawals: out });
      }
      if (req.method === "POST" && url.pathname === "/admin/api/withdrawal/action") {
        const body = await parseBody(req);
        const userId = String(body.userId || "");
        const withdrawalId = String(body.withdrawalId || "");
        const action = String(body.action || "approve");
        const w = readWalletForUser(userId);
        const idx = (w.withdrawals || []).findIndex((x) => x.id === withdrawalId);
        if (idx < 0) return sendJson(res, 404, { message: "Withdrawal not found" });
        w.withdrawals[idx].status = action === "approve" ? "approved" : "rejected";
        w.withdrawals[idx].updatedAt = Date.now();
        writeWalletForUser(userId, w);
        return sendJson(res, 200, { message: `Withdrawal ${action}ed` });
      }
      if (req.method === "GET" && url.pathname === "/admin/api/support/all-messages") {
        const dataDir = path.join(ROOT, "data");
        const all = [];
        if (fs.existsSync(dataDir)) {
          const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("support_") && f.endsWith(".json"));
          for (const file of files) {
            const userId = file.replace("support_", "").replace(".json", "");
            const user = getUserById(userId) || {};
            const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
            for (const msg of raw.messages || []) all.push({ ...msg, userId, userName: user.name || msg.userName || "Unknown", userEmail: user.email || msg.userEmail || "" });
          }
        }
        all.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
        return sendJson(res, 200, { messages: all.slice(0, 200), total: all.length });
      }
      if (req.method === "GET" && url.pathname.startsWith("/admin/api/support/messages/")) {
        const userId = decodeURIComponent(url.pathname.split("/").pop() || "");
        const file = path.join(ROOT, "data", `support_${userId}.json`);
        if (!fs.existsSync(file)) return sendJson(res, 200, { messages: [] });
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        return sendJson(res, 200, { messages: raw.messages || [] });
      }
      if (req.method === "POST" && url.pathname === "/admin/api/support/messages/send") {
        const body = await parseBody(req);
        const { userId, message } = body;
        if (!userId || !message) return sendJson(res, 400, { message: "User ID and message are required" });
        const user = readUsers().find((u) => u.id === userId);
        if (!user) return sendJson(res, 404, { message: "User not found" });
        const file = path.join(ROOT, "data", `support_${userId}.json`);
        const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { messages: [] };
        raw.messages.push({ id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, userId, userName: user.name || "Unknown", userEmail: user.email || "", type: "admin", message, time: Date.now(), status: "sent" });
        fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");
        return sendJson(res, 200, { success: true });
      }
      if (req.method === "POST" && url.pathname === "/admin/api/user/update-transaction-password") {
        const body = await parseBody(req);
        const { userId, newPassword } = body;
        if (!userId || !newPassword) return sendJson(res, 400, { message: "User ID and password are required" });
        const wallet = readWalletForUser(userId);
        wallet.transactionPassword = newPassword;
        writeWalletForUser(userId, wallet);
        return sendJson(res, 200, { success: true, message: "Transaction password updated" });
      }
      if (req.method === "GET" && url.pathname === "/admin/api/kyc/pending") {
        const items = readUsers().map((u) => ({ user: u, wallet: readWalletForUser(u.id) }))
          .filter(({ wallet }) => String(wallet.profile?.kycStatus || "") === "pending")
          .map(({ user, wallet }) => ({ userId: user.id, userName: user.name, userEmail: user.email, verification: wallet.profile.verification || null, submittedAt: wallet.profile?.kycSubmitted || 0 }));
        return sendJson(res, 200, { verifications: items });
      }
      if (req.method === "POST" && url.pathname === "/admin/api/kyc/action") {
        const body = await parseBody(req);
        const userId = String(body.userId || "");
        const action = String(body.action || "approve");
        const note = String(body.note || "").trim();
        const w = readWalletForUser(userId);
        w.profile = w.profile || {};
        w.profile.kycStatus = action === "approve" ? "approved" : "rejected";
        w.profile.kycReviewedAt = Date.now();
        w.profile.kycReviewNote = note;
        writeWalletForUser(userId, w);
        return sendJson(res, 200, { message: `KYC ${action}ed` });
      }
      if (req.method === "GET" && url.pathname === "/admin/api/support/tickets") {
        return sendJson(res, 200, { tickets: [] });
      }
      return sendJson(res, 404, { message: "Unknown admin endpoint" });
    }
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

    if (req.method === "GET" && url.pathname === "/api/coin/ticker") {
      const symbol = String(url.searchParams.get("symbol") || "BTCUSDT")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      try {
        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!r.ok) throw new Error("binance ticker failed");
        const t = await r.json();
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
      } catch {
        const mock = 65000 + (Math.random() * 1000 - 500);
        return sendJson(res, 200, {
          symbol,
          lastPrice: mock,
          priceChangePercent: Math.random() * 2 - 1,
          source: "simulated",
        });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/coin/depth") {
      const symbol = String(url.searchParams.get("symbol") || "BTCUSDT")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const limit = Math.min(100, Math.max(5, Number(url.searchParams.get("limit") || 20)));
      try {
        const r = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`);
        if (!r.ok) throw new Error("binance depth failed");
        const d = await r.json();
        const asks = Array.isArray(d.asks) ? d.asks.map((x) => ({ price: Number(x[0]), qty: Number(x[1]) })) : [];
        const bids = Array.isArray(d.bids) ? d.bids.map((x) => ({ price: Number(x[0]), qty: Number(x[1]) })) : [];
        return sendJson(res, 200, { symbol, asks, bids, source: "binance" });
      } catch {
        let mid = 65000;
        try {
          const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
          if (r.ok) {
            const t = await r.json();
            mid = Number(t.price || mid);
          }
        } catch { /* ignore */ }
        const asks = [];
        const bids = [];
        for (let i = 0; i < limit; i++) {
          asks.push({ price: mid * (1 + (i + 1) * 0.0002), qty: Math.random() * 2 + 0.05 });
          bids.push({ price: mid * (1 - (i + 1) * 0.0002), qty: Math.random() * 2 + 0.05 });
        }
        return sendJson(res, 200, { symbol, asks, bids, source: "simulated" });
      }
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
      
      let nextId = 854694;
      for (const u of users) {
        if (/^\d+$/.test(u.id)) {
          const num = parseInt(u.id, 10);
          if (num >= nextId) {
            nextId = num + 1;
          }
        }
      }
      
      const user = { id: nextId.toString(), name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      users.push(user);
      writeUsers(users);
      writeWalletForUser(user.id, readWalletForUser(user.id));
      return sendJson(res, 201, { message: "User registered" });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return sendJson(res, 400, { message: "Email is required" });

      const users = readUsers();
      const user = users.find(u => u.email.toLowerCase() === email);
      if (!user) return sendJson(res, 404, { message: "User not found" });

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetCode = code;
      user.resetExpires = Date.now() + 3600000;
      writeUsers(users);

      const emailSent = await sendResetEmail(email, code);
      console.log(`[PASSWORD RESET] Code for ${email}: ${code} (Email Sent: ${emailSent})`);
      
      if (emailSent) {
        return sendJson(res, 200, { message: "Reset code has been sent to your email." });
      } else {
        return sendJson(res, 500, { message: "Failed to send email. Please contact support." });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
      const body = await parseBody(req);
      const { email, code, password } = body;
      if (!email || !code || !password) return sendJson(res, 400, { message: "Missing required fields" });

      const users = readUsers();
      const userIdx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
      if (userIdx === -1) return sendJson(res, 400, { message: "Invalid request" });

      const user = users[userIdx];
      if (!user.resetCode || user.resetCode !== String(code) || user.resetExpires < Date.now()) {
        return sendJson(res, 400, { message: "Invalid or expired code" });
      }

      user.passwordHash = hashPassword(password);
      delete user.resetCode;
      delete user.resetExpires;
      writeUsers(users);

      return sendJson(res, 200, { message: "Password reset successful" });
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
      writeWalletForUser(user.id, readWalletForUser(user.id));
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
      const pct = (a, b) => (a > 0 ? (((b - a) / a) * 100).toFixed(4) : "0.0000");
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
          const frankPairs = ["INR", "JPY", "AED", "SAR", "PKR", "TRY", "CAD"];
          const r0 = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${frankPairs.join(",")}`);
          const d0 = await r0.json();
          const end = new Date();
          const st = new Date();
          st.setDate(st.getDate() - 5);
          const furl = `https://api.frankfurter.app/${st.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}?from=USD&to=${frankPairs.join(",")}`;
          const r1 = await fetch(furl);
          const h = r1.ok ? await r1.json() : { rates: {} };
          const days = Object.keys(h.rates || {}).sort();
          for (const code of frankPairs) {
            const latest = Number(d0.rates && d0.rates[code]);
            if (!(latest > 0)) continue;
            const lastInv = 1 / latest;
            let chg = "0.0000";
            if (days.length >= 2) {
              const prevRate = Number(h.rates[days[days.length - 2]] && h.rates[days[days.length - 2]][code]);
              const currRate = Number(h.rates[days[days.length - 1]] && h.rates[days[days.length - 1]][code]);
              if (prevRate > 0 && currRate > 0) chg = pct(1 / prevRate, 1 / currRate);
            }
            rows.push(toRow(`${code}/USD`, lastInv.toFixed(6), chg));
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
    if (req.method === "GET" && url.pathname === "/api/wallet/me") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      return sendJson(res, 200, { wallet: readWalletForUser(decoded.id) });
    }

    if (req.method === "POST" && url.pathname === "/api/wallet/set-transaction-password") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const newPassword = String(body.newPassword || "").trim();
      if (!newPassword || newPassword.length < 6) return sendJson(res, 400, { message: "Password must be at least 6 characters." });
      const wallet = readWalletForUser(decoded.id);
      wallet.transactionPassword = newPassword;
      writeWalletForUser(decoded.id, wallet);
      return sendJson(res, 200, { success: true, message: "Transaction password updated." });
    }

    if (req.method === "GET" && url.pathname === "/api/support/messages/user") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const file = path.join(ROOT, "data", `support_${decoded.id}.json`);
      if (!fs.existsSync(file)) return sendJson(res, 200, { messages: [] });
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      return sendJson(res, 200, { messages: raw.messages || [] });
    }

    if (req.method === "POST" && url.pathname === "/api/support/messages/send") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const message = String(body.message || "").trim();
      if (!message) return sendJson(res, 400, { message: "Message is required" });
      const file = path.join(ROOT, "data", `support_${decoded.id}.json`);
      const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { messages: [] };
      raw.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: decoded.id,
        userName: decoded.name || "Unknown",
        type: "user",
        message,
        time: Date.now(),
        status: "sent"
      });
      fs.writeFileSync(file, JSON.stringify(raw, null, 2));
      return sendJson(res, 200, { message: "Support message sent" });
    }

    if (pathname === "/api/trade/execute" && req.method === "POST") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });

      const body = await parseBody(req);
      const { amount, symbol, direction, duration, entryPrice } = body;
      const amt = Number(amount);
      if (!amt || amt <= 0) return sendJson(res, 400, { message: "Invalid amount" });

      const wallet = readWalletForUser(decoded.id);
      if ((wallet.balance || 0) < amt) return sendJson(res, 400, { message: "Insufficient balance" });

      const user = getUserById(decoded.id);
      const mode = user?.tradeOutcomeMode || "random";

      let isWin = false;
      if (mode === "profit") isWin = true;
      else if (mode === "loss") isWin = false;
      else isWin = Math.random() > 0.5;

      const config = { "30": 30, "60": 40, "90": 50, "120": 60, "180": 70, "300": 80 };
      const pct = config[String(duration)] || 30;
      const profitAmount = (amt * pct) / 100;
      
      wallet.balance = (wallet.balance || 0) - amt;
      if (isWin) {
          wallet.balance += (amt + profitAmount);
      }

      const tradeId = `tr_${Date.now()}`;
      const result = {
          id: tradeId,
          symbol,
          direction,
          duration,
          amount: amt,
          entryPrice: Number(entryPrice || 0),
          exitPrice: isWin ? (Number(entryPrice || 0) * (1 + 0.001)) : (Number(entryPrice || 0) * (1 - 0.001)),
          profitPct: isWin ? pct : -pct,
          profitAmount: isWin ? profitAmount : -profitAmount,
          isWin,
          status: "completed",
          created: Date.now()
      };

      wallet.transactions = wallet.transactions || [];
      wallet.transactions.push({
          id: tradeId,
          created: Date.now(),
          kind: "trade",
          title: `Trade ${symbol}`,
          amount: amt,
          asset: "USDT",
          status: "completed",
          detail: `${direction.toUpperCase()} | ${isWin ? 'PROFIT' : 'LOSS'}: ${Math.abs(result.profitAmount).toFixed(2)} USDT`
      });

      writeWalletForUser(decoded.id, wallet);
      return sendJson(res, 200, { message: "Success", result, wallet });
    }
    if (req.method === "POST" && url.pathname === "/api/verification/submit") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const fullName = String(body.fullName || "").trim();
      
      
      
      
      
      
      const idType = String(body.idType || "").trim();
      const idNumber = String(body.idNumber || "").trim();
      const idImageData = String(body.idImageData || "");
      if (!fullName || !idType || !idNumber || !idImageData) return sendJson(res, 400, { message: "Verification fields missing." });
      const w = readWalletForUser(decoded.id);
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
      writeWalletForUser(decoded.id, w);
      return sendJson(res, 200, { message: "Verification submitted." });
    }
    if (req.method === "POST" && url.pathname === "/api/withdraw/create") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const amount = Number(body.amount || 0);
      const method = String(body.method || "usdt").trim();
      let address = "";
      if (method === "bank") {
        address = `Bank: ${body.bankName || ''}, Acc: ${body.accountNumber || ''}, Holder: ${body.accountHolder || ''}, SWIFT/IFSC: ${body.swiftCode || ''}`;
      } else {
        address = String(body.address || "").trim();
      }
      if (!(amount > 0) || !address) return sendJson(res, 400, { message: "Invalid withdraw request." });
      const w = readWalletForUser(decoded.id);
      if (amount > Number(w.balance || 0)) return sendJson(res, 400, { message: "Amount exceeds balance." });
      w.balance = Number(w.balance || 0) - amount;
      w.withdrawals = w.withdrawals || [];
      const wd = { id: `withdraw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, amount, address, status: "pending", created: Date.now() };
      w.withdrawals.push(wd);
      w.transactions = w.transactions || [];
      w.transactions.push({ id: wd.id, created: wd.created, kind: "withdraw", title: "Withdrawal", amount, asset: "USDT", status: "pending", detail: address });
      writeWalletForUser(decoded.id, w);
      return sendJson(res, 200, { message: "Withdrawal submitted.", withdrawal: wd, wallet: w });
    }
    
    // Deposit/Recharge API endpoints
    if (req.method === "POST" && url.pathname === "/api/deposit/create") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      
      const body = await parseBody(req);
      const amount = Number(body.amount);
      const network = String(body.network || "TRC20").trim();
      
      if (!amount || amount <= 0) {
        return sendJson(res, 400, { message: "Invalid deposit amount." });
      }
      
      const walletFile = path.join(ROOT, "data", `wallet_${decoded.id}.json`);
      let wallet = { balance: 0, locks: [], c2c: [], recharges: [], withdrawals: [], transactions: [], txLogs: [], pendingDeposits: [] };
      
      if (fs.existsSync(walletFile)) {
        wallet = JSON.parse(fs.readFileSync(walletFile, "utf8"));
      }
      
      const deposit = {
        id: `deposit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: amount,
        network: network,
        status: "pending",
        created: Date.now(),
        creditedAt: null
      };
      
      wallet.pendingDeposits.push(deposit);
      wallet.transactions.push({
        id: deposit.id,
        created: deposit.created,
        kind: "deposit",
        title: "Deposit Request",
        amount: amount,
        asset: "USDT",
        status: "pending",
        detail: `${network} Network`
      });
      
      fs.writeFileSync(walletFile, JSON.stringify(wallet, null, 2));
      
      return sendJson(res, 200, { 
        message: "Deposit request created successfully.",
        deposit: deposit
      });
    }
    
    if (req.method === "GET" && url.pathname === "/api/deposit/pending") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      
      const walletFile = path.join(ROOT, "data", `wallet_${decoded.id}.json`);
      if (!fs.existsSync(walletFile)) {
        return sendJson(res, 200, { pendingDeposits: [] });
      }
      
      const wallet = JSON.parse(fs.readFileSync(walletFile, "utf8"));
      return sendJson(res, 200, { pendingDeposits: wallet.pendingDeposits || [] });
    }
    
    // --- SPOT TRADING & CHART APIs ---
    if (url.pathname === "/api/chart/market" && req.method === "GET") {
      const id = url.searchParams.get("id") || "bitcoin";
      const days = url.searchParams.get("days") || "1";
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
        if (!r.ok) throw new Error("CoinGecko error");
        const data = await r.json();
        return sendJson(res, 200, { data });
      } catch (err) {
        console.error("Chart API error:", err);
        // Fallback to Binance if CoinGecko fails
        const map = { bitcoin: "BTCUSDT", ethereum: "ETHUSDT", binancecoin: "BNBUSDT", solana: "SOLUSDT", ripple: "XRPUSDT" };
        const sym = map[id] || "BTCUSDT";
        const b = await chartMarketBinance(sym, days);
        if (b) return sendJson(res, 200, { data: b });
        // Return dummy data if both fail
        const prices = []; let p = 60000; const now = Date.now();
        for(let i=0; i<100; i++) { p += (Math.random()-0.5)*500; prices.push([now - (100-i)*3600000, p]); }
        return sendJson(res, 200, { data: { prices } });
      }
    }

    if (url.pathname === "/api/trade/spot/execute" && req.method === "POST") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });

      const body = await parseBody(req);
      const { amount, symbol, side, type, limitPrice, currentPrice } = body;
      const amt = Number(amount);
      if (!amt || amt <= 0) return sendJson(res, 400, { message: "Invalid amount" });

      const wallet = readWalletForUser(decoded.id);
      const cp = Number(currentPrice) || 0;
      const price = type === "limit" ? Number(limitPrice) : cp;
      if (price <= 0) return sendJson(res, 400, { message: "Invalid price" });

      const qty = amt / price;
      const order = { id: `spo_${Date.now()}`, symbol, side, type, amount: amt, qty, limitPrice: price, entryPrice: cp, status: type === "market" ? "filled" : "open", created: Date.now() };

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
          if (posIdx < 0 || wallet.spot_positions[posIdx].amount < qty) return sendJson(res, 400, { message: "Insufficient position" });
          wallet.spot_positions[posIdx].amount -= qty;
          wallet.balance += amt; 
          if (wallet.spot_positions[posIdx].amount <= 1e-10) wallet.spot_positions.splice(posIdx, 1);
        }
        wallet.transactions.push({ type: "spot_trade", title: `${side.toUpperCase()} ${symbol}`, amount: amt, asset: "USDT", status: "completed", created: Date.now() });
      } else {
        if (side === "buy") {
          if (wallet.balance < amt) return sendJson(res, 400, { message: "Insufficient balance" });
          wallet.balance -= amt; 
        }
        wallet.spot_orders.push(order);
      }
      writeWalletForUser(decoded.id, wallet);
      return sendJson(res, 200, { message: "Order placed", order, wallet });
    }

    if (url.pathname === "/api/trade/spot/orders" && req.method === "GET") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });

      const wallet = readWalletForUser(decoded.id);
      const pricesRaw = url.searchParams.get("prices");
      let prices = {};
      try { if(pricesRaw) prices = JSON.parse(pricesRaw); } catch(e){}

      let changed = false;
      wallet.spot_orders = wallet.spot_orders || [];
      wallet.spot_positions = wallet.spot_positions || [];
      
      for (const order of wallet.spot_orders.filter(o => o.status === "open")) {
        const cur = Number(prices[order.symbol]);
        if (!cur) continue;
        if ((order.side === "buy" && cur <= order.limitPrice) || (order.side === "sell" && cur >= order.limitPrice)) {
          order.status = "filled"; order.filledPrice = cur; changed = true;
          if (order.side === "buy") {
            const posIdx = wallet.spot_positions.findIndex(p => p.symbol === order.symbol);
            const qty = order.amount / cur;
            if (posIdx >= 0) {
              const oq = wallet.spot_positions[posIdx].amount; const op = wallet.spot_positions[posIdx].entryPrice || cur;
              wallet.spot_positions[posIdx].entryPrice = ((oq * op) + (qty * cur)) / (oq + qty);
              wallet.spot_positions[posIdx].amount += qty;
            } else wallet.spot_positions.push({ symbol: order.symbol, amount: qty, entryPrice: cur });
          } else {
            const posIdx = wallet.spot_positions.findIndex(p => p.symbol === order.symbol);
            const qty = order.amount / cur;
            if (posIdx >= 0 && wallet.spot_positions[posIdx].amount >= qty) {
              wallet.spot_positions[posIdx].amount -= qty; wallet.balance += order.amount;
              if (wallet.spot_positions[posIdx].amount <= 1e-10) wallet.spot_positions.splice(posIdx, 1);
            }
          }
        }
      }
      if (changed) writeWalletForUser(decoded.id, wallet);
      return sendJson(res, 200, { orders: wallet.spot_orders, positions: wallet.spot_positions, wallet: changed ? wallet : null });
    }

    if (url.pathname === "/api/trade/spot/cancel" && req.method === "POST") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });

      const { orderId } = await parseBody(req);
      const wallet = readWalletForUser(decoded.id);
      const idx = (wallet.spot_orders || []).findIndex(o => o.id === orderId && o.status === "open");
      if (idx < 0) return sendJson(res, 404, { message: "Order not found" });

      const order = wallet.spot_orders[idx];
      order.status = "cancelled";
      if (order.side === "buy") wallet.balance += order.amount;
      writeWalletForUser(decoded.id, wallet);
      return sendJson(res, 200, { message: "Order cancelled", wallet });
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
