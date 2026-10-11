export const DEFAULT_SURGERY_PRE_OP_CHECKLIST = [
  { itemKey: 'consent_signed', label: 'Informed consent signed', isRequired: true },
  { itemKey: 'npo_confirmed', label: 'NPO status confirmed', isRequired: true },
  { itemKey: 'allergies_reviewed', label: 'Allergies reviewed', isRequired: true },
  { itemKey: 'vitals_stable', label: 'Pre-op vitals within policy', isRequired: true },
  { itemKey: 'site_marked', label: 'Surgical site marked', isRequired: false },
  { itemKey: 'labs_reviewed', label: 'Required labs/imaging reviewed', isRequired: true },
] as const;
