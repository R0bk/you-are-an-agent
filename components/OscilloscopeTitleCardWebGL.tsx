import React, { useEffect, useRef, useState, useCallback } from 'react';
import opentype from 'opentype.js';

interface Point {
  x: number;
  y: number;
}

// Animation phases after text drawing
type AnimationPhase = 'text' | 'dissolve' | 'lissajous' | 'collapse' | 'fadeout';

// Phase durations in seconds
const DISSOLVE_DURATION = 1.4;   // Text morphs into Lissajous (longer for smooth blend)
const LISSAJOUS_DURATION = 2.0;  // Lissajous bloom
const COLLAPSE_DURATION = 0.8;   // Spiral collapse
const FADEOUT_DURATION = 0.2;

interface OscilloscopeTitleCardWebGLProps {
  onComplete?: () => void;
  skipDelay?: number;
  /** Barrel distortion strength (0 = none, 0.15-0.25 = subtle CRT curve). Negative = barrel, positive = pincushion. */
  distortion?: number;
}

// Vertex shader for drawing lines
const lineVertexShader = `
  attribute vec2 a_position;
  attribute float a_alpha;
  uniform vec2 u_resolution;
  varying float v_alpha;

  void main() {
    // Convert from pixels to clip space
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_alpha = a_alpha;
  }
`;

// Fragment shader for drawing lines with glow
const lineFragmentShader = `
  precision mediump float;
  varying float v_alpha;
  uniform vec3 u_color;

  void main() {
    gl_FragColor = vec4(u_color, v_alpha);
  }
`;

// Vertex shader for point sprites (beam dot) - now with per-vertex brightness
const pointVertexShader = `
  attribute vec2 a_position;
  attribute float a_brightness;
  uniform vec2 u_resolution;
  uniform float u_pointSize;
  varying float v_brightness;

  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    gl_PointSize = u_pointSize;
    v_brightness = a_brightness;
  }
`;

// Fragment shader for circular point sprites - uses per-vertex brightness
const pointFragmentShader = `
  precision mediump float;
  uniform vec3 u_color;
  varying float v_brightness;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center) * 2.0;

    if (dist > 1.0) discard;

    // Apply per-vertex brightness to match fade decay
    gl_FragColor = vec4(u_color * v_brightness, 1.0);
  }
`;

// Vertex shader for fullscreen quad
const quadVertexShader = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;

  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0, 1);
  }
`;

// Fragment shader for fade pass (phosphor decay)
// Models real phosphor behavior: fast initial drop, lingering tail
const fadeFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_fadeAmount;

  void main() {
    vec4 color = texture2D(u_texture, v_texCoord);

    // Get current brightness
    float brightness = max(color.r, max(color.g, color.b));

    // Phosphor-like decay: brighter pixels fade MUCH faster (sharp initial drop)
    // Dim pixels fade slower (lingering tail)
    float fadeFactor = pow(u_fadeAmount, 1.0 + brightness * 4.0);

    // Hard cutoff for very dim values to ensure complete fadeout
    vec4 faded = color * fadeFactor;
    float maxVal = max(faded.r, max(faded.g, faded.b));
    if (maxVal < 0.1) {
      faded = vec4(0.0, 0.0, 0.0, 1.0);  // Keep alpha=1 so it actually writes black!
    }

    gl_FragColor = vec4(faded.rgb, 1.0);  // Always output alpha=1
  }
`;

// Fragment shader for bloom horizontal pass
const bloomHFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_bloomSize;
  uniform float u_bloomThreshold;
  uniform float u_bloomBoost;

  void main() {
    vec4 color = vec4(0.0);

    // 13-tap Gaussian kernel - tighter grid, larger coverage
    float weights[13];
    weights[0] = 0.116;
    weights[1] = 0.110;
    weights[2] = 0.095;
    weights[3] = 0.075;
    weights[4] = 0.054;
    weights[5] = 0.036;
    weights[6] = 0.022;
    weights[7] = 0.012;
    weights[8] = 0.006;
    weights[9] = 0.003;
    weights[10] = 0.0013;
    weights[11] = 0.0005;
    weights[12] = 0.0002;

    vec2 texOffset = vec2(u_bloomSize / u_resolution.x, 0.0);

    for (int i = 0; i < 13; i++) {
      vec4 sampleP = texture2D(u_texture, v_texCoord + texOffset * float(i));
      vec4 sampleN = texture2D(u_texture, v_texCoord - texOffset * float(i));

      // Threshold + boost: only bloom bright pixels, then amplify
      float brightP = max(sampleP.r, max(sampleP.g, sampleP.b));
      float brightN = max(sampleN.r, max(sampleN.g, sampleN.b));
      float factorP = max(0.0, brightP - u_bloomThreshold) * u_bloomBoost;
      float factorN = max(0.0, brightN - u_bloomThreshold) * u_bloomBoost;

      if (i == 0) {
        color += sampleP * factorP * weights[0];
      } else {
        color += sampleP * factorP * weights[i];
        color += sampleN * factorN * weights[i];
      }
    }

    gl_FragColor = color;
  }
`;

// Fragment shader for bloom vertical pass (no threshold - already applied in H pass)
const bloomVFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_bloomSize;

  void main() {
    vec4 color = vec4(0.0);

    // 13-tap Gaussian kernel
    float weights[13];
    weights[0] = 0.116;
    weights[1] = 0.110;
    weights[2] = 0.095;
    weights[3] = 0.075;
    weights[4] = 0.054;
    weights[5] = 0.036;
    weights[6] = 0.022;
    weights[7] = 0.012;
    weights[8] = 0.006;
    weights[9] = 0.003;
    weights[10] = 0.0013;
    weights[11] = 0.0005;
    weights[12] = 0.0002;

    vec2 texOffset = vec2(0.0, u_bloomSize / u_resolution.y);

    color += texture2D(u_texture, v_texCoord) * weights[0];
    for (int i = 1; i < 13; i++) {
      color += texture2D(u_texture, v_texCoord + texOffset * float(i)) * weights[i];
      color += texture2D(u_texture, v_texCoord - texOffset * float(i)) * weights[i];
    }

    gl_FragColor = color;
  }
`;

