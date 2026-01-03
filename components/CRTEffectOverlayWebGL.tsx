import React, { useEffect, useRef } from 'react';

type PatternType = 'monitor' | 'lcd' | 'tv';
type BlendMode = 'add' | 'screen' | 'soft' | 'lighten' | 'hdr';

interface CRTEffectOverlayWebGLProps {
  /**
   * Optional "nudge" value: bump this number to force the overlay to redraw in UIs that throttle animations.
   * (Safe to ignore by the renderer; primarily for external callers.)
   */
  invalidateNonce?: number;
  /**
   * Z-index for the fixed overlay canvas.
   */
  zIndex?: number;
  /**
   * Desired animation rate. (Renderer may approximate.)
   */
  targetFps?: number;
  /**
   * Whether to animate. (Renderer may approximate.)
   */
  animate?: boolean;
  /**
   * Overall strength of the overlay (0..1). This is an overlay, not a full postprocess of the page.
   */
  intensity?: number;
  pattern?: PatternType;
  /**
   * Max devicePixelRatio to render at. Use 1 to match older p5 `pixelDensity(1)` CRT looks.
   */
  maxDpr?: number;
  /**
   * Barrel/pincushion warp strength. ~0.0..0.2 typical.
   */
  distortion?: number;
  /**
   * Scanline modulation strength. 0..0.2 typical.
   */
  scanlineStrength?: number;
  /**
   * Shadow mask visibility multiplier. 0..2 typical.
   */
  maskStrength?: number;

  /**
   * Old-style CRT tuning (ported from your previous shader).
   * These primarily affect the shadow mask geometry.
   */
  dotPitch?: number;
  dotScale?: number;
  falloff?: number;
  brightnessBoost?: number;

  /**
   * Chromatic convergence (simulate electron beam misalignment).
   * Offsets are in UV units (small, e.g. 0.005..0.02).
   */
  redConvergenceOffset?: [number, number];
  blueConvergenceOffset?: [number, number];
  convergenceStrength?: number;

