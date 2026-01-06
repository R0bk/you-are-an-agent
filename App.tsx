import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, Level } from './types';
import { LEVELS, ADVANCED_LEVELS } from './levels';
import { DevTools } from './components/DevTools';
import { SimulationView } from './components/SimulationView';
import { ManifestoView } from './components/ManifestoView';
import { Terminal } from './components/Terminal';
import { CRTEffectOverlay } from './components/CRTEffectOverlay';
import { CRTEffectOverlayWebGL } from './components/CRTEffectOverlayWebGL.tsx';
import { TitleCardOverlay } from './components/TitleCardOverlay';
import { OscilloscopeTitleCardWebGL } from './components/OscilloscopeTitleCardWebGL';
import { CRTDisplacementMapDefs } from './components/CRTDisplacementMapDefs';
import { Play, RotateCcw } from 'lucide-react';

export default function App() {
  // Started directly in PLAYING state as requested
  const [gameState, setGameState] = useState<GameState>(GameState.PLAYING);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [isRealisticMode, setIsRealisticMode] = useState(false);

  const [titleCard, setTitleCard] = useState<{ text: string; subtext?: string } | null>({
    text: 'You Are An Agent',
  });
  const [introComplete, setIntroComplete] = useState(false);
  const [crtMode, setCrtMode] = useState<'webgl' | 'css'>('webgl');
  const [crtEnabled, setCrtEnabled] = useState(true);
  const [crtInvalidateNonce, setCrtInvalidateNonce] = useState(0);
  const [typewriterSpeed, setTypewriterSpeed] = useState<1 | 2 | 4 | 8 | 16>(1);
  const [crtWebgl, setCrtWebgl] = useState({
    intensity: 0.24,
    pattern: 'monitor' as const,
    maxDpr: 1,
    targetFps: 15 as const,
    animate: false,

    // Master warp control (0-1) - controls all barrel distortion effects
    warp: 0.65,

    scanlineStrength: 0.08,
    maskStrength: 1.0,

    // Old "real CRT" controls (now approximated inside the overlay pipeline)
    dotPitch: 1.59,
    dotScale: 0.93,
    falloff: 0.12,
    brightnessBoost: 2.5,
    redConvergenceOffsetX: 0.01,
    redConvergenceOffsetY: 0.01,
    blueConvergenceOffsetX: -0.01,
    blueConvergenceOffsetY: -0.01,
    convergenceStrength: 0.1,
    glowRadius: 0.2,
    glowIntensity: 0.1,
    bloomThreshold: 0.36,
    bloomRadius: 1.0,
    bloomIntensity: 0.45,
    blendMode: 'hdr' as const,
    outputGamma: 2.2,

    // Apply CRT "to the content" via CSS postprocess (approximation).
    applyToContent: true,
    // Expensive: enables CSS `filter:` (blur/fringe/contrast/sat/brightness) over the entire app subtree.
    // Keep this off by default; the shell warp/vignette/scanlines are much cheaper.
    contentFilters: false,
    contentAberration: 0.8, // px
    contentBlur: 0.3, // px
    contentContrast: 1.05,
    contentSat: 1.06,
    contentBright: 1.03,
    contentVignette: 0.28, // 0..1
    contentScanlines: 0.18, // 0..1
  });

  // Derive all warp-related values from the master warp slider
  // Scaled to match the visual intensity of SVG displacement
  const warpDerived = useMemo(() => ({
    distortion: crtWebgl.warp * 0.25,     // WebGL barrel distortion (0-0.25 at warp=1)
    curvature: 0,                          // Not used when uiWarp2d > 0 (they're mutually exclusive)
    contentWarp: crtWebgl.warp * 1.5,     // DOM transform warp (0-1.5)
    uiWarp2d: crtWebgl.warp * 75,         // SVG displacement pixels (0-75)
  }), [crtWebgl.warp]);

  const activeLevel: Level | null = useMemo(() => {
    if (gameState === GameState.PLAYING) return LEVELS[currentLevelIndex] ?? null;
    if (gameState === GameState.PLAYING_ADVANCED) return ADVANCED_LEVELS[currentLevelIndex] ?? null;
    return null;
  }, [gameState, currentLevelIndex]);

  // Show title cards only at start, then only when the active level *changes* (i.e., between levels).
  const prevLevelKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeLevel) {
      prevLevelKeyRef.current = null;
      return;
    }

    const key = `${gameState}-${activeLevel.id}`;
    const prev = prevLevelKeyRef.current;
    prevLevelKeyRef.current = key;

    // Don't show "between level" cards until the initial intro card has finished.
    if (!introComplete) return;

    // Skip the first observed level after intro; we only want between-level transitions.
    if (!prev) return;

    if (prev !== key) {
      setTitleCard({
        text: `LEVEL ${activeLevel.id.toString().padStart(2, '0')}`,
        subtext: activeLevel.title,
      });
    }
  }, [gameState, activeLevel, introComplete]);

  const startSimulation = () => {
    setGameState(GameState.PLAYING);
    setCurrentLevelIndex(0);
  };

  const handleLevelSuccess = () => {
    if (gameState === GameState.PLAYING) {
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < LEVELS.length) {
            setCurrentLevelIndex(nextIndex);
        } else {
            setGameState(GameState.MANIFESTO);
        }
    } else if (gameState === GameState.PLAYING_ADVANCED) {
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < ADVANCED_LEVELS.length) {
            setCurrentLevelIndex(nextIndex);
        } else {
            setGameState(GameState.ENDING);
        }
    }
  };

  const handleManifestoContinue = () => {
    setGameState(GameState.PLAYING_ADVANCED);
    setCurrentLevelIndex(0); // Reset index for the advanced array
  };

  const jumpToLevel = (levelId: number) => {
    // Phase 1 check
    const basicIndex = LEVELS.findIndex(l => l.id === levelId);
    if (basicIndex !== -1) {
        setGameState(GameState.PLAYING);
        setCurrentLevelIndex(basicIndex);
        return;
    }
    
    // Phase 2 check
    const advancedIndex = ADVANCED_LEVELS.findIndex(l => l.id === levelId);
    if (advancedIndex !== -1) {
         setGameState(GameState.PLAYING_ADVANCED);
         setCurrentLevelIndex(advancedIndex);
         return;
    }
  };

  const renderContent = () => {
      if (gameState === GameState.INTRO) {
        return (
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0.5)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
            
            <div className="max-w-2xl w-full z-10 space-y-8">
              <div className="space-y-2">
                <h1 className="text-4xl md:text-6xl font-black font-mono text-white tracking-tighter">
                    youare<span className="text-terminal-green">anagent</span>.app
                </h1>
              </div>

              <Terminal title="MISSION_BRIEFING" className="bg-zinc-900/80 backdrop-blur">
                  <div className="p-4 space-y-4 font-mono text-sm md:text-base text-zinc-300">
                    <p>
                      Imagine discovering a popular GitHub repo, finding an issue, and deciding to help. 
                      Now imagine doing that only through raw API calls. <span className="text-red-400">That is agent tooling today.</span>
                    </p>
                    <p>
                      Imagine using a desktop, but you only see a screenshot every two seconds, and can only 
                      click one button at a time. <span className="text-red-400">That is "Computer Use" today.</span>
                    </p>
                    <p className="text-terminal-green pt-2 border-t border-zinc-700">
                      These aren't good human experiences. Why do we give them to agents?
                    </p>
                  </div>
              </Terminal>

              <button 
                onClick={startSimulation}
                className="w-full bg-white text-black font-mono font-bold text-lg py-4 rounded hover:bg-terminal-green transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Play size={20} fill="currentColor" />
                START SIMULATION
              </button>
            </div>
          </div>
        );
      }

      if (gameState === GameState.PLAYING) {
        return (
          <div className="min-h-screen flex items-center justify-center">
            <SimulationView
                key={`${currentLevelIndex}-${isRealisticMode}`} // Force re-render on level OR mode change
                level={LEVELS[currentLevelIndex]}
                onSuccess={handleLevelSuccess}
                isRealisticMode={isRealisticMode}
                setIsRealisticMode={setIsRealisticMode}
                crtUiCurvature={crtMode === 'webgl' ? warpDerived.curvature : 0}
                crtUiWarp2d={crtMode === 'webgl' ? warpDerived.uiWarp2d : 0}
                typewriterSpeed={typewriterSpeed}
            />
          </div>
        );
      }

      if (gameState === GameState.MANIFESTO) {
        return <ManifestoView onContinue={handleManifestoContinue} />;
      }

      if (gameState === GameState.PLAYING_ADVANCED) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <SimulationView
                    key={`${currentLevelIndex}-${isRealisticMode}`} // Force re-render on level OR mode change
                    level={ADVANCED_LEVELS[currentLevelIndex]}
                    onSuccess={handleLevelSuccess}
                    isRealisticMode={isRealisticMode}
                    setIsRealisticMode={setIsRealisticMode}
                    crtUiCurvature={crtMode === 'webgl' ? warpDerived.curvature : 0}
                    crtUiWarp2d={crtMode === 'webgl' ? warpDerived.uiWarp2d : 0}
                    typewriterSpeed={typewriterSpeed}
                />
            </div>
        );
      }

      if (gameState === GameState.ENDING) {
          return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-2xl space-y-8 animate-in fade-in duration-1000">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full mx-auto flex items-center justify-center mb-6">
                        <span className="text-4xl">🏁</span>
                    </div>
                    
                    <h2 className="text-3xl md:text-4xl font-mono font-bold text-white">
                        This is the <span className="text-terminal-green">Jagged Frontier</span>.
                    </h2>
                    
                    <p className="text-zinc-400 font-mono text-lg leading-relaxed">
                        Humans effortlessly understand the weight of an object from context and experience. 
                        Models, without the right <strong>AX</strong> (Agent Experience), are left guessing.
                    </p>

                    <p className="text-zinc-500 text-sm font-mono">
                        Agents don't need better prompts. They need interfaces designed for them.
                    </p>

                    <div className="pt-8 flex flex-col sm:flex-row gap-4 justify-center">
                        <button 
                            onClick={() => window.location.reload()}
                            className="flex items-center justify-center gap-2 px-6 py-3 border border-zinc-700 text-zinc-300 font-mono rounded hover:bg-zinc-800 transition-colors"
                        >
                            <RotateCcw size={16} />
                            Reboot System
                        </button>
                        <a 
                            href="#" 
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-terminal-green text-black font-mono font-bold rounded hover:bg-green-400 transition-colors"
                            onClick={(e) => { e.preventDefault(); alert("In a real app, this goes to the full blog post."); }}
                        >
                            Read the Full Post
                        </a>
                    </div>
                </div>
            </div>
          )
      }
      return null;
  }

  return (
    <>
        <CRTDisplacementMapDefs id="crtWarp2d" scale={warpDerived.uiWarp2d} />

        {/* Global CRT overlay.
            Keep it mounted; when a title card is up, render CRT ABOVE it so titles use the same CRT pipeline. */}
        {crtEnabled && (
          <div
            className="pointer-events-none"
            style={{ opacity: 1, transition: 'opacity 150ms linear' }}
          >
            {crtMode === 'webgl' ? (
              <CRTEffectOverlayWebGL
                invalidateNonce={crtInvalidateNonce}
                zIndex={titleCard ? 250 : 50}
                intensity={crtWebgl.intensity}
                pattern={crtWebgl.pattern}
                maxDpr={crtWebgl.maxDpr}
                targetFps={crtWebgl.targetFps}
                animate={crtWebgl.animate}
                distortion={warpDerived.distortion}
                scanlineStrength={crtWebgl.scanlineStrength}
                maskStrength={crtWebgl.maskStrength}
                dotPitch={crtWebgl.dotPitch}
                dotScale={crtWebgl.dotScale}
                falloff={crtWebgl.falloff}
                brightnessBoost={crtWebgl.brightnessBoost}
                redConvergenceOffset={[crtWebgl.redConvergenceOffsetX, crtWebgl.redConvergenceOffsetY]}
                blueConvergenceOffset={[crtWebgl.blueConvergenceOffsetX, crtWebgl.blueConvergenceOffsetY]}
                convergenceStrength={crtWebgl.convergenceStrength}
                glowRadius={crtWebgl.glowRadius}
                glowIntensity={crtWebgl.glowIntensity}
                bloomThreshold={crtWebgl.bloomThreshold}
                bloomRadius={crtWebgl.bloomRadius}
                bloomIntensity={crtWebgl.bloomIntensity}
                blendMode={crtWebgl.blendMode}
                outputGamma={crtWebgl.outputGamma}
              />
            ) : (
              <CRTEffectOverlay />
            )}
          </div>
        )}
        <DevTools
          levels={LEVELS}
          advancedLevels={ADVANCED_LEVELS}
          jumpToLevel={jumpToLevel}
          crtMode={crtMode}
          setCrtMode={setCrtMode}
          crtEnabled={crtEnabled}
          setCrtEnabled={setCrtEnabled}
          setGameState={setGameState}
          crtWebgl={crtWebgl}
          setCrtWebgl={setCrtWebgl}
          typewriterSpeed={typewriterSpeed}
          setTypewriterSpeed={setTypewriterSpeed}
        />
        <div
          className={
            !titleCard && crtMode === 'webgl' && crtWebgl.applyToContent
              ? `crt-content-shell ${crtWebgl.contentFilters ? 'crt-content-postprocess' : ''}`
              : undefined
          }
          style={
            !titleCard && crtMode === 'webgl' && crtWebgl.applyToContent
              ? ({
                  ...(crtWebgl.contentFilters
                    ? {
                        ['--crt-aberr' as any]: `${crtWebgl.contentAberration}px`,
                        ['--crt-blur' as any]: `${crtWebgl.contentBlur}px`,
                        ['--crt-contrast' as any]: crtWebgl.contentContrast,
                        ['--crt-sat' as any]: crtWebgl.contentSat,
                        ['--crt-bright' as any]: crtWebgl.contentBright,
                      }
                    : null),
                  ['--crt-warp' as any]: warpDerived.contentWarp,
                  ['--crt-vig' as any]: crtWebgl.contentVignette,
                  ['--crt-scan' as any]: crtWebgl.contentScanlines,
                } as React.CSSProperties)
              : undefined
          }
        >
          {/* Don't render content while a title card is showing - prevents level 1 animation from starting before the intro title card finishes */}
          {!titleCard && renderContent()}
        </div>
        {titleCard && (
          titleCard.text === 'You Are An Agent' ? (
            <OscilloscopeTitleCardWebGL
              onComplete={() => {
                if (!introComplete) setIntroComplete(true);
                setCrtInvalidateNonce((n) => n + 1);
                setTitleCard(null);
              }}
              skipDelay={2000}
            />
          ) : (
            <TitleCardOverlay
              text={titleCard.text}
              subtext={titleCard.subtext}
              speedMultiplier={typewriterSpeed}
              onDone={() => {
                if (!introComplete) setIntroComplete(true);
                setCrtInvalidateNonce((n) => n + 1);
                setTitleCard(null);
              }}
            />
          )
        )}
    </>
  );
}