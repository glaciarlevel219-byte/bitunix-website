/**
 * Production server for Hostinger (VPS or Node.js hosting).
 * Uses the same API handler as Vercel: api/[...route].js
 */
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("./scripts/load-env.js");

loadEnvFile(path.join(__dirname, ".env"));

const apiHandler = require("./api/[...route].js");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5608);
const ROOT = __dirname;
const API_ORIGIN =
  process.env.API_ORIGIN ||
  process.env.VERCEL_API_ORIGIN ||
  "https://bitunix-website-glaciars-projects-a1c0ea7e.vercel.app";
// Hostinger VPS: always use local API handler (MongoDB optional; invalid URI falls back safely).
const USE_LOCAL_API = process.env.API_PROXY !== "1";

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

function proxyToOrigin(req, res) {
  const incoming = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const target = new URL(incoming.pathname + incoming.search, API_ORIGIN);
  const lib = target.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;

  const proxyReq = lib.request(
    target,
    { method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    console.error("API proxy error:", err.message);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "API temporarily unavailable" }));
    }
  });
  req.pipe(proxyReq);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          host: "hostinger",
          api: USE_LOCAL_API ? "local" : "proxy",
          uptime: process.uptime(),
        })
      );
      return;
    }

    if (pathname.startsWith("/api/") || pathname.startsWith("/admin/api/")) {
      if (USE_LOCAL_API) {
        await apiHandler(req, res);
      } else {
        proxyToOrigin(req, res);
      }
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
  if (USE_LOCAL_API) {
    console.log("API: local (MongoDB configured)");
  } else {
    console.log(`API: proxy → ${API_ORIGIN}`);
  }
});
