/**
 * pi-remote: start pi inside a PTY and expose it over WebSocket for remote
 * browser/mobile access.
 *
 * Usage:
 *   import { startRemote } from "@noahsaso/pi-remote";
 *   await startRemote({ piPath: "/path/to/pi", args: ["-c"] });
 */
import { getAccessToken, getLocalUrl, getPort } from "./server.js";
export { getAccessToken, getLocalUrl, getPort };
export interface RemoteOptions {
    /**
     * Path to the pi binary (or any executable to run in the PTY).
     * When omitted, pi-remote tries to locate `pi` on PATH.
     */
    piPath?: string;
    /** Extra arguments forwarded to pi (e.g. ["-c", "--model", "sonnet"]) */
    args?: string[];
    /** Working directory for pi. Default: process.cwd() */
    cwd?: string;
    /** Environment variables forwarded to pi. Default: process.env */
    env?: Record<string, string>;
    /** Disable cloudflared tunnel */
    disableCloudflared?: boolean;
    /** Disable Tailscale serve */
    disableTailscale?: boolean;
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
export declare function startRemote(options?: RemoteOptions): Promise<() => void>;
//# sourceMappingURL=index.d.ts.map