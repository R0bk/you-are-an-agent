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
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Generates a smooth, deterministic barrel-style displacement map:
 * - R encodes x displacement
 * - G encodes y displacement
 *
 * No noise/turbulence => no “water ripples”.
 */
function generateBarrelMapDataUrl(size: number): string {
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
      const dx = nx * r2;
      const dy = ny * r2;

      const rr = clamp01(0.5 + dx * 0.5);
      const gg = clamp01(0.5 + dy * 0.5);

      const i = (y * size + x) * 4;
      data[i + 0] = Math.round(rr * 255); // R
      data[i + 1] = Math.round(gg * 255); // G
      data[i + 2] = 128; // B (unused)
      data[i + 3] = 255; // A
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export const CRTDisplacementMapDefs: React.FC<CRTDisplacementMapDefsProps> = ({ id, size = 256, scale = 0 }) => {
  const [href, setHref] = useState<string>('');
  const [viewport, setViewport] = useState({ width: 1920, height: 1080 });

  const stableSize = useMemo(() => Math.max(64, Math.min(512, Math.floor(size))), [size]);

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

  // Use userSpaceOnUse so the filter operates in screen coordinates, not element coordinates.
  // This ensures barrel distortion is relative to the viewport, not individual elements.
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <filter
        id={id}
        filterUnits="userSpaceOnUse"
        x="0"
        y="0"
        width={viewport.width}
        height={viewport.height}
      >
        {/* Displacement map stretched to cover full viewport */}
        <feImage
          href={href}
          preserveAspectRatio="none"
          result="map"
          x="0"
          y="0"
          width={viewport.width}
          height={viewport.height}
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