// Fragment shader for smooth bloom horizontal pass (continuous glow with threshold+boost)
const smoothBloomHFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_glowThreshold;
  uniform float u_glowBoost;
  uniform float u_glowRadius;

  void main() {
    vec4 color = vec4(0.0);

    // Exponential decay from center
    float maxTaps = 1024.0;
    float centerWeight = 0.8;
    float decay = 0.01 / u_glowRadius ; // decay rate, tweak as needed (smaller = wider)

    vec2 texOffset = vec2(1.0 / u_resolution.x, 0.0); 
    color += texture2D(u_texture, v_texCoord) * centerWeight;  

    for (int i = 1; i < 1024; i++) {
      float weight = exp(-decay * float(i));
      color += texture2D(u_texture, v_texCoord + texOffset * float(i)) * weight;
      color += texture2D(u_texture, v_texCoord - texOffset * float(i)) * weight;
    }

    gl_FragColor = color;
  }
`;

const smoothBloomVFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_glowRadius;

  void main() {
    vec4 color = vec4(0.0);

    // Exponential decay from center
    float maxTaps = 1024.0;
    float centerWeight = 3.0;
    float decay = 0.03 / u_glowRadius; // decay rate, tweak as needed (smaller = wider)

    vec2 texOffset = vec2(0.0, u_glowRadius / u_resolution.y);

    color += texture2D(u_texture, v_texCoord) * centerWeight;
    for (int i = 1; i < 1024; i++) {
      float weight = exp(-decay * float(i));
      color += texture2D(u_texture, v_texCoord + texOffset * float(i)) * weight;
      color += texture2D(u_texture, v_texCoord - texOffset * float(i)) * weight;
    }

    gl_FragColor = color;
  }
`;

// Fragment shader for compositing with barrel distortion
const compositeFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_mainTexture;
  uniform sampler2D u_bloomTexture;
  uniform sampler2D u_smoothBloomTexture;
  uniform float u_distortion;
  uniform float u_bloomIntensity;
  uniform float u_smoothBloomIntensity;

  vec2 applyBarrelDistortion(vec2 uv, float k) {
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    float factor = 1.0 + k * r2;
    return centered * factor + 0.5;
  }

  void main() {
    vec2 distortedUV = applyBarrelDistortion(v_texCoord, u_distortion);

    // Check if we're outside the valid texture range
    if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec4 mainColor = texture2D(u_mainTexture, distortedUV);
    vec4 bloomColor = texture2D(u_bloomTexture, distortedUV);
    vec4 smoothBloomColor = texture2D(u_smoothBloomTexture, distortedUV);

    // Add both blooms: grid pattern + smooth glow
    vec4 finalColor = mainColor + bloomColor * u_bloomIntensity + smoothBloomColor * u_smoothBloomIntensity;

    // Final hard cutoff to ensure complete black
    float maxBrightness = max(finalColor.r, max(finalColor.g, finalColor.b));
    if (maxBrightness < 0.02) {
      finalColor = vec4(0.0);
    }

    gl_FragColor = vec4(finalColor.rgb, 1.0);  // Alpha=1 always
  }
