/**
 * Cloudflared helpers: binary detection, quick tunnel lifecycle.
 * Quick tunnels provide public HTTPS URLs without authentication.
 */
export declare function findCloudflaredBin(): string | null;
/**
 * Start a cloudflared quick tunnel pointing at localhost:port.
 * Returns a promise that resolves with the public HTTPS URL.
 * The URL is parsed from cloudflared's stderr output.
 */
export declare function startCloudflaredTunnel(port: number): Promise<string>;
export declare function stopCloudflaredTunnel(): void;
export declare function getCloudflaredUrl(): string | null;
//# sourceMappingURL=cloudflared.d.ts.map