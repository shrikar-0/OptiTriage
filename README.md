# 🫀 OptiTriage

### Edge-Native Optical Triage Engine

**Calm. Accurate. Fast.**

![Patient Scan](pics/patient.png)
![Doctor Dashboard](pics/doctor.png)
![Receptionist Dashboard](pics/receptionist.png)

> A browser-based, zero-hardware clinical triage platform that transforms any standard webcam into a vital sign monitor — no wearables, no app install, no cloud video streaming.

---

## The Problem

**The Telemedicine Blind Spot** — Online doctors consult patients over video calls with zero objective physiological data. They prescribe based entirely on subjective observation.

**The Fatal Triage Bottleneck** — In crowded ERs, manual vital checks cannot scale. Patients deteriorate silently in waiting rooms before a doctor even sees them.

**The Hardware Barrier** — Pulse oximeters and ECGs are gated behind expensive proprietary hardware that billions globally cannot access — creating a massive health equity gap and unnecessary e-waste.

---

## The Solution

A receptionist registers a patient in seconds. A secure scan link is generated. The patient opens it in **any mobile browser** — no login, no download. Over 80 seconds, their webcam captures subtle color changes in skin caused by blood flow. **All signal processing runs entirely on their device.** The final vitals (Heart Rate, HRV, Respiratory Rate) are pushed live to the doctor's dashboard, risk-classified by NEWS2 score into Green / Yellow / Red priority.

Zero raw video ever leaves the patient's browser.

---

## Live Demo

| App | URL |
|---|---|
| 🧑‍⚕️ Doctor / Receptionist Dashboard | *(deploy link)* |
| 📱 Patient Scan Client | *(deploy link)* |

---

## How It Works

```
Receptionist                Patient Browser              Doctor Dashboard
     │                           │                              │
     │  Generate Scan Link        │                              │
     │──────────────────▶ SMS / WhatsApp                        │
     │                           │                              │
     │                    Opens scan link                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │  MediaPipe  │                       │
     │                    │ Face Mesh   │ 468 landmarks          │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │    CHROM    │ R/G + G/B ratios       │
     │                    │  Algorithm  │ cancels melanin bias   │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │  FFT Peak   │ BPM + HRV (RMSSD)     │
     │                    │  Detection  │                       │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │  4 × 20s    │ SQI-weighted avg       │
     │                    │   Cycles    │ stable final result    │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    Final numeric payload only            │
     │                    { bpm, hrv, respRate, ewsScore }      │
     │                           │──── Socket.io ──────────────▶│
     │                           │                       NEWS2  │
     │                           │                    🟢🟡🔴 Risk│
```

---

## Key Features

### 🔬 Signal Pipeline
- **CHROM Algorithm** — chrominance-based rPPG cancels melanin absorption and specular reflection, ensuring accuracy across all skin tones
- **Eulerian Video Magnification (EVM)** — amplifies invisible sub-pixel color changes caused by blood volume pulse
- **FFT Peak Detection** — bandpass-filtered (0.7–3.0 Hz / 42–180 BPM) Fast Fourier Transform extracts dominant pulse frequency
- **HRV via RMSSD** — Root Mean Square of Successive Differences from detected RR intervals
- **Optical Flow Respiratory Rate** — OpenCV.js tracks chest/shoulder micro-displacements at 0.13–0.5 Hz
- **Signal Quality Index (SQI)** — per-frame pixel variance + face velocity gating prevents bad data from corrupting results

### 🔄 Multi-Cycle Stability
- 4 independent 20-second measurement cycles (80 seconds total)
- Cycles with average SQI < 80% are automatically discarded
- Final result is SQI-weighted average across valid cycles — not a single noisy snapshot
- Large BPM spread across cycles triggers a "low consistency" flag

### 🏥 Clinical Backend
- **NEWS2 (National Early Warning Score 2)** — standard NHS clinical deterioration scoring from vital combinations
- **Real-time Socket.io relay** — vitals pushed live to doctor dashboard as scan completes
- **Role-based access** — doctors view queue, receptionists register patients (Supabase Auth)
- **Persistent scan history** — PostgreSQL via Prisma, ACID-compliant

### 🔒 Privacy by Architecture
- Raw video frames are processed in memory and discarded frame-by-frame — never stored, never transmitted
- Only the final numeric payload crosses the network
- HIPAA / GDPR compliance is a mathematical property of the architecture, not just a policy

