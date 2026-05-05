// Bitunix API Handler - Version 1.0.5 (Redeploy Trigger)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { MongoClient, ObjectId } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  if (!MONGODB_URI) {
    console.log("[DB] MONGODB_URI not found.");
    return null;
  }
  
  console.log("[DB] Attempting to connect to MongoDB with new client...");
  const client = new MongoClient(MONGODB_URI, {
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 15000
  });

  await client.connect();
  const db = client.db();
  cachedDb = db;
  console.log("[DB] Successfully connected to MongoDB.");
  return db;
}

const BACKUP_ROOT = path.join(__dirname, "..", "web", "wwwbitbank.vip", "api.wwwbitop.cc", "api");
const DATA_DIR = path.join(os.tmpdir(), "bitunix-data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ADMIN_USERS_FILE = path.join(DATA_DIR, "admin_users.json");
const SITE_CONFIG_FILE = path.join(DATA_DIR, "site_config.json");

const JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin-secret-key";

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureUsersFile() {
  ensureDataDir();
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

async function readUsers() {
  const db = await connectToDatabase();
  if (db) {
    return await db.collection("users").find({}).toArray();
  }
  ensureUsersFile();
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

async function writeUsers(users) {
  const db = await connectToDatabase();
  if (db) {
    // For simplicity in this refactor, we sync the whole array to a collection
    // In a real app, you'd use individual update operations.
    await db.collection("users").deleteMany({});
    if (users.length > 0) await db.collection("users").insertMany(users);
    return;
  }
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

function ensureAdminUsersFile() {
  ensureDataDir();
  const dir = path.dirname(ADMIN_USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ADMIN_USERS_FILE)) {
    const admin = [
      {
        id: crypto.randomUUID(),
        username: "admin",
        passwordHash: hashPassword("admin123"),
        role: "super_admin",
        createdAt: Date.now(),
      },
    ];
    fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify(admin, null, 2), "utf8");
  }
}

async function readAdminUsers() {
  const db = await connectToDatabase();
  if (db) {
    const admins = await db.collection("admin_users").find({}).toArray();
    if (admins.length === 0) {
      const defaultAdmin = {
        id: crypto.randomUUID(),
        username: "admin",
        passwordHash: hashPassword("admin123"),
        role: "super_admin",
        createdAt: Date.now(),
      };
      await db.collection("admin_users").insertOne(defaultAdmin);
      return [defaultAdmin];
    }
    return admins;
  }
  ensureAdminUsersFile();
  return JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, "utf8"));
}

function signAdminToken(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", ADMIN_SECRET).update(raw).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  const expected = crypto.createHmac("sha256", ADMIN_SECRET).update(raw).digest("base64url");
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
}

function walletFileForUser(userId) {
  return path.join(DATA_DIR, `wallet_${userId}.json`);
}

