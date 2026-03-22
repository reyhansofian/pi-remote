/**
 * Discovery service: lists all active pi-remote sessions.
 *
 * Runs as a detached process on port 7008. The first pi-remote session
 * spawns it; subsequent sessions register against it. When the last
 * session deregisters, the service cleans up its Tailscale route and exits.
 *
 * Localhost API (no auth):
 *   GET  /api/token         → { token }
 *   GET  /api/sessions      → { sessions: [...] }
 *   POST /api/sessions      → register { sessionId, port, cwd }
 *   DELETE /api/sessions/:id → deregister (auto-shutdown when empty)
 *
 * Web UI (token-authed):
 *   GET / → session list (cards with cwd + relative time)
 */
export declare const DISCOVERY_PORT = 7008;
export declare function startDiscoveryService(): Promise<void>;
//# sourceMappingURL=discovery.d.ts.map