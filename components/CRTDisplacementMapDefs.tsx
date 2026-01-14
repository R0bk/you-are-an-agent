import React, { useEffect, useMemo, useState } from 'react';

interface CRTDisplacementMapDefsProps {
  /**
   * SVG filter id to reference via `filter: url(#id)`.
   */
  id: string;
  /**
   * Base map resolution (higher = smoother, larger data URL).
   */
  size?: number;
  /**
   * Displacement scale (SVG units). Higher => more warp.
   */
  scale?: number;
  /**
   * Scroll offset to keep displacement map aligned with visible content.
   */
  scrollY?: number;
  /**
   * Total scrollable content height (scrollHeight of container).
   */
  scrollHeight?: number;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// Cache for memoized barrel map data URLs (keyed by size)
const barrelMapCache = new Map<number, string>();

/**
 * Generates a smooth, deterministic barrel-style displacement map:
 * - R encodes x displacement
 * - G encodes y displacement
 *
 * No noise/turbulence => no "water ripples".
 * Memoized by size to avoid regenerating on every render.
 */
function generateBarrelMapDataUrl(size: number): string {
  const cached = barrelMapCache.get(size);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5) / size * 2 - 1; // -1..1
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1; // -1..1
      const r2 = nx * nx + ny * ny;

      // Vector field for barrel distortion. Scale is handled by feDisplacementMap `scale`.
      // This produces a smooth 2-axis curvature, strongest at edges, minimal at center.
      // Use 0.25 coefficient to prevent clamping at corners (max r2=2, so max displacement=0.5)
      const intensity = 0.22;
      const dx = nx * r2 * intensity;
      const dy = ny * r2 * intensity;

      // Map to 0-1 range: 0.5 = no displacement, 0 = max negative, 1 = max positive
      const rr = 0.5 + dx;
      const gg = 0.5 + dy;

      const i = (y * size + x) * 4;
      data[i + 0] = Math.round(rr * 255); // R
      data[i + 1] = Math.round(gg * 255); // G
      data[i + 2] = 128; // B (unused)
      data[i + 3] = 255; // A
    }
  }

  ctx.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  barrelMapCache.set(size, dataUrl);
  return dataUrl;
}

export const CRTDisplacementMapDefs: React.FC<CRTDisplacementMapDefsProps> = ({ id, size = 256, scale = 0, scrollY = 0, scrollHeight }) => {
  const [href, setHref] = useState<string>('');
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 });

  const stableSize = 64;

  useEffect(() => {
    // Generate displacement map and track viewport size
    const update = () => {
      setHref(generateBarrelMapDataUrl(stableSize));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [stableSize]);

  // Use scrollHeight to cover all scrollable content, fall back to viewport
  const contentHeight = scrollHeight || viewport.height;

  // Add margin to filter region so displacement at edges has room to sample from.
  // With scale=120, max displacement is 60px, so use 80px margin to be safe.
  const margin = 80;

  // Use userSpaceOnUse so the filter operates in element coordinates.
  // Filter must cover entire scrollable content area plus margin for edge displacement.
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter
        id={id}
        filterUnits="userSpaceOnUse"
        x={-margin}
        y={-scrollY - margin}
        width={viewport.width + margin * 2}
        height={contentHeight + margin * 2}
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        {/* Displacement map covers viewport + margin so edges have data to sample */}
        <feImage
          href={href}
          preserveAspectRatio="none"
          result="map"
          x={-margin}
          y={-margin}
          width={viewport.width + margin * 2}
          height={viewport.height + margin * 2}
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
};


