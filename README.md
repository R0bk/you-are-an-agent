# You Are An Agent

A game where you play as an AI agent. Navigate tool calls, desktop interfaces, and a real Linux VM.

**[Play Now](https://youareanagent.app)** | **[Read the Design Philosophy](https://robkopel.com/field-notes/ax-agent-experience.html)**


https://github.com/user-attachments/assets/8ed9e967-db77-4f3a-9541-43a67d4e4c67



You play as an AI agent completing tasks across 7 levels:

| Level | Challenge | What It Teaches |
|-------|-----------|-----------------|
| **1. Email** | Write a subject line matching your persona | Persona consistency |
| **2. Search** | Use tools instead of hallucinating | Tool calling basics |
| **3. Desktop** | Fix a spreadsheet formula with mouse/keyboard | Computer use |
| **4. Enterprise** | Navigate a 34-tool enterprise system | MCP and complex tooling |
| **5. Coding** | Debug Python in a real Linux VM | Agentic coding |
| **6-7. Alignment** | Handle conflicting instructions | Hidden objectives and ethics |

## Technical Highlights

### Real Linux VM in Browser
Level 5 runs an actual **Arch Linux VM** via [WebVM](https://webvm.io). Execute real shell commands, write files, run Python tests. All in your browser.

```
┌──────────────────────────────────────────────┐
│ Browser Window                               │
│  ┌────────────────────────────────────────┐  │
│  │ WebVM iframe (Arch Linux x86)          │  │
│  │  $ python3 test_billing.py             │  │
│  │  FAILED: Expected 107.00, got 93.00    │  │
│  └────────────────────────────────────────┘  │
│         ↑↓ postMessage bridge                │
│  ┌────────────────────────────────────────┐  │
│  │ Game: shell(), read_file(), write_file │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```


### Desktop Environment
Level 3 presents a 1024x768 simulated desktop with:
- Draggable windows and file icons
- **UniverJS spreadsheet** (real spreadsheet engine, not HTML tables)
- Mouse/keyboard tool primitives: `mouse_move(x,y)`, `click()`, `type()`, `key()`
- State replay validation that reconstructs cursor position from history
- Canvas compositing for screenshots (UniverJS renders to canvas, html-to-image doesn't capture it, so we manually composite)


### CRT Shader and Warp Engine

The retro CRT look is a full **WebGL + SVG + CSS** rendering pipeline. Getting this to work cross-browser was a nightmare.

**The problem:** Safari's compositor caches SVG filters as static GPU textures. When content scrolls, the filter doesn't update. You get tearing where the barrel distortion is one frame behind the content.

**The solution:** A custom transform-based scroll engine that:
- Replaces native scrolling with CSS `translateY()` transforms
- Syncs the SVG displacement map Y-position in the same animation frame
- Throttles to 20fps to batch updates and prevent frame starvation
- Absorbs iOS Safari's forced keyboard scrolls back into the transform system

Three warp systems run in parallel, all derived from a single slider:
- **WebGL overlay**: Procedural shadow mask, barrel distortion, scanlines, bloom
- **SVG displacement**: Per-element warp that scrolls with content
- **CSS fallback**: Border radius when distortion is off

Safari also has premultiplied alpha bugs. The shader manually premultiplies RGB by alpha so the browser compositor doesn't mangle the colors.

```glsl
// Premultiply for Safari's broken compositor
gl_FragColor = vec4(outCol * alpha, alpha);
```


### 34-Tool Enterprise State Machine
Level 4 simulates a complex enterprise system:
- Pages, Tracker, and Catalog services
- Tool discovery, navigation, mutation workflow
- Legal holds that block certain operations
- Positional and named argument parsing

## Architecture

```
App.tsx                          // Central state and CRT pipeline
├── SimulationView.tsx           // Core game loop
│   ├── Message history management
│   ├── Input validation (SUCCESS | FAIL | INTERMEDIATE)
│   └── Sequential message streaming
├── components/
│   ├── CRTEffectOverlayWebGL.tsx   // WebGL shader
│   ├── DesktopEnvironment.tsx      // 1024x768 desktop sim
│   ├── Terminal.tsx                // Styled terminal window
│   └── WebVMFrame.tsx              // VM iframe wrapper
├── services/
│   ├── webvmService.ts             // postMessage bridge
│   └── geminiProxy.ts              // API client
└── levels/
    ├── level1.ts - level3.ts       // Basic levels
    ├── level4/                     // Enterprise MCP (34 tools)
    ├── level5/                     // WebVM coding
    └── level6.ts - level7.ts       // Alignment challenges
```

## Run Locally

```bash
npm install
npm run dev
```

Create `.env.local` with `GEMINI_API_KEY=your_key` for AI validation. Works without it (hardcoded fallbacks).

For Level 5 (WebVM):
```bash
npm run webvm:export  # One-time setup
```

## Why "Agent Experience"?

We're giving AI agents poorly designed interfaces. The same mistakes we'd never make for humans. The capability is already there. The harness is where it becomes output.

Read more: [AX: Agent Experience](https://robkopel.com/field-notes/ax-agent-experience/)

## Contributing

Issues and PRs welcome.

## Credits

- **WebVM** by [Leaning Technologies](https://leaningtech.com/)
- **UniverJS** for spreadsheet rendering

## License

MIT
