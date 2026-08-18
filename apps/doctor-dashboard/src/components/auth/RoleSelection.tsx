import React, { useState, useEffect, useRef, type CSSProperties } from 'react';
import doctorCharacterSrc from '../../assets/doctor-character.png';
import receptionistCharacterSrc from '../../assets/receptionist-character.png';
import { FloatingDecoration } from '../shared/FloatingDecoration';
import {
  HeartPulse, Stethoscope, Pill, Activity,
  Phone, Calendar, FileText, Bell,
  Syringe, ClipboardList, Thermometer, ShieldCheck,
  TestTube, Droplet, Monitor, Brain,
  UserPlus, MessageSquare, Mail, ClipboardCheck,
  Printer, Clock, Shield, Folder, UserCheck
} from 'lucide-react';

// ─── Artwork keyframes (injected once, referenced by inline animation) ─────────
//
// Phase 1 (0 → 40%):  Ellipse expands rapidly — character center appears.
// Phase 2 (40 → 57%): Growth nearly stops — plateau while cards slide in.
// Phase 3 (57 → 100%): Ellipse expands to full — peripheral equipment blooms.
//
// Because equipment lives at the outer ring of each PNG, the natural center-out
// expansion of the ellipse makes characters appear first and instruments appear
// last, without needing separate asset layers.
const ARTWORK_KEYFRAMES = `
  @keyframes rs-reveal-doctor {
    0%   { clip-path: ellipse(0%  0%  at 55% 65%); opacity: 0;    }
    5%   {                                          opacity: 0.82; }
    100% { clip-path: ellipse(80% 85% at 55% 65%); opacity: 0.82; }
  }

  @keyframes rs-reveal-receptionist {
    0%   { clip-path: ellipse(0%  0%  at 45% 60%); opacity: 0;    }
    5%   {                                          opacity: 0.82; }
    100% { clip-path: ellipse(80% 85% at 45% 60%); opacity: 0.82; }
  }

  /* ── Isolated floating keyframes for new background decorations ──
     Uniquely prefixed with "optitriage-icon" to never conflict with
     existing rs-reveal-* or fd-idle-* keyframe names. */
  @keyframes optitriage-icon-float-a {
    0%, 100% { transform: translate(0, 0) rotate(var(--oi-rot, 0deg)); }
    40%      { transform: translate(2px, -5px) rotate(calc(var(--oi-rot, 0deg) + 0.6deg)); }
    70%      { transform: translate(-1.5px, -2px) rotate(calc(var(--oi-rot, 0deg) - 0.4deg)); }
  }
  @keyframes optitriage-icon-float-b {
    0%, 100% { transform: translate(0, 0) rotate(var(--oi-rot, 0deg)); }
    35%      { transform: translate(-3px, -4px) rotate(calc(var(--oi-rot, 0deg) - 0.5deg)); }
    65%      { transform: translate(2px, -1.5px) rotate(calc(var(--oi-rot, 0deg) + 0.35deg)); }
  }
  @keyframes optitriage-icon-float-c {
    0%, 100% { transform: translate(0, 0) rotate(var(--oi-rot, 0deg)); }
    50%      { transform: translate(0, -6px) rotate(calc(var(--oi-rot, 0deg) + 0.8deg)); }
  }
  @keyframes optitriage-icon-float-d {
    0%, 100% { transform: translate(0, 0) rotate(var(--oi-rot, 0deg)); }
    30%      { transform: translate(3.5px, -3px) rotate(calc(var(--oi-rot, 0deg) + 0.45deg)); }
    70%      { transform: translate(-2px, -1px) rotate(calc(var(--oi-rot, 0deg) - 0.3deg)); }
  }
`;

