/**
 * Shared Tailscale helpers: binary detection, hostname lookup, serve management.
 * Used by both the discovery service and individual session startup.
 */
export declare function findTailscaleBin(): string | null;
export declare function getTailscaleHostname(bin: string): string | null;
export declare function tailscaleServe(bin: string, port: number, path: string): boolean;
export declare function tailscaleServeOff(bin: string, path: string): void;
//# sourceMappingURL=tailscale.d.ts.map