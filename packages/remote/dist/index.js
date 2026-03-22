/**
 * pi-remote: start pi inside a PTY and expose it over WebSocket for remote
 * browser/mobile access.
 *
 * Usage:
 *   import { startRemote } from "@noahsaso/pi-remote";
 *   await startRemote({ piPath: "/path/to/pi", args: ["-c"] });
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findCloudflaredBin, startCloudflaredTunnel, stopCloudflaredTunnel } from "./cloudflared.js";
import { DISCOVERY_PORT } from "./discovery.js";
import { killPty, onPtyExit, spawnInPty } from "./pty.js";
import { getAccessToken, getLocalUrl, getPort, setAccessToken, setCloudflaredUrl as setServerCloudflaredUrl, setTailscaleUrl as setServerTailscaleUrl, startServer, } from "./server.js";
import { findTailscaleBin, getTailscaleHostname, tailscaleServe, tailscaleServeOff } from "./tailscale.js";
import { setupTerminalWebSocket } from "./ws.js";
export { getAccessToken, getLocalUrl, getPort };
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const qrcodeTerminal = require("qrcode-terminal");
const DISCOVERY_URL = `http://127.0.0.1:${DISCOVERY_PORT}`;
// ---------- Discovery client ----------
async function fetchDiscovery(path, options) {
    try {
        return await fetch(`${DISCOVERY_URL}${path}`, options);
    }
    catch {
        return null;
    }
}
async function getDiscoveryToken() {
    const res = await fetchDiscovery("/api/token");
    if (!res?.ok)
        return null;
    const { token } = (await res.json());
    return token;
}
async function ensureDiscoveryService() {
    // Try to reach existing discovery service
    let token = await getDiscoveryToken();
    if (token) {
        process.stderr.write("\x1b[1;32m[discovery]\x1b[0m connected to existing service\n");
        return token;
    }
    // Spawn discovery service as detached process
    const entryPoint = join(__dirname, "discovery-main.js");
    process.stderr.write(`\x1b[1;32m[discovery]\x1b[0m spawning: ${entryPoint}\n`);
    const child = spawn(process.execPath, [entryPoint], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();
    // Poll until ready (max 5 seconds)
    for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 100));
        token = await getDiscoveryToken();
        if (token) {
            process.stderr.write("\x1b[1;32m[discovery]\x1b[0m service started\n");
            return token;
        }
    }
    throw new Error("Discovery service failed to start within 5 seconds");
}
async function registerSession(sessionId, port, cwd) {
    await fetchDiscovery("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, port, cwd }),
    });
}
async function deregisterSession(sessionId) {
    await fetchDiscovery(`/api/sessions/${sessionId}`, { method: "DELETE" });
}
// ---------- Session ID ----------
/** Generate a short session ID for the serve path */
function generateSessionId() {
    return cryptoRandomBytes(4).toString("hex"); // 8 hex chars
}
function renderTerminalQr(url) {
    let rendered = "";
    qrcodeTerminal.generate(url, { small: true }, (output) => {
        rendered = output;
    });
    return rendered;
}
function printRemoteAccessInfo(primaryUrl, lanUrl, tailscaleUrl, cloudflaredUrl) {
    process.stderr.write(`\n\x1b[1;36m[remote]\x1b[0m Scan or open: ${primaryUrl}\n`);
    if (cloudflaredUrl && cloudflaredUrl !== primaryUrl) {
        process.stderr.write(`\x1b[1;36m[remote]\x1b[0m Cloudflare: ${cloudflaredUrl}\n`);
    }
    if (tailscaleUrl && tailscaleUrl !== primaryUrl) {
        process.stderr.write(`\x1b[1;36m[remote]\x1b[0m Tailscale: ${tailscaleUrl}\n`);
    }
    if (lanUrl !== primaryUrl) {
        process.stderr.write(`\x1b[1;36m[remote]\x1b[0m LAN: ${lanUrl}\n`);
    }
    const qr = renderTerminalQr(primaryUrl);
    if (qr) {
        process.stderr.write(`${qr}\n`);
    }
}
/**
 * Resolve the `pi` binary path.
 * Tries options.piPath first, then searches PATH.
 */
function resolvePiPath(piPath) {
    if (piPath)
        return piPath;
    for (const cmd of ["which pi", "command -v pi"]) {
        try {
            const result = execSync(cmd, {
                encoding: "utf-8",
                env: process.env,
            }).trim();
            if (result && !result.includes("\n"))
                return result;
        }
        catch {
            // try next
        }
    }
    throw new Error('Could not find "pi" binary. Pass piPath explicitly or ensure pi is on PATH.');
}
/**
 * Start a remote pi session:
 *  1. Ensure the discovery service is running and get the shared token
 *  2. Start the HTTP server (static web UI + /api/local-url)
 *  3. Attach the WebSocket terminal bridge
 *  4. Register this session with the discovery service
 *  5. Set up Tailscale serve for this session's subpath
 *  6. Pass remote URL to pi via PI_REMOTE_URL env var
 *  7. Spawn pi inside a PTY with local terminal attached
 *
 * The extension (loaded by pi) reads PI_REMOTE_URL and shows
 * a persistent widget with the remote URL in the TUI.
 *
 * Returns a cleanup function that kills the PTY and stops the server.
 */
