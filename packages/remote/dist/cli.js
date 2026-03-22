#!/usr/bin/env node
/**
 * pi-remote CLI entry point.
 *
 * Usage:
 *   pi-remote [-- <pi-args...>]
 *   pi-remote --pi-path /custom/pi [-- <pi-args...>]
 *   pi-remote --no-cloudflared [-- <pi-args...>]
 *   pi-remote --no-tailscale [-- <pi-args...>]
 */
import { startRemote } from "./index.js";
const argv = process.argv.slice(2);
let piPath;
let disableCloudflared = false;
let disableTailscale = false;
let extraArgs = [];
// Parse --pi-path <path>
const piPathIdx = argv.indexOf("--pi-path");
if (piPathIdx !== -1 && piPathIdx + 1 < argv.length) {
    piPath = argv[piPathIdx + 1];
    argv.splice(piPathIdx, 2);
}
// Parse --no-cloudflared
const noCfIdx = argv.indexOf("--no-cloudflared");
if (noCfIdx !== -1) {
    disableCloudflared = true;
    argv.splice(noCfIdx, 1);
}
// Parse --no-tailscale
const noTsIdx = argv.indexOf("--no-tailscale");
if (noTsIdx !== -1) {
    disableTailscale = true;
    argv.splice(noTsIdx, 1);
}
// Everything after -- is forwarded to pi
const dashDash = argv.indexOf("--");
if (dashDash !== -1) {
    extraArgs = argv.slice(dashDash + 1);
}
startRemote({ piPath, args: extraArgs, disableCloudflared, disableTailscale }).catch((err) => {
    process.stderr.write(`pi-remote: ${err.message}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map