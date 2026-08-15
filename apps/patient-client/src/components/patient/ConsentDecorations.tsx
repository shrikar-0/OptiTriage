

export default function ConsentDecorations() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* DECORATION 1 — LEFT ECG */}
      <div
        style={{
          left: '8vw',
          top: '50vh',
          transform: 'translateY(-50%)',
        }}
        className="absolute"
      >
        <svg
          width="200"
          height="80"
          viewBox="0 0 200 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.38 }}
        >
          <path
            d="M0,40
               C20,40 30,30 40,30
               C50,30 55,50 65,50
               C75,50 80,30 90,30
               C100,30 105,50 115,50
               C125,50 130,30 140,30
               C150,30 155,50 165,50
               C175,50 180,40 200,40"
            stroke="#2F6F5E"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* DECORATION 2 — RIGHT ECG */}
      <div
        style={{
          right: '8vw',
          top: '60vh',
          transform: 'translateY(-50%)',
        }}
        className="absolute"
      >
        <svg
          width="200"
          height="80"
          viewBox="0 0 200 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.38 }}
        >
          <path
            d="M0,40
               C20,40 30,55 40,55
               C50,55 55,30 65,30
               C75,30 80,55 90,55
               C100,55 105,30 115,30
               C125,30 130,55 140,55
               C150,55 155,30 165,30
               C175,30 180,40 200,40"
            stroke="#2F6F5E"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* DECORATION 3 — BOTANICAL LINE ART (lower‑left) */}
      <div
        style={{
          left: '8vw',
          bottom: '8vh',
        }}
        className="absolute"
      >
        <svg
          width="120"
          height="100"
          viewBox="0 0 120 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.42 }}
        >
          {/* stems */}
          <path
            d="M60,100 Q55,70 60,40 Q65,20 70,10"
            stroke="#6F927F"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M60,80 Q45,60 40,40"
            stroke="#6F927F"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M60,80 Q75,60 80,40"
            stroke="#6F927F"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* leaves */}
          <ellipse cx="40" cy="40" rx="12" ry="6" stroke="#DCEAE4" strokeWidth="1" fill="none" transform="rotate(-30 40 40)" />
          <ellipse cx="80" cy="40" rx="12" ry="6" stroke="#DCEAE4" strokeWidth="1" fill="none" transform="rotate(30 80 40)" />
          <ellipse cx="60" cy="15" rx="10" ry="5" stroke="#DCEAE4" strokeWidth="1" fill="none" />
        </svg>
      </div>

      {/* DECORATION 4 — HEART / PULSE ORBIT (upper‑right) */}
      <div
        style={{
          right: '20vw',
          top: '30vh',
          transform: 'translateY(-50%)',
        }}
        className="absolute"
      >
        <svg
          width="110"
          height="110"
          viewBox="0 0 110 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.4 }}
        >
          {/* orbit circle */}
          <circle cx="55" cy="55" r="48" stroke="#2F6F5E" strokeWidth="1" strokeDasharray="6 6" />
          {/* heart outline */}
          <path
            d="M55,30 C40,15 25,30 25,48 C25,65 40,80 55,95 C70,80 85,65 85,48 C85,30 70,15 55,30 Z"
            stroke="#2F6F5E"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* tiny pulse line */}
          <path
            d="M30,55 Q40,45 55,55 Q70,65 80,55"
            stroke="#2F6F5E"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
          />
          {/* small dots on orbit */}
          <circle cx="55" cy="7" r="2" fill="#2F6F5E" opacity="0.5" />
          <circle cx="103" cy="55" r="2" fill="#2F6F5E" opacity="0.5" />
        </svg>
      </div>

      {/* DECORATION 5 — CAMERA / FACE SCAN (lower‑right) */}
      <div
        style={{
          right: '12vw',
          bottom: '14vh',
        }}
        className="absolute flex flex-col items-center"
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.4 }}
        >
          {/* camera body */}
          <rect x="20" y="30" width="80" height="60" rx="8" stroke="#2F6F5E" strokeWidth="1.2" />
          {/* lens */}
          <circle cx="60" cy="60" r="18" stroke="#2F6F5E" strokeWidth="1.2" />
          <circle cx="60" cy="60" r="8" stroke="#2F6F5E" strokeWidth="1" />
          {/* scanning corner brackets */}
          <g stroke="#2F6F5E" strokeWidth="1.2">
            <path d="M20,30 h15 M20,30 v15" />
            <path d="M100,30 h-15 M100,30 v15" />
            <path d="M20,90 h15 M20,90 v-15" />
            <path d="M100,90 h-15 M100,90 v-15" />
          </g>
          {/* subtle circular target */}
          <circle cx="60" cy="60" r="30" stroke="#2F6F5E" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.5" />
        </svg>
        <p
          className="mt-2 text-[9px] uppercase tracking-[0.12em] text-[#2F6F5E]"
          style={{ opacity: 0.4 }}
        >
          CAMERA · FACE · PULSE
        </p>
      </div>

      {/* DECORATION 6 — SMALL MEDICAL DETAILS (scattered) */}
      <div className="absolute inset-0" style={{ opacity: 0.35 }}>
        {/* tiny cross top‑left */}
        <svg
          x="5vw"
          y="12vh"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute"
          style={{ left: '5vw', top: '12vh' }}
        >
          <rect x="7" y="2" width="4" height="14" rx="1" fill="#2F6F5E" />
          <rect x="2" y="7" width="14" height="4" rx="1" fill="#2F6F5E" />
        </svg>
        {/* four‑point sparkle mid‑left */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute"
          style={{ left: '10vw', top: '70vh' }}
        >
          <path d="M10,2 L10,6 M10,14 L10,18 M2,10 L6,10 M14,10 L18,10" stroke="#2F6F5E" strokeWidth="1" strokeLinecap="round" />
        </svg>
        {/* tiny circle lower‑mid */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute"
          style={{ left: '50vw', bottom: '10vh' }}
        >
          <circle cx="6" cy="6" r="5" stroke="#2F6F5E" strokeWidth="1" />
        </svg>
        {/* small dot right‑mid */}
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="#2F6F5E"
          className="absolute"
          style={{ right: '6vw', top: '55vh' }}
        >
          <circle cx="4" cy="4" r="4" />
        </svg>
        {/* tiny cross near upper‑right */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute"
          style={{ right: '22vw', top: '18vh' }}
        >
          <rect x="6" y="1" width="4" height="14" rx="1" fill="#2F6F5E" opacity="0.5" />
          <rect x="1" y="6" width="14" height="4" rx="1" fill="#2F6F5E" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}
