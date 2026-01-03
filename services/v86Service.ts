declare global {
    interface Window {
        V86Starter: any;
        V86: any;
    }
}

// Dynamically load V86
// We fetch the raw code and inject it as a Blob URL script.
// This allows us to use the 'onload' event to ensure it is fully ready before we try to use it.
const loadV86 = async (): Promise<any> => {
    if (window.V86Starter) return window.V86Starter;
    if (window.V86) return window.V86;

    console.log("Fetching V86 source...");
    
    try {
        // Fetch raw text from esm.sh
        const { default: v86Code } = await import("https://esm.sh/v86@0.5.301/build/libv86.js?raw");
        
        console.log("Creating Blob for V86...");
        
        // Aggressive Environment Sanitization:
        // We wrap the library code in a closure where we explicitly explicitly undefined
        // any CommonJS/Node.js globals (module, exports, process, define).
        // We also ensure 'this' and 'global' point to window.
        const blobContent = `
            (function() {
                var module = undefined;
                var exports = undefined;
                var define = undefined;
                var process = undefined;
                var global = window;
                var window = global;
                
                // Execute the V86 code in this sanitized scope
                // We assume the library uses 'this' or 'window' to attach itself.
                ${v86Code}
            }).call(window);
        `;
        
        const blob = new Blob([blobContent], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        
        const script = document.createElement('script');
        script.src = url;
        script.async = false; 

        await new Promise((resolve, reject) => {
            script.onload = () => {
                console.log("V86 Script Parsed & Executed");
                resolve(null);
            };
            script.onerror = () => reject(new Error("V86 Blob Script Failed to Load"));
            document.head.appendChild(script);
        });
        
        URL.revokeObjectURL(url);

        if (window.V86Starter) {
            console.log("V86Starter Attached to Window Successfully");
            return window.V86Starter;
        } else if (window.V86) {
            console.log("V86 Attached to Window Successfully");
            return window.V86;
        } else {
             console.error("Window keys:", Object.keys(window).filter(k => k.toLowerCase().includes('v86')));
             throw new Error("Script loaded but neither V86Starter nor V86 are defined. UMD detection might have failed.");
        }
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

                // Using local files provided by user in 'public' folder.
                // We include the 'public/' prefix assuming the server is not serving 'public' at the root.
                this.emulator = new V86Class({
                    wasm_path: "https://cdn.jsdelivr.net/npm/v86@0.5.301/build/v86.wasm",
                    memory_size: 512 * 1024 * 1024, // Arch State usually requires 512MB
                    vga_memory_size: 8 * 1024 * 1024,
                    
                    initial_state: {
                        url: "./public/arch_state-v3.bin.zst",
                    },
                    bios: {
                        url: "./public/seabios.bin",
                    },
                    vga_bios: {
                        url: "./public/vgabios.bin",
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
