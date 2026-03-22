/**
 * HTTP server: serves the web UI, handles token auth for remote clients,
 * and exposes /api/local-url for generating the shareable LAN link.
 */
import { type Server } from "node:http";
export declare function setAccessToken(token: string): void;
export declare function getAccessToken(): string;
export declare function setTailscaleUrl(url: string): void;
export declare function getTailscaleUrl(): string | null;
export declare function setCloudflaredUrl(url: string): void;
export declare function getCloudflaredUrl(): string | null;
export declare function getPort(): number;
export declare function getLocalUrl(): string;
export declare function startServer(): Promise<Server>;
export declare function stopServer(): void;
//# sourceMappingURL=server.d.ts.map