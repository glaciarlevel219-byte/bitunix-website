const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const HOST = "127.0.0.1";
const PORT = 5618;
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
  try {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  } catch (error) {
    console.error('Error sending JSON response:', error);
  }
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
  try {
    let filePath;
    
    if (reqPath === "/" || reqPath === "/admin/") {
      filePath = path.join(ROOT, "admin", "index.html");
    } else if (reqPath.startsWith("/admin/")) {
      const internalPath = reqPath.slice(7);
      filePath = path.join(ROOT, "admin", internalPath === "" ? "index.html" : internalPath);
    } else {
      filePath = path.join(ROOT, "admin", reqPath === "/" ? "index.html" : reqPath.slice(1));
    }
    
    if (!filePath.startsWith(ROOT)) {
      return sendJson(res, 403, { message: "Forbidden" });
    }

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
    
    try {
      const fileContent = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(fileContent);
    } catch (fileError) {
      console.error('Error serving file:', fileError);
      sendJson(res, 500, { message: "File not found" });
    }
  } catch (error) {
    console.error('Error in serveAdminFile:', error);
    sendJson(res, 500, { message: "Server error" });
  }
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
    // Test endpoint for debugging
    if (req.method === "GET" && url.pathname === "/admin/api/test") {
      console.log('Test endpoint called');
      return sendJson(res, 200, { message: "Admin server is working!", timestamp: Date.now() });
    }

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
        
        Object.assign(config, body);
        
        writeSiteConfig(config);
        return sendJson(res, 200, { message: "Configuration updated successfully", config });
      });
      return;
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
              passwordHash: u.passwordHash,
              createdAt: u.createdAt,
              wallet: wallet,
              lastLogin: u.lastLogin || null
            };
          });
          
          return sendJson(res, 200, { users: usersWithWallets });
        } catch (error) {
          console.error('Error fetching users:', error);
          return sendJson(res, 500, { message: "Error fetching users" });
        }
      });
      return;
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
          console.error('Error fetching deposits:', error);
          return sendJson(res, 500, { message: "Error fetching deposits" });
        }
      });
      return;
    }

    // Approve/Reject deposit
    if (req.method === "POST" && url.pathname === "/admin/api/deposit/action") {
      requireAdminAuth(req, res, async () => {
        try {
          const body = await parseBody(req);
          const userId = String(body.userId || "").trim();
          const depositId = String(body.depositId || "").trim();
          const action = String(body.action || "").trim(); // approve or reject
          
          console.log('Deposit action request:', { userId, depositId, action });
          
          if (!userId || !depositId || !action) {
            console.log('Missing required fields:', { userId: !!userId, depositId: !!depositId, action: !!action });
            return sendJson(res, 400, { message: "Missing required fields" });
          }
          
          if (action !== "approve" && action !== "reject") {
            console.log('Invalid action:', action);
            return sendJson(res, 400, { message: "Invalid action" });
          }
          
          const walletPath = path.join(ROOT, "data", `wallet_${userId}.json`);
          if (!fs.existsSync(walletPath)) {
            return sendJson(res, 404, { message: "User wallet not found" });
          }
          
          const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
          const pendingDeposits = wallet.pendingDeposits || [];
          
          console.log('Found pending deposits:', pendingDeposits.length);
          console.log('Looking for deposit ID:', depositId);
          
          const depositIndex = pendingDeposits.findIndex(d => d.id === depositId);
          if (depositIndex === -1) {
            console.log('Deposit not found with ID:', depositId);
            return sendJson(res, 404, { message: "Deposit not found" });
          }
          
          const deposit = pendingDeposits[depositIndex];
          
          if (action === "approve") {
            // Add to balance and move to completed deposits
            wallet.balance = (wallet.balance || 0) + deposit.amount;
            
            if (!wallet.recharges) wallet.recharges = [];
            wallet.recharges.push({
              id: deposit.id,
              amount: deposit.amount,
              network: deposit.network,
              status: "completed",
              created: deposit.created,
              completedAt: Date.now()
            });
            
            // Update transaction status
            if (wallet.transactions) {
              const transaction = wallet.transactions.find(t => t.id === deposit.id);
              if (transaction) {
                transaction.status = "success";
              }
            }
          } else {
            // Just remove from pending deposits (reject)
            if (!wallet.recharges) wallet.recharges = [];
            wallet.recharges.push({
              id: deposit.id,
              amount: deposit.amount,
              network: deposit.network,
              status: "rejected",
              created: deposit.created,
              completedAt: Date.now()
            });
            
            // Update transaction status
            if (wallet.transactions) {
              const transaction = wallet.transactions.find(t => t.id === deposit.id);
              if (transaction) {
                transaction.status = "failed";
              }
            }
          }
          
          // Remove from pending deposits
          wallet.pendingDeposits.splice(depositIndex, 1);
          
          // Save updated wallet
          fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));
          
          return sendJson(res, 200, { 
            message: `Deposit ${action}d successfully`,
            action: action,
            depositId: depositId,
            userId: userId
          });
        } catch (error) {
          console.error('Error processing deposit action:', error);
          return sendJson(res, 500, { message: "Error processing deposit action" });
        }
      });
      return;
    }

    // Get user wallet data
    if (req.method === "GET" && url.pathname.startsWith("/admin/api/user-wallet/")) {
      requireAdminAuth(req, res, () => {
        try {
          const userId = url.pathname.split("/").pop();
          console.log('Fetching wallet data for user:', userId);
          
          const walletPath = path.join(ROOT, "data", `wallet_${userId}.json`);
          if (!fs.existsSync(walletPath)) {
            console.log('Wallet file not found for user:', userId);
            return sendJson(res, 404, { message: "User wallet not found" });
          }
          
          const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
          console.log('Wallet data loaded successfully');
          
          return sendJson(res, 200, { wallet: wallet });
        } catch (error) {
          console.error('Error fetching user wallet:', error);
          return sendJson(res, 500, { message: "Error fetching user wallet" });
        }
      });
      return;
    }

    // Get all pending withdrawals
    if (req.method === "GET" && url.pathname === "/admin/api/withdrawals") {
      requireAdminAuth(req, res, () => {
        try {
          const usersPath = path.join(ROOT, "data", "users.json");
          let users = [];
          if (fs.existsSync(usersPath)) {
            users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
          }
          
          let allPendingWithdrawals = [];
          
          users.forEach(user => {
            const walletPath = path.join(ROOT, "data", `wallet_${user.id}.json`);
            if (fs.existsSync(walletPath)) {
              try {
                const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
                const pendingWithdrawals = (wallet.withdrawals || []).filter(w => w.status === 'pending');
                
                pendingWithdrawals.forEach(withdrawal => {
                  allPendingWithdrawals.push({
                    ...withdrawal,
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
          
          return sendJson(res, 200, { withdrawals: allPendingWithdrawals });
        } catch (error) {
          console.error('Error fetching withdrawals:', error);
          return sendJson(res, 500, { message: "Error fetching withdrawals" });
        }
      });
      return;
    }

    // Withdrawal action (approve/reject)
    if (req.method === "POST" && url.pathname === "/admin/api/withdrawal/action") {
      requireAdminAuth(req, res, async () => {
        try {
          const body = await parseBody(req);
          const userId = String(body.userId || "").trim();
          const withdrawalId = String(body.withdrawalId || "").trim();
          const action = String(body.action || "").trim(); // approve or reject
          
          console.log('Withdrawal action request:', { userId, withdrawalId, action });
          
          if (!userId || !withdrawalId || !action) {
            console.log('Missing required fields:', { userId: !!userId, withdrawalId: !!withdrawalId, action: !!action });
            return sendJson(res, 400, { message: "Missing required fields" });
          }
          
          if (action !== "approve" && action !== "reject") {
            console.log('Invalid action:', action);
            return sendJson(res, 400, { message: "Invalid action" });
          }
          
          const walletPath = path.join(ROOT, "data", `wallet_${userId}.json`);
          if (!fs.existsSync(walletPath)) {
            return sendJson(res, 404, { message: "User wallet not found" });
          }
          
          const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
          const pendingWithdrawals = wallet.withdrawals || [];
          
          console.log('Found pending withdrawals:', pendingWithdrawals.length);
          console.log('Looking for withdrawal ID:', withdrawalId);
          
          const withdrawalIndex = pendingWithdrawals.findIndex(w => w.id === withdrawalId);
          if (withdrawalIndex === -1) {
            console.log('Withdrawal not found with ID:', withdrawalId);
            return sendJson(res, 404, { message: "Withdrawal not found" });
          }
          
          const withdrawal = pendingWithdrawals[withdrawalIndex];
          
          if (action === "approve") {
            // Deduct from balance and mark as completed
            wallet.balance = (wallet.balance || 0) - withdrawal.amount;
            
            // Update withdrawal status
            withdrawal.status = "completed";
            withdrawal.completedAt = Date.now();
            
            // Update transaction status
            if (wallet.transactions) {
              const transaction = wallet.transactions.find(t => t.id === withdrawal.id);
              if (transaction) {
                transaction.status = "success";
              }
            }
          } else {
            // Just mark as rejected (no balance deduction since it was already deducted)
            withdrawal.status = "rejected";
            withdrawal.completedAt = Date.now();
            
            // Refund the amount back to balance
            wallet.balance = (wallet.balance || 0) + withdrawal.amount;
            
            // Update transaction status
            if (wallet.transactions) {
              const transaction = wallet.transactions.find(t => t.id === withdrawal.id);
              if (transaction) {
                transaction.status = "failed";
              }
            }
          }
          
          // Save updated wallet
          fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));
          
          return sendJson(res, 200, { message: `Withdrawal ${action}ed successfully`, withdrawalId, action });
        } catch (error) {
          console.error(`Error ${action}ing withdrawal:`, error);
          return sendJson(res, 500, { message: `Error ${action}ing withdrawal` });
        }
      });
      return;
    }

    // Get support tickets
    if (req.method === "GET" && url.pathname === "/admin/api/support/tickets") {
      requireAdminAuth(req, res, () => {
        try {
          // Mock support tickets data - in real implementation, this would come from a database
          const mockTickets = [
            {
              id: "ticket_001_" + Date.now(),
              customerId: "403b3f00-2b1b-491d-8158-e6cab5b016fa",
              customerName: "fdsg",
              customerEmail: "abc123@gmail.com",
              subject: "Deposit not credited",
              status: "open",
              priority: "high",
              created: Date.now() - 3600000,
              lastUpdated: Date.now() - 1800000
            },
            {
              id: "ticket_002_" + Date.now(),
              customerId: "601d53ae-ac8b-4ce9-8624-cf25861f10ae",
              customerName: "Test User",
              customerEmail: "test@example.com",
              subject: "Account verification issue",
              status: "pending",
              priority: "medium",
              created: Date.now() - 7200000,
              lastUpdated: Date.now() - 3600000
            }
          ];
          
          return sendJson(res, 200, { tickets: mockTickets });
        } catch (error) {
          console.error('Error fetching support tickets:', error);
          return sendJson(res, 500, { message: "Error fetching support tickets" });
        }
      });
      return;
    }

    // Get support messages for a user
    if (req.method === "GET" && url.pathname.startsWith("/admin/api/support/messages/")) {
      requireAdminAuth(req, res, () => {
        try {
          const userId = url.pathname.split("/").pop();
          
          // Read from user support file
          const supportFile = path.join(ROOT, "data", `support_${userId}.json`);
          if (!fs.existsSync(supportFile)) {
            return sendJson(res, 200, { messages: [] });
          }
          
          const supportData = JSON.parse(fs.readFileSync(supportFile, "utf8"));
          const messages = supportData.messages || [];
          
          // Add user information to messages
          const usersPath = path.join(ROOT, "data", "users.json");
          let userName = "Unknown User";
          if (fs.existsSync(usersPath)) {
            const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
            const user = users.find(u => u.id === userId);
            if (user) {
              userName = user.name;
            }
          }
          
          return sendJson(res, 200, { 
            messages: messages,
            userName: userName
          });
        } catch (error) {
          console.error('Error fetching support messages:', error);
          return sendJson(res, 500, { message: "Error fetching support messages" });
        }
      });
      return;
    }

    // Send support message
    if (req.method === "POST" && url.pathname === "/admin/api/support/messages/send") {
      requireAdminAuth(req, res, async () => {
        try {
          const body = await parseBody(req);
          const userId = String(body.userId || "").trim();
          const message = String(body.message || "").trim();
          const type = String(body.type || "admin").trim();
          
          console.log('Admin message request received:', { userId, message, type });
          
          if (!userId || !message) {
            console.log('Missing required fields:', { userId: !!userId, message: !!message });
            return sendJson(res, 400, { message: "Missing required fields" });
          }
          
          // Save to user support file
          const supportFile = path.join(ROOT, "data", `support_${userId}.json`);
          console.log('Support file path:', supportFile);
          
          let supportData = { messages: [] };
          
          if (fs.existsSync(supportFile)) {
            console.log('Support file exists, reading...');
            supportData = JSON.parse(fs.readFileSync(supportFile, "utf8"));
            console.log('Existing messages count:', supportData.messages.length);
          }
          
          const newMessage = {
            id: "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            userId: userId,
            type: type,
            message: message,
            time: Date.now(),
            status: "sent"
          };
          
          supportData.messages.push(newMessage);
          
          console.log('Writing to support file...');
          fs.writeFileSync(supportFile, JSON.stringify(supportData, null, 2));
          console.log('Support file written successfully');
          
          console.log(`✅ Support message sent: ${type} to user ${userId}: ${message}`);
          
          return sendJson(res, 200, { 
            message: "Message sent successfully to user",
            messageData: newMessage,
            userId: userId,
            messageType: type
          });
        } catch (error) {
          console.error('❌ Error sending support message:', error);
          return sendJson(res, 500, { message: "Error sending support message: " + error.message });
        }
      });
      return;
    }

    // Get all recent user messages for admin
    if (req.method === "GET" && url.pathname === "/admin/api/support/all-messages") {
      requireAdminAuth(req, res, () => {
        try {
          const dataDir = path.join(ROOT, "data");
          const allMessages = [];
          
          // Read all support files
          if (fs.existsSync(dataDir)) {
            const files = fs.readdirSync(dataDir).filter(file => file.startsWith('support_') && file.endsWith('.json'));
            
            files.forEach(file => {
              const userId = file.replace('support_', '').replace('.json', '');
              const supportFile = path.join(dataDir, file);
              
              try {
                const supportData = JSON.parse(fs.readFileSync(supportFile, "utf8"));
                const messages = supportData.messages || [];
                
                // Get user info
                const usersPath = path.join(ROOT, "data", "users.json");
                let userName = "Unknown User";
                let userEmail = "Unknown";
                
                if (fs.existsSync(usersPath)) {
                  const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
                  const user = users.find(u => u.id === userId);
                  if (user) {
                    userName = user.name;
                    userEmail = user.email;
                  }
                }
                
                // Add messages with user info
                messages.forEach(msg => {
                  allMessages.push({
                    ...msg,
                    userName: userName,
                    userEmail: userEmail,
                    userId: userId
                  });
                });
              } catch (error) {
                console.error(`Error reading support file ${file}:`, error);
              }
            });
          }
          
          // Sort by time (newest first)
          allMessages.sort((a, b) => b.time - a.time);
          
          return sendJson(res, 200, { 
            messages: allMessages.slice(0, 50), // Show last 50 messages
            total: allMessages.length
          });
        } catch (error) {
          console.error('Error fetching all support messages:', error);
          return sendJson(res, 500, { message: "Error fetching support messages" });
        }
      });
      return;
    }

    // Get all user requests (comprehensive)
    if (req.method === "GET" && url.pathname === "/admin/api/all-requests") {
      requireAdminAuth(req, res, () => {
        try {
          const usersPath = path.join(ROOT, "data", "users.json");
          let users = [];
          if (fs.existsSync(usersPath)) {
            users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
          }
          
          let allRequests = [];
          
          users.forEach(user => {
            const walletPath = path.join(ROOT, "data", `wallet_${user.id}.json`);
            const supportPath = path.join(ROOT, "data", `support_${user.id}.json`);
            
            let userData = {
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              requests: []
            };
            
            // Get wallet data (deposits, withdrawals, transactions)
            if (fs.existsSync(walletPath)) {
              try {
                const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
                
                // Add deposits
                if (wallet.recharges && wallet.recharges.length > 0) {
                  wallet.recharges.forEach(deposit => {
                    userData.requests.push({
                      type: 'deposit',
                      id: deposit.id,
                      amount: deposit.amount,
                      network: deposit.network,
                      status: deposit.status,
                      created: deposit.created,
                      completedAt: deposit.completedAt,
                      userName: user.name,
                      userEmail: user.email
                    });
                  });
                }
                
                // Add pending deposits
                if (wallet.pendingDeposits && wallet.pendingDeposits.length > 0) {
                  wallet.pendingDeposits.forEach(deposit => {
                    userData.requests.push({
                      type: 'pending_deposit',
                      id: deposit.id,
                      amount: deposit.amount,
                      network: deposit.network,
                      status: 'pending',
                      created: deposit.created,
                      userName: user.name,
                      userEmail: user.email
                    });
                  });
                }
                
                // Add withdrawals
                if (wallet.withdrawals && wallet.withdrawals.length > 0) {
                  wallet.withdrawals.forEach(withdrawal => {
                    userData.requests.push({
                      type: 'withdrawal',
                      id: withdrawal.id,
                      amount: withdrawal.amount,
                      network: withdrawal.network,
                      status: withdrawal.status,
                      created: withdrawal.created,
                      completedAt: withdrawal.completedAt,
                      userName: user.name,
                      userEmail: user.email
                    });
                  });
                }
                
                // Add transactions
                if (wallet.transactions && wallet.transactions.length > 0) {
                  wallet.transactions.forEach(transaction => {
                    userData.requests.push({
                      type: 'transaction',
                      id: transaction.id,
                      kind: transaction.kind,
                      title: transaction.title,
                      amount: transaction.amount,
                      asset: transaction.asset,
                      status: transaction.status,
                      created: transaction.created,
                      userName: user.name,
                      userEmail: user.email
                    });
                  });
                }
              } catch (e) {
                // Skip invalid wallet files
              }
            }
            
            // Get support messages
            if (fs.existsSync(supportPath)) {
              try {
                const support = JSON.parse(fs.readFileSync(supportPath, "utf8"));
                if (support.messages && support.messages.length > 0) {
                  support.messages.forEach(message => {
                    userData.requests.push({
                      type: 'support_message',
                      id: message.id,
                      message: message.message,
                      status: message.status,
                      created: message.created,
                      userName: user.name,
                      userEmail: user.email
                    });
                  });
                }
              } catch (e) {
                // Skip invalid support files
              }
            }
            
            if (userData.requests.length > 0) {
              allRequests.push(userData);
            }
          });
          
          // Sort by creation date (newest first)
          allRequests.forEach(userData => {
            userData.requests.sort((a, b) => (b.created || 0) - (a.created || 0));
          });
          
          return sendJson(res, 200, { requests: allRequests });
        } catch (error) {
          console.error('Error fetching all requests:', error);
          return sendJson(res, 500, { message: "Error fetching requests" });
        }
      });
    }

    // Get user links and profiles
    if (req.method === "GET" && url.pathname === "/admin/api/user-links") {
      requireAdminAuth(req, res, () => {
        try {
          const usersPath = path.join(ROOT, "data", "users.json");
          let users = [];
          if (fs.existsSync(usersPath)) {
            users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
          }
          
          let userLinks = [];
          
          users.forEach(user => {
            const walletPath = path.join(ROOT, "data", `wallet_${user.id}.json`);
            const supportPath = path.join(ROOT, "data", `support_${user.id}.json`);
            
            let userLink = {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role || 'user',
              createdAt: user.createdAt,
              lastLogin: user.lastLogin,
              status: user.status || 'active',
              links: {
                profile: `/admin/users/${user.id}`,
                wallet: walletPath,
                support: supportPath,
                transactions: `/admin/users/${user.id}/transactions`,
                deposits: `/admin/users/${user.id}/deposits`,
                withdrawals: `/admin/users/${user.id}/withdrawals`,
                messages: `/admin/users/${user.id}/messages`
              }
            };
            
            // Add wallet balance if available
            if (fs.existsSync(walletPath)) {
              try {
                const wallet = JSON.parse(fs.readFileSync(walletPath, "utf8"));
                userLink.balance = wallet.balance || 0;
                userLink.walletStatus = 'active';
              } catch (e) {
                userLink.walletStatus = 'error';
              }
            } else {
              userLink.walletStatus = 'not_found';
            }
            
            // Add support status if available
            if (fs.existsSync(supportPath)) {
              try {
                const support = JSON.parse(fs.readFileSync(supportPath, "utf8"));
                userLink.supportMessages = support.messages ? support.messages.length : 0;
                userLink.supportStatus = 'active';
              } catch (e) {
                userLink.supportStatus = 'error';
              }
            } else {
              userLink.supportStatus = 'no_messages';
            }
            
            userLinks.push(userLink);
          });
          
          return sendJson(res, 200, { users: userLinks });
        } catch (error) {
          console.error('Error fetching user links:', error);
          return sendJson(res, 500, { message: "Error fetching user links" });
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

          const usersPath = path.join(ROOT, "data", "users.json");
          if (fs.existsSync(usersPath)) {
            const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
            stats.total_users = users.length;
          }

          return sendJson(res, 200, stats);
        } catch (error) {
          console.error('Error fetching stats:', error);
          return sendJson(res, 500, { message: "Error fetching stats" });
        }
      });
      return;
    }

    // Serve admin panel files
    if (url.pathname.startsWith("/admin/") || url.pathname === "/") {
      return serveAdminFile(url.pathname, res);
    }

    return sendJson(res, 404, { message: "Not found" });
  } catch (err) {
    console.error('Server error:', err);
    return sendJson(res, 500, { message: "Server error", detail: String(err.message || err) });
  }
});

adminServer.listen(PORT, HOST, () => {
  ensureAdminUsersFile();
  ensureSiteConfigFile();
  console.log(`Admin Panel running at http://${HOST}:${PORT}`);
  console.log(`Default login: admin / admin123`);
});
