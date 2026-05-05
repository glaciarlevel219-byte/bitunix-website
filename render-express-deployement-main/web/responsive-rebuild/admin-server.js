const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const HOST = "127.0.0.1";
const PORT = 5604;
const ROOT = __dirname;
const ADMIN_USERS_FILE = path.join(ROOT, "data", "admin_users.json");
const SITE_CONFIG_FILE = path.join(ROOT, "data", "site_config.json");

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
  const signature = crypto.createHmac("sha256", "admin-secret-key").update(raw).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  const expected = crypto.createHmac("sha256", "admin-secret-key").update(raw).digest("base64url");
  if (signature !== expected) return null;
  return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
}

function ensureAdminUsersFile() {
  const dir = path.dirname(ADMIN_USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ADMIN_USERS_FILE)) {
    const defaultAdmin = {
      id: crypto.randomUUID(),
      username: "admin",
      passwordHash: hashPassword("admin123"),
      role: "super_admin",
      createdAt: Date.now()
    };
    fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify([defaultAdmin], null, 2), "utf8");
  }
}

function ensureSiteConfigFile() {
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
      social_links: {
        twitter: "",
        telegram: "",
        discord: ""
      },
      api_keys: {
        binance: "",
        coingecko: ""
      }
    };
    fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf8");
  }
}

function readAdminUsers() {
  ensureAdminUsersFile();
  return JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, "utf8"));
}

