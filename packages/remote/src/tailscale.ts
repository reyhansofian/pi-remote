/**
 * Shared Tailscale helpers: binary detection, hostname lookup, serve management.
 * Used by both the discovery service and individual session startup.
 */

import { execSync } from "node:child_process";
import { statSync } from "node:fs";

const TAILSCALE_PATHS = [
	"/usr/local/bin/tailscale",
	"/usr/bin/tailscale",
	"/Applications/Tailscale.app/Contents/MacOS/Tailscale",
];

export function findTailscaleBin(): string | null {
	for (const cmd of ["which tailscale", "command -v tailscale"]) {
		try {
			const result = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
			if (result) return result;
		} catch {}
	}
	for (const p of TAILSCALE_PATHS) {
		try {
			if (statSync(p)) return p;
		} catch {}
	}
	return null;
}

export function getTailscaleHostname(bin: string): string | null {
	try {
		const json = execSync(`${JSON.stringify(bin)} status --json`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const dnsName: string = JSON.parse(json)?.Self?.DNSName;
		return dnsName?.replace(/\.$/, "") ?? null;
	} catch {
		return null;
	}
}

export function tailscaleServe(bin: string, port: number, path: string): boolean {
	try {
		execSync(
			`${JSON.stringify(bin)} serve --bg --https 443 --set-path ${JSON.stringify(path)} http://localhost:${port}`,
			{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		);
		return true;
	} catch {
		return false;
	}
}

export function tailscaleServeOff(bin: string, path: string): void {
	try {
		execSync(`${JSON.stringify(bin)} serve --https 443 --set-path ${JSON.stringify(path)} off`, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch {}
}
