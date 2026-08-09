/**
 * src/lib/payloadGuard.ts
 *
 * guardNumericPayload — rejects any inbound socket event that contains
 * non-numeric types that could indicate image / video / binary data smuggling.
 *
 * Per the OptiTriage architecture constraint:
 *   "Raw video frames NEVER leave the patient's browser, in any form —
 *    not as base64, not as compressed clips."
 *
 * This guard is the server-side enforcement of that rule on every vitals event.
 */

/** Allowed primitive types for TriagePayload fields. */
type AllowedPrimitive = number | boolean | string;

/** Rejection reason returned when the guard fails. */
export interface GuardRejection {
  field: string;
  reason: string;
}

/**
 * Inspects every value in `data` and returns a rejection reason if any field
 * violates the numeric-only payload contract.
 *
 * Detected violations:
 * - Buffer / ArrayBuffer / TypedArray (binary blob)
 * - Strings longer than MAX_STRING_LEN (base64 image heuristic)
 * - Strings beginning with "data:" (data URI)
 * - Objects / arrays nested beyond depth 0
 * - Symbols, functions, or undefined values
 */
export function guardNumericPayload(data: unknown): GuardRejection | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { field: '(root)', reason: 'Payload must be a plain JSON object.' };
  }

  const MAX_STRING_LEN = 512;

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const type = typeof value;

    // Binary blobs
    if (
      value instanceof Buffer ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    ) {
      return {
        field: key,
        reason: `Binary data is not permitted in triage payloads. Field "${key}" contains a ${value.constructor.name}.`,
      };
    }

    // Nested objects / arrays — payload must be flat
    if (type === 'object' && value !== null) {
      return {
        field: key,
        reason: `Nested objects are not permitted. Field "${key}" contains an object/array.`,
      };
    }

    // Disallowed primitive types
    if (type === 'symbol' || type === 'function' || type === 'undefined') {
      return {
        field: key,
        reason: `Illegal value type "${type}" in field "${key}".`,
      };
    }

    // String heuristics for base64 image smuggling
    if (type === 'string') {
      const str = value as string;
      if (str.startsWith('data:')) {
        return {
          field: key,
          reason: `Data URIs are not permitted. Field "${key}" appears to contain a data: URI.`,
        };
      }
      if (str.length > MAX_STRING_LEN) {
        return {
          field: key,
          reason:
            `Field "${key}" contains a string of length ${str.length}, ` +
            `exceeding the ${MAX_STRING_LEN}-character limit. ` +
            `Possible base64-encoded media data.`,
        };
      }
    }

    // Ensure value is an allowed primitive (number | boolean | string | null)
    const isAllowed =
      value === null ||
      type === 'number' ||
      type === 'boolean' ||
      type === 'string';

    if (!isAllowed) {
      return {
        field: key,
        reason: `Unexpected value type "${type}" in field "${key}".`,
      };
    }
  }

  return null; // payload is clean
}

/** Type-guard: narrows an unknown value to AllowedPrimitive. */
export function isAllowedPrimitive(v: unknown): v is AllowedPrimitive {
  const t = typeof v;
  return t === 'number' || t === 'boolean' || t === 'string';
}