function writeAdminUsers(users) {
  fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function readSiteConfig() {
  ensureSiteConfigFile();
  return JSON.parse(fs.readFileSync(SITE_CONFIG_FILE, "utf8"));
}

function writeSiteConfig(config) {
  fs.writeFileSync(SITE_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
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

function serveAdminFile(reqPath, res) {
  let filePath;
  
  // Handle root path
  if (reqPath === "/" || reqPath === "/admin/") {
    filePath = path.join(ROOT, "admin", "index.html");
  } else if (reqPath.startsWith("/admin/")) {
    // Remove /admin/ prefix for internal path
    const internalPath = reqPath.slice(7); // Remove "/admin/"
    filePath = path.join(ROOT, "admin", internalPath === "" ? "index.html" : internalPath);
  } else {
    filePath = path.join(ROOT, "admin", reqPath === "/" ? "index.html" : reqPath.slice(1));
  }
  
  if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { message: "Forbidden" });

  // If file doesn't exist or is directory, serve index.html
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, "admin", "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
  };
  
  const contentType = types[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  
  // Add debugging for CSS
  if (ext === ".css") {
    console.log(`Serving CSS file: ${filePath}`);
  }
  
  fs.createReadStream(filePath).pipe(res);
}

function requireAdminAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const decoded = verifyToken(token);
  if (!decoded) {
    return sendJson(res, 401, { message: "Unauthorized" });
  }
  req.admin = decoded;
  next();
}

const adminServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // Admin login
    if (req.method === "POST" && url.pathname === "/admin/api/login") {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      
      if (!username || !password) {
        return sendJson(res, 400, { message: "Username and password required" });
      }
      
      const users = readAdminUsers();
      const user = users.find((u) => u.username === username);
      
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { message: "Invalid credentials" });
      }
      
      const token = signToken({ 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        iat: Date.now() 
      });
      
      return sendJson(res, 200, { 
        token, 
        user: { id: user.id, username: user.username, role: user.role } 
      });
    }

    // Verify admin token
    if (req.method === "GET" && url.pathname === "/admin/api/verify") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const decoded = verifyToken(token);
      if (!decoded) {
        return sendJson(res, 401, { message: "Invalid token" });
      }
      return sendJson(res, 200, { user: decoded });
    }

    // Get site configuration
    if (req.method === "GET" && url.pathname === "/admin/api/config") {
      const config = readSiteConfig();
      return sendJson(res, 200, config);
    }

    // Update site configuration
    if (req.method === "POST" && url.pathname === "/admin/api/config") {
      requireAdminAuth(req, res, async () => {
        const body = await parseBody(req);
        const config = readSiteConfig();
        
        // Update config with new values
        Object.assign(config, body);
        
        writeSiteConfig(config);
        return sendJson(res, 200, { message: "Configuration updated successfully", config });
      });
    }

    // Get users list with detailed data
    if (req.method === "GET" && url.pathname === "/admin/api/users") {
      requireAdminAuth(req, res, () => {
        try {
          const usersPath = path.join(ROOT, "data", "users.json");
          let users = [];
          if (fs.existsSync(usersPath)) {
            users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
          }
          
          // Load wallet data for each user
          const usersWithWallets = users.map(u => {
            const walletPath = path.join(ROOT, "data", `wallet_${u.id}.json`);
            let wallet = null;
            if (fs.existsSync(walletPath)) {
              try {
                wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
              } catch (e) {
                wallet = null;
              }
            }
            
            return {
              id: u.id,
              name: u.name,
              email: u.email,
              passwordHash: u.passwordHash, // Show password hash for admin
              createdAt: u.createdAt,
              wallet: wallet,
              lastLogin: u.lastLogin || null
            };
          });
          
          return sendJson(res, 200, { users: usersWithWallets });
        } catch (error) {
          return sendJson(res, 500, { message: "Error fetching users" });
        }
      });
    }

    // Get pending deposit requests
    if (req.method === "GET" && url.pathname === "/admin/api/deposits") {
      requireAdminAuth(req, res, () => {
        try {
          const usersPath = path.join(ROOT, "data", "users.json");
          let users = [];
          if (fs.existsSync(usersPath)) {
            users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
          }
          
          let allPendingDeposits = [];
          
          users.forEach(user => {
            const walletPath = path.join(ROOT, "data", `wallet_${user.id}.json`);
            if (fs.existsSync(walletPath)) {
              try {
                const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
                const pendingDeposits = wallet.pendingDeposits || [];
                
                pendingDeposits.forEach(deposit => {
                  allPendingDeposits.push({
                    ...deposit,
                    userId: user.id,
                    userName: user.name,
                    userEmail: user.email
                  });
                });
              } catch (e) {
                // Skip invalid wallet files
              }
            }
          });
          
          return sendJson(res, 200, { deposits: allPendingDeposits });
        } catch (error) {
          return sendJson(res, 500, { message: "Error fetching deposits" });
        }
      });
    }

    // Approve deposit
    if (req.method === "POST" && url.pathname === "/admin/api/approve-deposit") {
      requireAdminAuth(req, res, async () => {
        try {
          const body = await parseBody(req);
          const { userId, depositId, action } = body;
          
          if (!userId || !depositId || !action) {
            return sendJson(res, 400, { message: "Missing required fields" });
          }
          
          const walletPath = path.join(ROOT, "data", `wallet_${userId}.json`);
          if (!fs.existsSync(walletPath)) {
            return sendJson(res, 404, { message: "User wallet not found" });
          }
          
          const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
          const pendingDeposits = wallet.pendingDeposits || [];
          
          const depositIndex = pendingDeposits.findIndex(d => d.id === depositId || d.rechargeId === depositId);
          if (depositIndex === -1) {
            return sendJson(res, 404, { message: "Deposit not found" });
          }
          
          const deposit = pendingDeposits[depositIndex];
          
          if (action === "approve") {
            // Add amount to user balance
            const amount = Number(deposit.amount) || 0;
            wallet.balance = (Number(wallet.balance) || 0) + amount;
            
            // Move to completed deposits
            wallet.recharges = wallet.recharges || [];
            wallet.recharges.push({
              id: deposit.rechargeId || deposit.id,
              amount: amount,
              network: deposit.network,
              status: "completed",
              created: deposit.created,
              completedAt: Date.now(),
              approvedBy: req.admin.username
            });
            
            // Remove from pending
            pendingDeposits.splice(depositIndex, 1);
            wallet.pendingDeposits = pendingDeposits;
            
            // Add transaction record
            wallet.transactions = wallet.transactions || [];
            wallet.transactions.push({
              id: crypto.randomUUID(),
              created: Date.now(),
              kind: "deposit",
              title: "Deposit Approved",
              amount: amount,
              asset: "USDT",
              status: "success",
              detail: `Approved by admin: ${req.admin.username}`,
              network: deposit.network
            });
            
          } else if (action === "reject") {
            // Remove from pending deposits
            pendingDeposits.splice(depositIndex, 1);
            wallet.pendingDeposits = pendingDeposits;
            
            // Add rejection record
            wallet.transactions = wallet.transactions || [];
            wallet.transactions.push({
              id: crypto.randomUUID(),
              created: Date.now(),
              kind: "deposit",
              title: "Deposit Rejected",
              amount: Number(deposit.amount) || 0,
              asset: "USDT",
              status: "failed",
              detail: `Rejected by admin: ${req.admin.username}`,
              network: deposit.network
            });
          }
          
          // Save updated wallet
          fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2), "utf8");
          
          return sendJson(res, 200, { 
            message: `Deposit ${action}d successfully`,
            deposit: {
              id: depositId,
              action: action,
              amount: deposit.amount,
              userId: userId
            }
          });
          
        } catch (error) {
          return sendJson(res, 500, { message: "Error processing deposit" });
        }
      });
    }

    // Get system stats
    if (req.method === "GET" && url.pathname === "/admin/api/stats") {
      requireAdminAuth(req, res, () => {
        try {
          const stats = {
            total_users: 0,
            total_transactions: 0,
            system_uptime: process.uptime(),
            memory_usage: process.memoryUsage(),
            node_version: process.version,
            platform: process.platform
          };

          // Count users
          const usersPath = path.join(ROOT, "data", "users.json");
          if (fs.existsSync(usersPath)) {
            const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
            stats.total_users = users.length;
          }

          return sendJson(res, 200, stats);
        } catch (error) {
          return sendJson(res, 500, { message: "Error fetching stats" });
        }
      });
    }

    // Serve admin panel files
    if (url.pathname.startsWith("/admin/") || url.pathname === "/") {
      return serveAdminFile(url.pathname, res);
    }

    return sendJson(res, 404, { message: "Not found" });
  } catch (err) {
    return sendJson(res, 500, { message: "Server error", detail: String(err.message || err) });
  }
});

adminServer.listen(PORT, HOST, () => {
  ensureAdminUsersFile();
  ensureSiteConfigFile();
  console.log(`Admin Panel running at http://${HOST}:${PORT}`);
  console.log(`Default login: admin / admin123`);
});
