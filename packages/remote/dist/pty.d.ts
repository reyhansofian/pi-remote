/**
 * PTY management: spawn a process inside a pseudo-terminal and expose
 * data/exit listeners plus resize/write/kill controls.
 */
export interface PtyState {
    running: boolean;
    exitCode: number | null;
}
export type PtyDataListener = (data: string) => void;
export type PtyExitListener = (exitCode: number) => void;
export interface SpawnOptions {
    /** Command to run inside the pty */
    command: string;
    /** Arguments for the command */
    args?: string[];
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env?: Record<string, string>;
    /** Initial terminal columns (default: 120) */
    cols?: number;
    /** Initial terminal rows (default: 30) */
    rows?: number;
    /** If true, attach local stdin/stdout to the PTY (for local terminal interaction) */
    attachLocal?: boolean;
}
export declare function spawnInPty(options: SpawnOptions): Promise<void>;
export declare function writeToPty(data: string): void;
export declare function resizePty(cols: number, rows: number): void;
export declare function killPty(): void;
export declare function onPtyData(cb: PtyDataListener): () => void;
export declare function onPtyExit(cb: PtyExitListener): () => void;
export declare function getPtyState(): PtyState;
export declare function getOutputBuffer(): string;
//# sourceMappingURL=pty.d.ts.map