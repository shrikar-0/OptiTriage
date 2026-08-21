# 🫀 OptiTriage

### Edge-Native Optical Triage Engine

**Calm. Accurate. Fast.**

[![React](https://img.shields.io/badge/React-19-0ea5e9?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Face%20Mesh-ff6f00?style=flat-square)](https://mediapipe.dev)
[![Privacy](https://img.shields.io/badge/Video-Never%20Leaves%20Device-10b981?style=flat-square)](https://github.com)
[![NEWS2](https://img.shields.io/badge/Scoring-NEWS2%20Clinical-ef4444?style=flat-square)](https://github.com)
[![SDG3](https://img.shields.io/badge/SDG-3%20Good%20Health-4CAF50?style=flat-square)](https://sdgs.un.org/goals/goal3)
[![SDG10](https://img.shields.io/badge/SDG-10%20Reduced%20Inequalities-DD1367?style=flat-square)](https://sdgs.un.org/goals/goal10)

> A browser-based, zero-hardware clinical triage platform that transforms any standard webcam into a vital sign monitor — no wearables, no app install, no cloud video streaming.

---

## Screenshots

![Patient Scan](pics/OptiTriage_Patient.jpeg)
![Doctor Dashboard](pics/OptiTriage_dr.jpeg)
![Receptionist Dashboard](pics/OptiTriage_Recep.jpeg)

---

## The Problem

**The Telemedicine Blind Spot** — Online doctors consult patients over video calls with zero objective physiological data. They prescribe based entirely on subjective observation.

**The Fatal Triage Bottleneck** — In crowded ERs, manual vital checks cannot scale. Patients deteriorate silently in waiting rooms before a doctor even sees them.

**The Hardware Barrier** — Pulse oximeters and ECGs are gated behind expensive proprietary hardware that billions globally cannot access — creating a massive health equity gap and unnecessary e-waste.

---

## The Solution

A receptionist registers a patient in seconds. A secure scan link is generated and delivered via WhatsApp. The patient opens it in **any mobile browser** — no login, no download. Over 80 seconds, their webcam captures subtle color changes in skin caused by blood flow. **All signal processing runs entirely on their device.** The final vitals (Heart Rate, HRV, Respiratory Rate) are pushed live to the doctor's dashboard, risk-classified by NEWS2 score into Green / Yellow / Red priority. An AI-generated health summary in the patient's preferred local language is delivered back to them on WhatsApp.

Zero raw video ever leaves the patient's browser.

---

## How It Works

```
Receptionist                Patient Browser              Doctor Dashboard
     │                           │                              │
     │  Generate Scan Link        │                             │
     │──────────────────▶ WhatsApp (automatic)                  │
     │                           │                              │
     │                    Opens scan link                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │  MediaPipe  │                       │
     │                    │ Face Mesh   │ 468 landmarks         │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │    CHROM    │ R/G + G/B ratios      │
     │                    │  Algorithm  │ cancels melanin bias  │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │  FFT Peak   │ BPM + HRV (RMSSD)     │
     │                    │  Detection  │                       │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    ┌──────▼──────┐                       │
     │                    │  4 × 20s    │ SQI-weighted avg      │
     │                    │   Cycles    │ stable final result   │
     │                    └──────┬──────┘                       │
     │                           │                              │
     │                    Final numeric payload only            │
     │                    { bpm, hrv, respRate, ewsScore }      │
     │                           │──── Socket.io ──────────────▶│
     │                           │                       NEWS2  │
     │                           │                    🟢🟡🔴 Risk│
     │                           │                              │
     │              AI Summary (Gemini) in local language       │
     │◀──────────────────── WhatsApp ───────────────────────────│
```

---

## Key Features

### 🔬 Signal Pipeline
- **CHROM Algorithm** — chrominance-based rPPG cancels melanin absorption and specular reflection, ensuring accuracy across all skin tones
- **Eulerian Video Magnification (EVM)** — amplifies invisible sub-pixel color changes caused by blood volume pulse
- **FFT Peak Detection** — bandpass-filtered (0.7–3.0 Hz / 42–180 BPM) Fast Fourier Transform extracts dominant pulse frequency
- **HRV via RMSSD** — Root Mean Square of Successive Differences from detected RR intervals, with adaptive frame-rate compensation
- **Optical Flow Respiratory Rate** — OpenCV.js tracks chest/shoulder micro-displacements at 0.13–0.5 Hz
- **Signal Quality Index (SQI)** — per-frame pixel variance + face velocity gating prevents bad data from corrupting results

### 🔄 Multi-Cycle Stability
- 4 independent 20-second measurement cycles (80 seconds total)
- Cycles with average SQI < 80% are automatically discarded
- Final result is SQI-weighted average across valid cycles — not a single noisy snapshot
- Large BPM spread across cycles triggers a "low consistency" flag

### 🤖 AI-Powered Health Summary
- **Gemini AI** generates a 150-200 word patient-friendly health interpretation after every scan
- Delivered automatically via **WhatsApp** to the patient's phone
- Supports **10 Indian languages**: English, Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, Malayalam, Punjabi
- Language is selected by the receptionist during patient registration — no extra step for the patient
- Explains each vital sign in plain language, describes what abnormal readings may indicate, and states urgency clearly
- Clearly labeled as AI-assisted clinical support, not a diagnosis

### 🏥 Clinical Backend
- **NEWS2 (National Early Warning Score 2)** — standard NHS clinical deterioration scoring from vital combinations
- **Real-time Socket.io relay** — vitals pushed live to doctor dashboard as scan completes
- **Role-based access** — doctors view queue, receptionists register patients (Supabase Auth with strict role enforcement)
- **Persistent scan history** — PostgreSQL via Prisma, ACID-compliant
- **Automatic WhatsApp delivery** — scan links and AI health summaries delivered without manual steps

### 🔒 Privacy by Architecture
- Raw video frames are processed in memory and discarded frame-by-frame — never stored, never transmitted
- Only the final numeric payload crosses the network
- HIPAA / GDPR compliance is a mathematical property of the architecture, not just a policy

### ⚖️ Health Equity
- CHROM chrominance math actively mitigates melanin bias — unlike raw green-channel extraction which fails on darker skin tones
- No wearable device required — works on any smartphone camera
- WhatsApp delivery + local language AI summaries eliminate literacy and language barriers
- Zero hardware cost means deployment in the most resource-constrained settings globally

---

## SDG Alignment

| SDG | Target | How OptiTriage Addresses It |
|---|---|---|
| **SDG 3** — Good Health | 3.8 Universal health coverage | Removes hardware barrier to basic vital sign monitoring globally |
| **SDG 3** — Good Health | 3.d Early warning systems | NEWS2 real-time risk classification flags deteriorating patients |
| **SDG 10** — Reduced Inequalities | Equity across groups | CHROM algorithm corrects skin tone bias built into standard oximeters |
| **SDG 9** — Innovation | Resilient infrastructure | Edge computing model works without broadband or cloud infrastructure |
| **SDG 12** — Responsible Consumption | Zero e-waste | Replaces single-use plastic pulse oximeters with a software solution |

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
| AI Summary | Google Gemini 2.0 Flash | Multilingual patient health interpretation |
| API Relay | Node.js + Express + Socket.io | Real-time numeric payload relay |
| Auth | Supabase Auth + JWT | Doctor/receptionist login + patient magic links |
| Database | PostgreSQL + Prisma ORM | Persistent scan history, NEWS2 scoring |
| Messaging | WhatsApp Web.js | Automatic scan link and AI summary delivery |
| Monorepo | pnpm workspaces | patient-client / doctor-dashboard / api |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PATIENT'S BROWSER                           │
│                                                                 │
│  Camera → MediaPipe → Skin ROI ─→ CHROM/EVM ─→ FFT → BPM/HRV    │
│                    → Motion ROI → Optical Flow → Resp Rate      │
│                                                                 │
│  SQI Gate → Multi-Cycle Averaging → Risk Classifier             │
│                                                                 │
│  ← No video leaves this boundary →                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ { bpm, hrv, respRate, ewsScore, sessionId }
                       │ Socket.io (encrypted)
┌──────────────────────▼──────────────────────────────────────────┐
│                     NODE.JS API                                 │
│  JWT verification → Payload guard → NEWS2 scoring               │
│  Prisma write → Socket.io broadcast → Gemini AI → WhatsApp      │
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
│           ├── lib/             # JWT, NEWS2, Gemini AI, WhatsApp gateway
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
- Google AI Studio API key (free at aistudio.google.com)

### Setup

```bash
# Clone the repo
git clone https://github.com/shrikar-0/OptiTriage .git
cd OptiTriage

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
GEMINI_API_KEY=AIza...
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

> **Note:** On first API startup, a QR code appears in the terminal. Scan it with your WhatsApp to enable automatic message delivery. The session is cached — you only need to scan once.

---

## Clinical Validation Note

OptiTriage is a **clinical decision support tool**, not a diagnostic device. Heart Rate and Respiratory Rate via rPPG are validated in peer-reviewed literature and have FDA 510(k) precedent (NuraLogix Anura). HRV and motion asymmetry features are research-grade and labeled as experimental. The AI health summary is generated for patient understanding only and is not a medical diagnosis. This tool is designed to flag patients for clinical review — not replace clinical judgment.

---

## Real-World Applications

| Setting | Use Case |
|---|---|
| 🏥 ER Waiting Rooms | Tablet kiosks flag silent deterioration before a doctor sees the patient |
| 💻 Telemedicine | Objective vitals gathered 5 minutes before the online consultation begins |
| 🌍 Rural Field Clinics | Offline PWA on health worker tablets where no hardware sensors exist |
| 🏭 Industrial Safety | Pre-shift fitness-for-duty screening with zero hardware cost |
| 📱 Community Health | WhatsApp-delivered AI summaries in local language reach patients with no digital literacy barrier |

---

## Sustainability

- **Zero e-waste** — no plastic pulse oximeters to manufacture, ship, or dispose of
- **Zero cloud video** — 100% edge compute means no server energy cost for video processing
- **Zero marginal hardware cost** — patients provide the computing power via their own devices
- **Zero language barrier** — AI summaries in 10 Indian languages reach patients in their mother tongue

---

*Built for clinical impact. Designed for the last mile.*