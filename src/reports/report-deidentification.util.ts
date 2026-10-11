const PII_KEY_PATTERN =
  /^(phone|email|abhaNumber|abhaAddress|abhaId|address|linkToken|storageKey|passwordHash|refreshToken|accessToken|emergencyContact|firstName|lastName|dateOfBirth|providerPayment|webhook|abdmTransactionId|abdmRequestId|linkTokenExpiresAt)$/i;

const PATIENT_ID_KEY = /^patientId$/i;

export function deidentifyReportPayload(value: unknown, options?: { maskPatientIds?: boolean }): unknown {
  return walk(value, options?.maskPatientIds ?? false);
}

function walk(value: unknown, maskPatientIds: boolean): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => walk(entry, maskPatientIds));
  }
  if (typeof value !== 'object') {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEY_PATTERN.test(key)) {
      continue;
    }
    if (maskPatientIds && PATIENT_ID_KEY.test(key) && typeof nested === 'string') {
      out.patientToken = `patient:${nested.slice(0, 8)}`;
      continue;
    }
    out[key] = walk(nested, maskPatientIds);
  }
  return out;
}
