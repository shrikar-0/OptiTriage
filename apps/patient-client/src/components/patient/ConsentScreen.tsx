import React from 'react';
import nurseImg from '../../assets/nurse_transparent.png';
import receptionistImg from '../../assets/receptionist_transparent.png';
import AmbientBackground from './AmbientBackground';
import ConsentDecorations from './ConsentDecorations';
import { Heart, Activity, Leaf, Camera } from 'lucide-react';

interface ConsentScreenProps {
  onBegin: () => void;
}

export default function ConsentScreen({ onBegin }: ConsentScreenProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-paper font-sans text-ink">
      {/* Ambient animated background */}
      <AmbientBackground />

      {/* Soft gradient background blobs – stay behind everything */}
      <div className="pointer-events-none absolute -left-[20vw] -top-[10vh] h-[60vw] w-[60vw] rounded-full bg-pulse-soft/50 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-[20vh] -right-[15vw] h-[70vw] w-[70vw] rounded-full bg-pulse-soft/40 blur-[120px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(to right, #E2E0D8 1px, transparent 1px), linear-gradient(to bottom, #E2E0D8 1px, transparent 1px)',
          backgroundSize: '4rem 4rem',
          maskImage:
            'radial-gradient(ellipse 60% 60% at 50% 50%, #000 10%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 60% 60% at 50% 50%, #000 10%, transparent 80%)',
        }}
      />

      {/* Peripheral decorative layer – static medical/health‑tech line art */}
      <ConsentDecorations />

      {/* Top‑corner peripheral labels – absolutely anchored to viewport edges */}
      <div
        className="pointer-events-none absolute left-8 top-7 z-20 whitespace-nowrap text-[11px] font-semibold tracking-[0.2em] text-pulse/60"
      >
        YOUR HEALTH, OUR PRIORITY
      </div>
      <div
        className="pointer-events-none absolute right-8 top-7 z-20 whitespace-nowrap text-[11px] font-semibold tracking-[0.2em] text-pulse/60"
      >
        CARE · COMPASSION · COMFORT
      </div>

      {/* Three‑column layout – visible from lg breakpoint upwards */}
      <div className="relative flex flex-col lg:grid lg:grid-cols-[1fr_minmax(420px,450px)_1fr] gap-8 lg:gap-0 items-center lg:items-stretch">
        {/* LEFT ZONE – Nurse + Decorations */}
        <div className="hidden lg:flex justify-center items-end pl-[3vw] relative">
          {/* Subtle soft organic background behind the nurse */}
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 h-[300px] w-[300px] rounded-full bg-pulse-soft/60 blur-[60px] pointer-events-none" />
          
          {/* Floating decorations */}
          <div className="absolute left-[15%] top-[30%] text-pulse/40 animate-[drift-a_12s_ease-in-out_infinite]">
            <Leaf size={32} strokeWidth={1.5} />
          </div>
          <div className="absolute right-[20%] bottom-[20%] text-pulse/40 animate-[drift-b_15s_ease-in-out_infinite]">
            <Activity size={28} strokeWidth={1.5} />
          </div>

          <img
            src={nurseImg}
            alt="Clinical Nurse"
            className="relative z-10 h-[260px] xl:h-[340px] object-contain drop-shadow-lg"
          />
        </div>

        {/* CENTER ZONE – Main consent UI */}
        <div className="mx-auto flex w-full max-w-[420px] flex-col items-center justify-center px-6 py-6 pt-16 text-center">
          {/* Eyebrow */}
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
            Welcome to OptiTriage
          </p>

          {/* Main heading */}
          <h1 className="mb-4 font-display text-4xl font-semibold leading-[1.1] tracking-tight text-ink md:text-5xl">
            Let's check your vitals
          </h1>

          {/* Description */}
          <p className="mb-5 max-w-[340px] text-[15px] leading-relaxed text-ink/60">
            Your camera reads your pulse from small color changes in your skin. It takes about 30 seconds.
          </p>

          {/* Instruction Cards */}
          <div className="mb-5 flex w-full max-w-[400px] flex-col gap-2.5 text-left">
            {/* Light */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-line/60 bg-white/80 px-4 py-3 shadow-[0_2px_12px_rgba(27,36,32,0.03)] backdrop-blur-md transition-all hover:border-line hover:bg-white hover:shadow-[0_4px_20px_rgba(27,36,32,0.06)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulse-soft text-pulse">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2V4M12 20V22M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M2 12H4M20 12H22M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9" />
                </svg>
              </div>
              <div className="flex flex-col justify-center">
                <p className="mb-0.5 text-[13.5px] font-semibold text-ink">Good, even light</p>
                <p className="text-[12.5px] leading-[1.4] text-ink/60">Face a window or lamp — avoid strong backlight.</p>
              </div>
            </div>

            {/* Still */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-line/60 bg-white/80 px-4 py-3 shadow-[0_2px_12px_rgba(27,36,32,0.03)] backdrop-blur-md transition-all hover:border-line hover:bg-white hover:shadow-[0_4px_20px_rgba(27,36,32,0.06)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulse-soft text-pulse">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="7" r="3.5" />
                  <path d="M5 21C5.8 16.8 8.1 14.5 12 14.5C15.9 14.5 18.2 16.8 19 21" />
                </svg>
              </div>
              <div className="flex flex-col justify-center">
                <p className="mb-0.5 text-[13.5px] font-semibold text-ink">Stay still</p>
                <p className="text-[12.5px] leading-[1.4] text-ink/60">Rest your head naturally, no need to hold a pose.</p>
              </div>
            </div>

            {/* Privacy */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-line/60 bg-white/80 px-4 py-3 shadow-[0_2px_12px_rgba(27,36,32,0.03)] backdrop-blur-md transition-all hover:border-line hover:bg-white hover:shadow-[0_4px_20px_rgba(27,36,32,0.06)]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pulse-soft text-pulse">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" />
                  <circle cx="12" cy="15.5" r="1" />
                </svg>
              </div>
              <div className="flex flex-col justify-center">
                <p className="mb-0.5 text-[13.5px] font-semibold text-ink">Nothing leaves your device</p>
                <p className="text-[12.5px] leading-[1.4] text-ink/60">Only the final numbers are sent to your doctor.</p>
              </div>
            </div>
          </div>

          {/* Begin scan button */}
          <button
            onClick={onBegin}
            className="w-full max-w-[400px] rounded-full bg-pulse py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_25px_rgba(47,111,94,0.20)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#255A4C] hover:shadow-[0_12px_30px_rgba(47,111,94,0.28)] active:translate-y-0 active:scale-[0.985]"
          >
            Begin scan
          </button>

          {/* Privacy microcopy */}
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] tracking-wide text-ink/35">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7C8 4.8 9.8 3 12 3C14.2 3 16 4.8 16 7V10" />
            </svg>
            <span>PRIVATE · LOCAL CAMERA PROCESSING</span>
          </div>
        </div>

        {/* RIGHT ZONE – Receptionist + Decorations */}
        <div className="hidden lg:flex justify-center items-end pr-[3vw] relative">
          {/* Subtle soft organic background behind the receptionist */}
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 h-[300px] w-[300px] rounded-full bg-pulse-soft/60 blur-[60px] pointer-events-none" />

          {/* Floating decorations */}
          <div className="absolute left-[20%] top-[25%] text-pulse/40 animate-[drift-b_14s_ease-in-out_infinite]">
            <Heart size={36} strokeWidth={1.5} />
          </div>
          <div className="absolute right-[15%] top-[45%] text-pulse/40 animate-[drift-a_13s_ease-in-out_infinite]">
            <Camera size={30} strokeWidth={1.5} />
          </div>
          <div className="absolute left-[25%] bottom-[15%] text-pulse/40 animate-[drift-b_16s_ease-in-out_infinite]">
            <Activity size={28} strokeWidth={1.5} />
          </div>

          <img
            src={receptionistImg}
            alt="Receptionist"
            className="relative z-10 h-[260px] xl:h-[340px] object-contain drop-shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}