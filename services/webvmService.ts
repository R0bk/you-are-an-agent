type WebVMExecResult = {
    ok: boolean;
    output: string;
};

type Pending = {
    resolve: (v: any) => void;
    reject: (e: any) => void;
    timeout: number;
};

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
    }

    async boot(): Promise<void> {
        if (this.ready) return;
        if (this.bootPromise) return this.bootPromise;

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

    async executeShell(cmd: string): Promise<string> {
        await this.boot();
        const result = await this.request<WebVMExecResult>("webvm:exec", { cmd }, 60_000);
        if (!result.ok) throw new Error(result.output || "WebVM exec failed");
        return result.output;
    }

    async writeFile(path: string, content: string): Promise<void> {
        await this.boot();
        await this.request("webvm:writeFile", { path, content }, 60_000);
    }
}

export const webvmService = new WebVMService();


