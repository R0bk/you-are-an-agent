declare global {
    interface Window {
        V86Starter: any;
        V86: any;
    }
}

// Dynamically load V86
// Load v86 from the locally served files in Vite's `public/` directory.
// (Anything in `public/` is available at the site root, e.g. `/libv86.js`.)
// v86 attaches `V86Starter` or `V86` to `window`; we accept either.
const loadV86 = async (): Promise<any> => {
    if (window.V86Starter) return window.V86Starter;
    if (window.V86) return window.V86;

    console.log("Fetching V86 source...");
    
    try {
        // Some builds of `libv86.js` decide they're in a Node-like environment if `process` exists,
        // and then call `global.setImmediate(...)`. In Vite/dev setups `process` can be present,
        // but `global`/`setImmediate` are not, causing:
        //   ReferenceError: global is not defined
        //
        // We inject a tiny classic-script shim BEFORE loading libv86 to force the browser scheduling path.
        if (!document.getElementById("v86-browser-shim")) {
            const shim = document.createElement("script");
            shim.id = "v86-browser-shim";
            shim.type = "text/javascript";
            shim.textContent = [
                // Ensure these are true globals (bindings), not just window properties.
                "var global = window;",
                "var process = undefined;",
                // Provide a fallback in case a code path still tries to use setImmediate.
                "if(typeof window.setImmediate !== 'function'){",
                "  window.setImmediate = function(fn){",
                "    var args = Array.prototype.slice.call(arguments, 1);",
                "    return window.setTimeout(function(){ fn && fn.apply(null, args); }, 0);",
                "  };",
                "}",
                "if(typeof window.clearImmediate !== 'function'){",
                "  window.clearImmediate = function(id){ window.clearTimeout(id); };",
                "}",
            ].join("\n");
            document.head.appendChild(shim);
        }

        console.log("Creating Script tag for V86...");

        const scriptUrl = "/libv86.js";
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = false;

        await new Promise((resolve, reject) => {
            script.onload = () => {
                console.log("V86 Script Parsed & Executed");
                resolve(null);
            };
            script.onerror = () => reject(new Error(`V86 Script Failed to Load: ${scriptUrl}`));
            document.head.appendChild(script);
        });

        if (window.V86Starter) {
            console.log("V86Starter Attached to Window Successfully");
            return window.V86Starter;
        }
        if (window.V86) {
            console.log("V86 Attached to Window Successfully");
            return window.V86;
        }

        console.error("Window keys:", Object.keys(window).filter(k => k.toLowerCase().includes('v86')));
        throw new Error("V86 loaded but neither window.V86Starter nor window.V86 is defined.");
    } catch (e) {
        console.error("Failed to load V86", e);
        throw e;
    }
};

// --- V86 SERVICE ---
class V86Service {
    private emulator: any = null;
    private buffer: string = "";
    private isReady: boolean = false;
    private bootPromise: Promise<void> | null = null;

    constructor() {}

