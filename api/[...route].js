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

// Sequential 6-digit ID counter storage
const ID_COUNTER_FILE = path.join(DATA_DIR, "user_id_counter.json");

function getNextUserId() {
  let counter = 1;
  try {
    if (fs.existsSync(ID_COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(ID_COUNTER_FILE, "utf8"));
      counter = data.counter || 1;
    }
  } catch (e) {}
  
  // Format as 6-digit (000001, 000002, etc.)
  const userId = counter.toString().padStart(6, "0");
  
  // Increment counter
  fs.writeFileSync(ID_COUNTER_FILE, JSON.stringify({ counter: counter + 1 }), "utf8");
  
  return userId;
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
    let pathname = url.pathname;
    if (pathname.endsWith("/") && pathname.length > 1) pathname = pathname.slice(0, -1);
    
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const decoded = verifyToken(token);

    // --- AUTH ---
    if (pathname === "/api/auth/register" && req.method === "POST") {
      const { name, email, password } = await parseBody(req);
      const db = await connectToDatabase();
      const existing = await db.collection("users").findOne({ email });
      if (existing) return sendJson(res, 400, { message: "Email already registered" });
      const newUser = { id: getNextUserId(), name, email, passwordHash: hashPassword(password), createdAt: Date.now() };
      await db.collection("users").insertOne(newUser);
      return sendJson(res, 201, { message: "Success", userId: newUser.id });
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

    if (pathname === "/api/trade/klines" || pathname === "/admin/api/trade/klines") {
        const symbol = String(url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
        const source = String(url.searchParams.get("source") || "binance");
        
        if (source === "frank") {
            try {
                const r = await fetch(`https://api.frankfurter.app/2020-01-01..?to=${symbol.replace("USD","")}`);
                if (!r.ok) throw new Error();
                const data = await r.json();
                const candles = [];
                let prev = 1;
                for(const date in data.rates) {
                    const rate = 1 / data.rates[date][symbol.replace("USD","")];
                    candles.push({ t: new Date(date).getTime(), o: String(prev), h: String(Math.max(prev, rate)), l: String(Math.min(prev, rate)), c: String(rate), v: "100" });
                    prev = rate;
                }
                return sendJson(res, 200, { candles: candles.slice(-100) });
            } catch {
                return sendJson(res, 200, { candles: [] });
            }
        }
        
        try {
            const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=100`);
            if(!r.ok) throw new Error();
            const data = await r.json();
            return sendJson(res, 200, { candles: data.map(k => ({ t: k[0], o: String(k[1]), h: String(k[2]), l: String(k[3]), c: String(k[4]), v: String(k[5]) })) });
        } catch {
            const candles = []; let p = 65000; for(let i=0; i<100; i++) { p += Math.random()*100-50; candles.push({ t: Date.now() - (100-i)*300000, o: String(p), h: String(p+10), l: String(p-10), c: String(p), v: "100" }); }
            return sendJson(res, 200, { candles });
        }
    }

    if (pathname === "/api/market/live") {
        try {
            const syms = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT"];
            const results = await Promise.all(syms.map(async s => {
                try {
                    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
                    if(!r.ok) return null;
                    const t = await r.json();
                    return { legal_name: s.replace("USDT",""), currency_name: "USD", now_price: t.lastPrice, change: t.priceChangePercent };
                } catch { return null; }
            }));
            return sendJson(res, 200, results.filter(Boolean));
        } catch { return sendJson(res, 200, []); }
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
    if (decoded) {
        if (pathname === "/api/auth/me") return sendJson(res, 200, { user: decoded });
        if (pathname === "/api/wallet/me") {
            const wallet = await readWallet(decoded.id);
            // Get credit score from user profile
            const db = await connectToDatabase();
            if (db) {
                const user = await db.collection("users").findOne({ id: decoded.id });
                if (user && user.creditScore !== undefined) {
                    wallet.creditScore = user.creditScore;
                }
            }
            return sendJson(res, 200, { wallet });
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
    }

    // --- ADMIN ---
    if ((pathname === "/admin/api/login" || pathname === "/api/admin/login") && req.method === "POST") {
        const { username, password } = await parseBody(req);
        if(username === "admin" && password === "admin123") {
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
            const users = db ? await db.collection("users").find({}).toArray() : [];
            const out = [];
            for(const u of users) {
                const w = await readWallet(u.id);
                (w.withdrawals || []).forEach(wd => out.push({ ...wd, userId: u.id, userName: u.name, userEmail: u.email }));
            }
            return sendJson(res, 200, { withdrawals: out.sort((a,b) => b.created - a.created) });
        }

        if (pathname === "/admin/api/withdrawal/action" && req.method === "POST") {
            const { userId, withdrawalId, action } = await parseBody(req);
            if (!userId || !withdrawalId || !action) {
                return sendJson(res, 400, { message: "Missing required fields" });
            }
            
            const wallet = await readWallet(userId);
            const withdrawalIndex = (wallet.pendingWithdrawals || []).findIndex(w => w.id === withdrawalId);
            
            if (withdrawalIndex === -1) {
                return sendJson(res, 404, { message: "Withdrawal not found" });
            }
            
            const withdrawal = wallet.pendingWithdrawals[withdrawalIndex];
            
            if (action === "reject") {
                // Return amount to balance
                wallet.balance = (wallet.balance || 0) + Number(withdrawal.amount);
            }
            
            // Remove from pending
            wallet.pendingWithdrawals.splice(withdrawalIndex, 1);
            
            // Update withdrawal status
            withdrawal.status = action === "approve" ? "completed" : "rejected";
            withdrawal.processedAt = Date.now();
            wallet.withdrawals = wallet.withdrawals || [];
            wallet.withdrawals.push(withdrawal);
            
            await writeWallet(userId, wallet);
            return sendJson(res, 200, { message: `Withdrawal ${action}d successfully` });
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
            
            // Update counter for future registrations
            fs.writeFileSync(ID_COUNTER_FILE, JSON.stringify({ counter: counter }), "utf8");
            
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