// ─── Responsive CSS (injected once) ──────────────────────────────────────────
//
// These media queries handle layout changes that can't be expressed via inline
// styles alone. They target data attributes and BEM-style class names scoped
// to this component to avoid leaking into the rest of the app.
const RESPONSIVE_STYLES = `
  /* ── Focus-visible ring for role cards ── */
  .rs-role-card:focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 3px;
  }

  /* ── Tablet landscape: reduce artwork + decoration sizes ── */
  @media (max-width: 1100px) {
    .rs-artwork-panel { max-width: 320px !important; }
    /* Scale down all decoration icons slightly */
    .rs-deco-layer svg { transform: scale(0.82); transform-origin: center; }
    /* Hide the lowest-priority (secondary) decorations */
    .rs-deco-secondary { display: none !important; }
  }

  /* ── Tablet portrait / narrow: hide entire artwork column ── */
  @media (max-width: 900px) {
    .rs-artwork-panel { display: none !important; }
    .rs-triptych { padding-top: 24px !important; }
  }

  /* ── Stack cards vertically on narrow viewports ── */
  @media (max-width: 640px) {
    .rs-cards-row {
      flex-direction: column !important;
      align-items: center !important;
    }
    .rs-role-card {
      width: min(260px, calc(100vw - 48px)) !important;
      min-height: auto !important;
    }
    /* Switch headline from absolute to static flow so it sits above stacked cards */
    .rs-headline-wrap {
      position: static !important;
      transform: none !important;
      width: 100% !important;
      max-width: 100% !important;
      padding: 24px 24px 16px !important;
    }
    .rs-triptych {
      padding-top: 0 !important;
    }
  }

  /* ── Tighten padding on mobile ── */
  @media (max-width: 480px) {
    .rs-brand-bar {
      padding-left: 20px !important;
      padding-right: 20px !important;
      padding-top: 20px !important;
    }
    .rs-headline-title {
      font-size: 24px !important;
    }
    .rs-headline-sub {
      font-size: 12px !important;
    }
  }

  /* ── Prevent any floating layer from spilling into the card zone ──
     The decoration containers use absolute inset-0 within rs-artwork-panel.
     Since rs-artwork-panel is already hidden below 900px, this rule is a
     safety net for the 900px–1100px tablet range where artwork shrinks. */
  @media (max-width: 1100px) {
    .rs-deco-layer {
      /* Clip any icon that might drift outside the panel boundary */
      overflow: hidden;
    }
  }

  /* ── Reduced-motion: disable idle drift animations ── */
  @media (prefers-reduced-motion: reduce) {
    .rs-deco-layer * {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// ─── useEntrance — fires once on mount, survives rerenders ───────────────────

function useEntrance(): boolean {
  const firedRef = useRef(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    // Two-frame delay: paint the hidden state, then trigger animations.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setEntered(true);
      });
    });
  }, []);

  return entered;
}

// ─── usePrefersReducedMotion ─────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ─── RoleCard ─────────────────────────────────────────────────────────────────

interface RoleCardProps {
  role: 'doctor' | 'receptionist';
  eyebrow: string;
  label: string;
  description: string;
  features: string[];
  icon: string;
  isSelected: boolean;
  onClick: () => void;
}

const RoleCard: React.FC<RoleCardProps> = ({
  role,
  eyebrow,
  label,
  description,
  features,
  icon,
  isSelected,
  onClick,
}) => {
  const isDoctor = role === 'doctor';

  const accentColor = isDoctor ? '#4F8FA8' : '#2F6F5E';
  const accentBg = isDoctor ? 'rgba(79,143,168,0.07)' : 'rgba(47,111,94,0.07)';
  const accentBorder = isDoctor ? 'rgba(79,143,168,0.28)' : 'rgba(47,111,94,0.28)';
  const selectedBorder = isDoctor ? '#4F8FA8' : '#2F6F5E';
  const selectedShadow = isDoctor
    ? '0 0 0 3px rgba(79,143,168,0.18), 0 12px 28px -4px rgba(79,143,168,0.16)'
    : '0 0 0 3px rgba(47,111,94,0.18), 0 12px 28px -4px rgba(47,111,94,0.16)';
  const iconBg = isDoctor ? 'rgba(79,143,168,0.10)' : 'rgba(47,111,94,0.10)';
  const featureDot = accentColor;
  const ctaText = isDoctor ? 'Clinical Suite' : 'Front Desk';

  const restShadow = '0 1px 3px rgba(44,62,53,0.03), 0 8px 24px -4px rgba(166,99,43,0.07)';
  const hoverShadow = '0 4px 12px rgba(44,62,53,0.05), 0 16px 36px -6px rgba(166,99,43,0.13)';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Select ${label} role`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); // Prevent Space from scrolling the page
          onClick();
        }
      }}
      className="rs-role-card group relative flex flex-col cursor-pointer select-none outline-none"
      style={{
        color: accentColor, // used by focus-visible outline via currentColor
        width: '260px',
        minHeight: '380px',
        borderRadius: '20px',
        padding: '32px 28px 28px',
        background: isSelected ? accentBg : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(12px)',
        border: isSelected
          ? `2px solid ${selectedBorder}`
          : `1.5px solid ${accentBorder}`,
        boxShadow: isSelected ? selectedShadow : restShadow,
        transform: isSelected ? 'translateY(-4px) scale(1.015)' : 'translateY(0) scale(1)',
        transition:
          'transform 280ms cubic-bezier(0.16,1,0.3,1), box-shadow 280ms cubic-bezier(0.16,1,0.3,1), border-color 200ms ease, background 200ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          const el = e.currentTarget;
          el.style.transform = 'translateY(-6px) scale(1.015)';
          el.style.boxShadow = hoverShadow;
          el.style.borderColor = accentColor;
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          const el = e.currentTarget;
          el.style.transform = '';
          el.style.boxShadow = '';
          el.style.borderColor = '';
        }
      }}
    >
      {/* Icon badge */}
      <div
        className="flex items-center justify-center rounded-2xl mb-6"
        style={{
          width: '56px',
          height: '56px',
          background: isSelected ? iconBg : 'rgba(250,246,240,1)',
          border: '1px solid rgba(166,99,43,0.13)',
          transition: 'background 200ms ease',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '26px',
            color: accentColor,
            fontVariationSettings: "'FILL' 1, 'wght' 400",
          }}
        >
          {icon}
        </span>
      </div>

      {/* Eyebrow */}
      <span
        className="block mb-1 tracking-widest uppercase font-semibold"
        style={{ fontSize: '10px', color: '#9E6B40', letterSpacing: '0.18em' }}
      >
        {eyebrow}
      </span>

      {/* Role title */}
      <h2
        className="font-display font-semibold leading-tight mb-2"
        style={{ fontSize: '26px', color: '#1B2420', letterSpacing: '-0.01em' }}
      >
        {label}
      </h2>

      {/* Description */}
      <p
        className="leading-relaxed mb-6"
        style={{ fontSize: '13px', color: '#5C6460', lineHeight: '1.6' }}
      >
        {description}
      </p>

      {/* Feature list */}
      <ul className="flex flex-col gap-2 mb-8 mt-auto">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <span
              className="flex-shrink-0 rounded-full"
              style={{ width: '5px', height: '5px', background: featureDot }}
            />
            <span className="font-medium" style={{ fontSize: '12px', color: '#384B42' }}>
              {f}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA strip */}
      <div
        className="flex items-center justify-between mt-auto rounded-xl px-4 py-3 transition-colors duration-200"
        style={{
          background: isSelected ? accentColor : 'transparent',
          border: `1.5px solid ${isSelected ? accentColor : accentBorder}`,
        }}
      >
        <span
          className="font-semibold tracking-wide"
          style={{ fontSize: '12px', color: isSelected ? '#ffffff' : accentColor, letterSpacing: '0.01em' }}
        >
          {ctaText}
        </span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '16px', color: isSelected ? '#ffffff' : accentColor, transition: 'transform 200ms ease' }}
        >
          arrow_forward
        </span>
      </div>
    </div>
  );
};

