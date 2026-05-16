/**
 * DotWaveBackground — halftone dot-wave green visual identity
 * Pure SVG + CSS, zero external deps, performance-first.
 * Mirrors the MPL dot-design reference (wave of circles growing toward foreground).
 */

import React, { useMemo } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DotWaveProps {
  /** Positioning variant */
  variant?: 'hero-right' | 'hero-left' | 'section-top' | 'section-bottom' | 'corner-br' | 'corner-tl' | 'full';
  /** Overall opacity (0-1) */
  opacity?: number;
  /** Green shade (default: #4ad569) */
  color?: string;
  /** Whether to animate dots with a subtle float */
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// ── Dot grid generator ────────────────────────────────────────────────────────
function generateDots(
  cols: number,
  rows: number,
  color: string,
  waveOrigin: { x: number; y: number } = { x: 1.0, y: 1.0 },
): React.ReactElement[] {
  const dots: React.ReactElement[] = [];
  const maxR = 14;
  const minR = 0.6;
  const W = 500;
  const H = 600;
  const gx = W / (cols - 1);
  const gy = H / (rows - 1);
  const maxDist = Math.max(
    Math.sqrt(
      Math.max(waveOrigin.x, 1 - waveOrigin.x) ** 2 +
      Math.max(waveOrigin.y, 1 - waveOrigin.y) ** 2,
    ),
    Number.EPSILON,
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * gx;
      const y = r * gy;

      // Distance from wave origin (normalized 0→1)
      const dx = x / W - waveOrigin.x;
      const dy = y / H - waveOrigin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - dist / maxDist); // 1 near origin, 0 far

      // Wave curvature: add sinusoidal distortion to create the flowing wave
      const wave = Math.sin((c / cols) * Math.PI * 1.6 - (r / rows) * Math.PI * 0.8) * 0.3;
      const tWave = Math.max(0, Math.min(1, t + wave));

      // Radius proportional to tWave (larger near origin)
      const radius = minR + tWave * (maxR - minR);

      // Skip tiny invisible dots
      if (radius < 0.8) continue;

      // Opacity: high near origin, fade out
      const opacity = 0.15 + tWave * 0.85;

      // Slight delay for stagger animation
      const delay = (c * 0.03 + r * 0.04).toFixed(2);

      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={x}
          cy={y}
          r={radius}
          fill={color}
          opacity={opacity}
          style={{ animationDelay: `${delay}s` }}
          className="dot-float"
        />,
      );
    }
  }
  return dots;
}

// ── Variant configs ───────────────────────────────────────────────────────────
const VARIANT_STYLES: Record<
  NonNullable<DotWaveProps['variant']>,
  {
    wrapStyle: React.CSSProperties;
    svgStyle: React.CSSProperties;
    waveOrigin: { x: number; y: number };
    cols: number;
    rows: number;
    viewBox: string;
  }
