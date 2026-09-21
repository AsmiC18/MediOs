-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftStartTime" TEXT NOT NULL,
    "shiftEndTime" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RosterEntry_hospitalId_idx" ON "RosterEntry"("hospitalId");

-- CreateIndex
CREATE INDEX "RosterEntry_branchId_idx" ON "RosterEntry"("branchId");

-- CreateIndex
CREATE INDEX "RosterEntry_userId_idx" ON "RosterEntry"("userId");

-- CreateIndex
CREATE INDEX "RosterEntry_date_idx" ON "RosterEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_hospitalId_userId_date_key" ON "RosterEntry"("hospitalId", "userId", "date");

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
