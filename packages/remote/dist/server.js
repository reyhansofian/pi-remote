/**
 * HTTP server: serves the web UI, handles token auth for remote clients,
 * and exposes /api/local-url for generating the shareable LAN link.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const START_PORT = 7009;
const MAX_PORT = 7099;
const HOST = "0.0.0.0";
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
};
/** Shared access token — set by index.ts from the discovery service. */
let ACCESS_TOKEN = "";
export function setAccessToken(token) {
    ACCESS_TOKEN = token;
}
export function getAccessToken() {
    return ACCESS_TOKEN;
}
let server = null;
let actualPort = START_PORT;
let tailscaleUrl = null;
export function setTailscaleUrl(url) {
    tailscaleUrl = url;
}
export function getTailscaleUrl() {
    return tailscaleUrl;
}
let cloudflaredUrl = null;
export function setCloudflaredUrl(url) {
    cloudflaredUrl = url;
}
export function getCloudflaredUrl() {
    return cloudflaredUrl;
}
export function getPort() {
    return actualPort;
}
export function getLocalUrl() {
    const nets = networkInterfaces();
    let localIp = "127.0.0.1";
    outer: for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces ?? []) {
            if (iface.family === "IPv4" && !iface.internal) {
                localIp = iface.address;
                break outer;
            }
        }
    }
    return `http://${localIp}:${actualPort}?token=${ACCESS_TOKEN}`;
}
/** Resolve the dist/web directory shipped with the package */
function getWebDir() {
    // In built dist/: web assets are in ../web-dist (copied during build)
    // In dev (src/): same relative path works because we build web first
    return join(__dirname, "..", "web-dist");
}
function styledErrorPage(title, message) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>pi remote</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0a0a0a;color:#d4d4d4;font-family:system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center}
.card{background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:24px 28px;max-width:300px;width:90%;text-align:center}
h2{margin-bottom:8px;font-size:16px;color:#e0e0e0}
p{font-size:12px;color:#888}
</style>
</head>
<body>
<div class="card">
<h2>${title}</h2>
<p>${message}</p>
</div>
</body>
</html>`;
}
async function handleRequest(req, res) {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const url = parsedUrl.pathname;
    const method = req.method ?? "GET";
    // WebSocket upgrade is handled elsewhere
    if (url === "/ws/terminal")
        return;
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }
    // Token auth: static assets and the SPA shell are exempt (auth enforced at WebSocket + API level)
    const isStaticAsset = url.startsWith("/assets/") || url === "/favicon.ico";
    const isSpaPage = url === "/" || url === "/index.html";
    if (!isStaticAsset && !isSpaPage) {
        const urlToken = parsedUrl.searchParams.get("token");
        if (urlToken !== ACCESS_TOKEN) {
            res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
            res.end(styledErrorPage("Access denied", "Invalid or missing access token."));
            return;
        }
    }
    // API: return the LAN URL with token (for QR code generation in the UI)
    if (url === "/api/local-url" && method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: getLocalUrl(), tailscaleUrl: getTailscaleUrl(), cloudflaredUrl: getCloudflaredUrl() }));
        return;
    }
    // Static file serving from web-dist/
    if (method === "GET") {
        const webDir = getWebDir();
        const filePath = url === "/" ? "/index.html" : url.split("?")[0];
        const fullPath = join(webDir, filePath);
        if (existsSync(fullPath) && statSync(fullPath).isFile()) {
            const content = readFileSync(fullPath);
            const ct = MIME[extname(filePath)] ?? "application/octet-stream";
            res.writeHead(200, { "Content-Type": ct });
            res.end(content);
            return;
        }
        // SPA fallback
        const indexPath = join(webDir, "index.html");
        if (existsSync(indexPath)) {
            const html = readFileSync(indexPath, "utf-8");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
            return;
        }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(styledErrorPage("No session found", "This remote session does not exist or has ended."));
}
export function startServer() {
    return new Promise((resolve, reject) => {
        function tryListen(port) {
            if (port > MAX_PORT) {
                reject(new Error(`No available port between ${START_PORT} and ${MAX_PORT}`));
                return;
            }
            // Probe whether the port is free on 127.0.0.1 first
            const probe = createConnection({ host: "127.0.0.1", port });
            probe.on("connect", () => {
                probe.destroy();
                tryListen(port + 1);
            });
            probe.on("error", () => {
                probe.destroy();
                const httpServer = createServer(handleRequest);
                httpServer.listen(port, HOST, () => {
                    server = httpServer;
                    actualPort = port;
                    resolve(httpServer);
                });
                httpServer.on("error", (err) => {
                    if (err.code === "EADDRINUSE") {
                        tryListen(port + 1);
                    }
                    else {
                        reject(err);
                    }
                });
            });
        }
        tryListen(START_PORT);
    });
}
export function stopServer() {
    if (server) {
        server.close();
        server = null;
    }
}
//# sourceMappingURL=server.js.map