async function readWalletForUser(userId) {
  const db = await connectToDatabase();
  if (db) {
    const wallet = await db.collection("wallets").findOne({ userId });
    return wallet || {
      userId,
      balance: 0,
      locks: [],
      c2c: [],
      recharges: [],
      withdrawals: [],
      transactions: [],
      txLogs: [],
      pendingDeposits: [],
      profile: {},
      settings: {},
    };
  }
  const file = walletFileForUser(userId);
  if (!fs.existsSync(file)) {
    return {
      balance: 0,
      locks: [],
      c2c: [],
      recharges: [],
      withdrawals: [],
      transactions: [],
      txLogs: [],
      pendingDeposits: [],
      profile: {},
      settings: {},
    };
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function writeWalletForUser(userId, wallet) {
  const db = await connectToDatabase();
  if (db) {
    await db.collection("wallets").updateOne({ userId }, { $set: wallet }, { upsrert: true });
    return;
  }
  ensureDataDir();
  fs.writeFileSync(walletFileForUser(userId), JSON.stringify(wallet, null, 2), "utf8");
}

async function getUserById(userId) {
  const users = await readUsers();
  return users.find((u) => u.id === userId) || null;
}

function ensureSiteConfigFile() {
  ensureDataDir();
  const dir = path.dirname(SITE_CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SITE_CONFIG_FILE)) {
    const defaultConfig = {
      site_name: "Bitunix",
      site_description: "Crypto trading platform with live market data",
      maintenance_mode: false,
      registration_enabled: true,
      trading_enabled: true,
      deposit_enabled: true,
      withdrawal_enabled: true,
      support_email: "support@bitunix.com",
      support_phone: "+1-800-BITUNIX",
      theme_color: "#1e40af",
      logo_url: "",
      footer_text: "© 2024 Bitunix. All rights reserved.",
      social_links: { twitter: "", telegram: "", discord: "" },
      api_keys: { binance: "", coingecko: "" },
    };
    fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf8");
  }
}

async function readSiteConfig() {
  const db = await connectToDatabase();
  if (db) {
    const config = await db.collection("site_config").findOne({});
    if (!config) {
      const defaultConfig = {
        site_name: "Bitunix",
        site_description: "Crypto trading platform with live market data",
        maintenance_mode: false,
        registration_enabled: true,
        trading_enabled: true,
        deposit_enabled: true,
        withdrawal_enabled: true,
        support_email: "support@bitunix.com",
        support_phone: "+1-800-BITUNIX",
        theme_color: "#1e40af",
        logo_url: "",
        footer_text: "© 2024 Bitunix. All rights reserved.",
        social_links: { twitter: "", telegram: "", discord: "" },
        api_keys: { binance: "", coingecko: "" },
      };
      await db.collection("site_config").insertOne(defaultConfig);
      return defaultConfig;
    }
    return config;
  }
  ensureSiteConfigFile();
  return JSON.parse(fs.readFileSync(SITE_CONFIG_FILE, "utf8"));
}

async function writeSiteConfig(config) {
  const db = await connectToDatabase();
  if (db) {
    const { _id, ...rest } = config;
    await db.collection("site_config").updateOne({}, { $set: rest }, { upsert: true });
    return;
  }
  ensureDataDir();
  fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

async function tryAdminRoutes(req, res, url, pathname) {
  if (!pathname.startsWith("/admin/api")) return false;

  if (req.method === "POST" && pathname === "/admin/api/login") {
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const adminUsers = await readAdminUsers();
    const admin = adminUsers.find((u) => u.username === username);
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      sendJson(res, 401, { message: "Invalid credentials" });
      return true;
    }
    const token = signAdminToken({ id: admin.id || admin._id, username: admin.username, role: admin.role, iat: Date.now() });
    sendJson(res, 200, { token, user: { id: admin.id || admin._id, username: admin.username, role: admin.role } });
    return true;
  }

  if (req.method === "GET" && pathname === "/admin/api/config") {
    sendJson(res, 200, await readSiteConfig());
    return true;
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const adminUser = verifyAdminToken(token);

  if (req.method === "POST" && pathname === "/admin/api/config") {
    if (!adminUser) {
      sendJson(res, 401, { message: "Unauthorized" });
      return true;
    }
    const body = await parseBody(req);
    const config = await readSiteConfig();
    Object.assign(config, body);
    await writeSiteConfig(config);
    sendJson(res, 200, { message: "Configuration updated successfully", config });
    return true;
  }

  if (!adminUser) {
    sendJson(res, 401, { message: "Unauthorized" });
    return true;
  }

  if (req.method === "GET" && pathname === "/admin/api/verify") {
    sendJson(res, 200, { user: adminUser });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/stats") {
    const users = await readUsers();
    sendJson(res, 200, {
      total_users: users.length,
      system_uptime: process.uptime(),
      uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      node_version: process.version,
    });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/users") {
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const usersList = await readUsers();
    const users = [];
    for (const u of usersList) {
        const w = await readWalletForUser(u.id);
        users.push({ ...u, balance: Number(w.balance || 0), wallet: w, transactionsCount: (w.transactions || []).length });
    }
    const filtered = users.filter(
        (u) =>
          !q ||
          u.id.toLowerCase().includes(q) ||
          String(u.name || "").toLowerCase().includes(q) ||
          String(u.email || "").toLowerCase().includes(q)
      );
    sendJson(res, 200, { users });
    return true;
  }
  if (req.method === "GET" && pathname.startsWith("/admin/api/user-wallet/")) {
    const userId = decodeURIComponent(pathname.split("/").pop() || "");
    sendJson(res, 200, { wallet: await readWalletForUser(userId) });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/deposits") {
    const out = [];
    const allUsers = await readUsers();
    for (const u of allUsers) {
      const w = await readWalletForUser(u.id);
      for (const d of w.pendingDeposits || []) out.push({ ...d, userId: u.id, userName: u.name, userEmail: u.email });
    }
    out.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
    sendJson(res, 200, { deposits: out });
    return true;
  }
  if (req.method === "POST" && pathname === "/admin/api/deposit/action") {
    const body = await parseBody(req);
    const userId = String(body.userId || "");
    const depositId = String(body.depositId || "");
    const action = String(body.action || "approve");
    const w = await readWalletForUser(userId);
    const idx = (w.pendingDeposits || []).findIndex((x) => x.id === depositId);
    if (idx < 0) {
      sendJson(res, 404, { message: "Deposit not found" });
      return true;
    }
    const dep = w.pendingDeposits[idx];
    w.pendingDeposits.splice(idx, 1);
    if (action === "approve") {
      w.balance = Number(w.balance || 0) + Number(dep.amount || 0);
      w.recharges = w.recharges || [];
      w.recharges.push({ ...dep, status: "completed", completedAt: Date.now() });
    }
    w.transactions = w.transactions || [];
    w.transactions.push({
      id: dep.id,
      created: Date.now(),
      kind: "deposit",
      title: "Deposit Request",
      amount: Number(dep.amount || 0),
      asset: "USDT",
      status: action === "approve" ? "completed" : "rejected",
      detail: `${dep.network || "TRC20"} Network`,
    });
    writeWalletForUser(userId, w);
    sendJson(res, 200, { message: `Deposit ${action}ed` });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/overview") {
    const users = await readUsers();
    const allWallets = [];
    for (const u of users) {
      allWallets.push(await readWalletForUser(u.id));
    }
    const deposits = allWallets.flatMap(w => (w.pendingDeposits || []).map(d => ({...d, userId: w.userId || d.userId})));
    const withdrawals = allWallets.flatMap(w => (w.withdrawals || []).filter(wd => wd.status === "pending"));
    const verifications = allWallets.flatMap(w => (w.profile && w.profile.kycStatus === "pending") ? [{...w.profile, userId: w.userId}] : []);

    sendJson(res, 200, {
      totalUsers: users.length,
      pendingDeposits: deposits,
      pendingWithdrawals: withdrawals,
      pendingVerifications: verifications,
      users: users.map(u => ({ id: u.id, name: u.name, email: u.email }))
    });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/users") {
    const users = await readUsers();
    const out = [];
    for (const u of users) {
      const w = await readWalletForUser(u.id);
      out.push({ ...u, balance: Number(w.balance || 0), wallet: w, transactionsCount: (w.transactions || []).length });
    }
    sendJson(res, 200, { users: out });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/deposits") {
    const out = [];
    const allUsers = await readUsers();
    for (const u of allUsers) {
      const w = await readWalletForUser(u.id);
      for (const d of w.pendingDeposits || []) {
        out.push({ ...d, userId: u.id, userName: u.name, userEmail: u.email });
      }
    }
    out.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
    sendJson(res, 200, { deposits: out });
    return true;
  }
  if (req.method === "POST" && pathname === "/admin/api/deposit/action") {
    const body = await parseBody(req);
    const userId = String(body.userId || "");
    const depositId = String(body.depositId || "");
    const action = String(body.action || "approve");
    const w = await readWalletForUser(userId);
    const idx = (w.pendingDeposits || []).findIndex((x) => x.id === depositId);
    if (idx < 0) {
      sendJson(res, 404, { message: "Deposit not found" });
      return true;
    }
    const dep = w.pendingDeposits[idx];
    w.pendingDeposits.splice(idx, 1);
    if (action === "approve") {
      w.balance = Number(w.balance || 0) + Number(dep.amount || 0);
      w.recharges = w.recharges || [];
      w.recharges.push({ ...dep, status: "completed", completedAt: Date.now() });
    }
    w.transactions = w.transactions || [];
    w.transactions.push({ 
      id: dep.id, 
      created: Date.now(), 
      kind: "deposit", 
      title: "Deposit Request", 
      amount: Number(dep.amount || 0), 
      asset: "USDT", 
      status: action === "approve" ? "completed" : "rejected", 
      detail: `${dep.network || "TRC20"} Network` 
    });
    await writeWalletForUser(userId, w);
    sendJson(res, 200, { message: `Deposit ${action}ed` });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/withdrawals") {
    const out = [];
    const allUsers = await readUsers();
    for (const u of allUsers) {
      const w = await readWalletForUser(u.id);
      for (const wd of w.withdrawals || []) {
        if (wd.status === "pending") out.push({ ...wd, userId: u.id, userName: u.name, userEmail: u.email });
      }
    }
    out.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
    sendJson(res, 200, { withdrawals: out });
    return true;
  }
  if (req.method === "POST" && pathname === "/admin/api/withdrawal/action") {
    const body = await parseBody(req);
    const userId = String(body.userId || "");
    const withdrawalId = String(body.withdrawalId || "");
    const action = String(body.action || "approve");
    const w = await readWalletForUser(userId);
    const idx = (w.withdrawals || []).findIndex((x) => x.id === withdrawalId);
    if (idx < 0) {
      sendJson(res, 404, { message: "Withdrawal not found" });
      return true;
    }
    w.withdrawals[idx].status = action === "approve" ? "approved" : "rejected";
    w.withdrawals[idx].updatedAt = Date.now();
    await writeWalletForUser(userId, w);
    sendJson(res, 200, { message: `Withdrawal ${action}ed` });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/support/all-messages") {
    const all = [];
    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("support_") && f.endsWith(".json"));
      for (const file of files) {
        const userId = file.replace("support_", "").replace(".json", "");
        const user = await getUserById(userId) || {};
        const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
        for (const msg of raw.messages || []) all.push({ ...msg, userId, userName: user.name || msg.userName || "Unknown", userEmail: user.email || msg.userEmail || "" });
      }
      
      const db = await connectToDatabase();
      if (db) {
          const mongoChats = await db.collection("support_chats").find({}).toArray();
          for (const chat of mongoChats) {
              const user = await getUserById(chat.userId) || {};
              for (const msg of chat.messages || []) {
                  all.push({ ...msg, userId: chat.userId, userName: user.name || msg.userName || "Unknown", userEmail: user.email || msg.userEmail || "" });
              }
          }
      }
    }
    all.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
    sendJson(res, 200, { messages: all.slice(0, 200), total: all.length });
    return true;
  }
  if (req.method === "GET" && pathname.startsWith("/admin/api/support/messages/")) {
    const userId = decodeURIComponent(pathname.split("/").pop() || "");
    const file = path.join(DATA_DIR, `support_${userId}.json`);
    if (!fs.existsSync(file)) {
      sendJson(res, 200, { messages: [] });
      return true;
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    sendJson(res, 200, { messages: raw.messages || [] });
    return true;
  }
  if (req.method === "POST" && pathname === "/admin/api/support/messages/send") {
    const body = await parseBody(req);
    const userId = String(body.userId || "");
    const message = String(body.message || "").trim();
    if (!message || !userId) {
      sendJson(res, 400, { message: "userId and message are required" });
      return true;
    }
    ensureDataDir();
    const file = path.join(DATA_DIR, `support_${userId}.json`);
    const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { messages: [] };
    const user = await getUserById(userId) || {};
    raw.messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      userName: user.name || "Unknown",
      userEmail: user.email || "",
      type: "admin",
      message,
      time: Date.now(),
      status: "sent",
    });

    const db = await connectToDatabase();
    if (db) {
        await db.collection("support_chats").updateOne({ userId }, { $set: raw }, { upsert: true });
    } else {
        fs.writeFileSync(file, JSON.stringify(raw, null, 2));
    }
    sendJson(res, 200, { message: "Support message sent" });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/kyc/pending") {
    const allUsers = await readUsers();
    const items = [];
    for (const u of allUsers) {
        const wallet = await readWalletForUser(u.id);
        if (String(wallet.profile?.kycStatus || "") === "pending") {
            items.push({
                userId: u.id,
                userName: u.name,
                userEmail: u.email,
                verification: wallet.profile.verification || null,
                submittedAt: wallet.profile?.kycSubmitted || 0,
            });
        }
    }
    sendJson(res, 200, { verifications: items });
    return true;
  }
  if (req.method === "POST" && pathname === "/admin/api/kyc/action") {
    const body = await parseBody(req);
    const userId = String(body.userId || "");
    const action = String(body.action || "approve");
    const note = String(body.note || "").trim();
    const w = await readWalletForUser(userId);
    w.profile = w.profile || {};
    w.profile.kycStatus = action === "approve" ? "approved" : "rejected";
    w.profile.kycReviewedAt = Date.now();
    w.profile.kycReviewNote = note;
    await writeWalletForUser(userId, w);
    sendJson(res, 200, { message: `KYC ${action}ed` });
    return true;
  }
  if (req.method === "GET" && pathname === "/admin/api/support/tickets") {
    sendJson(res, 200, { tickets: [] });
    return true;
  }

  sendJson(res, 404, { message: "Unknown admin endpoint" });
  return true;
}

