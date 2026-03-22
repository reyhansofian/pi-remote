/**
 * WebSocket bridge: connects browser clients to the PTY.
 *
 * Multiple clients share one PTY. Mobile clients take priority for terminal
 * sizing to avoid wide-screen output breaking mobile displays.
 */
import type { Server } from "node:http";
export declare function setupTerminalWebSocket(httpServer: Server): void;
//# sourceMappingURL=ws.d.ts.map