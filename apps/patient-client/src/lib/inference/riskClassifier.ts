
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';

export interface FusedFeatures {
  bpm: number;
  hrv: number;
  /** Optional — absent while motion worker is still buffering. */
  respRate?: number | null;
  /** Optional — absent while motion worker is still buffering. */
  motionAsymmetry?: number[] | null;
  sqi: number;
}

export interface RiskClassification {
  level: RiskLevel;
  /** Additive score (0–9), analogous to NEWS2. */
  score: number;
  confidence: number;
  /**
   * True when respRate or motionAsymmetry were absent at inference time.
   * The badge should surface a "Limited signal" qualifier.
   */
  isPartial: boolean;
}

export class RiskClassifier {
  /** Null until a real model is loaded. Type kept for forward-compatibility. */
  // private session: InferenceSession | null = null;
  private isInitialized = false;

  /**
   * Initialize the ONNX session.
   * Stubbed for now — in the future this will load the .onnx model file.
   */
  public async init(modelPath: string = '/models/risk_classifier.onnx'): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Future implementation:
      // this.session = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });
      
      // Simulating network delay for model loading
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.isInitialized = true;
      console.log(`[RiskClassifier] Initialized (stubbed) using model path: ${modelPath}`);
    } catch (err) {
      console.error('[RiskClassifier] Failed to initialize:', err);
      throw err;
    }
  }

  /**
   * Predict risk level based on the fused feature vector.
   * Currently uses simple deterministic thresholds.
   */
  public async predict(features: FusedFeatures): Promise<RiskClassification> {
    if (!this.isInitialized) {
      throw new Error('RiskClassifier is not initialized. Call init() first.');
    }

    // --- STUB IMPLEMENTATION (Heuristics based on NEWS2-like thresholds) ---
    // When the real model is wired in, replace this with:
    //   const tensor = new ort.Tensor('float32', Float32Array.from([...]), [1, N]);
    //   const results = await this.session.run({ input: tensor });

    let riskScore = 0;
    const hasRespRate = features.respRate != null;
    const hasAsymmetry = features.motionAsymmetry != null && features.motionAsymmetry.length > 0;
    const isPartial = !hasRespRate || !hasAsymmetry;

    // ── Heart Rate (always available) ────────────────────────────────────
    if (features.bpm <= 40 || features.bpm >= 131) riskScore += 3;
    else if (features.bpm >= 111) riskScore += 2;
    else if (features.bpm <= 50 || features.bpm >= 91) riskScore += 1;

    // ── Respiratory Rate (optional — skip when absent) ───────────────────
    if (hasRespRate) {
      const rr = features.respRate!;
      if (rr <= 8 || rr >= 25) riskScore += 3;
      else if (rr >= 21) riskScore += 2;
      else if (rr >= 9 && rr <= 11) riskScore += 1;
      // 12–20 brpm = normal, +0
    }

    // ── Motion Asymmetry (optional — skip when absent) ───────────────────
    if (hasAsymmetry) {
      const maxAsymmetry = Math.max(...features.motionAsymmetry!.map(Math.abs));
      if (maxAsymmetry > 5.0) riskScore += 3;
    }

    // ── Level from additive score ─────────────────────────────────────────
    let level: RiskLevel = 'Low';
    if (riskScore >= 7) level = 'Critical';
    else if (riskScore >= 5) level = 'High';
    else if (riskScore >= 3) level = 'Moderate';

    // ── Confidence: penalise partial data and poor SQI ────────────────────
    let confidence = isPartial ? 0.6 : 0.95;
    if (features.sqi < 0.5) confidence = Math.min(confidence, 0.5);
    else if (features.sqi < 0.8) confidence = Math.min(confidence, 0.75);

    return {
      level,
      score: riskScore,
      confidence,
      isPartial,
    };
  }
}
