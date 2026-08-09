/**
 * SignalBars — audio-equalizer-style waveform meter.
 *
 * Five thin vertical bars pulse up and down independently via staggered
 * animation delays. When `active` is false the bars sit at minimum scale
 * and a reduced opacity, giving a clear "waiting" state vs "live" state.
 *
 * The `signal-bar` keyframe is defined in index.css.
 * prefers-reduced-motion is handled globally in index.css (duration → 0.001ms).
 */
export default function SignalBars({ active = true }: { active?: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[3px] h-5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-pulse"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            animation: active ? `signal-bar 900ms ease-in-out infinite` : 'none',
            animationDelay: `${i * 110}ms`,
            transform: active ? undefined : 'scaleY(0.25)',
            opacity: active ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  );
}
