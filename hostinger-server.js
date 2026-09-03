/**
 * Production server for Hostinger (VPS or Node.js hosting).
 * Uses the same API handler as Vercel: api/[...route].js
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const apiHandler = require("./api/[...route].js");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5608);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePath(urlPath) {
  let p = urlPath.split("?")[0];
  if (p === "/") return path.join(ROOT, "index.html");
  if (p === "/admin" || p === "/admin/") return path.join(ROOT, "admin", "index.html");
  const rel = p.replace(/^\//, "").replace(/\.\./g, "");
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function serveStatic(urlPath, res) {
  const filePath = safePath(urlPath);
  if (!filePath || !fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    const index = path.join(filePath, "index.html");
    if (!fs.existsSync(index)) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    return serveStatic(urlPath.replace(/\/?$/, "/index.html"), res);
  }
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  if (urlPath.startsWith("/admin")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, host: "hostinger", uptime: process.uptime() }));
      return;
    }

    if (pathname.startsWith("/api/") || pathname.startsWith("/admin/api/")) {
      await apiHandler(req, res);
      return;
    }

    serveStatic(pathname, res);
  } catch (err) {
    console.error("Request error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "Server error" }));
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bitunix (Hostinger) → http://${HOST}:${PORT}`);
  console.log(`MongoDB: ${process.env.MONGODB_URI ? "configured" : "NOT SET — add MONGODB_URI in .env"}`);
});
