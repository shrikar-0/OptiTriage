import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

// ─── Entrance direction presets ──────────────────────────────────────────────
//
// Each decoration enters from a different offset so the composition feels
// physically staggered rather than "PowerPoint" sequential.

export type EntranceDirection =
  | 'from-top'
  | 'from-bottom'
  | 'from-left'
  | 'from-right'
  | 'from-top-left'
  | 'from-top-right'
  | 'from-bottom-left'
  | 'from-bottom-right';

/** Translate offsets (px) for each entrance direction. */
const ENTRANCE_OFFSETS: Record<EntranceDirection, { x: number; y: number }> = {
  'from-top':          { x:  0,  y: -28 },
  'from-bottom':       { x:  0,  y:  28 },
  'from-left':         { x: -28, y:  0  },
  'from-right':        { x:  28, y:  0  },
  'from-top-left':     { x: -22, y: -22 },
  'from-top-right':    { x:  22, y: -22 },
  'from-bottom-left':  { x: -22, y:  22 },
  'from-bottom-right': { x:  22, y:  22 },
};

// ─── Idle float presets ──────────────────────────────────────────────────────
//
// Extremely subtle post-entrance drift to suggest the icon is physically
// suspended rather than bolted to the page.  Each variant uses a different
// axis emphasis so adjacent icons don't sway in lockstep.

export type IdleVariant = 'drift-y' | 'drift-x' | 'drift-xy' | 'none';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FloatingDecorationProps {
  /** The Lucide icon to display. */
  icon: LucideIcon;
  /** Absolute positioning within the decoration container. */
  position: {
    top?: string | number;
    bottom?: string | number;
    left?: string | number;
    right?: string | number;
  };
  /** Icon size in px (default 24). */
  size?: number;
  /** Final settled rotation in degrees (default 0). */
  rotation?: number;
  /** Entrance delay in seconds (default 0). */
  delay?: number;
  /** Entrance animation duration in seconds (default 0.9). */
  duration?: number;
  /** Direction the icon enters FROM (default 'from-top'). */
  entrance?: EntranceDirection;
  /** How much extra rotation (degrees) to add during the entrance (default 8). */
  entranceRotation?: number;
  /** Final settled opacity (default 0.45). */
  opacity?: number;
  /** Subtle idle drift after settling (default 'drift-y'). */
  idle?: IdleVariant;
  /** Idle animation duration in seconds (default 6). */
  idleDuration?: number;
  /** Optional extra class names. */
  className?: string;
  /** Icon stroke colour (default 'currentColor'). */
  color?: string;
  /** Whether the entrance animation has been triggered (default true). */
  entered?: boolean;
  /** Prefer reduced motion — skips animation entirely (default false). */
  reducedMotion?: boolean;
}

/**
 * Reusable floating decoration element.
 *
 * Each instance injects a scoped `@keyframes` block (keyed by React `useId`)
 * so every icon gets its own entrance trajectory — no shared class fights.
 *
 * Animation lifecycle:
 *   1. Opacity 0, translated + rotated away from final position.
 *   2. CSS transition triggers on `entered` prop → slides/rotates/fades in.
 *   3. After entrance, a looping idle keyframe gently sways the element.
 */
export const FloatingDecoration: React.FC<FloatingDecorationProps> = ({
  icon: Icon,
  position,
  size = 24,
  rotation = 0,
  delay = 0,
  duration = 1.3,
  entrance = 'from-top',
  entranceRotation = 8,
  opacity = 0.45,
  idle = 'drift-y',
  idleDuration = 9,
  className = '',
  color = 'currentColor',
  entered = true,
  reducedMotion = false,
}) => {
  // Unique id per instance so keyframe names never collide.
  const uid = useId().replace(/:/g, '');

  const offset = ENTRANCE_OFFSETS[entrance];

  // ── Reduced motion: instant final state ──
  if (reducedMotion) {
    return (
      <div
        className={`absolute flex items-center justify-center pointer-events-none ${className}`}
        style={{
          ...position,
          opacity,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        <Icon size={size} color={color} strokeWidth={1.5} />
      </div>
    );
  }

  // ── Idle keyframe (scoped per instance) ──
  const idleName = `fd-idle-${uid}`;
  let idleKeyframe = '';

  if (idle === 'drift-y') {
    idleKeyframe = `
      @keyframes ${idleName} {
        0%, 100% { transform: rotate(${rotation}deg) translate(0, 0); }
        50%      { transform: rotate(${rotation + 0.5}deg) translate(0, -3.5px); }
      }`;
  } else if (idle === 'drift-x') {
    idleKeyframe = `
      @keyframes ${idleName} {
        0%, 100% { transform: rotate(${rotation}deg) translate(0, 0); }
        50%      { transform: rotate(${rotation - 0.4}deg) translate(3px, 0); }
      }`;
  } else if (idle === 'drift-xy') {
    idleKeyframe = `
      @keyframes ${idleName} {
        0%, 100% { transform: rotate(${rotation}deg) translate(0, 0); }
        33%      { transform: rotate(${rotation + 0.35}deg) translate(2px, -2.5px); }
        66%      { transform: rotate(${rotation - 0.25}deg) translate(-1.5px, 1.5px); }
      }`;
  }

  // ── Entrance → settled transition ──
  //
  // Before `entered`: offset + extra rotation + opacity 0.
  // After  `entered`: final position + rotation + target opacity.
  // The transition property handles the smooth deceleration.

  const entranceEase = 'cubic-bezier(0.16, 1, 0.3, 1)'; // silky smooth deceleration curve
  const totalDelay = delay;

  const startTransform = `translate(${offset.x}px, ${offset.y}px) rotate(${rotation + entranceRotation}deg)`;
  const endTransform   = `rotate(${rotation}deg)`;

  // After settling, hand off to the idle animation.
  // The idle animation starts after the entrance completes (delay + duration).
  const idleDelaySec = totalDelay + duration + 0.2; // graceful transition buffer

  const style: React.CSSProperties = entered
    ? {
        ...position,
        opacity,
        transform: endTransform,
        transition: [
          `opacity ${duration}s ${entranceEase} ${totalDelay}s`,
          `transform ${duration}s ${entranceEase} ${totalDelay}s`,
        ].join(', '),
        // Layer the idle animation on top once entrance finishes.
        ...(idle !== 'none'
          ? {
              animation: `${idleName} ${idleDuration}s ease-in-out ${idleDelaySec}s infinite`,
            }
          : {}),
      }
    : {
        ...position,
        opacity: 0,
        transform: startTransform,
        // Still declare transition so the FIRST entered=true flip animates.
        transition: [
          `opacity ${duration}s ${entranceEase} ${totalDelay}s`,
          `transform ${duration}s ${entranceEase} ${totalDelay}s`,
        ].join(', '),
      };

  return (
    <>
      {idleKeyframe && <style>{idleKeyframe}</style>}
      <div
        className={`absolute flex items-center justify-center pointer-events-none ${className}`}
        style={style}
      >
        <Icon size={size} color={color} strokeWidth={1.5} />
      </div>
    </>
  );
};