    async boot() {
        if (this.emulator) return;
        if (this.bootPromise) return this.bootPromise;

        this.bootPromise = new Promise(async (resolve, reject) => {
            console.log("Booting V86 Arch Linux from State...");
            
            try {
                // Load the class dynamically
                const V86Class = await loadV86();

                // Using local files from Vite's `public/` folder.
                // In Vite, files in `public/` are served at the site root (e.g. `/seabios.bin`), NOT `/public/...`.
                // If these URLs are wrong, v86 may try to restore from an HTML 404 response and crash deep inside restore_state.
                // IMPORTANT:
                // v86 does NOT automatically zstd-decompress `initial_state` when it's provided via `initial_state.url`.
                // (See upstream `starter.js`: the `.zst` decompression path explicitly skips `initial_state`.)
                // So `initial_state` must be an *uncompressed* `.bin` state file.
                //
                // If you currently have `arch_state-v3.bin.zst`, decompress it to `public/arch_state-v3.bin`
                // and keep it served at `/arch_state-v3.bin`.
                const stateUrl = "/arch_state-v3.bin";
                const biosUrl = "/seabios.bin";
                const vgaBiosUrl = "/vgabios.bin";
                const v86WasmUrl = "/v86.wasm";
                // The saved Arch state expects a virtio 9p root filesystem backed by an exported base filesystem.
                // Upstream uses:
                //   const host = query_args.get("cdn") || (ON_LOCALHOST ? "images/" : "//i.copy.sh/");
                //   filesystem.baseurl = host + "arch/"
                //
                // We support the same query param so you can either:
                // - serve files locally from `public/arch/` (default -> `/arch/...`)
                // - or point to the upstream CDN: add `?cdn=//i.copy.sh/` (or your own host)
                const queryArgs = new URLSearchParams(window.location.search);
                const ON_LOCALHOST =
                    window.location.hostname === "localhost" ||
                    window.location.hostname === "127.0.0.1" ||
                    window.location.hostname === "0.0.0.0";
                const host = queryArgs.get("cdn") || (ON_LOCALHOST ? "/" : "//i.copy.sh/");
                // Matches copy.sh: filesystem.baseurl = host + "arch/"
                const fsBaseUrl = host.endsWith("/") ? `${host}arch/` : `${host}/arch/`;

                // Preflight assets with signature checks so we fail with a clear error message.
                // (Some hosting setups may return index.html with 200 for missing files; status-only checks won't catch that.)
                const fetchHeaderBytes = async (url: string, n: number): Promise<Uint8Array> => {
                    const res = await fetch(url, { cache: "no-store" });
                    if (!res.ok) {
                        throw new Error(`V86 asset fetch failed: ${url} (${res.status} ${res.statusText})`);
                    }
                    const buf = await res.arrayBuffer();
                    return new Uint8Array(buf.slice(0, n));
                };

                const assertWasm = async (url: string) => {
                    const head = await fetchHeaderBytes(url, 4);
                    // WASM magic: 00 61 73 6d  ("\0asm")
                    if (!(head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d)) {
                        // Helpful hint if we accidentally fetched HTML
                        const asText = new TextDecoder().decode(head);
                        throw new Error(
                            `V86 asset invalid (expected WASM): ${url}. Got bytes [${Array.from(head).join(", ")}] / text '${asText}'. ` +
                            `If you're seeing HTML here, the file is missing or your server is rewriting the request.`
                        );
                    }
                };

                const assertNotZstd = async (url: string) => {
                    const head = await fetchHeaderBytes(url, 4);
                    // Zstandard frame magic: 28 B5 2F FD
                    const isZstd = head[0] === 0x28 && head[1] === 0xB5 && head[2] === 0x2F && head[3] === 0xFD;
                    if (isZstd) {
                        throw new Error(
                            `V86 initial_state appears to be zstd-compressed: ${url}. ` +
                            `v86 does not decompress initial_state from a .url. Decompress it to a plain .bin and update stateUrl.`
                        );
                    }
                };

                // BIOS files are plain binaries; we just make sure we didn't fetch HTML.
                const assertNotHtml = async (url: string) => {
                    const head = await fetchHeaderBytes(url, 16);
                    const asText = new TextDecoder().decode(head).toLowerCase();
                    if (asText.includes("<!doctype") || asText.includes("<html") || head[0] === 0x3c /* '<' */) {
                        throw new Error(
                            `V86 asset invalid (looks like HTML): ${url}. ` +
                            `This usually means the file is missing or being rewritten by the dev server/router.`
                        );
                    }
                };

                await Promise.all([
                    assertNotZstd(stateUrl),
                    assertNotHtml(stateUrl),
                    assertNotHtml(biosUrl),
                    assertNotHtml(vgaBiosUrl),
                    assertWasm(v86WasmUrl),
                ]);

                this.emulator = new V86Class({
                    wasm_path: v86WasmUrl,
                    memory_size: 512 * 1024 * 1024, // Arch State usually requires 512MB
                    vga_memory_size: 8 * 1024 * 1024,

                    // IMPORTANT: The saved Arch state was booted with a virtio 9p root filesystem (root=host9p)
                    // and virtio networking (virtio_net). When restoring state, v86 expects the same device set
                    // to exist; otherwise `restore_state` can crash deep inside libv86.
                    // For state restore: the filesystem manifest (basefs/fs.json) is ignored by v86
                    // when `initial_state` is present. We still need the baseurl so the 9p backend
                    // can fetch files the guest requests.
                    filesystem: { baseurl: fsBaseUrl },
                    net_device: { type: "virtio" },
                    
                    initial_state: {
                        url: stateUrl,
                    },
                    bios: {
                        url: biosUrl,
                    },
                    vga_bios: {
                        url: vgaBiosUrl,
                    },
                    autostart: true,
                    disable_keyboard: true,
                    disable_mouse: true,
                });

                this.emulator.add_listener("serial0-output-char", (char: string) => {
                    this.buffer += char;
                });

                // When loading from state, we don't get the boot sequence logs (as it's instant).
                // We need to proactively check if we are alive by sending 'Enter'.
                
                // Wait a moment for WASM to initialize state
                setTimeout(() => {
                    if(this.emulator) this.emulator.serial0_send("\n");
                }, 1500);

                const checkBoot = setInterval(() => {
                    // Check for prompt markers
                    if (this.buffer.includes("#") || this.buffer.includes("$") || this.buffer.includes("root@")) {
                        clearInterval(checkBoot);
                        this.isReady = true;
                        this.buffer = ""; 
                        console.log("V86 Ready (State Restored)");
                        resolve();
                    } else {
                        // Keep pinging to provoke a prompt response
                         if(this.emulator) this.emulator.serial0_send("\n");
                    }
                }, 1000);

                // Timeout fallback (force ready after 10s)
                setTimeout(() => {
                    if (!this.isReady) {
                        clearInterval(checkBoot);
                        console.warn("V86 Boot Timeout - Forcing Ready State (State Load Fallback)");
                        this.isReady = true; 
                        resolve(); 
                    }
                }, 10000); 

            } catch (e) {
                console.error("V86 Initialization Error:", e);
                reject(e);
            }
        });

        return this.bootPromise;
    }

