import React from 'react';
import { GameState, Level } from '../types';
import { Bug } from 'lucide-react';

type DevToolsProps = {
  levels: Level[];
  advancedLevels: Level[];
  jumpToLevel: (levelId: number) => void;
  crtMode: 'webgl' | 'css';
  setCrtMode: React.Dispatch<React.SetStateAction<'webgl' | 'css'>>;
  crtEnabled: boolean;
  setCrtEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  // This is a large state object; keep it flexible to avoid duplicating the full type here.
  crtWebgl: any;
  setCrtWebgl: React.Dispatch<React.SetStateAction<any>>;
  typewriterSpeed: 1 | 2 | 4 | 8 | 16;
  setTypewriterSpeed: React.Dispatch<React.SetStateAction<1 | 2 | 4 | 8 | 16>>;
};

export const DevTools: React.FC<DevToolsProps> = ({
  levels,
  advancedLevels,
  jumpToLevel,
  crtMode,
  setCrtMode,
  crtEnabled,
  setCrtEnabled,
  setGameState,
  crtWebgl,
  setCrtWebgl,
  typewriterSpeed,
  setTypewriterSpeed,
}) => {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const isInsideMenu = (e: Event) => {
      if (!menuRef.current) return false;
      const target = e.target;
      // Prefer composedPath when available (more robust across shadow DOM / native controls).
      const path = (e as any).composedPath?.() as EventTarget[] | undefined;
      if (Array.isArray(path) && path.includes(menuRef.current)) return true;
      return target instanceof Node ? menuRef.current.contains(target) : false;
    };

    const onDown = (e: PointerEvent | MouseEvent) => {
      if (!menuRef.current) return;
      if (!isInsideMenu(e)) setOpen(false);
    };

    // Use pointerdown for consistent behavior across mouse/touch/stylus.
    document.addEventListener('pointerdown', onDown as any);
    // Fallback for older/odd environments.
    document.addEventListener('mousedown', onDown as any);
    return () => {
      document.removeEventListener('pointerdown', onDown as any);
      document.removeEventListener('mousedown', onDown as any);
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] font-sans">
      {/* Click-to-toggle menu (hover menus close while dragging sliders). */}
      <div
        className="relative"
        ref={menuRef}
        // Prevent interactions inside the panel (esp. slider drags) from being treated as "outside" clicks.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          className="bg-zinc-800/80 backdrop-blur border border-zinc-700 text-zinc-400 p-2 rounded hover:bg-zinc-700 hover:text-white transition-colors shadow-lg"
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          <Bug size={16} />
        </button>

        {/* Avoid `mt-*` gaps between trigger and menu; use padding inside a wrapper instead so the menu stays hoverable. */}
        {open && (
          <div className="absolute right-0 top-full pt-2">
            <div className="w-72 max-h-[75vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-1 animate-in fade-in slide-in-from-top-2">
              <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1 tracking-wider">Phase 1</div>
              {levels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => jumpToLevel(l.id)}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-300 hover:bg-zinc-800 rounded hover:text-terminal-green truncate flex gap-2"
                >
                  <span className="opacity-50">{l.id}</span>
                  <span>{l.title}</span>
                </button>
              ))}
              <div className="text-[10px] uppercase font-bold text-zinc-500 px-2 py-1 mt-1 border-t border-zinc-800 tracking-wider">
                Phase 2
              </div>
              {advancedLevels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => jumpToLevel(l.id)}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-300 hover:bg-zinc-800 rounded hover:text-terminal-green truncate flex gap-2"
                >
                  <span className="opacity-50">{l.id}</span>
                  <span>{l.title}</span>
                </button>
              ))}
              <div className="border-t border-zinc-800 mt-1 pt-1 grid grid-cols-1 gap-0.5">
                <button
                  onClick={() => setCrtMode((m) => (m === 'webgl' ? 'css' : 'webgl'))}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-400 hover:bg-zinc-800 rounded hover:text-white"
                >
                  Toggle CRT Mode ({crtMode.toUpperCase()})
                </button>
                <button
                  onClick={() => setCrtEnabled((v) => !v)}
                  className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-400 hover:bg-zinc-800 rounded hover:text-white"
                >
                  Global CRT ({crtEnabled ? 'ON' : 'OFF'})
                </button>
                <div className="px-2 py-2 rounded bg-black/30 border border-zinc-800">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Typewriter Speed</div>
                  <div className="flex gap-1">
                    {([1, 2, 4, 8, 16] as const).map((speed) => (
                      <button
                        key={speed}
                        onClick={() => setTypewriterSpeed(speed)}
                        className={`flex-1 px-2 py-1 text-xs font-mono rounded transition-colors ${
                          typewriterSpeed === speed
                            ? 'bg-terminal-green text-black font-bold'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
                {crtMode === 'webgl' && (
                  <div className="px-2 py-2 rounded bg-black/30 border border-zinc-800 space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">CRT (WebGL) Settings</div>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Intensity</span>
                        <span className="text-zinc-500">{crtWebgl.intensity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.6}
                        step={0.01}
                        value={crtWebgl.intensity}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, intensity: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Pattern</span>
                        <span className="text-zinc-500">{crtWebgl.pattern.toUpperCase()}</span>
                      </div>
                      <select
                        value={crtWebgl.pattern}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, pattern: e.target.value as any }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
                      >
                        <option value="monitor">Monitor</option>
                        <option value="lcd">LCD</option>
                        <option value="tv">TV</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Pixel Scale (DPR cap)</span>
                        <span className="text-zinc-500">{crtWebgl.maxDpr}x</span>
                      </div>
                      <select
                        value={crtWebgl.maxDpr}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, maxDpr: Number(e.target.value) }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
                      >
                        <option value={0.5}>0.5x (supersoft)</option>
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x (pixelDensity(1))</option>
                        <option value={2}>2x (retina)</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>WebGL FPS</span>
                        <span className="text-zinc-500">{crtWebgl.targetFps}fps</span>
                      </div>
                      <select
                        value={crtWebgl.targetFps}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, targetFps: Number(e.target.value) as any }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
                      >
                        <option value={60}>60</option>
                        <option value={30}>30</option>
                        <option value={20}>20</option>
                        <option value={15}>15</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Animate CRT</span>
                        <span className="text-zinc-500">{crtWebgl.animate ? 'ON' : 'OFF'}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={crtWebgl.animate}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, animate: e.target.checked }))}
                        className="mt-1"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>UI Curvature (Agent box)</span>
                        <span className="text-zinc-500">{crtWebgl.curvature.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={crtWebgl.curvature}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, curvature: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>2D Warp (SVG, experimental)</span>
                        <span className="text-zinc-500">{crtWebgl.uiWarp2d.toFixed(0)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={crtWebgl.uiWarp2d}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, uiWarp2d: Number(e.target.value) }))}
                        className="w-full"
                      />
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">Per-pixel warp. Can be heavy / browser-dependent.</div>
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Apply to Content (Warp/Scanlines)</span>
                        <span className="text-zinc-500">{crtWebgl.applyToContent ? 'ON' : 'OFF'}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={crtWebgl.applyToContent}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, applyToContent: e.target.checked }))}
                        className="mt-1"
                      />
                    </label>

                    {crtWebgl.applyToContent && (
                      <div className="space-y-2">
                        <label className="block">
                          <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                            <span>Content Filters (Blur/Fringe) — expensive</span>
                            <span className="text-zinc-500">{crtWebgl.contentFilters ? 'ON' : 'OFF'}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={crtWebgl.contentFilters}
                            onChange={(e) => setCrtWebgl((p: any) => ({ ...p, contentFilters: e.target.checked }))}
                            className="mt-1"
                          />
                        </label>

                        <label className="block">
                          <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                            <span>Content Warp</span>
                            <span className="text-zinc-500">{crtWebgl.contentWarp.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={crtWebgl.contentWarp}
                            onChange={(e) => setCrtWebgl((p: any) => ({ ...p, contentWarp: Number(e.target.value) }))}
                            className="w-full"
                          />
                        </label>

                        {crtWebgl.contentFilters && (
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                                <span>Content Fringe</span>
                                <span className="text-zinc-500">{crtWebgl.contentAberration.toFixed(2)}px</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={3}
                                step={0.05}
                                value={crtWebgl.contentAberration}
                                onChange={(e) =>
                                  setCrtWebgl((p: any) => ({ ...p, contentAberration: Number(e.target.value) }))
                                }
                                className="w-full"
                              />
                            </label>
                            <label className="block">
                              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                                <span>Content Blur</span>
                                <span className="text-zinc-500">{crtWebgl.contentBlur.toFixed(2)}px</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={1.5}
                                step={0.05}
                                value={crtWebgl.contentBlur}
                                onChange={(e) => setCrtWebgl((p: any) => ({ ...p, contentBlur: Number(e.target.value) }))}
                                className="w-full"
                              />
                            </label>
                          </div>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          <label className="block">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                              <span>Contrast</span>
                              <span className="text-zinc-500">{crtWebgl.contentContrast.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0.9}
                              max={1.3}
                              step={0.01}
                              value={crtWebgl.contentContrast}
                              onChange={(e) =>
                                setCrtWebgl((p: any) => ({ ...p, contentContrast: Number(e.target.value) }))
                              }
                              className="w-full"
                            />
                          </label>
                          <label className="block">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                              <span>Sat</span>
                              <span className="text-zinc-500">{crtWebgl.contentSat.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0.9}
                              max={1.3}
                              step={0.01}
                              value={crtWebgl.contentSat}
                              onChange={(e) => setCrtWebgl((p: any) => ({ ...p, contentSat: Number(e.target.value) }))}
                              className="w-full"
                            />
                          </label>
                          <label className="block">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                              <span>Bright</span>
                              <span className="text-zinc-500">{crtWebgl.contentBright.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0.9}
                              max={1.2}
                              step={0.01}
                              value={crtWebgl.contentBright}
                              onChange={(e) =>
                                setCrtWebgl((p: any) => ({ ...p, contentBright: Number(e.target.value) }))
                              }
                              className="w-full"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                              <span>Vignette</span>
                              <span className="text-zinc-500">{crtWebgl.contentVignette.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={crtWebgl.contentVignette}
                              onChange={(e) =>
                                setCrtWebgl((p: any) => ({ ...p, contentVignette: Number(e.target.value) }))
                              }
                              className="w-full"
                            />
                          </label>
                          <label className="block">
                            <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                              <span>Scanlines</span>
                              <span className="text-zinc-500">{crtWebgl.contentScanlines.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={crtWebgl.contentScanlines}
                              onChange={(e) =>
                                setCrtWebgl((p: any) => ({ ...p, contentScanlines: Number(e.target.value) }))
                              }
                              className="w-full"
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Distortion</span>
                        <span className="text-zinc-500">{crtWebgl.distortion.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.2}
                        step={0.005}
                        value={crtWebgl.distortion}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, distortion: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Scanlines</span>
                        <span className="text-zinc-500">{crtWebgl.scanlineStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.2}
                        step={0.01}
                        value={crtWebgl.scanlineStrength}
                        onChange={(e) =>
                          setCrtWebgl((p: any) => ({ ...p, scanlineStrength: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Mask</span>
                        <span className="text-zinc-500">{crtWebgl.maskStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={crtWebgl.maskStrength}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, maskStrength: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <div className="pt-1 mt-1 border-t border-zinc-800" />
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Old CRT Controls (ported)</div>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Blend Mode (internal)</span>
                        <span className="text-zinc-500">{crtWebgl.blendMode.toUpperCase()}</span>
                      </div>
                      <select
                        value={crtWebgl.blendMode}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, blendMode: e.target.value as any }))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-200"
                      >
                        <option value="screen">Screen</option>
                        <option value="add">Add</option>
                        <option value="soft">Soft</option>
                        <option value="lighten">Lighten</option>
                        <option value="hdr">HDR</option>
                      </select>
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">
                        Affects bloom compositing inside the WebGL overlay (not CSS mix-blend-mode).
                      </div>
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Dot Pitch</span>
                        <span className="text-zinc-500">{crtWebgl.dotPitch.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={6}
                        step={0.01}
                        value={crtWebgl.dotPitch}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, dotPitch: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Dot Scale</span>
                        <span className="text-zinc-500">{crtWebgl.dotScale.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.01}
                        max={2}
                        step={0.01}
                        value={crtWebgl.dotScale}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, dotScale: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Falloff</span>
                        <span className="text-zinc-500">{crtWebgl.falloff.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={crtWebgl.falloff}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, falloff: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Brightness Boost</span>
                        <span className="text-zinc-500">{crtWebgl.brightnessBoost.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={0.05}
                        value={crtWebgl.brightnessBoost}
                        onChange={(e) =>
                          setCrtWebgl((p: any) => ({ ...p, brightnessBoost: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Convergence Strength</span>
                        <span className="text-zinc-500">{crtWebgl.convergenceStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={crtWebgl.convergenceStrength}
                        onChange={(e) =>
                          setCrtWebgl((p: any) => ({ ...p, convergenceStrength: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span>Red X</span>
                          <span className="text-zinc-500">{crtWebgl.redConvergenceOffsetX.toFixed(3)}</span>
                        </div>
                        <input
                          type="range"
                          min={-0.05}
                          max={0.05}
                          step={0.001}
                          value={crtWebgl.redConvergenceOffsetX}
                          onChange={(e) =>
                            setCrtWebgl((p: any) => ({ ...p, redConvergenceOffsetX: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="block">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span>Red Y</span>
                          <span className="text-zinc-500">{crtWebgl.redConvergenceOffsetY.toFixed(3)}</span>
                        </div>
                        <input
                          type="range"
                          min={-0.05}
                          max={0.05}
                          step={0.001}
                          value={crtWebgl.redConvergenceOffsetY}
                          onChange={(e) =>
                            setCrtWebgl((p: any) => ({ ...p, redConvergenceOffsetY: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="block">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span>Blue X</span>
                          <span className="text-zinc-500">{crtWebgl.blueConvergenceOffsetX.toFixed(3)}</span>
                        </div>
                        <input
                          type="range"
                          min={-0.05}
                          max={0.05}
                          step={0.001}
                          value={crtWebgl.blueConvergenceOffsetX}
                          onChange={(e) =>
                            setCrtWebgl((p: any) => ({ ...p, blueConvergenceOffsetX: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="block">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span>Blue Y</span>
                          <span className="text-zinc-500">{crtWebgl.blueConvergenceOffsetY.toFixed(3)}</span>
                        </div>
                        <input
                          type="range"
                          min={-0.05}
                          max={0.05}
                          step={0.001}
                          value={crtWebgl.blueConvergenceOffsetY}
                          onChange={(e) =>
                            setCrtWebgl((p: any) => ({ ...p, blueConvergenceOffsetY: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Glow Radius</span>
                        <span className="text-zinc-500">{crtWebgl.glowRadius.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.01}
                        value={crtWebgl.glowRadius}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, glowRadius: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Glow Intensity</span>
                        <span className="text-zinc-500">{crtWebgl.glowIntensity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={crtWebgl.glowIntensity}
                        onChange={(e) =>
                          setCrtWebgl((p: any) => ({ ...p, glowIntensity: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Bloom Threshold</span>
                        <span className="text-zinc-500">{crtWebgl.bloomThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={crtWebgl.bloomThreshold}
                        onChange={(e) =>
                          setCrtWebgl((p: any) => ({ ...p, bloomThreshold: Number(e.target.value) }))
                        }
                        className="w-full"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span>Bloom Radius</span>
                          <span className="text-zinc-500">{crtWebgl.bloomRadius.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={6}
                          step={0.05}
                          value={crtWebgl.bloomRadius}
                          onChange={(e) =>
                            setCrtWebgl((p: any) => ({ ...p, bloomRadius: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="block">
                        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                          <span>Bloom Intensity</span>
                          <span className="text-zinc-500">{crtWebgl.bloomIntensity.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={0.05}
                          value={crtWebgl.bloomIntensity}
                          onChange={(e) =>
                            setCrtWebgl((p: any) => ({ ...p, bloomIntensity: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                        <span>Output Gamma</span>
                        <span className="text-zinc-500">{crtWebgl.outputGamma.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={crtWebgl.outputGamma}
                        onChange={(e) => setCrtWebgl((p: any) => ({ ...p, outputGamma: Number(e.target.value) }))}
                        className="w-full"
                      />
                    </label>
                  </div>
                )}
              </div>
              <button
                onClick={() => setGameState(GameState.INTRO)}
                className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-400 hover:bg-zinc-800 rounded hover:text-white"
              >
                Go to Intro
              </button>
              <button
                onClick={() => setGameState(GameState.MANIFESTO)}
                className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-400 hover:bg-zinc-800 rounded hover:text-white"
              >
                View Manifesto
              </button>
              <button
                onClick={() => setGameState(GameState.ENDING)}
                className="w-full text-left px-2 py-1.5 text-xs font-mono text-zinc-400 hover:bg-zinc-800 rounded hover:text-white"
              >
                View Ending
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
