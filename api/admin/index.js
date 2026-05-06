// Vercel Serverless Handler for Admin Panel
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// JWT Secret for token signing
const JWT_SECRET = process.env.JWT_SECRET || 'bitunix-admin-secret-key-2024';

// Paths
const ROOT = path.join(process.cwd(), '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const ADMIN_USERS_FILE = path.join(DATA_DIR, 'admin_users.json');

// Helper functions
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

function readAdminUsers() {
  try {
    if (!fs.existsSync(ADMIN_USERS_FILE)) {
      // Create default admin
      const defaultAdmin = {
        id: crypto.randomUUID(),
        username: 'admin',
        passwordHash: hashPassword('admin123'),
        role: 'super_admin',
        createdAt: Date.now()
      };
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(ADMIN_USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
      return [defaultAdmin];
    }
    return JSON.parse(fs.readFileSync(ADMIN_USERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

// CORS headers
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Main handler
module.exports = async (req, res) => {
  setCORS(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  try {
    // Admin login
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const { username, password } = req.body || {};
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password required' });
      }
      
      const users = readAdminUsers();
      const user = users.find(u => u.username === username);
      
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const token = signToken({
        id: user.id,
        username: user.username,
        role: user.role,
        iat: Date.now()
      });
      
      return res.status(200).json({
        token,
        user: { id: user.id, username: user.username, role: user.role }
      });
    }
    
    // Verify token
    if (req.method === 'GET' && url.pathname === '/api/admin/verify') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const decoded = verifyToken(token);
      
      if (!decoded) {
        return res.status(401).json({ message: 'Invalid token' });
      }
      
      return res.status(200).json({ user: decoded });
    }
    
    // Default response
    return res.status(200).json({ message: 'Admin API working' });
    
  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
