-- CreateIndex
CREATE INDEX "AuditLog_hospitalId_createdAt_idx" ON "AuditLog"("hospitalId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_hospitalId_branchId_createdAt_idx" ON "AuditLog"("hospitalId", "branchId", "createdAt" DESC);