`;

// Helper to compile shaders
function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

// Helper to create program
function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

// Helper to create framebuffer with texture
function createFramebuffer(gl: WebGLRenderingContext, width: number, height: number): { framebuffer: WebGLFramebuffer; texture: WebGLTexture } | null {
  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();

  if (!framebuffer || !texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { framebuffer, texture };
}

export const OscilloscopeTitleCardWebGL: React.FC<OscilloscopeTitleCardWebGLProps> = ({
  onComplete,
  skipDelay = 3000,
  distortion = 0.3
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);
  const fontRef = useRef<opentype.Font | null>(null);

  // Load font on mount
  useEffect(() => {
    opentype.load('/fonts/Arial-Black.ttf', (err, font) => {
      if (err) {
        console.error('Could not load font:', err);
        return;
      }
      fontRef.current = font;
      setFontLoaded(true);
    });
  }, []);

  const setupWebGL = useCallback((canvas: HTMLCanvasElement, font: opentype.Font) => {
    const gl = canvas.getContext('webgl', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      console.error('WebGL not supported');
      return null;
    }

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Create shaders and programs
    const lineVS = createShader(gl, gl.VERTEX_SHADER, lineVertexShader);
    const lineFS = createShader(gl, gl.FRAGMENT_SHADER, lineFragmentShader);
    const pointVS = createShader(gl, gl.VERTEX_SHADER, pointVertexShader);
    const pointFS = createShader(gl, gl.FRAGMENT_SHADER, pointFragmentShader);
    const quadVS = createShader(gl, gl.VERTEX_SHADER, quadVertexShader);
    const fadeFS = createShader(gl, gl.FRAGMENT_SHADER, fadeFragmentShader);
    const bloomHFS = createShader(gl, gl.FRAGMENT_SHADER, bloomHFragmentShader);
    const bloomVFS = createShader(gl, gl.FRAGMENT_SHADER, bloomVFragmentShader);
    const smoothBloomHFS = createShader(gl, gl.FRAGMENT_SHADER, smoothBloomHFragmentShader);
    const smoothBloomVFS = createShader(gl, gl.FRAGMENT_SHADER, smoothBloomVFragmentShader);
    const compositeFS = createShader(gl, gl.FRAGMENT_SHADER, compositeFragmentShader);

    if (!lineVS || !lineFS || !pointVS || !pointFS || !quadVS || !fadeFS || !bloomHFS || !bloomVFS || !smoothBloomHFS || !smoothBloomVFS || !compositeFS) {
      return null;
    }

    const lineProgram = createProgram(gl, lineVS, lineFS);
    const pointProgram = createProgram(gl, pointVS, pointFS);
    const fadeProgram = createProgram(gl, quadVS, fadeFS);
    const bloomHProgram = createProgram(gl, quadVS, bloomHFS);
    const bloomVProgram = createProgram(gl, quadVS, bloomVFS);
    const smoothBloomHProgram = createProgram(gl, quadVS, smoothBloomHFS);
    const smoothBloomVProgram = createProgram(gl, quadVS, smoothBloomVFS);
    const compositeProgram = createProgram(gl, quadVS, compositeFS);

    if (!lineProgram || !pointProgram || !fadeProgram || !bloomHProgram || !bloomVProgram || !smoothBloomHProgram || !smoothBloomVProgram || !compositeProgram) {
      return null;
    }

    // Get attribute and uniform locations
    const lineProgramInfo = {
      program: lineProgram,
      attribs: {
        position: gl.getAttribLocation(lineProgram, 'a_position'),
        alpha: gl.getAttribLocation(lineProgram, 'a_alpha'),
      },
      uniforms: {
        resolution: gl.getUniformLocation(lineProgram, 'u_resolution'),
        color: gl.getUniformLocation(lineProgram, 'u_color'),
      },
    };

    const pointProgramInfo = {
      program: pointProgram,
      attribs: {
        position: gl.getAttribLocation(pointProgram, 'a_position'),
        brightness: gl.getAttribLocation(pointProgram, 'a_brightness'),
      },
      uniforms: {
        resolution: gl.getUniformLocation(pointProgram, 'u_resolution'),
        color: gl.getUniformLocation(pointProgram, 'u_color'),
        pointSize: gl.getUniformLocation(pointProgram, 'u_pointSize'),
      },
    };

    const fadeProgramInfo = {
      program: fadeProgram,
      attribs: {
        position: gl.getAttribLocation(fadeProgram, 'a_position'),
      },
      uniforms: {
        texture: gl.getUniformLocation(fadeProgram, 'u_texture'),
        fadeAmount: gl.getUniformLocation(fadeProgram, 'u_fadeAmount'),
      },
    };

    const bloomHProgramInfo = {
      program: bloomHProgram,
      attribs: {
        position: gl.getAttribLocation(bloomHProgram, 'a_position'),
      },
      uniforms: {
        texture: gl.getUniformLocation(bloomHProgram, 'u_texture'),
        resolution: gl.getUniformLocation(bloomHProgram, 'u_resolution'),
        bloomSize: gl.getUniformLocation(bloomHProgram, 'u_bloomSize'),
        bloomThreshold: gl.getUniformLocation(bloomHProgram, 'u_bloomThreshold'),
        bloomBoost: gl.getUniformLocation(bloomHProgram, 'u_bloomBoost'),
      },
    };

    const bloomVProgramInfo = {
      program: bloomVProgram,
      attribs: {
        position: gl.getAttribLocation(bloomVProgram, 'a_position'),
      },
      uniforms: {
        texture: gl.getUniformLocation(bloomVProgram, 'u_texture'),
        resolution: gl.getUniformLocation(bloomVProgram, 'u_resolution'),
        bloomSize: gl.getUniformLocation(bloomVProgram, 'u_bloomSize'),
      },
    };

    const smoothBloomHProgramInfo = {
      program: smoothBloomHProgram,
      attribs: {
        position: gl.getAttribLocation(smoothBloomHProgram, 'a_position'),
      },
      uniforms: {
        texture: gl.getUniformLocation(smoothBloomHProgram, 'u_texture'),
        resolution: gl.getUniformLocation(smoothBloomHProgram, 'u_resolution'),
        glowThreshold: gl.getUniformLocation(smoothBloomHProgram, 'u_glowThreshold'),
        glowBoost: gl.getUniformLocation(smoothBloomHProgram, 'u_glowBoost'),
        glowRadius: gl.getUniformLocation(smoothBloomHProgram, 'u_glowRadius'),
      },
    };

    const smoothBloomVProgramInfo = {
      program: smoothBloomVProgram,
      attribs: {
        position: gl.getAttribLocation(smoothBloomVProgram, 'a_position'),
      },
      uniforms: {
        texture: gl.getUniformLocation(smoothBloomVProgram, 'u_texture'),
        resolution: gl.getUniformLocation(smoothBloomVProgram, 'u_resolution'),
        glowRadius: gl.getUniformLocation(smoothBloomVProgram, 'u_glowRadius'),
      },
    };

    const compositeProgramInfo = {
      program: compositeProgram,
      attribs: {
        position: gl.getAttribLocation(compositeProgram, 'a_position'),
      },
      uniforms: {
        mainTexture: gl.getUniformLocation(compositeProgram, 'u_mainTexture'),
        bloomTexture: gl.getUniformLocation(compositeProgram, 'u_bloomTexture'),
        smoothBloomTexture: gl.getUniformLocation(compositeProgram, 'u_smoothBloomTexture'),
        distortion: gl.getUniformLocation(compositeProgram, 'u_distortion'),
        bloomIntensity: gl.getUniformLocation(compositeProgram, 'u_bloomIntensity'),
        smoothBloomIntensity: gl.getUniformLocation(compositeProgram, 'u_smoothBloomIntensity'),
      },
    };

    // Create buffers
    const lineBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();
    const quadBuffer = gl.createBuffer();

    // Setup quad buffer for fullscreen passes
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    // Create framebuffers
    const width = canvas.width;
    const height = canvas.height;

    const mainFB1 = createFramebuffer(gl, width, height);
    const mainFB2 = createFramebuffer(gl, width, height);
    const bloomFB1 = createFramebuffer(gl, width / 2, height / 2);
    const bloomFB2 = createFramebuffer(gl, width / 2, height / 2);
    const smoothBloomFB1 = createFramebuffer(gl, width / 2, height / 2);
    const smoothBloomFB2 = createFramebuffer(gl, width / 2, height / 2);

    if (!mainFB1 || !mainFB2 || !bloomFB1 || !bloomFB2 || !smoothBloomFB1 || !smoothBloomFB2) {
      return null;
    }

    // Clear framebuffers initially
    [mainFB1, mainFB2, bloomFB1, bloomFB2, smoothBloomFB1, smoothBloomFB2].forEach(fb => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.framebuffer);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Generate path segments from font
    const distance = (p1: Point, p2: Point): number => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const resampleByArcLength = (points: Point[], targetSpacing: number): Point[] => {
      if (points.length < 2) return points;
      const arcLengths: number[] = [0];
      for (let i = 1; i < points.length; i++) {
        arcLengths.push(arcLengths[i - 1] + distance(points[i - 1], points[i]));
      }
      const totalLength = arcLengths[arcLengths.length - 1];
      const numSamples = Math.max(2, Math.ceil(totalLength / targetSpacing));
      const sampledPoints: Point[] = [];

      for (let i = 0; i < numSamples; i++) {
        const targetDist = (i / (numSamples - 1)) * totalLength;
        let segmentIdx = 0;
        for (let j = 0; j < arcLengths.length - 1; j++) {
          if (arcLengths[j + 1] >= targetDist) {
            segmentIdx = j;
            break;
          }
        }
        const segmentStart = arcLengths[segmentIdx];
        const segmentEnd = arcLengths[segmentIdx + 1];
        const segmentLength = segmentEnd - segmentStart;
        const t = segmentLength > 0 ? (targetDist - segmentStart) / segmentLength : 0;
        const p1 = points[segmentIdx];
        const p2 = points[segmentIdx + 1];
        sampledPoints.push({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t
        });
      }
      return sampledPoints;
    };

    const samplePath = (path: opentype.Path, targetPointSpacing = 5): Point[][] => {
      const strokes: Point[][] = [];
      let currentStroke: Point[] = [];
      const denseSampleRate = 50;

      path.commands.forEach((cmd) => {
        if (cmd.type === 'M') {
          if (currentStroke.length > 0) strokes.push(currentStroke);
          currentStroke = [{ x: cmd.x, y: cmd.y }];
        } else if (cmd.type === 'L') {
          currentStroke.push({ x: cmd.x, y: cmd.y });
        } else if (cmd.type === 'Q') {
          const lastPoint = currentStroke[currentStroke.length - 1];
          for (let i = 1; i <= denseSampleRate; i++) {
            const t = i / denseSampleRate;
            const x = (1 - t) * (1 - t) * lastPoint.x + 2 * (1 - t) * t * cmd.x1 + t * t * cmd.x;
            const y = (1 - t) * (1 - t) * lastPoint.y + 2 * (1 - t) * t * cmd.y1 + t * t * cmd.y;
            currentStroke.push({ x, y });
          }
        } else if (cmd.type === 'C') {
          const lastPoint = currentStroke[currentStroke.length - 1];
          for (let i = 1; i <= denseSampleRate; i++) {
            const t = i / denseSampleRate;
            const t2 = t * t;
            const t3 = t2 * t;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const x = mt3 * lastPoint.x + 3 * mt2 * t * cmd.x1 + 3 * mt * t2 * cmd.x2 + t3 * cmd.x;
            const y = mt3 * lastPoint.y + 3 * mt2 * t * cmd.y1 + 3 * mt * t2 * cmd.y2 + t3 * cmd.y;
            currentStroke.push({ x, y });
          }
        } else if (cmd.type === 'Z') {
          if (currentStroke.length > 0) currentStroke.push({ ...currentStroke[0] });
        }
      });

      if (currentStroke.length > 0) strokes.push(currentStroke);
      return strokes.map(stroke => resampleByArcLength(stroke, targetPointSpacing));
    };

    // Build letter paths
    const letterPaths: { [key: string]: Point[][] } = {};
    const text = "YOU ARE AN AGENT";
    const uniqueChars = Array.from(new Set(text.replace(/ /g, '')));

    uniqueChars.forEach(char => {
      const glyph = font.charToGlyph(char);
      const path = glyph.getPath(0, 0, 1000);
      const rawStrokes = samplePath(path, 15);
      const bbox = glyph.getBoundingBox();
      const bboxWidth = bbox.x2 - bbox.x1;
      const bboxHeight = bbox.y2 - bbox.y1;

      const normalizedStrokes = rawStrokes.map(stroke =>
        stroke.map(point => ({
          x: (point.x - bbox.x1) / bboxWidth,
          y: (point.y - bbox.y1) / bboxHeight
        }))
      );
      letterPaths[char] = normalizedStrokes;
    });

    const lines = ["YOU ARE", "AN AGENT"];
    const letterWidth = 140;
    const letterHeight = 200;
    const letterSpacing = 32;
    const wordSpacing = 80;
    const lineSpacing = 140;

    interface PathSegment {
      start: Point;
      end: Point;
      strokeId: number;
    }

    const allSegments: PathSegment[] = [];
    let strokeIdCounter = 0;

    const totalHeight = lines.length * letterHeight + (lines.length - 1) * lineSpacing;
    const startY = height / 2 - totalHeight / 4;

    lines.forEach((line, lineIndex) => {
      const words = line.split(' ');
      let currentX = 0;
      const currentY = startY + lineIndex * (letterHeight + lineSpacing);

      words.forEach((word, wordIndex) => {
        if (wordIndex > 0) currentX += wordSpacing;

        for (let i = 0; i < word.length; i++) {
          const letter = word[i];
          const paths = letterPaths[letter];

          if (paths) {
            paths.forEach(path => {
              const currentStrokeId = strokeIdCounter++;
              for (let j = 0; j < path.length - 1; j++) {
                const start = {
                  x: currentX + path[j].x * letterWidth,
                  y: currentY + path[j].y * letterHeight
                };
                const end = {
                  x: currentX + path[j + 1].x * letterWidth,
                  y: currentY + path[j + 1].y * letterHeight
                };
                allSegments.push({ start, end, strokeId: currentStrokeId });
              }
            });
          }
          currentX += letterWidth + letterSpacing;
        }
      });

      const lineWidth = currentX - letterSpacing;
      const offsetX = (width - lineWidth) / 2;

      const lineStartSegment = allSegments.findIndex(seg =>
        Math.abs(seg.start.y - currentY) < 1
      );
      if (lineStartSegment >= 0) {
        for (let i = lineStartSegment; i < allSegments.length; i++) {
          if (Math.abs(allSegments[i].start.y - currentY) < letterHeight + 10) {
            allSegments[i].start.x += offsetX;
            allSegments[i].end.x += offsetX;
          }
        }
      }
    });

    return {
      gl,
      lineProgram: lineProgramInfo,
      pointProgram: pointProgramInfo,
      fadeProgram: fadeProgramInfo,
      bloomHProgram: bloomHProgramInfo,
      bloomVProgram: bloomVProgramInfo,
      smoothBloomHProgram: smoothBloomHProgramInfo,
      smoothBloomVProgram: smoothBloomVProgramInfo,
      compositeProgram: compositeProgramInfo,
      lineBuffer,
      pointBuffer,
      quadBuffer,
      mainFB1,
      mainFB2,
      bloomFB1,
      bloomFB2,
      smoothBloomFB1,
      smoothBloomFB2,
      allSegments,
      width,
      height,
    };
  }, []);

  useEffect(() => {
    if (!fontLoaded || !fontRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const webglState = setupWebGL(canvas, fontRef.current);
    if (!webglState) {
      console.error('Failed to initialize WebGL');
      return;
    }

    const {
      gl,
      pointProgram,
      fadeProgram,
      bloomHProgram,
      bloomVProgram,
      smoothBloomHProgram,
      smoothBloomVProgram,
      compositeProgram,
      pointBuffer,
      quadBuffer,
      mainFB1,
      mainFB2,
      bloomFB1,
      bloomFB2,
      smoothBloomFB1,
      smoothBloomFB2,
      allSegments,
      width,
      height,
    } = webglState;

    let currentFB = mainFB1;
    let previousFB = mainFB2;

    // Animation state
    let t = 0;
    const maxSpeed = 1000.0;
    const accelerationDuration = 8.0;
    const startTime = Date.now();
    let lastFrameTime = Date.now();

    // Phase state machine
    let animationPhase: AnimationPhase = 'text';
    let phaseStartTime = 0;
    let lissajousTime = 0; // Parametric time for Lissajous curves

    // Text phase: run through text multiple times before transitioning
    let textPassCount = 0;
    const textPassesBeforeTransition = 30; // Run through text 30 times before music animation

    // Track last text position for smooth transition to Lissajous
    let lastTextPosition: Point = { x: width / 2, y: height / 2 };

    // Time-based decay constants
    // Target: at 60fps (16.67ms), a full-bright pixel should decay to ~0.237
    // This means pow(decayPerMs, 16.67) = 0.237 for brightness=1.0
    // So decayPerMs = pow(0.237, 1/16.67) ≈ 0.917
    const targetFps = 60;
    const targetFrameMs = 1000 / targetFps;
    const fadeBase = 0.75;
    const fullBrightDecayPerFrame = Math.pow(fadeBase, 1.0 + 1.0 * 4.0); // ~0.237 at 60fps
    const decayPerMs = Math.pow(fullBrightDecayPerFrame, 1.0 / targetFrameMs);

    // DJ beat-style acceleration: speed doubles like musical notes
    // 1/1 (whole) → 1/2 (half) → 1/4 (quarter) → 1/8 (eighth) → 1/16 (sixteenth)
    // More doublings = slower start
    const accelSteps = 13; // Number of doublings (13 = starts at 1/8192 of max)
    const getSpeed = (elapsed: number): number => {
      const progress = Math.min(elapsed / accelerationDuration, 1);
      // Starts VERY slow, doubles repeatedly until max
      // At progress=0: 2^(-13) = 1/8192 of max (very slow)
      // At progress=1: 2^0 = full speed
      const eased = Math.pow(2, accelSteps * (progress - 1));
      return eased * maxSpeed;
    };

    const getPointAtT = (tVal: number): Point | null => {
      const segmentIndex = Math.floor(tVal);
      if (segmentIndex >= allSegments.length) return null;

      const segment = allSegments[segmentIndex];
      const segmentT = tVal - segmentIndex;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * segmentT,
        y: segment.start.y + (segment.end.y - segment.start.y) * segmentT
      };
    };

    // Generate Lissajous curve points
    // Classic oscilloscope X-Y mode: x = A*sin(a*t + δ), y = B*sin(b*t)
    const generateLissajousPoints = (
      centerX: number,
      centerY: number,
      amplitude: number,
      freqA: number,
      freqB: number,
      phaseShift: number,
      timeStart: number,
      timeEnd: number,
      numPoints: number,
      deltaMs: number
    ): { x: number; y: number; brightness: number }[] => {
      const points: { x: number; y: number; brightness: number }[] = [];
      const drawnPixels = new Set<string>();

      for (let i = 0; i < numPoints; i++) {
        const progress = i / (numPoints - 1);
        const time = timeStart + (timeEnd - timeStart) * progress;

        const x = centerX + amplitude * Math.sin(freqA * time + phaseShift);
        const y = centerY + amplitude * Math.sin(freqB * time);

        // Pixel deduplication
        const px = Math.round(x);
        const py = Math.round(y);
        const key = `${px},${py}`;
        if (drawnPixels.has(key)) continue;
        drawnPixels.add(key);

        // Brightness gradient: older points are dimmer
        const timeAgoMs = (1.0 - progress) * deltaMs;
        const brightness = Math.pow(decayPerMs, timeAgoMs);

        points.push({ x: px, y: py, brightness });
      }

      return points;
    };

    // Get Lissajous parameters that evolve over time
    // Starts simple (circle), becomes more complex, then simplifies for collapse
    const getLissajousParams = (phaseProgress: number, isCollapse: boolean) => {
      // Frequency ratios that create interesting patterns
      // Circle (1:1) → Figure-8 (1:2) → Complex (2:3) → Trefoil (3:2) → Circle
      const patterns = [
        { a: 1, b: 1, phase: Math.PI / 2 },   // Circle
        { a: 1, b: 2, phase: Math.PI / 4 },   // Figure-8
        { a: 2, b: 3, phase: Math.PI / 3 },   // Complex knot
        { a: 3, b: 4, phase: Math.PI / 6 },   // More complex
        { a: 3, b: 2, phase: Math.PI / 2 },   // Trefoil
      ];

      if (isCollapse) {
        // During collapse, stay on a simple shrinking circle
        return { freqA: 1, freqB: 1, phaseShift: Math.PI / 2 };
      }

      // Interpolate between patterns based on progress
      const patternIndex = phaseProgress * (patterns.length - 1);
      const idx = Math.floor(patternIndex);
      const frac = patternIndex - idx;
      const p1 = patterns[Math.min(idx, patterns.length - 1)];
      const p2 = patterns[Math.min(idx + 1, patterns.length - 1)];

      return {
        freqA: p1.a + (p2.a - p1.a) * frac,
        freqB: p1.b + (p2.b - p1.b) * frac,
        phaseShift: p1.phase + (p2.phase - p1.phase) * frac,
      };
    };

    const drawQuad = (program: { attribs: { position: number } }) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(program.attribs.position);
      gl.vertexAttribPointer(program.attribs.position, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const animate = () => {
      const now = Date.now();
      const deltaMs = Math.min(now - lastFrameTime, 100); // Cap at 100ms to handle tab switches
      lastFrameTime = now;

      const elapsed = (now - startTime) / 1000;
      const currentSpeed = getSpeed(elapsed);

      // Time-based fade amount - scales with actual frame time
      const timeBasedFade = Math.pow(decayPerMs, deltaMs);

      // Collect new points with time-based brightness gradient
      const drawnPixels = new Set<string>();
      let newPoints: { x: number; y: number; brightness: number }[] = [];
      const maxPointsPerFrame = 4000;

      const addPoint = (point: Point, progress: number) => {
        const px = Math.round(point.x);
        const py = Math.round(point.y);
        const key = `${px},${py}`;
        if (!drawnPixels.has(key) && newPoints.length < maxPointsPerFrame) {
          drawnPixels.add(key);
          const timeAgoMs = (1.0 - progress) * deltaMs;
          const brightness = Math.pow(decayPerMs, timeAgoMs);
          newPoints.push({ x: px, y: py, brightness });
        }
      };

      // ============ PHASE STATE MACHINE ============
      if (animationPhase === 'text') {
        // Text drawing phase
        const prevT = t;
        t += currentSpeed;

        let didWrap = false;
        if (t >= allSegments.length) {
          textPassCount++;
          if (textPassCount >= textPassesBeforeTransition) {
            // Text complete! Transition to dissolve phase
            animationPhase = 'dissolve';
            phaseStartTime = now;
            t = 0; // Restart path for dissolve
          } else {
            // Wrap around for another pass
            t = t % allSegments.length;
            didWrap = true;
          }
        }

        // Sample text path and track last position
        if (!didWrap) {
          const distTraveled = Math.abs(t - prevT);
          const numSamples = Math.max(2, Math.min(maxPointsPerFrame, Math.ceil(distTraveled * 5)));

          for (let i = 0; i <= numSamples; i++) {
            const progress = i / numSamples;
            const interpT = prevT + (Math.min(t, allSegments.length - 0.001) - prevT) * progress;
            const point = getPointAtT(interpT);
            if (point) {
              addPoint(point, progress);
              lastTextPosition = point; // Track beam position
            }
          }
        } else {
          // Handle wrap-around sampling
          const distTraveled = (allSegments.length - prevT) + t;
          const numSamples = Math.max(2, Math.min(maxPointsPerFrame, Math.ceil(distTraveled * 5)));
          const ratio = (allSegments.length - prevT) / distTraveled;
          const samplesBeforeWrap = Math.ceil(numSamples * ratio);
          const samplesAfterWrap = numSamples - samplesBeforeWrap;
          const totalSamples = samplesBeforeWrap + samplesAfterWrap;

          for (let i = 0; i <= samplesBeforeWrap; i++) {
            const progress = i / totalSamples;
            const interpT = prevT + (allSegments.length - prevT) * (i / Math.max(1, samplesBeforeWrap));
            const point = getPointAtT(Math.min(interpT, allSegments.length - 0.001));
            if (point) {
              addPoint(point, progress);
              lastTextPosition = point;
            }
          }
          for (let i = 1; i <= samplesAfterWrap; i++) {
            const progress = (samplesBeforeWrap + i) / totalSamples;
            const interpT = t * (i / Math.max(1, samplesAfterWrap));
            const point = getPointAtT(interpT);
            if (point) {
              addPoint(point, progress);
              lastTextPosition = point;
            }
          }
        }

      } else if (animationPhase === 'dissolve') {
        // Dissolve phase: mathematically blend text path → Lissajous curve
        const phaseElapsed = (now - phaseStartTime) / 1000;
        const phaseProgress = Math.min(phaseElapsed / DISSOLVE_DURATION, 1);

        if (phaseProgress >= 1) {
          animationPhase = 'lissajous';
          phaseStartTime = now;
          // Don't reset lissajousTime - continue smoothly
        }

        // Blend factor: 0 = pure text, 1 = pure Lissajous
        // Use smooth ease-in-out for natural transition
        const blendFactor = phaseProgress * phaseProgress * (3 - 2 * phaseProgress); // Smoothstep

        // Continue tracing text path
        const prevT = t;
        const dissolveSpeed = maxSpeed * 0.6;
        t += dissolveSpeed;
        if (t >= allSegments.length) t = t % allSegments.length;

        // Lissajous parameters - start simple, stay simple for clean blend
        const lissajousAmplitude = Math.min(width, height) * 0.2;
        const lissajousCenterX = width / 2;
        const lissajousCenterY = height / 2;

        // Advance Lissajous time
        const lissajousSpeed = 6 + phaseProgress * 4;
        const prevLissajousTime = lissajousTime;
        lissajousTime += (deltaMs / 1000) * lissajousSpeed;

        // Sample points along both paths and blend
        const distTraveled = Math.abs(t - prevT) + (t < prevT ? allSegments.length : 0);
        const numSamples = Math.max(2, Math.min(maxPointsPerFrame, Math.ceil(distTraveled * 5)));

        for (let i = 0; i <= numSamples; i++) {
          const sampleProgress = i / numSamples;

          // Text path position
          let interpT = prevT + distTraveled * sampleProgress;
          if (interpT >= allSegments.length) interpT -= allSegments.length;
          const textPoint = getPointAtT(interpT);

          // Lissajous position at same progress through frame
          const lissT = prevLissajousTime + (lissajousTime - prevLissajousTime) * sampleProgress;
          const lissX = lissajousCenterX + lissajousAmplitude * Math.sin(lissT + Math.PI / 2);
          const lissY = lissajousCenterY + lissajousAmplitude * Math.sin(lissT * 1.5);

          if (textPoint) {
            // Add subtle perturbation to text that increases with progress
            const perturbAmt = 20 * blendFactor;
            const perturbPhase = interpT * 0.03 + phaseElapsed * 5;
            const textX = textPoint.x + Math.sin(perturbPhase) * perturbAmt;
            const textY = textPoint.y + Math.sin(perturbPhase * 1.3) * perturbAmt;

            // Blend between text position and Lissajous position
            const finalX = textX * (1 - blendFactor) + lissX * blendFactor;
            const finalY = textY * (1 - blendFactor) + lissY * blendFactor;

            lastTextPosition = { x: finalX, y: finalY };

            const px = Math.round(finalX);
            const py = Math.round(finalY);
            const key = `${px},${py}`;
            if (!drawnPixels.has(key) && newPoints.length < maxPointsPerFrame) {
              drawnPixels.add(key);
              const timeAgoMs = (1.0 - sampleProgress) * deltaMs;
              const brightness = Math.pow(decayPerMs, timeAgoMs);
              newPoints.push({ x: px, y: py, brightness });
            }
          }
        }

      } else if (animationPhase === 'lissajous') {
        // Lissajous bloom phase - continues smoothly from dissolve
        const phaseElapsed = (now - phaseStartTime) / 1000;
        const phaseProgress = Math.min(phaseElapsed / LISSAJOUS_DURATION, 1);

        if (phaseProgress >= 1) {
          animationPhase = 'collapse';
          phaseStartTime = now;
        }

        // Amplitude grows from dissolve size to full size
        const startAmplitude = Math.min(width, height) * 0.2; // Match dissolve end
        const maxAmplitude = Math.min(width, height) * 0.3;
        const amplitudeEase = 1 - Math.pow(1 - phaseProgress, 2);
        const amplitude = startAmplitude + (maxAmplitude - startAmplitude) * amplitudeEase;

        // Get evolving Lissajous parameters
        const { freqA, freqB, phaseShift } = getLissajousParams(phaseProgress, false);

        // Speed continues from dissolve, gradually increases
        const baseSpeed = 10;
        const speedMultiplier = 1 + phaseProgress * 2;

        const prevLissajousTime = lissajousTime;
        lissajousTime += (deltaMs / 1000) * baseSpeed * speedMultiplier;

        // Generate Lissajous points centered on screen
        newPoints = generateLissajousPoints(
          width / 2,
          height / 2,
          amplitude,
          freqA,
          freqB,
          phaseShift,
          prevLissajousTime,
          lissajousTime,
          Math.ceil(deltaMs * 3),
          deltaMs
        );

      } else if (animationPhase === 'collapse') {
        // Spiral collapse phase
        const phaseElapsed = (now - phaseStartTime) / 1000;
        const phaseProgress = Math.min(phaseElapsed / COLLAPSE_DURATION, 1);

        if (phaseProgress >= 1) {
          animationPhase = 'fadeout';
          phaseStartTime = now;
        }

        // Amplitude shrinks exponentially to center
        const maxAmplitude = Math.min(width, height) * 0.25;
        const shrinkEase = Math.pow(1 - phaseProgress, 2); // Ease in quad - fast at end
        const amplitude = maxAmplitude * shrinkEase;

        // Get simple circular pattern for collapse
        const { freqA, freqB, phaseShift } = getLissajousParams(phaseProgress, true);

        // Speed slows down as it collapses (like winding down)
        const baseSpeed = 12;
        const speedMultiplier = 1 - phaseProgress * 0.7; // Slow down

        const prevLissajousTime = lissajousTime;
        lissajousTime += (deltaMs / 1000) * baseSpeed * speedMultiplier;

        // Generate shrinking Lissajous
        newPoints = generateLissajousPoints(
          width / 2,
          height / 2,
          amplitude,
          freqA,
          freqB,
          phaseShift,
          prevLissajousTime,
          lissajousTime,
          Math.ceil(deltaMs * 2),
          deltaMs
        );

      } else if (animationPhase === 'fadeout') {
        // Just let phosphor decay, no new points
        const phaseElapsed = (now - phaseStartTime) / 1000;

        if (phaseElapsed >= FADEOUT_DURATION) {
          setIsComplete(true);
          setTimeout(() => onComplete?.(), skipDelay);
          return;
        }

        // No new points - just fade existing phosphor
        newPoints = [];
      }

      // === PASS 1: Fade previous frame (time-based) ===
      // The shader does: pow(fadeAmount, 1.0 + brightness * 4.0)
      // For brightness=1.0, we want: pow(fadeAmount, 5.0) = timeBasedFade
      // So: fadeAmount = pow(timeBasedFade, 1/5) = pow(timeBasedFade, 0.2)
      const shaderFadeAmount = Math.pow(timeBasedFade, 0.2);

      gl.bindFramebuffer(gl.FRAMEBUFFER, currentFB.framebuffer);
      gl.viewport(0, 0, width, height);

      gl.useProgram(fadeProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, previousFB.texture);
      gl.uniform1i(fadeProgram.uniforms.texture, 0);
      gl.uniform1f(fadeProgram.uniforms.fadeAmount, shaderFadeAmount);
      drawQuad(fadeProgram);

      // === PASS 2: Draw new path as point sprites with brightness gradient ===
      if (newPoints.length > 1) {
        // Interleaved buffer: x, y, brightness for each point
        const pathData: number[] = [];
        for (let i = 0; i < newPoints.length; i++) {
          pathData.push(newPoints[i].x, newPoints[i].y, newPoints[i].brightness);
        }

        gl.useProgram(pointProgram.program);
        gl.uniform2f(pointProgram.uniforms.resolution, width, height);
        gl.uniform1f(pointProgram.uniforms.pointSize, 3.0);

        // Base color - brightness is applied per-vertex
        gl.uniform3f(pointProgram.uniforms.color, 0.0, 0.9, 0.7);

        gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pathData), gl.DYNAMIC_DRAW);

        // Stride = 3 floats (x, y, brightness) * 4 bytes = 12
        const stride = 3 * 4;
        gl.enableVertexAttribArray(pointProgram.attribs.position);
        gl.vertexAttribPointer(pointProgram.attribs.position, 2, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(pointProgram.attribs.brightness);
        gl.vertexAttribPointer(pointProgram.attribs.brightness, 1, gl.FLOAT, false, stride, 2 * 4);

        gl.drawArrays(gl.POINTS, 0, newPoints.length);
      }

      // === PASS 3: Bloom horizontal (with threshold + boost for brights) ===
      // Disable blending for post-process passes to prevent accumulation
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFB1.framebuffer);
      gl.viewport(0, 0, width / 2, height / 2);

      gl.useProgram(bloomHProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentFB.texture);
      gl.uniform1i(bloomHProgram.uniforms.texture, 0);
      gl.uniform2f(bloomHProgram.uniforms.resolution, width / 2, height / 2);
      gl.uniform1f(bloomHProgram.uniforms.bloomSize, 4.0);
      gl.uniform1f(bloomHProgram.uniforms.bloomThreshold, 0.3); // Only bloom pixels above 30% brightness
      gl.uniform1f(bloomHProgram.uniforms.bloomBoost, 15.0);    // Boost bright areas 15x
      drawQuad(bloomHProgram);

      // === PASS 4: Bloom vertical ===
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFB2.framebuffer);

      gl.useProgram(bloomVProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomFB1.texture);
      gl.uniform1i(bloomVProgram.uniforms.texture, 0);
      gl.uniform2f(bloomVProgram.uniforms.resolution, width / 2, height / 2);
      gl.uniform1f(bloomVProgram.uniforms.bloomSize, 4.0);
      drawQuad(bloomVProgram);

      // === PASS 5: Smooth glow horizontal (wide, continuous glow for bright areas) ===
      gl.bindFramebuffer(gl.FRAMEBUFFER, smoothBloomFB1.framebuffer);

      gl.useProgram(smoothBloomHProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentFB.texture);
      gl.uniform1i(smoothBloomHProgram.uniforms.texture, 0);
      gl.uniform2f(smoothBloomHProgram.uniforms.resolution, width / 2, height / 2);
      gl.uniform1f(smoothBloomHProgram.uniforms.glowThreshold, 0.2);  // Low threshold for more glow
      gl.uniform1f(smoothBloomHProgram.uniforms.glowBoost, 25.0);     // Big boost for bright areas
      gl.uniform1f(smoothBloomHProgram.uniforms.glowRadius, 1.0/currentSpeed);     // Radius in pixels
      drawQuad(smoothBloomHProgram);

      // === PASS 6: Smooth glow vertical ===
      gl.bindFramebuffer(gl.FRAMEBUFFER, smoothBloomFB2.framebuffer);

      gl.useProgram(smoothBloomVProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, smoothBloomFB1.texture);
      gl.uniform1i(smoothBloomVProgram.uniforms.texture, 0);
      gl.uniform2f(smoothBloomVProgram.uniforms.resolution, width / 2, height / 2);
      gl.uniform1f(smoothBloomVProgram.uniforms.glowRadius, 1.0/currentSpeed);
      drawQuad(smoothBloomVProgram);

      // === PASS 7: Composite to screen with distortion ===
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(compositeProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentFB.texture);
      gl.uniform1i(compositeProgram.uniforms.mainTexture, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomFB2.texture);
      gl.uniform1i(compositeProgram.uniforms.bloomTexture, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, smoothBloomFB2.texture);
      gl.uniform1i(compositeProgram.uniforms.smoothBloomTexture, 2);
      gl.uniform1f(compositeProgram.uniforms.distortion, distortion);
      gl.uniform1f(compositeProgram.uniforms.bloomIntensity, 10.0/Math.sqrt(currentSpeed));    // Grid bloom (lower)
      gl.uniform1f(compositeProgram.uniforms.smoothBloomIntensity, 4.0/Math.sqrt(currentSpeed)); // Smooth glow (much higher)
      drawQuad(compositeProgram);

      // Re-enable blending for next frame's point drawing
      gl.enable(gl.BLEND);

      // Swap framebuffers
      [currentFB, previousFB] = [previousFB, currentFB];

      animationRef.current = requestAnimationFrame(animate);
    };

    // Handle resize
    const handleResize = () => {
      // For now, just continue with original size
      // A full resize would require recreating framebuffers
    };
    window.addEventListener('resize', handleResize);

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [fontLoaded, onComplete, skipDelay, distortion, setupWebGL]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ background: '#000' }}
      />
      {isComplete && (
        <div className="absolute bottom-8 text-center w-full">
          <div className="text-green-400 text-sm font-mono animate-pulse">
            Press any key to continue...
          </div>
        </div>
      )}
    </div>
  );
};
