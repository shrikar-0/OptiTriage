import type { RgbSample } from '../types/rppg';

/**
 * CHROM (Chrominance-based) rPPG Algorithm
 * De Haan, G., & Jeanne, V. (2013). Robust pulse rate from chrominance-based rPPG.
 */
export class ChromProcessor {
  /**
   * Applies the CHROM algorithm to a window of RGB samples.
   * Also performs background referencing if background RGB samples are provided.
   *
   * @param skinWindow Array of average RGB values from the skin ROI
   * @param bgWindow Array of average RGB values from a background non-skin ROI (optional)
   * @returns The 1D chrominance pulse signal
   */
  static processWindow(skinWindow: RgbSample[], _bgWindow?: RgbSample[]): number[] {
    if (skinWindow.length === 0) return [];

    // Calculate temporal means for each skin color channel over the window
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    for (let i = 0; i < skinWindow.length; i++) {
      sumR += skinWindow[i].r;
      sumG += skinWindow[i].g;
      sumB += skinWindow[i].b;
    }

    let meanR = sumR / skinWindow.length;
    let meanG = sumG / skinWindow.length;
    let meanB = sumB / skinWindow.length;

    // Prevent division by zero
    if (meanR === 0) meanR = 1;
    if (meanG === 0) meanG = 1;
    if (meanB === 0) meanB = 1;

    const x: number[] = new Array(skinWindow.length);
    const y: number[] = new Array(skinWindow.length);

    // Calculate normalized chrominance signals X and Y per De Haan & Jeanne (2013)
    // Rn = R / mean(R), Gn = G / mean(G), Bn = B / mean(B)
    // X = 3 * Rn - 2 * Gn
    // Y = 1.5 * Rn + Gn - 1.5 * Bn
    for (let i = 0; i < skinWindow.length; i++) {
      const nR = skinWindow[i].r / meanR;
      const nG = skinWindow[i].g / meanG;
      const nB = skinWindow[i].b / meanB;

      x[i] = 3 * nR - 2 * nG;
      y[i] = 1.5 * nR + nG - 1.5 * nB;
    }

    // Zero-mean X and Y for AC signal extraction and standard deviation calculation
    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;

    let stdX = 0;
    let stdY = 0;

    for (let i = 0; i < skinWindow.length; i++) {
      x[i] -= meanX;
      y[i] -= meanY;
      stdX += x[i] * x[i];
      stdY += y[i] * y[i];
    }

    stdX = Math.sqrt(stdX / skinWindow.length);
    stdY = Math.sqrt(stdY / skinWindow.length);

    // Calculate alpha ratio: std(X) / std(Y)
    const alpha = stdX / (stdY || 1);

    // Final pulse signal S = X - alpha * Y
    const signal: number[] = new Array(skinWindow.length);
    for (let i = 0; i < skinWindow.length; i++) {
      signal[i] = x[i] - alpha * y[i];
    }

    return signal;
  }
}