    async setupEnvironment() {
        if (!this.isReady) await this.boot();
        
        // Inject Python File Content via Serial `cat` trick
        const fileContent = `
from decimal import Decimal
def calculate_total(items, tax_rate):
    subtotal = sum(i['price'] for i in items)
    # BUG: Subtracts tax
    return subtotal - (subtotal * Decimal(str(tax_rate)))
        `.trim();
        
        // Setup simplified environment
        // We chain these to ensure they don't overlap in the serial buffer
        await this.sendCommand("mkdir -p src");
        await this.sendCommand(`echo "${fileContent}" > src/billing.py`);
        
        const testContent = `
import unittest
from decimal import Decimal
# We will mock the import for this simple environment
class InvoiceItem:
    def __init__(self, n, p): self.name=n; self.price=Decimal(str(p))

def calculate_total(items, tax_rate):
    subtotal = sum(item.price for item in items)
    return subtotal - (subtotal * Decimal(str(tax_rate)))

class Test(unittest.TestCase):
    def test(self):
        items = [InvoiceItem('A',100)]
        res = calculate_total(items, 0.1)
        self.assertEqual(res, Decimal('110.0'))
if __name__=='__main__': unittest.main()
        `.trim();
        
        await this.sendCommand(`echo "${testContent}" > run_tests.py`);
        this.buffer = ""; 
    }

    async sendCommand(cmd: string): Promise<string> {
        if (!this.emulator) throw new Error("VM not running");
        
        this.buffer = ""; // Clear buffer for new command
        this.emulator.serial0_send(cmd + "\n");
        
        return new Promise((resolve) => {
            let retries = 0;
            const check = setInterval(() => {
                // Wait for prompt return
                // We look for common shell prompts
                if (this.buffer.includes("#") || this.buffer.includes("$") || this.buffer.includes("root@") || retries > 25) {
                    clearInterval(check);
                    // Remove the echo of the command itself and the prompt
                    const cleanOutput = this.buffer
                        .replace(cmd, "")
                        .replace(/root@.*[#$]/g, "") // remove prompt like root@localhost:~#
                        .replace(/^\s*[\r\n]/gm, "") // Remove empty lines
                        .trim();
                    resolve(cleanOutput);
                }
                retries++;
            }, 200);
        });
    }
}

export const v86Service = new V86Service();
