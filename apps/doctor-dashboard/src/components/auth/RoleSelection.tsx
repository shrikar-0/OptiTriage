import React from 'react';

// ─── RoleCard sub-component ───────────────────────────────────────────────────

interface RoleCardProps {
  icon: string;
  label: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}

const RoleCard: React.FC<RoleCardProps> = ({
  icon,
  label,
  description,
  isSelected,
  onClick,
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className={[
        'flex flex-col items-center gap-3 w-52 px-10 py-8 rounded-2xl cursor-pointer',
        'transition-all duration-200 bg-white',
        isSelected
          ? 'border-2 border-[#4F8FA8] bg-[rgba(79,143,168,0.06)] scale-[1.02] shadow-md'
          : 'border border-[rgba(79,143,168,0.2)] shadow-sm hover:border-[#4F8FA8] hover:shadow-md hover:scale-[1.02]',
      ].join(' ')}
    >
      <div className="w-14 h-14 bg-[rgba(79,143,168,0.1)] rounded-full flex items-center justify-center">
        <span
          className="material-symbols-outlined text-[28px] text-[#4F8FA8]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </div>
      <span className="font-semibold text-base text-[#1a2e35]">{label}</span>
      <span className="text-xs text-[#7A8C85] text-center">{description}</span>
    </div>
  );
};

// ─── RoleSelection ────────────────────────────────────────────────────────────

interface RoleSelectionProps {
  onSelect: (role: 'doctor' | 'receptionist') => void;
  selected: 'doctor' | 'receptionist' | null;
}

const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect, selected }) => {
  const continueLabel =
    selected === 'doctor' ? 'Continue as Doctor' : 'Continue as Receptionist';

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center"
      style={{ backgroundColor: '#FDF1DB' }}
    >
      {/* Brand mark */}
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[32px] text-[#4F8FA8]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          vital_signs
        </span>
        <span className="font-bold text-2xl text-[#1a2e35]">OptiTriage</span>
      </div>

      {/* Subtitle */}
      <p className="text-sm text-[#7A8C85] mt-3">Who are you today?</p>

      {/* Role cards */}
      <div className="flex flex-row gap-6 mt-10">
        <RoleCard
          icon="stethoscope"
          label="Doctor"
          description="View patient queue and live vitals"
          isSelected={selected === 'doctor'}
          onClick={() => onSelect('doctor')}
        />
        <RoleCard
          icon="person_add"
          label="Receptionist"
          description="Register patients and send scan links"
          isSelected={selected === 'receptionist'}
          onClick={() => onSelect('receptionist')}
        />
      </div>

      {/* Continue button */}
      {selected && (
        <button
          onClick={() => onSelect(selected)}
          className={[
            'mt-8 w-[216px] bg-[#4F8FA8] text-white font-semibold text-sm',
            'rounded-xl py-3 hover:bg-[#3d7a91] transition-colors duration-200',
            'animate-in fade-in slide-in-from-bottom-2 duration-300',
          ].join(' ')}
        >
          {continueLabel}
        </button>
      )}
    </div>
  );
};

export default RoleSelection;
