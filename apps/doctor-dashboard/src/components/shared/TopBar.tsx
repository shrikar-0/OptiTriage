interface TopBarProps {
  activeView?: 'doctor' | 'receptionist';
}

export default function TopBar({ activeView = 'doctor' }: TopBarProps) {
  const isReceptionist = activeView === 'receptionist';

  return (
    <header
      className={[
        'fixed top-0 right-0 z-50 flex items-center h-16 bg-white px-8',
        isReceptionist ? 'left-0 justify-center' : 'left-64 justify-between',
      ].join(' ')}
      style={{ boxShadow: '0px 4px 20px rgba(44,62,53,0.08)' }}
    >
      {/* Logo — absolutely centred in receptionist mode, left-aligned in doctor mode */}
      <div
        className={[
          'flex items-center gap-2',
          isReceptionist ? 'absolute left-1/2 -translate-x-1/2' : '',
        ].join(' ')}
      >
        <span
          className="material-symbols-outlined text-2xl"
          style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 1" }}
        >
          vital_signs
        </span>
        <span className="font-bold text-xl" style={{ color: '#1b637b' }}>
          OptiTriage
        </span>
      </div>

      {/* Right controls — hidden in receptionist mode */}
      {!isReceptionist && (
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center bg-gray-100 rounded-full px-4 py-2 gap-2">
            <span className="material-symbols-outlined text-gray-400 text-[18px]">search</span>
            <input
              className="bg-transparent border-none outline-none text-sm text-gray-600 w-44 placeholder:text-gray-400"
              placeholder="Search patients, ID..."
              type="text"
            />
          </div>
          {(['notifications', 'settings'] as const).map((icon) => (
            <button
              key={icon}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </button>
          ))}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm cursor-pointer"
            style={{ backgroundColor: '#4F8FA8' }}
          >
            Dr
          </div>
        </div>
      )}
    </header>
  );
}
