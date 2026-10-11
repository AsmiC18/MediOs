-- Allow patient-portal-initiated erasure requests (no staff User FK).
ALTER TABLE "PatientPrivacyErasureRequest" ALTER COLUMN "requestedByUserId" DROP NOT NULL;
