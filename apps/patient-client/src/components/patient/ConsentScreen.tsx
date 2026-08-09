interface ConsentScreenProps {
  onBegin: () => void;
}

export default function ConsentScreen({ onBegin }: ConsentScreenProps) {
  return (
    <div className="flex flex-col items-center gap-8 px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pulse-soft">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2F6F5E"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h4l2 8 4-16 2 8h6" />
        </svg>
      </div>

      <div className="max-w-xs">
        <p className="font-display text-lg font-normal text-ink/50 leading-snug mb-1">
          Welcome to OptiTriage
        </p>
        <h1 className="font-display text-3xl leading-tight text-ink">
          Let's check your vitals
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/60">
          Your camera reads your pulse from small color changes in your
          skin. It takes about 30 seconds.
        </p>
      </div>

      <div className="w-full max-w-xs space-y-3 text-left">
        {[
          ['Good, even light', 'Face a window or lamp — avoid strong backlight.'],
          ['Stay still', 'Rest your head naturally, no need to hold a pose.'],
          ['Nothing leaves your device', 'Only the final numbers are sent to your doctor.'],
        ].map(([title, detail]) => (
          <div key={title} className="flex items-start gap-3 rounded-xl border border-line bg-white/60 px-4 py-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pulse" />
            <div>
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-[13px] text-ink/55">{detail}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onBegin}
        className="mt-2 w-full max-w-xs rounded-full bg-pulse py-3.5 text-[15px] font-medium text-white transition active:scale-[0.98]"
      >
        Begin scan
      </button>
    </div>
  );
}
