-- Enforce at most one ADMITTED admission per (hospitalId, patientId).
-- Prisma schema cannot express partial unique indexes; applied via raw SQL.
-- Discharged and cancelled admissions are excluded by the WHERE clause.

CREATE UNIQUE INDEX "IpdAdmission_one_active_per_patient_hospital"
ON "IpdAdmission"("hospitalId", "patientId")
WHERE status = 'ADMITTED';
