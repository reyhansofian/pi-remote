/**
 * Cloudflared helpers: binary detection, quick tunnel lifecycle.
 * Quick tunnels provide public HTTPS URLs without authentication.
 */
import { execSync, spawn } from "node:child_process";
import { statSync } from "node:fs";
const CLOUDFLARED_PATHS = ["/usr/local/bin/cloudflared", "/usr/bin/cloudflared"];
let tunnelProcess = null;
let tunnelUrl = null;
export function findCloudflaredBin() {
    for (const cmd of ["which cloudflared", "command -v cloudflared"]) {
        try {
            const result = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
            if (result)
                return result;
        }
        catch { }
    }
    for (const p of CLOUDFLARED_PATHS) {
        try {
            if (statSync(p))
                return p;
        }
        catch { }
    }
    return null;
}
/**
 * Start a cloudflared quick tunnel pointing at localhost:port.
 * Returns a promise that resolves with the public HTTPS URL.
 * The URL is parsed from cloudflared's stderr output.
 */
export function startCloudflaredTunnel(port) {
    return new Promise((resolve, reject) => {
        if (tunnelProcess) {
            reject(new Error("Cloudflared tunnel already running"));
            return;
        }
        const bin = findCloudflaredBin();
        if (!bin) {
            reject(new Error("cloudflared binary not found"));
            return;
        }
        const proc = spawn(bin, ["tunnel", "--url", `http://localhost:${port}`], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        tunnelProcess = proc;
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                reject(new Error("Timed out waiting for cloudflared tunnel URL (30s)"));
            }
        }, 30_000);
        const onData = (data) => {
            const text = data.toString();
            const urlMatch = text.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/);
            if (urlMatch && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                tunnelUrl = urlMatch[1];
                resolve(tunnelUrl);
            }
        };
        // cloudflared outputs the URL to stderr
        proc.stderr?.on("data", onData);
        proc.stdout?.on("data", onData);
        proc.on("error", (err) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                tunnelProcess = null;
                reject(err);
            }
        });
        proc.on("exit", (code) => {
            tunnelProcess = null;
            tunnelUrl = null;
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(new Error(`cloudflared exited with code ${code}`));
            }
        });
    });
}
export function stopCloudflaredTunnel() {
    if (tunnelProcess) {
        try {
            tunnelProcess.kill();
        }
        catch {
            // ignore
        }
        tunnelProcess = null;
        tunnelUrl = null;
    }
}
export function getCloudflaredUrl() {
    return tunnelUrl;
}
//# sourceMappingURL=cloudflared.js.map