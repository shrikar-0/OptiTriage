import { useEffect, useRef } from 'react';

const WAVE_COLOR = '#2F6F5E';

function WavePath() {
  return (
    <path
      d="M0,200 C60,200 80,160 120,160 C160,160 180,240 220,240 C260,240 280,180 320,180 C360,180 380,210 420,210 C460,210 480,170 520,170 C560,170 580,230 620,230 C660,230 680,190 720,190"
      fill="none"
      stroke={WAVE_COLOR}
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  );
}

export default function AmbientBackground() {
  const leftWrapRef = useRef<HTMLDivElement>(null);
  const rightWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    if (leftWrapRef.current) {
      leftWrapRef.current.style.transform = 'translateX(-60px)';
      leftWrapRef.current.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!leftWrapRef.current) return;
          leftWrapRef.current.style.transition = 'transform 700ms cubic-bezier(0.22,1,0.36,1), opacity 700ms ease-out';
          leftWrapRef.current.style.transform = 'translateX(0)';
          leftWrapRef.current.style.opacity = '1';
        });
      });
    }

    if (rightWrapRef.current) {
      rightWrapRef.current.style.transform = 'translateX(60px)';
      rightWrapRef.current.style.opacity = '0';
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!rightWrapRef.current) return;
            rightWrapRef.current.style.transition = 'transform 700ms cubic-bezier(0.22,1,0.36,1), opacity 700ms ease-out';
            rightWrapRef.current.style.transform = 'translateX(0)';
            rightWrapRef.current.style.opacity = '1';
          });
        });
      }, 150);
    }
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-pulse-soft opacity-25 blur-3xl"
        style={{ animation: 'drift-a 22s ease-in-out infinite' }}
      />
      <div
        className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-pulse-soft opacity-18 blur-3xl"
        style={{ animation: 'drift-b 26s ease-in-out infinite' }}
      />

      <div
        ref={leftWrapRef}
        className="absolute left-0 top-1/3 w-[240px]"
        style={{ opacity: 0.18 }}
      >
        <svg viewBox="0 0 720 400" className="w-full">
          <WavePath />
        </svg>
      </div>

      <div
        ref={rightWrapRef}
        className="absolute right-0 bottom-1/3 w-[240px]"
        style={{ opacity: 0.18 }}
      >
        <svg viewBox="0 0 720 400" className="w-full" style={{ transform: 'scaleX(-1)' }}>
          <WavePath />
        </svg>
      </div>
    </div>
  );
}