export async function startRemote(options = {}) {
    const piPath = resolvePiPath(options.piPath);
    const sessionId = generateSessionId();
    const cwd = options.cwd ?? process.cwd();
    // 1. Ensure discovery service is running and get shared token
    const token = await ensureDiscoveryService();
    setAccessToken(token);
    // 2. Start HTTP server (so the port is known before printing the URL)
    const httpServer = await startServer();
    setupTerminalWebSocket(httpServer);
    const port = getPort();
    const url = getLocalUrl();
    // 3. Register this session with the discovery service
    await registerSession(sessionId, port, cwd);
    // 4. Try cloudflared quick tunnel (public internet access)
    let cloudflaredUrl = null;
    if (!options.disableCloudflared) {
        const cfBin = findCloudflaredBin();
        process.stderr.write(`\x1b[1;33m[cloudflared]\x1b[0m binary: ${cfBin ?? "not found"}\n`);
        if (cfBin) {
            try {
                process.stderr.write(`\x1b[1;33m[cloudflared]\x1b[0m starting quick tunnel for localhost:${port}...\n`);
                const rawCfUrl = await startCloudflaredTunnel(port);
                cloudflaredUrl = `${rawCfUrl}?token=${token}`;
                setServerCloudflaredUrl(cloudflaredUrl);
                process.stderr.write(`\x1b[1;33m[cloudflared]\x1b[0m url: ${cloudflaredUrl}\n`);
            }
            catch (err) {
                process.stderr.write(`\x1b[1;33m[cloudflared]\x1b[0m failed: ${err.message}\n`);
            }
        }
    }
    // 5. Try to set up Tailscale serve for this session's subpath
    const tsBin = !options.disableTailscale ? findTailscaleBin() : null;
    let tailscaleUrl = null;
    const tsServePath = `/pi/${sessionId}/`;
    if (!options.disableTailscale) {
        process.stderr.write(`\x1b[1;35m[tailscale]\x1b[0m binary: ${tsBin ?? "not found"}\n`);
        if (tsBin) {
            const hostname = getTailscaleHostname(tsBin);
            process.stderr.write(`\x1b[1;35m[tailscale]\x1b[0m hostname: ${hostname ?? "not found"}\n`);
            if (hostname) {
                const serveCmd = `${JSON.stringify(tsBin)} serve --bg --https 443 --set-path ${JSON.stringify(tsServePath)} http://localhost:${port}`;
                process.stderr.write(`\x1b[1;35m[tailscale]\x1b[0m running: ${serveCmd}\n`);
                const served = tailscaleServe(tsBin, port, tsServePath);
                process.stderr.write(`\x1b[1;35m[tailscale]\x1b[0m serve result: ${served ? "ok" : "failed"}\n`);
                if (served) {
                    tailscaleUrl = `https://${hostname}${tsServePath}?token=${token}`;
                    setServerTailscaleUrl(tailscaleUrl);
                    process.stderr.write(`\x1b[1;35m[tailscale]\x1b[0m url: ${tailscaleUrl}\n`);
                }
            }
        }
    }
    // 6. Build discovery URL for the TUI widget
    let discoveryUrl = null;
    if (tsBin && tailscaleUrl) {
        // Extract base Tailscale URL (hostname) from the session URL
        const hostname = getTailscaleHostname(tsBin);
        if (hostname) {
            discoveryUrl = `https://${hostname}/pi/?token=${token}`;
        }
    }
    // 7. Pass the remote URL to pi so the extension can display it in the TUI
    const restartFile = join(tmpdir(), `pi-remote-restart-${process.pid}.json`);
    const piEnv = {
        ...(options.env ?? process.env),
        PI_REMOTE_URL: url,
        PI_REMOTE_RESTART_FILE: restartFile,
        ...(cloudflaredUrl ? { PI_REMOTE_CLOUDFLARED_URL: cloudflaredUrl } : {}),
        ...(tailscaleUrl ? { PI_REMOTE_TAILSCALE_URL: tailscaleUrl } : {}),
        ...(discoveryUrl ? { PI_REMOTE_DISCOVERY_URL: discoveryUrl } : {}),
    };
    printRemoteAccessInfo(cloudflaredUrl ?? tailscaleUrl ?? url, url, tailscaleUrl, cloudflaredUrl);
    // 8. Spawn pi in the PTY with local terminal attached
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 30;
    await spawnInPty({
        command: piPath,
        args: options.args ?? [],
        cwd,
        env: piEnv,
        cols,
        rows,
        attachLocal: true,
    });
    // Exit when pi exits — delay briefly so WebSocket can send the exit message to browsers
    onPtyExit((exitCode) => {
        setTimeout(async () => {
            // Full remote cleanup
            stopCloudflaredTunnel();
            if (tsBin && tailscaleUrl)
                tailscaleServeOff(tsBin, tsServePath);
            await deregisterSession(sessionId);
            httpServer.close();
            // Check if the extension requested a restart without remote
            if (existsSync(restartFile)) {
                try {
                    const config = JSON.parse(readFileSync(restartFile, "utf-8"));
                    unlinkSync(restartFile);
                    const result = spawnSync(config.command, config.args, {
                        stdio: "inherit",
                        cwd: config.cwd ?? process.cwd(),
                        env: config.env,
                    });
                    process.exit(result.status ?? 1);
                }
                catch {
                    unlinkSync(restartFile);
                }
            }
            process.exit(exitCode);
        }, 500);
    });
    // Register cleanup
    const cleanup = () => {
        stopCloudflaredTunnel();
        if (tsBin && tailscaleUrl)
            tailscaleServeOff(tsBin, tsServePath);
        deregisterSession(sessionId).catch(() => { });
        killPty();
        httpServer.close();
    };
    process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        cleanup();
        process.exit(0);
    });
    return cleanup;
}
//# sourceMappingURL=index.js.map