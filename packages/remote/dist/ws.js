/**
 * WebSocket bridge: connects browser clients to the PTY.
 *
 * Multiple clients share one PTY. Mobile clients take priority for terminal
 * sizing to avoid wide-screen output breaking mobile displays.
 */
import { WebSocketServer } from "ws";
import { getOutputBuffer, getPtyState, onPtyData, onPtyExit, resizePty, writeToPty } from "./pty.js";
import { getAccessToken } from "./server.js";
function send(ws, msg) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}
export function setupTerminalWebSocket(httpServer) {
    const wss = new WebSocketServer({ noServer: true });
    // Per-client state
    let activeWs = null;
    const clientSizes = new Map();
    const mobileClients = new Set();
    const getMobileSize = () => {
        for (const mws of mobileClients) {
            if (mws.readyState === mws.OPEN) {
                const size = clientSizes.get(mws);
                if (size)
                    return size;
            }
        }
        return null;
    };
    httpServer.on("upgrade", (req, socket, head) => {
        const parsed = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (parsed.pathname === "/ws/terminal") {
            // Require valid token for WebSocket connections
            const token = parsed.searchParams.get("token");
            if (token !== getAccessToken()) {
                socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
                socket.destroy();
                return;
            }
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
        else {
            socket.destroy();
        }
    });
    wss.on("connection", (ws) => {
        // Send current PTY state to the new client
        const state = getPtyState();
        send(ws, { type: "state", ...state });
        // Replay history buffer so late joiners see past output
        const buffer = getOutputBuffer();
        if (buffer) {
            send(ws, { type: "data", data: buffer });
        }
        // Forward PTY output to this client
        const removeDataListener = onPtyData((data) => {
            send(ws, { type: "data", data });
        });
        const removeExitListener = onPtyExit((exitCode) => {
            send(ws, { type: "exit", exitCode });
        });
        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "input") {
                    // The sender becomes the active client
                    if (activeWs !== ws) {
                        activeWs = ws;
                        // Apply sizing: mobile takes priority
                        const mSize = getMobileSize();
                        if (mSize) {
                            resizePty(mSize.cols, mSize.rows);
                        }
                        else {
                            const size = clientSizes.get(ws);
                            if (size)
                                resizePty(size.cols, size.rows);
                        }
                    }
                    writeToPty(msg.data);
                }
                else if (msg.type === "resize") {
                    clientSizes.set(ws, { cols: msg.cols, rows: msg.rows });
                    if (msg.mobile)
                        mobileClients.add(ws);
                    // Mobile resize always applies.
                    // PC resize applies only when no mobile client is connected.
                    if (msg.mobile) {
                        resizePty(msg.cols, msg.rows);
                    }
                    else if (mobileClients.size === 0 && (activeWs === ws || activeWs === null)) {
                        activeWs = ws;
                        resizePty(msg.cols, msg.rows);
                    }
                }
            }
            catch {
                // ignore malformed messages
            }
        });
        ws.on("close", () => {
            removeDataListener();
            removeExitListener();
            clientSizes.delete(ws);
            mobileClients.delete(ws);
            if (activeWs === ws) {
                activeWs = null;
                // Hand control to a remaining client
                const mSize = getMobileSize();
                if (mSize) {
                    resizePty(mSize.cols, mSize.rows);
                }
                else {
                    for (const [remainWs, size] of clientSizes) {
                        if (remainWs.readyState === remainWs.OPEN) {
                            activeWs = remainWs;
                            resizePty(size.cols, size.rows);
                            break;
                        }
                    }
                }
            }
        });
    });
}
//# sourceMappingURL=ws.js.map