// ─── Animation style helpers ─────────────────────────────────────────────────

/** Returns a CSS transition style that goes from hidden → visible. */
function fadeStyle(
  entered: boolean,
  reduced: boolean,
  delay: number,
  extras?: { translateY?: string; scale?: number; duration?: number },
): CSSProperties {
  if (reduced) {
    return { opacity: 1, transform: 'none', transition: 'none' };
  }

  const dur = `${extras?.duration ?? 0.85}s`;
  const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const transforms: string[] = [];
  if (extras?.translateY) transforms.push(`translateY(${entered ? '0' : extras.translateY})`);
  if (extras?.scale != null) transforms.push(`scale(${entered ? 1 : extras.scale})`);
  const transformStr = transforms.length ? transforms.join(' ') : undefined;

  return {
    opacity: entered ? 1 : 0,
    transform: transformStr,
    transition: `opacity ${dur} ${ease} ${delay}s, transform ${dur} ${ease} ${delay}s`,
  };
}

// ─── RoleSelection ────────────────────────────────────────────────────────────

interface RoleSelectionProps {
  onSelect: (role: 'doctor' | 'receptionist') => void;
  selected: 'doctor' | 'receptionist' | null;
}

const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect, selected }) => {
  const entered = useEntrance();
  const reduced = usePrefersReducedMotion();

  /* ── Artwork keyframe reveal (two-phase: character then equipment) ── */
  const artworkStyle = (side: 'doctor' | 'receptionist'): CSSProperties => {
    if (reduced) {
      // Instant final state — no animation.
      return { opacity: 0.82, clipPath: 'none' };
    }

    const isDoc = side === 'doctor';
    const center = isDoc ? '55% 65%' : '45% 60%';
    const delay = isDoc ? '0.15s' : '0.2s';
    const name = isDoc ? 'rs-reveal-doctor' : 'rs-reveal-receptionist';

    if (!entered) {
      // Paint the fully-hidden initial state before animation fires.
      return {
        opacity: 0,
        clipPath: `ellipse(0% 0% at ${center})`,
      };
    }

    // Once entered, hand control entirely to the keyframe with a smooth, slow reveal.
    // 'forwards' fill mode keeps the final state after completion.
    return {
      animation: `${name} 2.2s cubic-bezier(0.16, 1, 0.3, 1) ${delay} forwards`,
    };
  };

  /* ── Baseline rule ── */
  const baselineStyle: CSSProperties = reduced
    ? { height: '1px', width: '100%', background: 'rgba(166,99,43,0.18)', flexShrink: 0 }
    : {
      height: '1px',
      width: '100%',
      background: 'rgba(166,99,43,0.18)',
      flexShrink: 0,
      transformOrigin: 'center',
      transform: entered ? 'scaleX(1)' : 'scaleX(0)',
      opacity: entered ? 1 : 0,
      transition: `transform 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.9s, opacity 0.8s ease 0.9s`,
    };

  return (
    <div
      className="min-h-screen w-full flex flex-col overflow-hidden"
      style={{ backgroundColor: '#FAF6F0' }}
    >
      {/* Injected styles — keyframes + responsive rules */}
      <style>{ARTWORK_KEYFRAMES}</style>
      <style>{RESPONSIVE_STYLES}</style>

      {/* ── Top brand bar ── */}
      <header
        className="rs-brand-bar flex items-center gap-2.5 px-10 pt-8 pb-0 flex-shrink-0"
        style={{ zIndex: 2, ...fadeStyle(entered, reduced, 0, { translateY: '-10px', duration: 0.8 }) }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '28px', color: '#4F8FA8', fontVariationSettings: "'FILL' 1" }}
        >
          vital_signs
        </span>
        <span
          className="font-display font-bold"
          style={{ fontSize: '20px', color: '#1B2420', letterSpacing: '-0.01em' }}
        >
          OptiTriage
        </span>
      </header>

      {/* ── Main stage ── */}
      <main className="flex-1 flex items-stretch justify-center relative overflow-hidden">

        {/* Headline block — centred above cards */}
        <div
          className="rs-headline-wrap absolute top-0 left-1/2 flex flex-col items-center pointer-events-none"
          style={{ transform: 'translateX(-50%)', zIndex: 3, paddingTop: '40px', width: 'max(280px, 90vw)', maxWidth: '600px' }}
        >
          <div style={fadeStyle(entered, reduced, 0.15, { duration: 0.85 })}>
            <div className="flex flex-col items-center">
              <span
                className="uppercase font-semibold tracking-widest mb-2"
                style={{ fontSize: '10px', color: '#9E6B40', letterSpacing: '0.22em' }}
              >
                Select your workspace
              </span>
              <h1
                className="rs-headline-title font-display font-semibold text-center"
                style={{ fontSize: '32px', color: '#1B2420', letterSpacing: '-0.02em', lineHeight: 1.2 }}
              >
                Who are you today?
              </h1>
              <p
                className="rs-headline-sub mt-2 text-center"
                style={{ fontSize: '13.5px', color: '#6B7B75', lineHeight: 1.55 }}
              >
                Choose your role to access the right workspace.
              </p>
            </div>
          </div>
        </div>

        {/* Three-column triptych */}
        <div
          className="rs-triptych w-full flex items-end justify-center gap-0"
          style={{ maxWidth: '1280px', paddingTop: '140px', alignItems: 'flex-end' }}
        >

          {/* LEFT — Doctor artwork */}
          <div
            className="rs-artwork-panel flex-1 flex items-end justify-end relative"
            style={{ minWidth: 0 }}
            aria-hidden="true"
          >
            {/* Doctor Decorations — curated clinical composition */}
            <div
              className="rs-deco-layer absolute inset-0 pointer-events-none"
              style={{ zIndex: 0 }}
            >
              {/* Activity monitor — drifts in from top-left, subtle y-idle */}
              <FloatingDecoration
                icon={Activity}
                position={{ top: '14%', left: '15%' }}
                size={28}
                rotation={-12}
                entrance="from-top-left"
                entranceRotation={10}
                delay={1.0}
                duration={1.45}
                color="#4F8FA8"
                opacity={0.32}
                idle="drift-y"
                idleDuration={10}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-primary"
              />
              {/* HeartPulse — drops in from above, xy idle */}
              <FloatingDecoration
                icon={HeartPulse}
                position={{ top: '10%', right: '30%' }}
                size={22}
                rotation={8}
                entrance="from-top"
                entranceRotation={-6}
                delay={1.3}
                duration={1.35}
                color="#4F8FA8"
                opacity={0.38}
                idle="drift-xy"
                idleDuration={11.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Pill — rises from bottom-left */}
              <FloatingDecoration
                icon={Pill}
                position={{ bottom: '35%', left: '12%' }}
                size={24}
                rotation={-20}
                entrance="from-bottom-left"
                entranceRotation={12}
                delay={1.55}
                duration={1.4}
                color="#4F8FA8"
                opacity={0.36}
                idle="drift-x"
                idleDuration={12.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Stethoscope — slides in from the left, balancing the middle */}
              <FloatingDecoration
                icon={Stethoscope}
                position={{ top: '38%', left: '22%' }}
                size={30}
                rotation={15}
                entrance="from-left"
                entranceRotation={-10}
                delay={1.15}
                duration={1.55}
                color="#4F8FA8"
                opacity={0.22}
                idle="drift-y"
                idleDuration={10.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* ── Additional background icons (optitriage-icon-float keyframes) ── */}
              {/* Syringe — upper-left corner, light and small */}
              <FloatingDecoration
                icon={Syringe}
                position={{ top: '5%', left: '8%' }}
                size={20}
                rotation={-30}
                entrance="from-top-left"
                entranceRotation={15}
                delay={1.8}
                duration={1.3}
                color="#B5825A"
                opacity={0.32}
                idle="drift-xy"
                idleDuration={13.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Thermometer — mid-left, medium size */}
              <FloatingDecoration
                icon={Thermometer}
                position={{ top: '55%', left: '6%' }}
                size={22}
                rotation={10}
                entrance="from-left"
                entranceRotation={-8}
                delay={2.0}
                duration={1.4}
                color="#B5825A"
                opacity={0.30}
                idle="drift-y"
                idleDuration={11}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* ClipboardList — lower area, subtle */}
              <FloatingDecoration
                icon={ClipboardList}
                position={{ bottom: '20%', left: '20%' }}
                size={26}
                rotation={-8}
                entrance="from-bottom-left"
                entranceRotation={10}
                delay={2.2}
                duration={1.5}
                color="#B5825A"
                opacity={0.28}
                idle="drift-x"
                idleDuration={14}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* ShieldCheck — near top, right of panel, very light */}
              <FloatingDecoration
                icon={ShieldCheck}
                position={{ top: '22%', right: '18%' }}
                size={18}
                rotation={5}
                entrance="from-top-right"
                entranceRotation={-12}
                delay={2.4}
                duration={1.35}
                color="#B5825A"
                opacity={0.25}
                idle="drift-y"
                idleDuration={12}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* TestTube — bottom-right of left panel, small */}
              <FloatingDecoration
                icon={TestTube}
                position={{ bottom: '10%', right: '15%' }}
                size={19}
                rotation={18}
                entrance="from-bottom-right"
                entranceRotation={-10}
                delay={2.6}
                duration={1.3}
                color="#B5825A"
                opacity={0.27}
                idle="drift-xy"
                idleDuration={15}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Droplet — top area, very subtle */}
              <FloatingDecoration
                icon={Droplet}
                position={{ top: '30%', left: '5%' }}
                size={16}
                rotation={-5}
                entrance="from-left"
                entranceRotation={8}
                delay={2.8}
                duration={1.2}
                color="#B5825A"
                opacity={0.22}
                idle="drift-y"
                idleDuration={10}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
            </div>

            <img
              src={doctorCharacterSrc}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                maxWidth: '520px',
                height: 'auto',
                display: 'block',
                objectFit: 'contain',
                objectPosition: 'bottom right',
                userSelect: 'none',
                pointerEvents: 'none',
                marginRight: '-24px',
                marginBottom: '60px',
                position: 'relative',
                zIndex: 1,
                ...artworkStyle('doctor'),
              }}
            />
          </div>

          {/* CENTRE — Role cards + continue button */}
          <div
            className="flex flex-col items-center flex-shrink-0 px-4"
            style={{ zIndex: 2 }}
          >
            {/* Cards wrapper with entrance animation */}
            <div
              className="rs-cards-row flex flex-row items-stretch"
              style={{ gap: '20px', ...fadeStyle(entered, reduced, 0.45, { translateY: '18px', scale: 0.98, duration: 0.95 }) }}
            >
              <RoleCard
                role="doctor"
                eyebrow="Clinical Suite"
                label="Doctor"
                description="Monitor the live patient queue, review rPPG vitals, and act on triage risk scores in real time."
                features={['Live vital stream', 'NEWS2 risk matrix', 'Patient history']}
                icon="stethoscope"
                isSelected={selected === 'doctor'}
                onClick={() => onSelect('doctor')}
              />
              <RoleCard
                role="receptionist"
                eyebrow="Front Desk"
                label="Receptionist"
                description="Register new patients, generate secure scan links, and send them instantly via WhatsApp."
                features={['Fast registration', 'Instant QR & link', 'Patient records']}
                icon="person_add"
                isSelected={selected === 'receptionist'}
                onClick={() => onSelect('receptionist')}
              />
            </div>

            {/* Continue button */}
            {selected && (
              <button
                onClick={() => onSelect(selected)}
                style={{
                  marginTop: '24px',
                  width: 'min(260px, calc(100vw - 48px))',
                  background: selected === 'doctor' ? '#4F8FA8' : '#2F6F5E',
                  color: '#ffffff',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: '13.5px',
                  letterSpacing: '0.01em',
                  borderRadius: '14px',
                  padding: '14px 0',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: selected === 'doctor'
                    ? '0 4px 16px rgba(79,143,168,0.35)'
                    : '0 4px 16px rgba(47,111,94,0.35)',
                  transition: 'background 250ms ease, box-shadow 250ms ease, transform 250ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = selected === 'doctor'
                    ? '0 6px 20px rgba(79,143,168,0.45)'
                    : '0 6px 20px rgba(47,111,94,0.45)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = selected === 'doctor'
                    ? '0 4px 16px rgba(79,143,168,0.35)'
                    : '0 4px 16px rgba(47,111,94,0.35)';
                }}
              >
                {selected === 'doctor' ? 'Continue as Doctor' : 'Continue as Receptionist'}
                &nbsp;→
              </button>
            )}

            <div style={{ height: '48px' }} />
          </div>

          {/* RIGHT — Receptionist artwork */}
          <div
            className="rs-artwork-panel flex-1 flex items-end justify-start relative"
            style={{ minWidth: 0 }}
            aria-hidden="true"
          >
            {/* Receptionist Decorations — administrative/front-desk composition */}
            <div
              className="rs-deco-layer absolute inset-0 pointer-events-none"
              style={{ zIndex: 0 }}
            >
              {/* Phone — slides from top-right, subtle x-idle */}
              <FloatingDecoration
                icon={Phone}
                position={{ top: '14%', right: '15%' }}
                size={28}
                rotation={12}
                entrance="from-top-right"
                entranceRotation={-8}
                delay={1.15}
                duration={1.45}
                color="#2F6F5E"
                opacity={0.30}
                idle="drift-x"
                idleDuration={11}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-primary"
              />
              {/* Calendar — enters from right */}
              <FloatingDecoration
                icon={Calendar}
                position={{ top: '38%', right: '22%' }}
                size={26}
                rotation={-10}
                entrance="from-right"
                entranceRotation={6}
                delay={1.4}
                duration={1.4}
                color="#2F6F5E"
                opacity={0.34}
                idle="drift-y"
                idleDuration={10}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* FileText — rises from bottom-right */}
              <FloatingDecoration
                icon={FileText}
                position={{ bottom: '35%', right: '12%' }}
                size={28}
                rotation={15}
                entrance="from-bottom-right"
                entranceRotation={8}
                delay={1.6}
                duration={1.5}
                color="#2F6F5E"
                opacity={0.28}
                idle="drift-xy"
                idleDuration={12}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Bell — drops from above, smallest and lightest */}
              <FloatingDecoration
                icon={Bell}
                position={{ top: '10%', left: '30%' }}
                size={22}
                rotation={-8}
                entrance="from-top"
                entranceRotation={-10}
                delay={1.7}
                duration={1.35}
                color="#2F6F5E"
                opacity={0.35}
                idle="drift-y"
                idleDuration={9.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* ── Additional background icons (optitriage-icon-float keyframes) ── */}
              {/* UserPlus — upper-right corner */}
              <FloatingDecoration
                icon={UserPlus}
                position={{ top: '5%', right: '8%' }}
                size={20}
                rotation={12}
                entrance="from-top-right"
                entranceRotation={-14}
                delay={1.9}
                duration={1.3}
                color="#B5825A"
                opacity={0.30}
                idle="drift-xy"
                idleDuration={13}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* MessageSquare — mid-right */}
              <FloatingDecoration
                icon={MessageSquare}
                position={{ top: '52%', right: '6%' }}
                size={22}
                rotation={-8}
                entrance="from-right"
                entranceRotation={10}
                delay={2.1}
                duration={1.4}
                color="#B5825A"
                opacity={0.28}
                idle="drift-y"
                idleDuration={11.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* ClipboardCheck — lower area */}
              <FloatingDecoration
                icon={ClipboardCheck}
                position={{ bottom: '18%', right: '20%' }}
                size={24}
                rotation={10}
                entrance="from-bottom-right"
                entranceRotation={-10}
                delay={2.3}
                duration={1.45}
                color="#B5825A"
                opacity={0.27}
                idle="drift-x"
                idleDuration={14.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Mail — near top-left of right panel */}
              <FloatingDecoration
                icon={Mail}
                position={{ top: '24%', left: '18%' }}
                size={18}
                rotation={-6}
                entrance="from-top-left"
                entranceRotation={12}
                delay={2.5}
                duration={1.3}
                color="#B5825A"
                opacity={0.25}
                idle="drift-y"
                idleDuration={12.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Clock — bottom-left of right panel, small */}
              <FloatingDecoration
                icon={Clock}
                position={{ bottom: '10%', left: '14%' }}
                size={19}
                rotation={-15}
                entrance="from-bottom-left"
                entranceRotation={10}
                delay={2.7}
                duration={1.35}
                color="#B5825A"
                opacity={0.26}
                idle="drift-xy"
                idleDuration={15}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
              {/* Folder — top mid area, very subtle */}
              <FloatingDecoration
                icon={Folder}
                position={{ top: '32%', left: '5%' }}
                size={17}
                rotation={5}
                entrance="from-left"
                entranceRotation={-8}
                delay={2.9}
                duration={1.25}
                color="#B5825A"
                opacity={0.22}
                idle="drift-y"
                idleDuration={10.5}
                entered={entered}
                reducedMotion={reduced}
                className="rs-deco-secondary"
              />
            </div>

            <img
              src={receptionistCharacterSrc}
              alt=""
              draggable={false}
              style={{
                width: '100%',
                maxWidth: '520px',
                height: 'auto',
                display: 'block',
                objectFit: 'contain',
                objectPosition: 'bottom left',
                userSelect: 'none',
                pointerEvents: 'none',
                marginLeft: '-24px',
                marginBottom: '60px',
                position: 'relative',
                zIndex: 1,
                ...artworkStyle('receptionist'),
              }}
            />
          </div>

        </div>{/* end triptych */}

      </main>

      {/* Baseline desk rule */}
      <div aria-hidden="true" style={baselineStyle} />

      {/* Footer wordmark */}
      <footer
        className="flex items-center justify-center py-4"
        style={{ flexShrink: 0, ...fadeStyle(entered, reduced, 1.4, { duration: 0.8 }) }}
      >
        <span style={{ fontSize: '11px', color: '#9E9488', letterSpacing: '0.06em' }}>
          OPTITRIAGE · MEDICAL TRIAGE PLATFORM
        </span>
      </footer>
    </div>
  );
};

export default RoleSelection;
