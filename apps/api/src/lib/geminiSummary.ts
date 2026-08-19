/**
 * src/lib/geminiSummary.ts
 *
 * Gemini AI — patient-friendly vitals summary generator.
 *
 * Exports a single async function:
 *   generateVitalsSummary(vitals, languageCode) → string
 *
 * Model: gemini-1.5-pro — strongest multilingual instruction-following.
 *
 * The prompt opens with a bold native-script instruction and embeds
 * inline context labels on every vital so Gemini has no ambiguity
 * about what language to use.
 *
 * On any error (network, quota, bad key) it returns a safe plain-English
 * fallback so the calling WhatsApp flow is never blocked.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Language map ─────────────────────────────────────────────────────────────

const languageMap: Record<string, string> = {
  en: 'English',
  hi: 'हिंदी (Hindi)',
  mr: 'मराठी (Marathi)',
  ta: 'தமிழ் (Tamil)',
  te: 'తెలుగు (Telugu)',
  bn: 'বাংলা (Bengali)',
  gu: 'ગુજરાતી (Gujarati)',
  kn: 'ಕನ್ನಡ (Kannada)',
  ml: 'മലയാളം (Malayalam)',
  pa: 'ਪੰਜਾਬੀ (Punjabi)',
};

// ─── Vitals input type ────────────────────────────────────────────────────────

export interface VitalsSummaryInput {
  bpm: number;
  hrv: number;
  respRate: number;
  ewsScore: number;
  news2Category: string; // e.g. "Low", "Medium", "High"
}

// ─── Client (lazy-initialised so a missing key only fails at call time) ───────

function getClient(): GoogleGenerativeAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[Gemini] GEMINI_API_KEY is not set — AI summary skipped.');
    return null;
  }
  return new GoogleGenerativeAI(key);
}

// ─── Plain-English fallback ───────────────────────────────────────────────────

function buildFallback(vitals: VitalsSummaryInput): string {
  const urgent = vitals.ewsScore >= 7 || vitals.news2Category === 'High';
  return (
    `Your health scan is complete. ` +
    `Heart Rate: ${vitals.bpm} BPM, Respiratory Rate: ${vitals.respRate} breaths/min. ` +
    `Risk Level: ${vitals.news2Category}. ` +
    (urgent
      ? 'Please see a doctor urgently.'
      : "Your vitals appear stable. Continue to follow your doctor's advice.")
  );
}



// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates a brief, patient-friendly health summary using Gemini AI.
 *
 * @param vitals        Computed vital-sign values from the scan.
 * @param languageCode  BCP-47 code (e.g. "hi", "mr"). Defaults to "en".
 * @returns             Generated summary string, or a plain-English fallback.
 */
export async function generateVitalsSummary(
  vitals: VitalsSummaryInput,
  languageCode = 'en',
): Promise<string> {
  const code = languageMap[languageCode] ? languageCode : 'en';
  const { bpm, hrv, respRate, ewsScore, news2Category } = vitals;

  try {
    const genAI = getClient();
    if (!genAI) return buildFallback(vitals);

    console.log('[Gemini] Language requested:', languageMap[code]);
    console.log('[Gemini] Using model: gemini-3.6-flash');

    const generativeModel = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    const result = await generativeModel.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `IMPORTANT INSTRUCTION: Write your ENTIRE response in ${languageMap[code]} script only. Do not write even one word in English or Roman script.

You are a caring health assistant explaining scan results to a patient in simple words they understand.

Patient scan results:
- Heart Rate: ${bpm} BPM ${bpm < 60 ? '(lower than normal)' : bpm > 100 ? '(higher than normal)' : '(normal range)'}
  Normal range: 60-100 BPM
- Heart Rate Variability (HRV): ${hrv} ms ${hrv < 20 ? '(low — body under stress)' : hrv > 80 ? '(excellent)' : '(normal)'}
  Normal range: 20-80ms. Higher HRV means your heart adapts better to stress.
- Respiratory Rate: ${respRate} breaths/min ${respRate > 20 ? '(faster than normal — needs attention)' : respRate < 12 ? '(slower than normal)' : '(normal)'}
  Normal range: 12-20 breaths per minute
- Risk Level: ${news2Category} (Clinical Score: ${ewsScore}/18)

Write a 200-word warm, friendly health report covering:
1. Overall health status in one encouraging opening sentence
2. What their heart rate of ${bpm} BPM tells about their body right now — if high, mention it could be due to stress, dehydration, fever, or physical activity; if normal, affirm it
3. What their HRV of ${hrv}ms means — explain HRV as the body's "stress resilience meter" — higher values mean better recovery
4. What their breathing rate of ${respRate} means — if above 20, say it may indicate mild respiratory stress or anxiety
5. Clear advice: should they see a doctor urgently, within a day, or are they stable for now?
6. One warm closing sentence with encouragement

Write ONLY in ${languageMap[code]} script. Zero English words allowed.`
        }]
      }]
    });

    const responseText = result.response.text().trim();

    console.log('[Gemini] Language requested:', languageMap[code]);
    console.log('[Gemini] Response preview:', result.response.text().substring(0, 100));

    // If the response looks like it's still in English, dump the full raw object for diagnosis
    const looksEnglish = /^[A-Za-z\s,.'"!?()-]{30,}/.test(responseText);
    if (looksEnglish && code !== 'en') {
      console.warn('[Gemini] WARNING: Response appears to still be in English despite language instruction.');
      console.warn('[Gemini] Full raw response object:', JSON.stringify(result.response, null, 2));
    }

    if (!responseText) {
      console.warn('[Gemini] Empty response received — using fallback.');
      return buildFallback(vitals);
    }

    console.log(`[Gemini] ✓ Summary generated in ${languageMap[code]}`);
    return responseText;
  } catch (err) {
    console.error('[Gemini] generateVitalsSummary failed:', (err as Error).message);
    return buildFallback(vitals);
  }
}
