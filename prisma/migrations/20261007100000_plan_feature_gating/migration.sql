-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeature" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPlan" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "PlanFeature_planId_idx" ON "PlanFeature"("planId");

-- CreateIndex
CREATE INDEX "PlanFeature_featureKey_idx" ON "PlanFeature"("featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeature_planId_featureKey_key" ON "PlanFeature"("planId", "featureKey");

-- CreateIndex
CREATE INDEX "HospitalPlan_hospitalId_idx" ON "HospitalPlan"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalPlan_planId_idx" ON "HospitalPlan"("planId");

-- CreateIndex
CREATE INDEX "HospitalPlan_hospitalId_isActive_idx" ON "HospitalPlan"("hospitalId", "isActive");

-- CreateIndex
CREATE INDEX "HospitalPlan_startsAt_idx" ON "HospitalPlan"("startsAt");

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPlan" ADD CONSTRAINT "HospitalPlan_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPlan" ADD CONSTRAINT "HospitalPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
