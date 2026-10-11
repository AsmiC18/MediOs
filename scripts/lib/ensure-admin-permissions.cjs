const PHASE1_PERMISSIONS = [
  'billing:read',
  'billing:manage',
  'payments:read',
  'payments:manage',
  'refunds:read',
  'refunds:manage',
  'refunds:approve',
  'scheduling:read',
  'scheduling:manage',
  'attendance:read',
  'attendance:manage',
  'attendance:export',
  'roster:read',
  'roster:manage',
  'work-schedules:read',
  'work-schedules:manage',
  'booking-rules:read',
  'booking-rules:manage',
  'leave:read',
  'leave:manage',
];

async function ensureAdminPhase1Permissions(prisma, adminRoleId) {
  for (const name of PHASE1_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: name },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRoleId, permissionId: permission.id },
      },
      update: {},
      create: { roleId: adminRoleId, permissionId: permission.id },
    });
  }
}

module.exports = { ensureAdminPhase1Permissions, PHASE1_PERMISSIONS };