### ⚖️ Health Equity
- CHROM chrominance math actively mitigates melanin bias — unlike raw green-channel extraction which fails on darker skin tones
- No wearable device required — works on any smartphone camera
- SMS / WhatsApp delivery means zero friction for patients

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Patient Frontend | React + Vite + Tailwind | Scan UI, camera access, real-time waveform |
| Face Tracking | MediaPipe Tasks Vision (WASM) | 468 facial landmarks, GPU-accelerated |
| Pulse Extraction | CHROM + EVM (WebGPU/WGSL) | rPPG signal from skin ROI |
| Frequency Analysis | FFT.js + DSP.js | BPM and HRV from pulse waveform |
| Motion Analysis | OpenCV.js (WASM) | Respiratory rate via optical flow |
| Risk Inference | onnxruntime-web | On-device clinical risk classification |
| API Relay | Node.js + Express + Socket.io | Real-time numeric payload relay |
| Auth | Supabase Auth + JWT | Doctor/receptionist login + patient magic links |
| Database | PostgreSQL + Prisma ORM | Persistent scan history, NEWS2 scoring |
| Messaging | WhatsApp Web.js / UltraMsg | Patient scan link delivery |
| Monorepo | pnpm workspaces | patient-client / doctor-dashboard / api |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PATIENT'S BROWSER                           │
│                                                                 │
│  Camera → MediaPipe → Skin ROI ─→ CHROM/EVM ─→ FFT → BPM/HRV  │
│                    → Motion ROI → Optical Flow → Resp Rate      │
│                                                                 │
│  SQI Gate → Multi-Cycle Averaging → Risk Classifier            │
│                                                                 │
│  ← No video leaves this boundary →                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │ { bpm, hrv, respRate, ewsScore, sessionId }
                       │ Socket.io (encrypted)
┌──────────────────────▼──────────────────────────────────────────┐
│                     NODE.JS API                                  │
│  JWT verification → Payload guard → NEWS2 scoring               │
│  Prisma write → Socket.io broadcast to doctor                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   PostgreSQL    Doctor Dashboard  Receptionist
   (Supabase)   Live Queue + NEWS2  Generate Links
```

---

## Repo Structure

```
OptiTriage/
├── apps/
│   ├── patient-client/          # React scan app (camera + rPPG pipeline)
│   │   └── src/
│   │       ├── lib/rppg/        # CHROM, FFT, HRV, SQI algorithms
│   │       ├── lib/motion/      # Optical flow, Butterworth filter
│   │       ├── lib/worker/      # Web Workers (rppg + motion)
│   │       └── hooks/           # useFaceMesh, useScanLifecycle, useRppgWorker
│   ├── doctor-dashboard/        # React dashboard (queue + vitals panel)
│   │   └── src/
│   │       ├── components/      # PatientQueue, VitalsPanel, EscalationAlert
│   │       └── pages/           # Dashboard, ReceptionistDashboard
│   └── api/                     # Express + Socket.io relay
│       └── src/
│           ├── lib/             # JWT, NEWS2, payload guard, SMS gateway
│           ├── middleware/      # Supabase JWT verification, rate limiting
│           ├── routes/          # sessions, queue, vitals, staff
│           └── db/              # Prisma client, repositories
└── packages/
    └── shared/                  # Shared TypeScript types
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+
- A Supabase project (free tier works)

### Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/optitriage.git
cd optitriage

# Install dependencies
pnpm install

# Generate Prisma client
pnpm --filter @optitriage/api exec prisma generate

# Push schema to Supabase
pnpm --filter @optitriage/api exec prisma db push
```

### Environment Variables

**`apps/api/.env`**
```dotenv
PORT=3001
JWT_SECRET=your_random_secret_here
DATABASE_URL=postgresql://postgres.[ref]:[password]@pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.[ref]:[password]@pooler.supabase.com:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PATIENT_SCAN_BASE_URL=http://localhost:5173/scan
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

**`apps/doctor-dashboard/.env`**
```dotenv
VITE_API_BASE_URL=http://localhost:3001
VITE_SUPABASE_URL=https://[ref].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Run

```bash
pnpm --parallel -r --filter "./apps/*" run dev
```

| App | URL |
|---|---|
| Patient Scan | http://localhost:5173 |
| Doctor / Receptionist Dashboard | http://localhost:5174 |
| API | http://localhost:3001 |

---

## Clinical Validation Note

OptiTriage is a **clinical decision support tool**, not a diagnostic device. Heart Rate and Respiratory Rate via rPPG are validated in peer-reviewed literature and have FDA 510(k) precedent (NuraLogix Anura). HRV and motion asymmetry features are research-grade and labeled as experimental. This tool is designed to flag patients for clinical review — not replace clinical judgment.

---

## Real-World Impact

| Setting | Use Case |
|---|---|
| 🏥 ER Waiting Rooms | Tablet kiosks flag silent deterioration before a doctor sees the patient |
| 💻 Telemedicine | Objective vitals gathered 5 minutes before the online consultation begins |
| 🌍 Rural Field Clinics | Offline PWA on health worker tablets where no hardware sensors exist |
| 🏭 Industrial Safety | Pre-shift fitness-for-duty screening with zero hardware cost |

---

## Sustainability

- **Zero e-waste** — no plastic pulse oximeters to manufacture, ship, or dispose of
- **Zero cloud video** — 100% edge compute means no server energy cost for video processing
- **Zero marginal hardware cost** — patients provide the computing power via their own devices

---


*Built at hackathon speed. Designed for clinical impact.*