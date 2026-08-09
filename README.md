# OptiTriage

**The Edge-Native Optical Triage Engine**

_Transforming any standard webcam into a clinical-grade vital sign monitor with zero cloud video processing._

---

## 🚨 The Problem: Telemedicine is "Blind"

Telemedicine digitized the doctor-patient conversation, but it left the physical exam behind. Today, doctors prescribe medications over video calls with **zero objective physiological data**. Meanwhile, manual triage in crowded emergency rooms creates fatal bottlenecks, allowing patients to deteriorate unnoticed while waiting for basic pulse oximetry.

## 💡 The Solution: OptiTriage

OptiTriage is a frictionless, B2B clinical triage link. It uses **Remote Photoplethysmography (rPPG)** to extract Heart Rate (BPM), Heart Rate Variability (HRV), and Respiratory Rate entirely through a standard browser camera.

No app installs. No proprietary hardware. No cloud video streaming.

---

## 🔥 Core Technical Differentiators

Judges, here is why OptiTriage is built differently than traditional computer vision applications:

### 1. 100% Edge-Native Compute (Zero-Video Cloud)

Traditional telemedicine streams heavy video to remote servers, causing high bandwidth costs, latency, and severe HIPAA/GDPR privacy risks.

- **Our Approach:** OptiTriage turns the patient's local browser into a compute node. We offload 478-point facial landmark tracking to **WebAssembly (Wasm)** and mathematical signal amplification to **WebGPU**.
- **The Result:** The video never leaves the user's local RAM. Only a 1-kilobyte JSON payload (containing the final numbers) is pushed to the doctor's dashboard via WebSockets. It is infinitely scalable and secure by design.

### 2. Health Equity via the CHROM Algorithm

Standard RGB pixel-tracking fails on darker skin tones because melanin absorbs light differently.

- **Our Approach:** Instead of basic green-channel extraction, we implemented the **CHROM Algorithm** (Chrominance-based rPPG).
- **The Result:** By projecting RGB values into a chrominance subspace, our math dynamically cancels out specular reflections (sweat/shine) and melanin bias, ensuring clinical accuracy across all skin tones.

---

## ⚙️ How the rPPG Pipeline Works

1. **Face Mesh Tracking (MediaPipe):** Detects 478 landmarks to isolate the forehead and cheek Regions of Interest (ROI) where micro-capillaries are most dense.
2. **Signal Extraction (HTML5 Canvas):** Extracts raw RGB pixel averages per frame at 60 FPS on a background Web Worker (ensuring the UI never freezes).
3. **Signal Cleaning (CHROM + WebGPU):** Normalizes the signal, removes auto-exposure lighting jumps using a background-wall reference frame, and isolates the pulse wave.
4. **Frequency Analysis (DSP.js FFT):** Runs a Fast Fourier Transform over a 10-second sliding window to identify the dominant frequency peak between 0.75 Hz and 4.0 Hz (45–240 BPM).
5. **Clinical Triage Scoring:** Evaluates the vitals against the National Early Warning Score (NEWS2) and pushes a Red/Yellow/Green alert to the doctor's Socket.io room.

---
