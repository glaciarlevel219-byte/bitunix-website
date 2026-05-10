const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { MongoClient, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");

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
        host: process.env.SMTP_HOST || "smtp.hostinger.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER || "support@bitunixpk.com",
          pass: process.env.SMTP_PASS || ""
        }
      });

      try {
        if (!process.env.SMTP_PASS) {
          console.warn("SMTP_PASS not set, skipping email send. Code:", code);
          return sendJson(res, 400, { message: "SMTP Password not configured in Vercel. Please set SMTP_PASS." });
        }
        await transporter.sendMail({
          from: `"Bitunix Support" <${process.env.SMTP_USER || "support@bitunixpk.com"}>`,
          to: email,
          subject: "Password Reset Code",
          text: `Your password reset code is: ${code}\nThis code will expire in 15 minutes.`
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
        } catch (e) {
            // Fallback: reuse our live market aggregator if possible
            try {
                const rowsRes = await fetch(`http://${req.headers.host}/api/market/live`);
                const rowsJson = rowsRes.ok ? await rowsRes.json() : null;
                const rows = rowsJson?.data || [];
                const base = symbol.replace("USDT", "");
                const row = rows.find((x) => String(x.legal_name || "").toUpperCase() === base) || null;
                const last = Number(row?.now_price || 0);
                const chg = Number(row?.change || 0);
                return sendJson(res, 200, {
                    symbol,
                    lastPrice: last,
                    priceChangePercent: chg,
                    source: "fallback",
                });
            } catch (_) {}

            // Fallback: CoinGecko (works in many regions where Binance is blocked)
            try {
                const base = symbol.replace(/USDT$/i, "");
                const map = {
                    BTC: "bitcoin",
                    ETH: "ethereum",
                    BNB: "binancecoin",
                    SOL: "solana",
                    XRP: "ripple",
                    DOGE: "dogecoin",
                    ADA: "cardano",
                    DOT: "polkadot",
                    LTC: "litecoin",
                    BCH: "bitcoin-cash",
                    ETC: "ethereum-classic",
                    FIL: "filecoin",
                    EOS: "eos",
                    SHIB: "shiba-inu",
                    TON: "the-open-network",
                };
                const id = map[base];
                if (id) {
                    const cg = await fetch(
                        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`
                    );
                    if (cg.ok) {
                        const data = await cg.json();
                        const price = Number(data?.[id]?.usd || 0);
                        const chg = Number(data?.[id]?.usd_24h_change || 0);
                        if (price > 0) {
                            return sendJson(res, 200, {
                                symbol,
                                lastPrice: price,
                                priceChangePercent: chg,
                                source: "coingecko",
                            });
                        }
                    }
                }
            } catch (_) {}

            const mock = 65000 + (Math.random() * 1000 - 500);
            return sendJson(res, 200, {
                symbol,
                lastPrice: mock,
                priceChangePercent: Math.random() * 2 - 1,
                source: "simulated",
            });
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
            const toRow = (label, now_price, change) => ({ 
                label, 
                legal_name: label.split("/")[0], 
                currency_name: label.split("/")[1] || "USD", 
                now_price: Number(now_price || 0), 
                change: Number(change || 0) 
            });
            const results = [];
            
            // 1. Crypto
            const cryptoSyms = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "ETCUSDT", "FILUSDT", "EOSUSDT"];
            try {
                const cryptoRes = await Promise.all(cryptoSyms.map(async s => {
                    try {
                        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
                        if(!r.ok) return null;
                        const t = await r.json();
                        return toRow(s.replace("USDT","/USD"), t.lastPrice, t.priceChangePercent);
                    } catch { return null; }
                }));
                const cryptoRows = cryptoRes.filter(Boolean);
                results.push(...cryptoRows);

                // If Binance is blocked and we got no crypto rows, fallback to CoinGecko
                if (!cryptoRows.length) {
                    try {
                        const cgUrl =
                            "https://api.coingecko.com/api/v3/simple/price?ids=" +
                            "bitcoin,ethereum,binancecoin,solana,ripple,dogecoin,cardano,polkadot,litecoin,bitcoin-cash,ethereum-classic,filecoin,eos" +
                            "&vs_currencies=usd&include_24hr_change=true";
                        const cg = await fetch(cgUrl);
                        if (cg.ok) {
                            const d = await cg.json();
                            const map = [
                                ["bitcoin", "BTC"],
                                ["ethereum", "ETH"],
                                ["binancecoin", "BNB"],
                                ["solana", "SOL"],
                                ["ripple", "XRP"],
                                ["dogecoin", "DOGE"],
                                ["cardano", "ADA"],
                                ["polkadot", "DOT"],
                                ["litecoin", "LTC"],
                                ["bitcoin-cash", "BCH"],
                                ["ethereum-classic", "ETC"],
                                ["filecoin", "FIL"],
                                ["eos", "EOS"],
                            ];
                            for (const [id, sym] of map) {
                                const price = Number(d?.[id]?.usd || 0);
                                const chg = Number(d?.[id]?.usd_24h_change || 0);
                                if (price > 0) results.push(toRow(`${sym}/USD`, price, chg));
                            }
                        }
                    } catch (e) {}
                }
            } catch(e){}

            // 2. FX
            try {
                const fxPairs = [{l:"INR/USD",t:"INR"},{l:"EUR/USD",s:"EURUSDT"},{l:"GBP/USD",s:"GBPUSDT"},{l:"AUD/USD",s:"AUDUSDT"},{l:"JPY/USD",t:"JPY"},{l:"AED/USD",t:"AED"},{l:"SAR/USD",t:"SAR"},{l:"PKR/USD",t:"PKR"},{l:"TRY/USD",t:"TRY"},{l:"CAD/USD",t:"CAD"}];
                let fxData = null; try { const fr = await fetch("https://open.er-api.com/v6/latest/USD"); if(fr.ok) fxData = await fr.json(); } catch(e){}
                for(const p of fxPairs) {
                    if(p.s) {
                        try { const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${p.s}`); if(r.ok) { const t=await r.json(); results.push(toRow(p.l, t.lastPrice, t.priceChangePercent)); continue; } } catch(e){}
                    }
                    const rate = fxData?.rates?.[p.t];
                    if(rate) results.push(toRow(p.l, (1/rate).toFixed(6), (Math.random()*0.2-0.1).toFixed(2)));
                }
            } catch(e){}

            // 3. Metals
            try {
                const metalSyms = ["PAXGUSDT", "XAUTUSDT"];
                const metalRes = await Promise.all(metalSyms.map(async s => {
                    try {
                        const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`);
                        if(!r.ok) return null;
                        const t = await r.json();
                        return toRow(s === "PAXGUSDT" ? "PAXG/USD" : "XAU/USD", t.lastPrice, t.priceChangePercent);
                    } catch { return null; }
                }));
                results.push(...metalRes.filter(Boolean));
            } catch(e){}

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
            
            // Also add to withdrawals history
            w.withdrawals = w.withdrawals || [];
            w.withdrawals.push(withdrawal);
            
            await writeWallet(decoded.id, w);
            
            // Notification logic
            const msg = { type: "user", message: `📢 [SYSTEM]: Withdrawal request for ${withdrawal.amount} USDT.`, time: Date.now(), status: "unread", userName: decoded.name, userEmail: decoded.email };
            const db = await connectToDatabase();
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
                out.push({ 
                    ...u, 
                    balance: w.balance, 
                    wallet: w,
                    tradeOutcomeMode: u.tradeOutcomeMode || "random" 
                });
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
    }

    return sendJson(res, 404, { message: "Route not found" });

  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { message: "Internal Error", error: err.message });
  }
};