  /**
   * Glow/bloom derived from the procedural mask itself (not the underlying page).
   * This approximates the “phosphor bloom” feeling from the old pipeline.
   */
  glowRadius?: number; // in px-ish units (scaled by dotPitch)
  glowIntensity?: number; // 0..1
  bloomThreshold?: number; // 0..1
  bloomRadius?: number; // 0..10
  bloomIntensity?: number; // 0..5
  blendMode?: BlendMode;
  outputGamma?: number; // typically 2.2
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(shader) || 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(err);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(program) || 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(err);
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext, w: number, h: number) {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function createFramebuffer(gl: WebGLRenderingContext, tex: WebGLTexture) {
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error('Failed to create framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fb);
    throw new Error('Framebuffer incomplete');
  }
  return fb;
}

/**
 * A high-quality CRT *overlay*.
 * Note: A true CRT post-process requires sampling the underlying scene; browsers don't let WebGL sample the page.
 * This overlay still delivers the “real CRT” feel (mask + scanlines + roll + distortion) without blocking clicks.
 */
export const CRTEffectOverlayWebGL: React.FC<CRTEffectOverlayWebGLProps> = ({
  invalidateNonce,
  zIndex = 50,
  targetFps,
  animate,
  intensity = 0.22,
  pattern = 'monitor',
  maxDpr = 1,
  distortion = 0.02,
  scanlineStrength = 0.08,
  maskStrength = 1.0,

  // Old defaults (ported from your previous CRT page state)
  dotPitch = 1.59,
  dotScale = 0.93,
  falloff = 0.12,
  brightnessBoost = 2.5,
  redConvergenceOffset = [0.01, 0.01],
  blueConvergenceOffset = [-0.01, -0.01],
  convergenceStrength = 0.1,
  glowRadius = 0.2,
  glowIntensity = 0.1,
  bloomThreshold = 0.36,
  bloomRadius = 1.0,
  bloomIntensity = 0.45,
  blendMode = 'hdr',
  outputGamma = 2.2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const blendModeRef = useRef<BlendMode>(blendMode);
  const paramsRef = useRef({
    intensity,
    pattern,
    maxDpr,
    distortion,
    scanlineStrength,
    maskStrength,
    dotPitch,
    dotScale,
    falloff,
    brightnessBoost,
    redConvergenceOffset,
    blueConvergenceOffset,
    convergenceStrength,
    glowRadius,
    glowIntensity,
    bloomThreshold,
    bloomRadius,
    bloomIntensity,
    blendMode,
    outputGamma,
  });

  // Keep params hot without reinitializing shaders on slider moves.
  useEffect(() => {
    paramsRef.current = {
      intensity,
      pattern,
      maxDpr,
      distortion,
      scanlineStrength,
      maskStrength,
      dotPitch,
      dotScale,
      falloff,
      brightnessBoost,
      redConvergenceOffset,
      blueConvergenceOffset,
      convergenceStrength,
      glowRadius,
      glowIntensity,
      bloomThreshold,
      bloomRadius,
      bloomIntensity,
      blendMode,
      outputGamma,
    };
    blendModeRef.current = blendMode;
  }, [
    intensity,
    pattern,
    maxDpr,
    distortion,
    scanlineStrength,
    maskStrength,
    dotPitch,
    dotScale,
    falloff,
    brightnessBoost,
    redConvergenceOffset,
    blueConvergenceOffset,
    convergenceStrength,
    glowRadius,
    glowIntensity,
    bloomThreshold,
    bloomRadius,
    bloomIntensity,
    blendMode,
    outputGamma,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // IMPORTANT: We output non-premultiplied RGB in the shader (and optionally premultiply explicitly).
    // Using premultipliedAlpha=true here can cause visible blending artifacts depending on browser.
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    const vs = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    // Pass 1: generate procedural CRT overlay (ported from old CRT shader but without sampling the scene).
    const fsMask = `
      precision mediump float;
      varying vec2 v_uv;
      uniform vec2 u_res;
      uniform float u_time;
      uniform float u_intensity;
      uniform float u_distortion;
      uniform float u_scanlineStrength;
      uniform float u_maskStrength;
      uniform float u_pattern; // 0 monitor, 1 lcd, 2 tv

      // Old CRT controls
      uniform float u_dotPitch;
      uniform float u_dotScale;
      uniform float u_falloff;
      uniform float u_brightnessBoost;
      uniform vec2 u_redConv;
      uniform vec2 u_blueConv;
      uniform float u_convStrength;
      uniform float u_glowRadius;
      uniform float u_glowIntensity;
      uniform float u_outputGamma;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      vec2 radialDistortion(vec2 coord) {
        vec2 cc = coord - 0.5;
        float dist = dot(cc, cc) * u_distortion;
        return coord + cc * (1.0 + dist) * dist;
      }

      float createCircularDot(vec2 point, vec2 center) {
        vec2 delta = point - center;
        float dist = length(delta);
        float dotSize = u_dotPitch * u_dotScale * 0.5;
        return smoothstep(dotSize, dotSize * (1.0 - u_falloff), dist);
      }

      float createRectangularDot(vec2 point, vec2 center, vec2 aspect) {
        vec2 delta = abs(point - center);
        vec2 dotSize = vec2(u_dotPitch * u_dotScale * 0.5) * aspect;
        vec2 rect = smoothstep(dotSize, dotSize * (1.0 - u_falloff), delta);
        return rect.x * rect.y;
      }

      // Old monitor CRT pattern (circular dots, staggered)
      float getMonitorPattern(vec2 coord, float verticalIndex) {
        float colWidth = u_dotPitch;
        float colIndex = floor(coord.x / colWidth);
        float yOffset  = mod(colIndex, 2.0) * (u_dotPitch * 1.5);
        float yPos     = coord.y - yOffset;

        float withinGroup = mod(floor(yPos / u_dotPitch), 3.0);

        vec2 dotCenter = vec2(
          (colIndex + 0.5) * colWidth,
          (floor(yPos / u_dotPitch) + 0.5) * u_dotPitch + yOffset
        );

        float dotIntensity = createCircularDot(coord, dotCenter);
        return (abs(withinGroup - verticalIndex) < 0.5) ? dotIntensity : 0.0;
      }

      // Old LCD pattern (rectangular subpixels R|G|B)
      float getLCDPattern(vec2 coord, float colorIndex) {
        float elementWidth  = u_dotPitch / 3.0;
        float elementHeight = u_dotPitch;
        vec2 elementAspect = vec2(0.31, 1.0);

        float elementPos = mod(floor(coord.x / elementWidth), 3.0);
        if (abs(elementPos - colorIndex) > 0.5) return 0.0;

        vec2 basePos = floor(coord / vec2(elementWidth, elementHeight));
        vec2 center = vec2(
          (basePos.x + 0.5) * elementWidth,
          (basePos.y + 0.5) * elementHeight
        );

        return createRectangularDot(coord, center, elementAspect);
      }

      // Old TV CRT pattern (rectangular elements w/ row shifts)
      float getTVPattern(vec2 coord, float colorIndex) {
        float elementWidth  = u_dotPitch / 3.0;
        float elementHeight = u_dotPitch;
        vec2 elementAspect = vec2(0.31, 1.0);

        float groupIndex = floor(coord.x / (elementWidth * 3.0));
        float yOffset = mod(groupIndex, 2.0) * (elementHeight * 0.5);

        vec2 shiftedCoord = vec2(coord.x, coord.y - yOffset);
        float elementPos = mod(floor(shiftedCoord.x / elementWidth), 3.0);
        if (abs(elementPos - colorIndex) > 0.5) return 0.0;

        vec2 basePos = floor(shiftedCoord / vec2(elementWidth, elementHeight));
        vec2 center = vec2(
          (basePos.x + 0.5) * elementWidth,
          (basePos.y + 0.5) * elementHeight + yOffset
        );

        return createRectangularDot(coord, center, elementAspect);
      }

      float getPattern(vec2 coord, float colorIndex) {
        if (u_pattern < 0.5) return getMonitorPattern(coord, colorIndex);
        if (u_pattern < 1.5) return getLCDPattern(coord, colorIndex);
        return getTVPattern(coord, colorIndex);
      }

      float scanlinesPx(float yPx, float t) {
        // Pixel-space scanlines (stable across DPI/resize).
        float s = sin(yPx * 3.14159 + t * 1.2);
        return 1.0 - u_scanlineStrength + u_scanlineStrength * (0.5 + 0.5 * s);
      }

      vec3 applyGlow(vec2 coord, vec3 base) {
        if (u_glowIntensity <= 0.0 || u_glowRadius <= 0.0) return base;

        // Low-cost radial glow. Old code used 32 taps; we keep this cheap.
        const int SAMPLES = 12;
        float angleStep = 6.28318 / float(SAMPLES);
        vec3 acc = base;
        float total = 1.0;
        for (int i = 0; i < SAMPLES; i++) {
          float a = float(i) * angleStep;
          vec2 offset = vec2(cos(a), sin(a)) * (u_glowRadius * u_dotPitch);
          vec3 pat = vec3(
            getPattern(coord + offset, 0.0),
            getPattern(coord + offset, 1.0),
            getPattern(coord + offset, 2.0)
          );
          float w = exp(-dot(offset, offset) / (4.0 * u_dotPitch * u_dotPitch));
          acc += pat * w * u_glowIntensity;
          total += w * u_glowIntensity;
        }
        return acc / total;
      }

      void main() {
        vec2 uv = v_uv;
        if (u_distortion > 0.0) uv = radialDistortion(uv);

        // outside the barrel warp, fade it out rather than hard cut
        float edge = smoothstep(0.0, 0.02, uv.x) *
                     smoothstep(0.0, 0.02, uv.y) *
                     smoothstep(0.0, 0.02, 1.0 - uv.x) *
                     smoothstep(0.0, 0.02, 1.0 - uv.y);

        vec2 coord = uv * u_res;

        // scanlines + subtle vertical roll band
        float sl = scanlinesPx(coord.y, u_time);
        float roll = smoothstep(0.06, 0.0, abs(fract(uv.y + u_time * 0.06) - 0.5));
        float rollBoost = 1.0 + 0.22 * roll;

        // vignette
        vec2 cc = uv - 0.5;
        float vig = smoothstep(0.85, 0.20, dot(cc, cc));

        // noise / flicker (very subtle)
        float n = hash(coord + u_time * 60.0);
        float grain = (n - 0.5) * 0.08;
        float flick = 0.98 + 0.02 * sin(u_time * 14.0) + grain;

        // Stationary subpixel pattern with convergence offsets (pattern-only, since we don't have scene sampling).
        vec2 rCoord = coord + (u_redConv * u_convStrength) * u_res;
        vec2 bCoord = coord + (u_blueConv * u_convStrength) * u_res;
        vec3 mask = vec3(
          getPattern(rCoord, 0.0),
          getPattern(coord, 1.0),
          getPattern(bCoord, 2.0)
        );

        // Base procedural “phosphor” color
        vec3 col = mask * u_maskStrength;
        col = applyGlow(coord, col);
        col *= sl * rollBoost * vig * flick * u_brightnessBoost;

        // Gamma-ish output shaping (approximate old outputGamma behavior)
        vec3 outCol = pow(max(col, 0.0), vec3(1.0 / max(0.001, u_outputGamma)));

        float alpha = u_intensity * edge;
        gl_FragColor = vec4(outCol, alpha);
      }
    `;

    // Bright-pass (extract bloom source from the base mask pass).
    const fsBright = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_base;
      uniform float u_bloomThreshold;

      void main() {
        vec4 base = texture2D(u_base, v_uv);
        float lum = dot(base.rgb, vec3(0.2126, 0.7152, 0.0722));
        float bright = smoothstep(u_bloomThreshold, u_bloomThreshold + 0.2, lum);
        // Store bright contribution in alpha (gated by base alpha).
        gl_FragColor = vec4(0.0, 0.0, 0.0, bright * base.a);
      }
    `;

    // Pass 3/4: separable blur for bloom buffer.
    const fsBlur = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_tex;
      uniform vec2 u_res;
      uniform vec2 u_dir; // (1,0) or (0,1)
      uniform float u_radius;

      void main() {
        vec2 px = u_dir / u_res;
        // 9-tap Gaussian-ish blur
        vec4 c = vec4(0.0);
        c += texture2D(u_tex, v_uv + px * -4.0 * u_radius) * 0.05;
        c += texture2D(u_tex, v_uv + px * -3.0 * u_radius) * 0.09;
        c += texture2D(u_tex, v_uv + px * -2.0 * u_radius) * 0.12;
        c += texture2D(u_tex, v_uv + px * -1.0 * u_radius) * 0.15;
        c += texture2D(u_tex, v_uv) * 0.18;
        c += texture2D(u_tex, v_uv + px * 1.0 * u_radius) * 0.15;
        c += texture2D(u_tex, v_uv + px * 2.0 * u_radius) * 0.12;
        c += texture2D(u_tex, v_uv + px * 3.0 * u_radius) * 0.09;
        c += texture2D(u_tex, v_uv + px * 4.0 * u_radius) * 0.05;
        gl_FragColor = c;
      }
    `;

    // Final combine: blend base mask + blurred bloom (internal blend only; canvas compositing still handles page blending).
    const fsCombine = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_base;
      uniform sampler2D u_bloom;
      uniform float u_bloomIntensity;
      uniform float u_blendMode; // 0 add,1 screen,2 soft,3 lighten,4 hdr

      vec3 screenBlend(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }
      vec3 soften(vec3 a, vec3 b) {
        // soft-light-ish approximation
        return mix(
          2.0 * a * b + a * a * (1.0 - 2.0 * b),
          2.0 * a * (1.0 - b) + sqrt(max(a, 0.0)) * (2.0 * b - 1.0),
          step(0.5, b)
        );
      }
      vec3 hdrBlend(vec3 a, vec3 b) {
        vec3 hdr = a + b;
        return hdr / (1.0 + hdr);
      }

      void main() {
        vec4 base = texture2D(u_base, v_uv);
        vec4 bloom = texture2D(u_bloom, v_uv);

        // Bloom source is alpha from mask pass; treat it as light
        vec3 bcol = vec3(bloom.a) * u_bloomIntensity;
        vec3 col;
        if (u_blendMode < 0.5) col = base.rgb + bcol;
        else if (u_blendMode < 1.5) col = screenBlend(base.rgb, bcol);
        else if (u_blendMode < 2.5) col = soften(base.rgb, bcol);
        else if (u_blendMode < 3.5) col = max(base.rgb, bcol);
        else col = hdrBlend(base.rgb, bcol);

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), base.a);
      }
    `;

    let program: WebGLProgram;
    try {
      program = createProgram(gl, vs, fsMask);
    } catch {
      return;
    }

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_res');
    const intensityLoc = gl.getUniformLocation(program, 'u_intensity');
    const patternLoc = gl.getUniformLocation(program, 'u_pattern');
    const distortionLoc = gl.getUniformLocation(program, 'u_distortion');
    const scanlineLoc = gl.getUniformLocation(program, 'u_scanlineStrength');
    const maskLoc = gl.getUniformLocation(program, 'u_maskStrength');
    const dotPitchLoc = gl.getUniformLocation(program, 'u_dotPitch');
    const dotScaleLoc = gl.getUniformLocation(program, 'u_dotScale');
    const falloffLoc = gl.getUniformLocation(program, 'u_falloff');
    const brightnessLoc = gl.getUniformLocation(program, 'u_brightnessBoost');
    const redConvLoc = gl.getUniformLocation(program, 'u_redConv');
    const blueConvLoc = gl.getUniformLocation(program, 'u_blueConv');
    const convStrengthLoc = gl.getUniformLocation(program, 'u_convStrength');
    const glowRadiusLoc = gl.getUniformLocation(program, 'u_glowRadius');
    const glowIntensityLoc = gl.getUniformLocation(program, 'u_glowIntensity');
    const outputGammaLoc = gl.getUniformLocation(program, 'u_outputGamma');

    let brightProgram: WebGLProgram | null = null;
    let blurProgram: WebGLProgram | null = null;
    let combineProgram: WebGLProgram | null = null;
    try {
      brightProgram = createProgram(gl, vs, fsBright);
      blurProgram = createProgram(gl, vs, fsBlur);
      combineProgram = createProgram(gl, vs, fsCombine);
    } catch {
      // If extra programs fail, we can still render the base mask program directly.
      brightProgram = null;
      blurProgram = null;
      combineProgram = null;
    }

    const brightPosLoc = brightProgram ? gl.getAttribLocation(brightProgram, 'a_pos') : -1;
    const brightBaseLoc = brightProgram ? gl.getUniformLocation(brightProgram, 'u_base') : null;
    const brightThresholdLoc = brightProgram ? gl.getUniformLocation(brightProgram, 'u_bloomThreshold') : null;

    const blurPosLoc = blurProgram ? gl.getAttribLocation(blurProgram, 'a_pos') : -1;
    const blurTexLoc = blurProgram ? gl.getUniformLocation(blurProgram, 'u_tex') : null;
    const blurResLoc = blurProgram ? gl.getUniformLocation(blurProgram, 'u_res') : null;
    const blurDirLoc = blurProgram ? gl.getUniformLocation(blurProgram, 'u_dir') : null;
    const blurRadiusLoc = blurProgram ? gl.getUniformLocation(blurProgram, 'u_radius') : null;

    const combinePosLoc = combineProgram ? gl.getAttribLocation(combineProgram, 'a_pos') : -1;
    const combineBaseLoc = combineProgram ? gl.getUniformLocation(combineProgram, 'u_base') : null;
    const combineBloomLoc = combineProgram ? gl.getUniformLocation(combineProgram, 'u_bloom') : null;
    const combineBloomIntensityLoc = combineProgram ? gl.getUniformLocation(combineProgram, 'u_bloomIntensity') : null;
    const combineBlendModeLoc = combineProgram ? gl.getUniformLocation(combineProgram, 'u_blendMode') : null;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // IMPORTANT: do NOT enable WebGL blending. We want straight-alpha pixels in the canvas,
    // and let the browser composite the canvas over the DOM.
    gl.disable(gl.BLEND);

    // Offscreen buffers for bloom (created on-demand / resized as needed)
    let texBase: WebGLTexture | null = null;
    let fbBase: WebGLFramebuffer | null = null;
    let texBright: WebGLTexture | null = null;
    let fbBright: WebGLFramebuffer | null = null;
    let texBlur1: WebGLTexture | null = null;
    let fbBlur1: WebGLFramebuffer | null = null;
    let texBlur2: WebGLTexture | null = null;
    let fbBlur2: WebGLFramebuffer | null = null;

    const setSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, Math.max(0.25, paramsRef.current.maxDpr));
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        gl.viewport(0, 0, w, h);

        // Resize / recreate bloom buffers
        try {
          if (texBase) gl.deleteTexture(texBase);
          if (fbBase) gl.deleteFramebuffer(fbBase);
          if (texBright) gl.deleteTexture(texBright);
          if (fbBright) gl.deleteFramebuffer(fbBright);
          if (texBlur1) gl.deleteTexture(texBlur1);
          if (fbBlur1) gl.deleteFramebuffer(fbBlur1);
          if (texBlur2) gl.deleteTexture(texBlur2);
          if (fbBlur2) gl.deleteFramebuffer(fbBlur2);
        } catch {
          // ignore cleanup errors
        }
        texBase = null;
        fbBase = null;
        texBright = null;
        fbBright = null;
        texBlur1 = null;
        fbBlur1 = null;
        texBlur2 = null;
        fbBlur2 = null;

        if (brightProgram && blurProgram && combineProgram) {
          try {
            texBase = createTexture(gl, w, h);
            fbBase = createFramebuffer(gl, texBase);
            texBright = createTexture(gl, w, h);
            fbBright = createFramebuffer(gl, texBright);
            texBlur1 = createTexture(gl, w, h);
            fbBlur1 = createFramebuffer(gl, texBlur1);
            texBlur2 = createTexture(gl, w, h);
            fbBlur2 = createFramebuffer(gl, texBlur2);
          } catch {
            texBase = null;
            fbBase = null;
            texBright = null;
            fbBright = null;
            texBlur1 = null;
            fbBlur1 = null;
            texBlur2 = null;
            fbBlur2 = null;
          }
        }
      }
    };

    const start = performance.now();
    const frame = () => {
      setSize();

      const t = (performance.now() - start) / 1000;
      const p = paramsRef.current;
      const patternNum = p.pattern === 'monitor' ? 0 : p.pattern === 'lcd' ? 1 : 2;
      const blendModeNum =
        p.blendMode === 'add'
          ? 0
          : p.blendMode === 'screen'
            ? 1
            : p.blendMode === 'soft'
              ? 2
              : p.blendMode === 'lighten'
                ? 3
                : 4;

      // IMPORTANT: bind the CRT program BEFORE updating its uniforms.
      // Otherwise, uniforms get applied to whichever program ran last frame (blur/combine),
      // making the UI sliders look like they do nothing.
      gl.useProgram(program);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform1f(timeLoc, t);
      gl.uniform1f(intensityLoc, Math.max(0, Math.min(1, p.intensity)));
      gl.uniform1f(patternLoc, patternNum);
      gl.uniform1f(distortionLoc, Math.max(0, p.distortion));
      gl.uniform1f(scanlineLoc, Math.max(0, p.scanlineStrength));
      gl.uniform1f(maskLoc, Math.max(0, p.maskStrength));
      gl.uniform1f(dotPitchLoc, Math.max(0.1, p.dotPitch));
      gl.uniform1f(dotScaleLoc, Math.max(0.01, p.dotScale));
      gl.uniform1f(falloffLoc, Math.max(0.0, Math.min(1.0, p.falloff)));
      gl.uniform1f(brightnessLoc, Math.max(0.0, p.brightnessBoost));
      gl.uniform2f(redConvLoc, p.redConvergenceOffset[0], p.redConvergenceOffset[1]);
      gl.uniform2f(blueConvLoc, p.blueConvergenceOffset[0], p.blueConvergenceOffset[1]);
      gl.uniform1f(convStrengthLoc, Math.max(0.0, p.convergenceStrength));
      gl.uniform1f(glowRadiusLoc, Math.max(0.0, p.glowRadius));
      gl.uniform1f(glowIntensityLoc, Math.max(0.0, p.glowIntensity));
      gl.uniform1f(outputGammaLoc, Math.max(0.1, p.outputGamma));

      // Pass 1: render mask into offscreen (if possible), else render directly.
      const canBloom = !!(
        brightProgram &&
        blurProgram &&
        combineProgram &&
        texBase &&
        fbBase &&
        texBright &&
        fbBright &&
        texBlur1 &&
        fbBlur1 &&
        texBlur2 &&
        fbBlur2
      );

      if (canBloom) {
        // 1) Base mask
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbBase);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 2) Bright pass (extract bloom source)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbBright);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(brightProgram!);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(brightPosLoc);
        gl.vertexAttribPointer(brightPosLoc, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBase);
        gl.uniform1i(brightBaseLoc, 0);
        gl.uniform1f(brightThresholdLoc, Math.max(0.0, Math.min(1.0, p.bloomThreshold)));
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 3) Blur horizontal
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbBlur1);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(blurProgram!);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(blurPosLoc);
        gl.vertexAttribPointer(blurPosLoc, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBright);
        gl.uniform1i(blurTexLoc, 0);
        gl.uniform2f(blurResLoc, canvas.width, canvas.height);
        gl.uniform2f(blurDirLoc, 1, 0);
        gl.uniform1f(blurRadiusLoc, Math.max(0.0, p.bloomRadius));
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 4) Blur vertical
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbBlur2);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBlur1);
        gl.uniform1i(blurTexLoc, 0);
        gl.uniform2f(blurDirLoc, 0, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Final: combine to screen framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(combineProgram!);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(combinePosLoc);
        gl.vertexAttribPointer(combinePosLoc, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texBase);
        gl.uniform1i(combineBaseLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texBlur2);
        gl.uniform1i(combineBloomLoc, 1);

        gl.uniform1f(combineBloomIntensityLoc, Math.max(0.0, p.bloomIntensity));
        gl.uniform1f(combineBlendModeLoc, blendModeNum);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      rafRef.current = window.requestAnimationFrame(frame);
    };

    frame();
    window.addEventListener('resize', setSize);

    return () => {
      window.removeEventListener('resize', setSize);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      try {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        if (brightProgram) gl.deleteProgram(brightProgram);
        if (blurProgram) gl.deleteProgram(blurProgram);
        if (combineProgram) gl.deleteProgram(combineProgram);
        if (texBase) gl.deleteTexture(texBase);
        if (fbBase) gl.deleteFramebuffer(fbBase);
        if (texBright) gl.deleteTexture(texBright);
        if (fbBright) gl.deleteFramebuffer(fbBright);
        if (texBlur1) gl.deleteTexture(texBlur1);
        if (fbBlur1) gl.deleteFramebuffer(fbBlur1);
        if (texBlur2) gl.deleteTexture(texBlur2);
        if (fbBlur2) gl.deleteFramebuffer(fbBlur2);
      } catch {
        // ignore cleanup errors
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0"
      style={{ zIndex }}
      aria-hidden="true"
    />
  );
};


