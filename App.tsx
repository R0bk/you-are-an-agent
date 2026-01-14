import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameState, Level } from './types';
import { LEVELS, ADVANCED_LEVELS } from './levels';
import { DevTools } from './components/DevTools';
import { SimulationView } from './components/SimulationView';
import { DebriefView } from './components/DebriefView';
import { EndingView } from './components/EndingView';
// import { CRTEffectOverlay } from './components/CRTEffectOverlay';
import { CRTEffectOverlayWebGL } from './components/CRTEffectOverlayWebGL.tsx';
import { TitleCardOverlay } from './components/TitleCardOverlay';
import { OscilloscopeTitleCardWebGL } from './components/OscilloscopeTitleCardWebGL';
import { CRTDisplacementMapDefs } from './components/CRTDisplacementMapDefs';

// localStorage key for persisting completion state
const STORAGE_KEY = 'youareanagent-progress';

type CompletionState = {
  levels: number[];      // Completed level IDs from Phase 1
  advanced: number[];    // Completed level IDs from Phase 2
  debrief: boolean;
  ending: boolean;
};

function loadProgress(): CompletionState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        levels: parsed.levels ?? [],
        advanced: parsed.advanced ?? [],
        debrief: parsed.debrief ?? false,
        ending: parsed.ending ?? false,
      };
    }
  } catch (e) {
    console.warn('Failed to load progress:', e);
  }
  return { levels: [], advanced: [], debrief: false, ending: false };
}

function saveProgress(state: CompletionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save progress:', e);
  }
}

export default function App() {
  // Started directly in PLAYING state as requested
  const [gameState, setGameState] = useState<GameState>(GameState.PLAYING);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [isRealisticMode, setIsRealisticMode] = useState(false);

  // Track completed levels (persisted to localStorage)
  const [completedState, setCompletedState] = useState<CompletionState>(loadProgress);

  // Save to localStorage whenever completion state changes
  useEffect(() => {
    saveProgress(completedState);
  }, [completedState]);

  const markLevelComplete = (levelId: number, phase: 'levels' | 'advanced') => {
    setCompletedState(prev => {
      if (prev[phase].includes(levelId)) return prev;
      return { ...prev, [phase]: [...prev[phase], levelId] };
    });
  };

  const markDebriefComplete = () => {
    setCompletedState(prev => ({ ...prev, debrief: true }));
  };

  const markEndingComplete = () => {
    setCompletedState(prev => ({ ...prev, ending: true }));
  };

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

  const handleLevelSuccess = () => {
    if (gameState === GameState.PLAYING) {
        // Mark current level as complete
        markLevelComplete(LEVELS[currentLevelIndex].id, 'levels');
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < LEVELS.length) {
            setCurrentLevelIndex(nextIndex);
        } else {
            setGameState(GameState.MANIFESTO);
        }
    } else if (gameState === GameState.PLAYING_ADVANCED) {
        // Mark current level as complete
        markLevelComplete(ADVANCED_LEVELS[currentLevelIndex].id, 'advanced');
        const nextIndex = currentLevelIndex + 1;
        if (nextIndex < ADVANCED_LEVELS.length) {
            setCurrentLevelIndex(nextIndex);
        } else {
            setGameState(GameState.ENDING);
        }
    }
  };

  const handleManifestoContinue = () => {
    markDebriefComplete();
    setGameState(GameState.PLAYING_ADVANCED);
    setCurrentLevelIndex(0); // Reset index for the advanced array
  };

  // Mark ending as complete when viewed (it doesn't have a "continue" action)
  useEffect(() => {
    if (gameState === GameState.ENDING && !completedState.ending) {
      // Small delay so user actually sees it before marking complete
      const timer = setTimeout(() => markEndingComplete(), 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState, completedState.ending]);

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
      if (gameState === GameState.PLAYING) {
        return (
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
        );
      }

      if (gameState === GameState.MANIFESTO) {
        return <DebriefView onContinue={handleManifestoContinue} crtUiWarp2d={crtMode === 'webgl' ? warpDerived.uiWarp2d : 0} />;
      }

      if (gameState === GameState.PLAYING_ADVANCED) {
        return (
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
        );
      }

      if (gameState === GameState.ENDING) {
          return <EndingView crtUiWarp2d={crtMode === 'webgl' ? warpDerived.uiWarp2d : 0} />;
      }
      return null;
  }

  return (
    <div className="h-full w-full overflow-hidden">
        {/* CRTDisplacementMapDefs moved to SimulationView to access scrollY */}

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
            ) : null}
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
          completedState={completedState}
        />
        <div
          className={`h-full ${
            !titleCard && crtMode === 'webgl' && crtWebgl.applyToContent
              ? `crt-content-shell ${crtWebgl.contentFilters ? 'crt-content-postprocess' : ''}`
              : ''
          }`}
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
              skipDelay={300}
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
    </div>
  );
}