function sendJson(res, code, payload) {
  res.status(code).json(payload);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
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

module.exports = async (req, res) => {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  let pathname = url.pathname;
  
  // Normalize pathname to handle cases where Vercel might strip /api
  if (!pathname.startsWith("/api") && !pathname.startsWith("/admin/api")) {
    if (pathname.startsWith("/market/live")) pathname = "/api" + pathname;
    else if (pathname.startsWith("/login")) pathname = "/admin/api" + pathname;
  }

  console.log(`[API Request] ${req.method} ${pathname} (Original: ${url.pathname})`);

  try {
    if (req.method === "GET" && pathname === "/api/debug/db") {
      try {
        const db = await connectToDatabase();
        if (db) {
            return sendJson(res, 200, { 
                status: "connected", 
                database: db.databaseName,
                message: "MongoDB is working correctly!" 
            });
        } else {
            return sendJson(res, 500, { 
                status: "failed", 
                uri_present: !!MONGODB_URI,
                error: "connectToDatabase returned null (No URI?)"
            });
        }
      } catch (err) {
        console.error("[Debug Endpoint Error]", err);
        return sendJson(res, 500, { 
            status: "error", 
            message: err.message,
            code: err.code || "N/A",
            name: err.name || "Error"
        });
      }
    }

    if (await tryAdminRoutes(req, res, url, pathname)) {
        console.log(`[API Admin] Handled ${pathname}`);
        return;
    }

    if (req.method === "GET" && pathname === "/api/backup/config") {
      return sendJson(res, 200, readBackupJson("config"));
    }
    if (req.method === "GET" && pathname === "/api/backup/currency") {
      return sendJson(res, 200, readBackupJson("currency"));
    }
    if (req.method === "GET" && pathname === "/api/backup/country") {
      return sendJson(res, 200, readBackupJson("country"));
    }
    if (req.method === "GET" && pathname === "/api/backup/news") {
      return sendJson(res, 200, readBackupJson("news"));
    }
    if (req.method === "GET" && pathname === "/api/market/live") {
      const data = await liveMarket();
      return sendJson(res, 200, { code: 0, message: "success", data });
    }
    if (req.method === "POST" && pathname === "/api/auth/register") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email || password.length < 6) {
        return sendJson(res, 400, { message: "Provide name, email and password(min 6)." });
      }
      const users = await readUsers();
      if (users.some((u) => u.email === email)) {
        return sendJson(res, 409, { message: "Email already registered." });
      }
      const user = { id: crypto.randomUUID(), name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      users.push(user);
      await writeUsers(users);
      await writeWalletForUser(user.id, await readWalletForUser(user.id));
      return sendJson(res, 201, { message: "Registered successfully." });
    }
    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const users = await readUsers();
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
    if (req.method === "GET" && pathname === "/api/trade/klines") {
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
          t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5],
        }));
        return sendJson(res, 200, { source: "binance", candles });
      }
      if (source === "frank") {
        const fromC = String(url.searchParams.get("from") || "USD");
        const toC = String(url.searchParams.get("to") || "INR");
        
        // Simulating candles for FX as Frankfurter is limited for history
        const days = 60;
        const now = Date.now();
        const candles = [];
        let lastPrice = 1;
        
        try {
            const fr = await fetch(`https://open.er-api.com/v6/latest/${fromC}`);
            if (fr.ok) {
                const d = await fr.json();
                lastPrice = 1 / (d.rates[toC] || 1);
            }
        } catch(e) {}

        for (let i = days; i >= 0; i--) {
            const t = now - (i * 86400000);
            const varp = 1 + (Math.random() * 0.02 - 0.01);
            const p = lastPrice * varp;
            candles.push({ t, o: p, h: p * 1.005, l: p * 0.995, c: p, v: 1 });
        }
        return sendJson(res, 200, { source: "simulated_fx", candles });
      }

      if (source === "gecko_ohlc") {
        const id = String(url.searchParams.get("id") || "bitcoin").toLowerCase().replace(/[^a-z0-9-]/g, "");
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
    if (req.method === "GET" && pathname === "/api/trade/rows") {
      const cat = String(url.searchParams.get("cat") || "crypto");
      const toRow = (label, last, chg) => ({ label, last, chg: String(chg) });
      if (cat === "crypto") {
        const syms = [
          "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT",
          "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT", "XMRUSDT", "YFIUSDT", "MKRUSDT", "CVCUSDT", "SUSHIUSDT", "GALAUSDT",
        ];
        const rows = await Promise.all(syms.map(async (symbol) => {
          try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
            if (!r.ok) return null;
            const t = await r.json();
            const base = symbol.replace("USDT", "");
            return toRow(`${base}/USD`, t.lastPrice, t.priceChangePercent);
          } catch {
            return null;
          }
        }));
        if (!rows.filter(Boolean).length) {
            const fallback = readBackupJson("currency");
            const fr = fallback?.data?.all || fallback?.data?.top_three || [];
            return sendJson(res, 200, { rows: fr.map(x => toRow(`${x.legal_name}/USD`, x.now_price, x.change)) });
        }
        return sendJson(res, 200, { rows: rows.filter(Boolean) });
      }
      if (cat === "fx") {
        const rows = [];
        const pairs = [
          { label: "INR/USD", from: "USD", to: "INR" },
          { label: "EUR/USD", symbol: "EURUSDT" },
          { label: "GBP/USD", symbol: "GBPUSDT" },
          { label: "AUD/USD", symbol: "AUDUSDT" },
          { label: "JPY/USD", from: "USD", to: "JPY" },
          { label: "AED/USD", from: "USD", to: "AED" },
          { label: "SAR/USD", from: "USD", to: "SAR" },
          { label: "PKR/USD", from: "USD", to: "PKR" },
          { label: "TRY/USD", from: "USD", to: "TRY" },
          { label: "CAD/USD", from: "USD", to: "CAD" },
        ];
        
        let fxData = null;
        try {
          const fxRes = await fetch("https://open.er-api.com/v6/latest/USD");
          if (fxRes.ok) fxData = await fxRes.json();
        } catch(e) {}

        for (const p of pairs) {
          try {
            if (p.symbol) {
              const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${p.symbol}`);
              if (r.ok) {
                const t = await r.json();
                rows.push(toRow(p.label, t.lastPrice, t.priceChangePercent));
                continue;
              }
            }
            
            const rate = fxData?.rates?.[p.to || "INR"];
            if (rate) {
                const price = (1 / rate).toFixed(6);
                rows.push(toRow(p.label, price, (Math.random() * 0.4 - 0.2).toFixed(2)));
            } else {
                // Fallback hardcoded logic for missing API pairs
                const fallbacks = { AED: 3.67, SAR: 3.75, PKR: 278.50, TRY: 32.20, CAD: 1.36, INR: 83.40 };
                const fRate = fallbacks[p.to] || 1;
                rows.push(toRow(p.label, (1/fRate).toFixed(6), "0.00"));
            }
          } catch {}
        }
        return sendJson(res, 200, { rows: rows.length ? rows : [toRow("EUR/USD", "0", "0")] });
      }
      if (cat === "metal") {
        const syms = ["PAXGUSDT", "XAUTUSDT"];
        const rows = await Promise.all(syms.map(async (symbol) => {
          try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
            if (!r.ok) return null;
            const t = await r.json();
            const lab = symbol === "PAXGUSDT" ? "PAXG/USD" : "XAU/USD";
            return toRow(lab, t.lastPrice, t.priceChangePercent);
          } catch {
            return null;
          }
        }));
        if (!rows.filter(Boolean).length) {
            const fallback = readBackupJson("currency");
            const fr = fallback?.data?.all || fallback?.data?.top_three || [];
            return sendJson(res, 200, { rows: fr.map(x => toRow(`${x.legal_name}/USD`, x.now_price, x.change)) });
        }
        return sendJson(res, 200, { rows: rows.filter(Boolean) });
      }
      return sendJson(res, 400, { message: "Unknown cat" });
    }
    if (req.method === "GET" && pathname === "/api/trade/quote") {
      const fromC = String(url.searchParams.get("from") || "USD");
      const toC = String(url.searchParams.get("to") || "INR");
      const r = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(fromC)}&to=${encodeURIComponent(toC)}`);
      if (!r.ok) return sendJson(res, 502, { message: "Quote failed" });
      const d = await r.json();
      const m = d.rates && d.rates[toC];
      if (m == null) return sendJson(res, 404, { message: "Pair not found" });
      return sendJson(res, 200, { rate: Number(m) });
    }
    if (req.method === "GET" && pathname === "/api/chart/market") {
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
      } catch {
        return sendJson(res, 502, { message: "Chart data error." });
      }
    }
    if (req.method === "GET" && pathname === "/api/auth/me") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      return sendJson(res, 200, { user: decoded });
    }

    // --- NEW ENDPOINTS FOR WALLET & SUPPORT ---

    if (req.method === "GET" && pathname === "/api/wallet/me") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const wallet = await readWalletForUser(decoded.id);
      return sendJson(res, 200, { wallet });
    }

    if (req.method === "POST" && pathname === "/api/deposit/create") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const w = await readWalletForUser(decoded.id);
      w.pendingDeposits = w.pendingDeposits || [];
      const dep = {
        id: `dep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        amount: Number(body.amount),
        network: String(body.network || "TRC20"),
        created: Date.now(),
        status: "pending"
      };
      w.pendingDeposits.push(dep);
      await writeWalletForUser(decoded.id, w);
      return sendJson(res, 200, { message: "Deposit request created", deposit: dep });
    }

    if (req.method === "POST" && pathname === "/api/withdraw/create") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const w = await readWalletForUser(decoded.id);
      const amt = Number(body.amount);
      if (amt > w.balance) return sendJson(res, 400, { message: "Insufficient balance" });
      w.balance -= amt;
      w.withdrawals = w.withdrawals || [];
      const wd = {
        id: `wd_${Date.now()}`,
        amount: amt,
        address: body.address,
        network: body.network || "TRC20",
        status: "pending",
        created: Date.now()
      };
      w.withdrawals.push(wd);
      await writeWalletForUser(decoded.id, w);
      return sendJson(res, 200, { message: "Withdrawal request submitted", wallet: w });
    }

    if (req.method === "POST" && pathname === "/api/verification/submit") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const w = await readWalletForUser(decoded.id);
      w.profile = w.profile || {};
      w.profile.kycStatus = "pending";
      w.profile.kycSubmitted = Date.now();
      w.profile.verification = body;
      await writeWalletForUser(decoded.id, w);
      return sendJson(res, 200, { message: "Verification submitted" });
    }

    if (req.method === "POST" && pathname === "/api/support/messages/send") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      const body = await parseBody(req);
      const userId = decoded.id;
      
      const db = await connectToDatabase();
      let raw;
      if (db) {
          const chat = await db.collection("support_chats").findOne({ userId });
          raw = chat || { userId, messages: [] };
      } else {
          const file = path.join(DATA_DIR, `support_${userId}.json`);
          raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { userId, messages: [] };
      }

      const msg = {
        id: `msg_${Date.now()}`,
        userId,
        type: "user",
        message: body.message,
        time: Date.now(),
        status: "sent"
      };
      raw.messages.push(msg);

      if (db) {
          await db.collection("support_chats").updateOne({ userId }, { $set: raw }, { upsert: true });
      } else {
          const file = path.join(DATA_DIR, `support_${userId}.json`);
          fs.writeFileSync(file, JSON.stringify(raw, null, 2));
      }
      return sendJson(res, 200, { message: "Message sent", chat: msg });
    }

    if (req.method === "GET" && pathname === "/api/support/messages/user") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) return sendJson(res, 401, { message: "Unauthorized." });
      
      const userId = decoded.id;
      const db = await connectToDatabase();
      if (db) {
          const chat = await db.collection("support_chats").findOne({ userId });
          return sendJson(res, 200, { messages: chat ? chat.messages : [] });
      } else {
          const file = path.join(DATA_DIR, `support_${userId}.json`);
          const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { messages: [] };
          return sendJson(res, 200, { messages: raw.messages });
      }
    }
    return sendJson(res, 404, { message: "Not found" });
  } catch (err) {
    return sendJson(res, 500, { message: "Server error", detail: String(err.message || err) });
  }
};
