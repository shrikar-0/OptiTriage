/**
 * Compile-time validation that the @optitriage/shared path alias resolves.
 * Remove this file once real business logic imports TriagePayload directly.
 */
import type { TriagePayload, EwsRiskBand } from '@optitriage/shared';

// Ambient reference only — referenced via tsconfig paths, never at runtime.
declare const _: TriagePayload;
declare const __: EwsRiskBand;