> = {
  'hero-right': {
    wrapStyle: { position: 'absolute', top: 0, right: 0, width: '55%', height: '100%', pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', top: '50%', right: '-5%', transform: 'translateY(-50%)', width: '100%', height: '110%' },
    waveOrigin: { x: 1.0, y: 1.0 },
    cols: 16, rows: 20,
    viewBox: '0 0 500 600',
  },
  'hero-left': {
    wrapStyle: { position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', top: '50%', left: '-5%', transform: 'translateY(-50%) scaleX(-1)', width: '100%', height: '110%' },
    waveOrigin: { x: 0.0, y: 1.0 },
    cols: 14, rows: 18,
    viewBox: '0 0 500 600',
  },
  'section-top': {
    wrapStyle: { position: 'absolute', top: 0, left: 0, right: 0, height: '240px', pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', top: '-20px', left: 0, width: '100%', height: '100%' },
    waveOrigin: { x: 0.5, y: 0.0 },
    cols: 28, rows: 8,
    viewBox: '0 0 1200 240',
  },
  'section-bottom': {
    wrapStyle: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '200px', pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', bottom: '-10px', left: 0, width: '100%', height: '100%' },
    waveOrigin: { x: 0.5, y: 1.0 },
    cols: 28, rows: 7,
    viewBox: '0 0 1200 200',
  },
  'corner-br': {
    wrapStyle: { position: 'absolute', bottom: 0, right: 0, width: '320px', height: '320px', pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', bottom: '-10px', right: '-10px', width: '100%', height: '100%' },
    waveOrigin: { x: 1.0, y: 1.0 },
    cols: 12, rows: 12,
    viewBox: '0 0 380 380',
  },
  'corner-tl': {
    wrapStyle: { position: 'absolute', top: 0, left: 0, width: '280px', height: '280px', pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', top: '-10px', left: '-10px', width: '100%', height: '100%' },
    waveOrigin: { x: 0.0, y: 0.0 },
    cols: 11, rows: 11,
    viewBox: '0 0 340 340',
  },
  'full': {
    wrapStyle: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
    svgStyle:  { position: 'absolute', inset: 0, width: '100%', height: '100%' },
    waveOrigin: { x: 1.0, y: 1.0 },
    cols: 22, rows: 26,
    viewBox: '0 0 500 600',
  },
};

// ── Main Component ────────────────────────────────────────────────────────────
export function DotWaveBackground({
  variant = 'hero-right',
  opacity = 0.18,
  color = '#4ad569',
  animate = true,
  className = '',
  style = {},
}: DotWaveProps) {
  const cfg = VARIANT_STYLES[variant];

  // Wide variants use a wider viewBox for section backgrounds
  const isWide = variant === 'section-top' || variant === 'section-bottom';
  const waveOriginForWide = isWide
    ? cfg.waveOrigin
    : cfg.waveOrigin;

  const dots = useMemo(() => {
    if (isWide) {
      // For wide variants, generate dots across the full width
      const W = 1200;
      const H = parseInt(cfg.viewBox.split(' ')[3]);
      const cols = cfg.cols;
      const rows = cfg.rows;
      const gx = W / (cols - 1);
      const gy = H / (rows - 1);
      const maxR = 10;
      const minR = 1.0;
      const elems: React.ReactElement[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * gx;
          const y = r * gy;
          const dx = x / W - cfg.waveOrigin.x;
          const dy = y / H - cfg.waveOrigin.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = Math.sqrt(
            Math.max(cfg.waveOrigin.x, 1 - cfg.waveOrigin.x) ** 2 +
            Math.max(cfg.waveOrigin.y, 1 - cfg.waveOrigin.y) ** 2,
          );
          const t = Math.max(0, 1 - dist / maxDist);
          const wave = Math.sin((c / cols) * Math.PI * 2.5) * 0.25;
          const tW = Math.max(0, Math.min(1, t + wave));
          const radius = minR + tW * (maxR - minR);
          if (radius < 1.0) continue;
          const op = 0.1 + tW * 0.9;
          const delay = (c * 0.02 + r * 0.05).toFixed(2);
          elems.push(
            <circle key={`${r}-${c}`} cx={x} cy={y} r={radius} fill={color}
              opacity={op} style={{ animationDelay: `${delay}s` }}
              className={animate ? 'dot-float' : ''} />,
          );
        }
      }
      return elems;
    }
    return generateDots(cfg.cols, cfg.rows, color, cfg.waveOrigin);
  }, [variant, color, animate]);

  return (
    <div
      className={className}
      style={{ ...cfg.wrapStyle, opacity, ...style }}
      aria-hidden="true"
    >
      <svg
        viewBox={cfg.viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={cfg.svgStyle}
        xmlns="http://www.w3.org/2000/svg"
      >
        {dots}
      </svg>
    </div>
  );
}

// ── Thin decorative dot-line divider ─────────────────────────────────────────
export function DotDivider({ color = '#4ad569', opacity = 0.3 }: { color?: string; opacity?: number }) {
  return (
    <div style={{ width: '100%', height: '2px', overflow: 'hidden', opacity, position: 'relative' }}>
      <svg viewBox="0 0 1200 4" style={{ width: '100%', height: '4px' }} preserveAspectRatio="none">
        {Array.from({ length: 80 }).map((_, i) => (
          <circle key={i} cx={i * 15 + 7} cy={2} r={i % 4 === 0 ? 2 : 1} fill={color} opacity={i % 3 === 0 ? 1 : 0.5} />
        ))}
      </svg>
    </div>
  );
}

// ── Floating particles (CSS-only, ultra-light) ────────────────────────────────
export function FloatingParticles({ count = 12, color = '#4ad569', opacity = 0.12 }: {
  count?: number;
  color?: string;
  opacity?: number;
}) {
  const particles = useMemo(() =>
    Array.from({ length: count }).map((_, i) => {
      const size  = 2 + Math.random() * 5;
      const left  = Math.random() * 100;
      const top   = Math.random() * 100;
      const dur   = 8 + Math.random() * 12;
      const delay = Math.random() * 8;
      return { i, size, left, top, dur, delay };
    }),
  [count]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.i}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: '50%',
            background: color,
            opacity,
            animation: `float-particle ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default DotWaveBackground;
