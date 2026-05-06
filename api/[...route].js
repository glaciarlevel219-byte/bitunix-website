const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { MongoClient, ObjectId } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  if (!MONGODB_URI) return null;
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db();
  return cachedDb;
}

const DATA_DIR = path.join(os.tmpdir(), "bitunix-data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SITE_CONFIG_FILE = path.join(DATA_DIR, "site_config.json");
const JWT_SECRET = process.env.JWT_SECRET || "local-secret";

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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if(!storedHash || !storedHash.includes(":")) return false;
  const [salt, hash] = storedHash.split(":");
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
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

// --- DB HELPERS ---
async function readWallet(userId) {
  const db = await connectToDatabase();
  if (db) return (await db.collection("wallets").findOne({ userId })) || { userId, balance: 0, pendingDeposits: [], transactions: [] };
  return { userId, balance: 0, pendingDeposits: [], transactions: [] };
}

async function writeWallet(userId, wallet) {
  const db = await connectToDatabase();
  if (db) await db.collection("wallets").updateOne({ userId }, { $set: wallet }, { upsert: true });
}

// --- HANDLER ---
module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const decoded = verifyToken(token);

    // --- AUTH ---
    if (pathname === "/api/auth/register" && req.method === "POST") {
      const { name, email, password } = await parseBody(req);
      const db = await connectToDatabase();
      const existing = await db.collection("users").findOne({ email });
      if (existing) return sendJson(res, 400, { message: "Email already registered" });
      const newUser = { id: crypto.randomUUID(), name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      await db.collection("users").insertOne(newUser);
      return sendJson(res, 201, { message: "Success" });
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const { email, password } = await parseBody(req);
      const db = await connectToDatabase();
      const u = await db.collection("users").findOne({ email });
      if (!u || !verifyPassword(password, u.passwordHash)) return sendJson(res, 401, { message: "Invalid credentials" });
      const token = signToken({ id: u.id, name: u.name, email: u.email });
      return sendJson(res, 200, { token, user: { id: u.id, name: u.name, email: u.email } });
    }

    // --- MARKET (Unified Route) ---
    if (pathname === "/api/trade/rows") {
        const cat = url.searchParams.get("cat") || "crypto";
        const toRow = (label, last, chg) => ({ label, last: Number(last || 0), chg: String(chg || "0.00") });
        const rows = [];
        
        if (cat === "crypto") {
            const syms = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT"];
            try {
                const results = await Promise.all(syms.map(async s => {
                    try {
                        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
                        if(!r.ok) return null;
                        const t = await r.json();
                        return toRow(s.replace("USDT","/USD"), t.lastPrice, t.priceChangePercent);
                    } catch { return null; }
                }));
                rows.push(...results.filter(Boolean));
            } catch(e){}
            // Fallback for Crypto
            if(rows.length === 0) {
                try {
                    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,ripple,dogecoin,cardano,polkadot,litecoin,bitcoin-cash,ethereum-classic,filecoin,eos&vs_currencies=usd&include_24hr_change=true");
                    const d = await r.json();
                    const map = { bitcoin:"BTC/USD", ethereum:"ETH/USD", binancecoin:"BNB/USD", solana:"SOL/USD", ripple:"XRP/USD", dogecoin:"DOGE/USD", cardano:"ADA/USD", polkadot:"DOT/USD", litecoin:"LTC/USD", "bitcoin-cash":"BCH/USD", "ethereum-classic":"ETC/USD", filecoin:"FIL/USD", eos:"EOS/USD" };
                    Object.keys(d).forEach(id => rows.push(toRow(map[id], d[id].usd, d[id].usd_24h_change)));
                } catch(e){}
            }
        } else if (cat === "metal") {
            try {
                const syms = ["PAXGUSDT", "XAUTUSDT"];
                const results = await Promise.all(syms.map(async s => {
                    try {
                        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
                        if(!r.ok) return null;
                        const t = await r.json();
                        return toRow(s === "PAXGUSDT" ? "PAXG/USD" : "XAU/USD", t.lastPrice, t.priceChangePercent);
                    } catch { return null; }
                }));
                rows.push(...results.filter(Boolean));
            } catch(e){}
            if(rows.length === 0) rows.push(toRow("PAXG/USD", 2320.50, 0.45), toRow("XAU/USD", 2325.10, -0.12));
        } else if (cat === "fx") {
            const pairs = [{l:"INR/USD",t:"INR"},{l:"EUR/USD",s:"EURUSDT"},{l:"GBP/USD",s:"GBPUSDT"},{l:"AUD/USD",s:"AUDUSDT"},{l:"JPY/USD",t:"JPY"},{l:"AED/USD",t:"AED"},{l:"SAR/USD",t:"SAR"},{l:"PKR/USD",t:"PKR"},{l:"TRY/USD",t:"TRY"},{l:"CAD/USD",t:"CAD"}];
            let fxData = null; try { const fr = await fetch("https://open.er-api.com/v6/latest/USD"); if(fr.ok) fxData = await fr.json(); } catch(e){}
            for(const p of pairs) {
                if(p.s) {
                    try { const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${p.s}`); if(r.ok) { const t=await r.json(); rows.push(toRow(p.l, t.lastPrice, t.priceChangePercent)); continue; } } catch(e){}
                }
                const rate = fxData?.rates?.[p.t];
                if(rate) rows.push(toRow(p.l, (1/rate).toFixed(6), (Math.random()*0.2-0.1).toFixed(2)));
                else rows.push(toRow(p.l, "0.00", "0.00"));
            }
        }
        return sendJson(res, 200, { rows });
    }

    if (pathname === "/api/trade/klines") {
        const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
        try {
            const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=100`);
            if(!r.ok) throw new Error();
            const data = await r.json();
            return sendJson(res, 200, { candles: data.map(k => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] })) });
        } catch {
            const candles = []; let p = 65000; for(let i=0; i<100; i++) { p += Math.random()*100-50; candles.push({ t: Date.now() - (100-i)*300000, o: p, h: p+10, l: p-10, c: p, v: 100 }); }
            return sendJson(res, 200, { candles });
        }
    }

    // --- USER PROTECTED ---
    if (decoded) {
        if (pathname === "/api/auth/me") return sendJson(res, 200, { user: decoded });
        if (pathname === "/api/wallet/me") return sendJson(res, 200, { wallet: await readWallet(decoded.id) });
        
        if (pathname === "/api/deposit/create" && req.method === "POST") {
            const body = await parseBody(req);
            const w = await readWallet(decoded.id);
            const dep = { id: `dep_${Date.now()}`, amount: Number(body.amount), network: body.network || "TRC20", created: Date.now(), status: "pending" };
            w.pendingDeposits.push(dep);
            await writeWallet(decoded.id, w);
            
            // Notification logic
            const msg = { type: "user", message: `📢 [SYSTEM]: Deposit request for ${dep.amount} USDT.`, time: Date.now(), status: "unread", userName: decoded.name, userEmail: decoded.email };
            const db = await connectToDatabase();
            if(db) await db.collection("support_chats").updateOne({ userId: decoded.id }, { $push: { messages: msg } }, { upsert: true });
            
            return sendJson(res, 200, { message: "Success", deposit: dep });
        }
    }

    // --- ADMIN ---
    if (pathname === "/admin/api/login" && req.method === "POST") {
        const { username, password } = await parseBody(req);
        if(username === "admin" && password === "rahi0889") {
            const token = signToken({ role: "admin", user: "admin" });
            return sendJson(res, 200, { token, user: { username: "admin" } });
        }
        return sendJson(res, 401, { message: "Invalid credentials" });
    }

    if (pathname.startsWith("/admin/api")) {
        const admin = verifyToken(token);
        if(!admin || admin.role !== "admin") {
            // Allow login and verify without check if token is invalid but it's a login attempt
            if(pathname !== "/admin/api/login") return sendJson(res, 401, { message: "Unauthorized" });
        }

        if (pathname === "/admin/api/verify") return sendJson(res, 200, { user: { username: "admin" } });

        if (pathname === "/admin/api/stats") {
            const db = await connectToDatabase();
            const total_users = db ? await db.collection("users").countDocuments() : 0;
            return sendJson(res, 200, { total_users, uptime: process.uptime() });
        }

        if (pathname === "/admin/api/users") {
            const db = await connectToDatabase();
            const users = db ? await db.collection("users").find({}).toArray() : [];
            const out = [];
            for(const u of users) {
                const w = await readWallet(u.id);
                out.push({ ...u, balance: w.balance, wallet: w });
            }
            return sendJson(res, 200, { users: out });
        }

        if (pathname === "/admin/api/deposits") {
            const db = await connectToDatabase();
            const users = db ? await db.collection("users").find({}).toArray() : [];
            const out = [];
            for(const u of users) {
                const w = await readWallet(u.id);
                (w.pendingDeposits || []).forEach(d => out.push({ ...d, userId: u.id, userName: u.name, userEmail: u.email }));
            }
            return sendJson(res, 200, { deposits: out.sort((a,b) => b.created - a.created) });
        }

        if (pathname === "/admin/api/withdrawals") {
            const db = await connectToDatabase();
            const users = db ? await db.collection("users").find({}).toArray() : [];
            const out = [];
            for(const u of users) {
                const w = await readWallet(u.id);
                (w.withdrawals || []).forEach(wd => out.push({ ...wd, userId: u.id, userName: u.name, userEmail: u.email }));
            }
            return sendJson(res, 200, { withdrawals: out.sort((a,b) => b.created - a.created) });
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

        if (pathname === "/admin/api/user/update-credit-score" && req.method === "POST") {
            const { userId, score } = await parseBody(req);
            const db = await connectToDatabase();
            if(db) {
                await db.collection("users").updateOne({ id: userId }, { $set: { creditScore: Number(score) } });
                return sendJson(res, 200, { message: "Success" });
            }
            return sendJson(res, 500, { message: "DB Error" });
        }
    }

    return sendJson(res, 404, { message: "Route not found" });

  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { message: "Internal Error", error: err.message });
  }
};
