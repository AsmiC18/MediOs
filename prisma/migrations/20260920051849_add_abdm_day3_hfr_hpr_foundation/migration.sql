-- AlterTable
ALTER TABLE "AbdmHospitalConfig" ADD COLUMN     "hfrFacilityName" TEXT,
ADD COLUMN     "hfrFacilityStatus" TEXT,
ADD COLUMN     "hfrRegistrationReference" TEXT,
ADD COLUMN     "hfrTrackingId" TEXT,
ADD COLUMN     "hfrVerifiedAt" TIMESTAMP(3);
