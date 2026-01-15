type WebVMExecResult = {
    ok: boolean;
    output: string;
};

type Pending = {
    resolve: (v: any) => void;
    reject: (e: any) => void;
    timeout: number;
};

export type BootStage =
    | 'idle'
    | 'loading-iframe'
    | 'booting-vm'
    | 'ready';

type BootStageListener = (stage: BootStage) => void;

/**
 * Bridge to a WebVM instance running inside an iframe.
 * Communicates via window.postMessage.
 *
 * Requires `webvm-main` to include the embed message handler (we patch it in this repo).
 */
class WebVMService {
    private iframe: HTMLIFrameElement | null = null;
    private ready = false;
    private pending = new Map<string, Pending>();
    private bootPromise: Promise<void> | null = null;
    private currentStage: BootStage = 'idle';
    private stageListeners = new Set<BootStageListener>();

    /** Subscribe to boot stage changes */
    onStageChange(listener: BootStageListener): () => void {
        this.stageListeners.add(listener);
        // Immediately fire current stage
        listener(this.currentStage);
        return () => this.stageListeners.delete(listener);
    }

    private setStage(stage: BootStage) {
        this.currentStage = stage;
        for (const listener of this.stageListeners) {
            listener(stage);
        }
    }

    getStage(): BootStage {
        return this.currentStage;
    }

    constructor() {
        window.addEventListener("message", (ev) => this.onMessage(ev));
    }

    getEmbedUrl(): string {
        const q = new URLSearchParams(window.location.search);
        const override = q.get("webvm");
        if (override) return override;

        // Single-service mode: serve WebVM from the same Vite dev server under /webvm/
        // after running `npm run webvm:export` (copies `webvm-main/build` -> `public/webvm`).
        // Use an explicit file path because Vite dev treats `/webvm` (no trailing slash) as an SPA route.
        return `${window.location.origin}/webvm/index.html`;
    }

    attachIframe(iframe: HTMLIFrameElement | null) {
        this.iframe = iframe;
        if (iframe && this.currentStage === 'idle') {
            this.setStage('loading-iframe');
        }
    }

    async boot(): Promise<void> {
        if (this.ready) {
            this.setStage('ready');
            return;
        }
        if (this.bootPromise) return this.bootPromise;

        // Transition to booting state when we start waiting
        this.setStage('booting-vm');

        this.bootPromise = new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                reject(
                    new Error(
                        "WebVM boot timeout. Run `npm run webvm:export` once (to place WebVM under /webvm/), then refresh. Or pass ?webvm=<url>."
                    )
                );
            }, 60_000);

            const check = () => {
                if (this.ready) {
                    window.clearTimeout(timeout);
                    this.setStage('ready');
                    resolve();
                } else {
                    window.setTimeout(check, 250);
                }
            };
            check();
        });

        return this.bootPromise;
    }

    private post(msg: any) {
        const win = this.iframe?.contentWindow;
        if (!win) throw new Error("WebVM iframe not attached");
        win.postMessage(msg, "*");
    }

    private request<T = any>(type: string, payload: any, timeoutMs = 30_000): Promise<T> {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return new Promise<T>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`WebVM request timeout: ${type}`));
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timeout });
            this.post({ type, id, ...payload });
        });
    }

    private onMessage(ev: MessageEvent) {
        const data = ev.data;
        if (!data || typeof data !== "object") return;

        if (data.type === "webvm:ready") {
            this.ready = true;
            return;
        }

        const id = data.id;
        if (!id || typeof id !== "string") return;

        const pending = this.pending.get(id);
        if (!pending) return;

        window.clearTimeout(pending.timeout);
        this.pending.delete(id);

        if (data.type === "webvm:result") {
            pending.resolve(data.result);
        } else if (data.type === "webvm:error") {
            pending.reject(new Error(data.error || "WebVM error"));
        }
    }

    private async requestWithRetry<T = any>(
        type: string,
        payload: any,
        timeoutMs = 30_000,
        maxRetries = 5,
        retryDelayMs = 500
    ): Promise<T> {
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.request<T>(type, payload, timeoutMs);
            } catch (e) {
                lastError = e as Error;
                // Only retry on "busy" errors
                if (lastError.message.includes("busy")) {
                    console.log(`WebVM busy, retrying in ${retryDelayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(r => setTimeout(r, retryDelayMs));
                    continue;
                }
                throw e;
            }
        }
        throw lastError || new Error("WebVM request failed after retries");
    }

    /**
     * Clean up terminal output by removing:
     * - ANSI escape codes
     * - Trailing shell prompts (user@host:~$, [user@host ~]$, etc.)
     * - The echoed command itself from the start
     */
    private cleanOutput(raw: string, cmd: string): string {
        // Remove ANSI escape codes
        let cleaned = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

        // Remove carriage returns
        cleaned = cleaned.replace(/\r/g, '');

        // Remove the echoed command from the start (command + newline)
        const cmdLine = cmd.trim();
        if (cleaned.startsWith(cmdLine)) {
            cleaned = cleaned.slice(cmdLine.length);
        }
        // Also try with \n prefix in case there's leading whitespace
        cleaned = cleaned.replace(new RegExp(`^\\s*${cmdLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`), '');

        // Remove trailing shell prompts (various formats)
        // Matches: user@host:~$ , [user@host ~]$ , bash-5.1$ , etc.
        cleaned = cleaned.replace(/\n?[\w-]*@[\w-]*:[~\/\w]*\$\s*$/g, '');
        cleaned = cleaned.replace(/\n?\[[\w@\s~\/-]+\]\$\s*$/g, '');
        cleaned = cleaned.replace(/\n?bash-[\d.]+\$\s*$/g, '');
        cleaned = cleaned.replace(/\n?[a-z]+@[a-z]+:.*\$\s*$/gi, '');

        // Trim whitespace
        cleaned = cleaned.trim();

        return cleaned;
    }

    async executeShell(cmd: string): Promise<string> {
        await this.boot();
        const result = await this.requestWithRetry<WebVMExecResult>("webvm:exec", { cmd }, 60_000);
        if (!result.ok) throw new Error(result.output || "WebVM exec failed");
        return this.cleanOutput(result.output, cmd);
    }

    async writeFile(path: string, content: string): Promise<void> {
        await this.boot();
        await this.requestWithRetry("webvm:writeFile", { path, content }, 60_000);
    }
}

export const webvmService = new WebVMService();


