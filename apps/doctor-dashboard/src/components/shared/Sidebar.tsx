export default function Sidebar({
  activeView,
  onSwitch,
  onSignOut,
}: {
  activeView: 'doctor' | 'receptionist';
  onSwitch: (view: 'doctor' | 'receptionist') => void;
  onSignOut: () => void;
}) {

  return (
    <>
      {activeView === 'receptionist' ? (
        /* ── Minimal receptionist sidebar — no teal bar ── */
        <nav
          className="fixed left-0 top-0 h-screen w-64 flex flex-col py-6 z-20"
          style={{ backgroundColor: '#FDF1DB' }}
        >
          {/* Push buttons to the bottom */}
          <div className="flex-1" />

          <div className="px-3 flex flex-col gap-1">
            {/* Switch button */}
            <button
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold h-12 rounded-xl transition-colors mb-1"
              style={{ backgroundColor: '#4F8FA8', color: '#ffffff' }}
              onClick={() => onSwitch('doctor')}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3d7a91')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#4F8FA8')}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                stethoscope
              </span>
              Switch to Doctor
            </button>

            {/* Support + Log Out */}
            {[
              { name: 'Support', icon: 'help_outline', action: undefined as (() => void) | undefined },
            ].map((item) => (
              <a
                key={item.name}
                href="#"
                className="flex items-center gap-3 px-4 py-2 rounded-full transition-all text-xs font-semibold uppercase tracking-wider hover:bg-[rgba(79,143,168,0.08)]"
                style={{ color: '#7A8C85' }}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.name}
              </a>
            ))}
            <button
              onClick={onSignOut}
              className="flex items-center gap-3 px-4 py-2 rounded-full transition-all text-xs font-semibold uppercase tracking-wider hover:bg-[rgba(79,143,168,0.08)] w-full text-left"
              style={{ color: '#7A8C85' }}
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Log Out
            </button>
          </div>
        </nav>
      ) : (
        /* ── Full teal doctor sidebar ── */
        <nav
          className="fixed left-0 top-0 h-screen w-64 flex flex-col py-6 z-20"
          style={{ backgroundColor: "#4F8FA8" }}
        >
          {/* Brand */}
          <div className="px-5 mb-8 flex items-center gap-2">
            <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              vital_signs
            </span>
            <span className="text-white font-bold text-xl tracking-tight">OptiTriage</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer */}
          <div className="px-2 pt-4 border-t border-white/20 flex flex-col gap-1">
            <button
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold h-12 rounded-lg hover:bg-white/90 transition-colors mb-2"
              style={{ backgroundColor: "#ffffff", color: "#4F8FA8" }}
              onClick={() => onSwitch('receptionist')}
            >
              <span className="material-symbols-outlined text-[16px]" style={{ color: "#4F8FA8", fontVariationSettings: "'FILL' 1" }}>
                person_add
              </span>
              Switch to Receptionist
            </button>

            {[
              { name: "Support", icon: "help_outline" },
            ].map((item) => (
              <a
                key={item.name}
                href="#"
                className="flex items-center gap-3 px-4 py-2 text-white/80 hover:bg-white/10 rounded-full transition-all text-xs font-semibold uppercase tracking-wider"
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {item.name}
              </a>
            ))}
            <button
              onClick={onSignOut}
              className="flex items-center gap-3 px-4 py-2 text-white/80 hover:bg-white/10 rounded-full transition-all text-xs font-semibold uppercase tracking-wider w-full text-left"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Log Out
            </button>
          </div>
        </nav>
      )}

    </>
  );
}
