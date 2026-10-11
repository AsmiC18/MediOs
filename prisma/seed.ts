import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { bootstrapHospitalRoleCatalogue } from '../src/roles/role-bootstrap.util';
import {
  bootstrapHospitalEnterprisePlan,
  bootstrapPlanCatalogue,
} from '../src/plans/plan-bootstrap.util';
import { upsertDevelopmentIcd10Fixture } from '../src/clinical/icd10/icd10-development-fixture';

const prisma = new PrismaClient();

async function upsertPermission(name: string, description: string) {
  return prisma.permission.upsert({
    where: { name },
    update: { description },
    create: { name, description },
  });
}

async function grantPermission(roleId: string, permissionId: string) {
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId,
        permissionId,
      },
    },
    update: {},
    create: {
      roleId,
      permissionId,
    },
  });
}

async function main() {
  const hospital = await prisma.hospital.upsert({
    where: {
      code: 'DEMO',
    },
    update: {
      name: 'MediOS Demo Hospital',
    },
    create: {
      name: 'MediOS Demo Hospital',
      code: 'DEMO',
    },
  });

  const role = await prisma.role.upsert({
    where: {
      hospitalId_name: {
        hospitalId: hospital.id,
        name: 'ADMIN',
      },
    },
    update: {
      description: 'System administrator',
    },
    create: {
      hospitalId: hospital.id,
      name: 'ADMIN',
      description: 'System administrator',
    },
  });

  const receptionistRole = await prisma.role.upsert({
    where: {
      hospitalId_name: {
        hospitalId: hospital.id,
        name: 'RECEPTIONIST',
      },
    },
    update: {
      description: 'Reception staff',
    },
    create: {
      hospitalId: hospital.id,
      name: 'RECEPTIONIST',
      description: 'Reception staff',
    },
  });

  const permission = await prisma.permission.upsert({
    where: {
      name: 'patients:read',
    },
    update: {
      description: 'View patient records',
    },
    create: {
      name: 'patients:read',
      description: 'View patient records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: permission.id,
    },
  });

  const createPermission = await prisma.permission.upsert({
    where: {
      name: 'patients:create',
    },
    update: {
      description: 'Create patient records',
    },
    create: {
      name: 'patients:create',
      description: 'Create patient records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: createPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: createPermission.id,
    },
  });

  const updatePermission = await prisma.permission.upsert({
    where: {
      name: 'patients:update',
    },
    update: {
      description: 'Update patient records',
    },
    create: {
      name: 'patients:update',
      description: 'Update patient records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: updatePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: updatePermission.id,
    },
  });

  const engagementReadPermission = await prisma.permission.upsert({
    where: { name: 'patients:engagement:read' },
    update: { description: 'Read patient engagement and NPS' },
    create: {
      name: 'patients:engagement:read',
      description: 'Read patient engagement and NPS',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: engagementReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: engagementReadPermission.id,
    },
  });

  const engagementManagePermission = await prisma.permission.upsert({
    where: { name: 'patients:engagement:manage' },
    update: { description: 'Manage patient engagement actions and win-back' },
    create: {
      name: 'patients:engagement:manage',
      description: 'Manage patient engagement actions and win-back',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: engagementManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: engagementManagePermission.id,
    },
  });

  const abdmReadPermission = await prisma.permission.upsert({
    where: {
      name: 'abdm:read',
    },
    update: {
      description: 'View ABDM configuration and ABHA linkage',
    },
    create: {
      name: 'abdm:read',
      description: 'View ABDM configuration and ABHA linkage',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: abdmReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: abdmReadPermission.id,
    },
  });

  const abdmManagePermission = await prisma.permission.upsert({
    where: {
      name: 'abdm:manage',
    },
    update: {
      description: 'Manage ABDM configuration, HPR and ABHA linkage',
    },
    create: {
      name: 'abdm:manage',
      description: 'Manage ABDM configuration, HPR and ABHA linkage',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: abdmManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: abdmManagePermission.id,
    },
  });

  const abdmConsentReadPermission = await prisma.permission.upsert({
    where: {
      name: 'abdm:consent:read',
    },
    update: {
      description: 'View ABDM consent records and audit logs',
    },
    create: {
      name: 'abdm:consent:read',
      description: 'View ABDM consent records and audit logs',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: abdmConsentReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: abdmConsentReadPermission.id,
    },
  });

  const abdmConsentManagePermission = await prisma.permission.upsert({
    where: {
      name: 'abdm:consent:manage',
    },
    update: {
      description: 'Create and manage ABDM consent records',
    },
    create: {
      name: 'abdm:consent:manage',
      description: 'Create and manage ABDM consent records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: abdmConsentManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: abdmConsentManagePermission.id,
    },
  });

  const opdReadPermission = await prisma.permission.upsert({
    where: { name: 'opd:read' },
    update: { description: 'View OPD queue entries' },
    create: {
      name: 'opd:read',
      description: 'View OPD queue entries',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: opdReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: opdReadPermission.id,
    },
  });

  const opdManagePermission = await prisma.permission.upsert({
    where: { name: 'opd:manage' },
    update: { description: 'Manage OPD queue check-in and workflow' },
    create: {
      name: 'opd:manage',
      description: 'Manage OPD queue check-in and workflow',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: opdManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: opdManagePermission.id,
    },
  });

  const ipdReadPermission = await prisma.permission.upsert({
    where: { name: 'ipd:read' },
    update: { description: 'View IPD beds and admissions' },
    create: {
      name: 'ipd:read',
      description: 'View IPD beds and admissions',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: ipdReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: ipdReadPermission.id,
    },
  });

  const ipdManagePermission = await prisma.permission.upsert({
    where: { name: 'ipd:manage' },
    update: { description: 'Manage IPD beds, admissions, transfers, and discharge' },
    create: {
      name: 'ipd:manage',
      description: 'Manage IPD beds, admissions, transfers, and discharge',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: ipdManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: ipdManagePermission.id,
    },
  });

  const clinicalReadPermission = await prisma.permission.upsert({
    where: { name: 'clinical:read' },
    update: { description: 'View clinical encounters and records' },
    create: {
      name: 'clinical:read',
      description: 'View clinical encounters and records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: clinicalReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: clinicalReadPermission.id,
    },
  });

  const clinicalManagePermission = await prisma.permission.upsert({
    where: { name: 'clinical:manage' },
    update: { description: 'Create and manage clinical encounters and records' },
    create: {
      name: 'clinical:manage',
      description: 'Create and manage clinical encounters and records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: clinicalManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: clinicalManagePermission.id,
    },
  });

  const clinicalSafetyOverridePermission = await prisma.permission.upsert({
    where: { name: 'clinical:safety_override' },
    update: {
      description: 'Override blocking prescription safety findings with documented reason',
    },
    create: {
      name: 'clinical:safety_override',
      description: 'Override blocking prescription safety findings with documented reason',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: clinicalSafetyOverridePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: clinicalSafetyOverridePermission.id,
    },
  });

  const diagnosticsReadPermission = await prisma.permission.upsert({
    where: { name: 'diagnostics:read' },
    update: { description: 'View diagnostic orders and results' },
    create: {
      name: 'diagnostics:read',
      description: 'View diagnostic orders and results',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: diagnosticsReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: diagnosticsReadPermission.id,
    },
  });

  const diagnosticsManagePermission = await prisma.permission.upsert({
    where: { name: 'diagnostics:manage' },
    update: { description: 'Create and manage diagnostic orders and results' },
    create: {
      name: 'diagnostics:manage',
      description: 'Create and manage diagnostic orders and results',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: diagnosticsManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: diagnosticsManagePermission.id,
    },
  });

  const emergencyReadPermission = await prisma.permission.upsert({
    where: { name: 'emergency:read' },
    update: { description: 'View emergency visits and triage records' },
    create: {
      name: 'emergency:read',
      description: 'View emergency visits and triage records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: emergencyReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: emergencyReadPermission.id,
    },
  });

  const emergencyManagePermission = await prisma.permission.upsert({
    where: { name: 'emergency:manage' },
    update: { description: 'Create and manage emergency visits and triage' },
    create: {
      name: 'emergency:manage',
      description: 'Create and manage emergency visits and triage',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: emergencyManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: emergencyManagePermission.id,
    },
  });

  const pharmacyReadPermission = await prisma.permission.upsert({
    where: { name: 'pharmacy:read' },
    update: { description: 'View pharmacy products, stock, and dispensings' },
    create: {
      name: 'pharmacy:read',
      description: 'View pharmacy products, stock, and dispensings',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: pharmacyReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: pharmacyReadPermission.id,
    },
  });

  const pharmacyManagePermission = await prisma.permission.upsert({
    where: { name: 'pharmacy:manage' },
    update: { description: 'Manage pharmacy products, stock, and dispensing' },
    create: {
      name: 'pharmacy:manage',
      description: 'Manage pharmacy products, stock, and dispensing',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: pharmacyManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: pharmacyManagePermission.id,
    },
  });

  const insuranceReadPermission = await prisma.permission.upsert({
    where: { name: 'insurance:read' },
    update: { description: 'View insurance providers, policies, and claims' },
    create: {
      name: 'insurance:read',
      description: 'View insurance providers, policies, and claims',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: insuranceReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: insuranceReadPermission.id,
    },
  });

  const insuranceManagePermission = await prisma.permission.upsert({
    where: { name: 'insurance:manage' },
    update: { description: 'Manage insurance providers, policies, pre-auth, and claims' },
    create: {
      name: 'insurance:manage',
      description: 'Manage insurance providers, policies, pre-auth, and claims',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: insuranceManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: insuranceManagePermission.id,
    },
  });

  const insurancePreauthManagePermission = await prisma.permission.upsert({
    where: { name: 'insurance:preauth:manage' },
    update: { description: 'Manage insurance pre-authorizations' },
    create: {
      name: 'insurance:preauth:manage',
      description: 'Manage insurance pre-authorizations',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: insurancePreauthManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: insurancePreauthManagePermission.id,
    },
  });

  const insuranceClaimsManagePermission = await prisma.permission.upsert({
    where: { name: 'insurance:claims:manage' },
    update: { description: 'Manage insurance claims lifecycle' },
    create: {
      name: 'insurance:claims:manage',
      description: 'Manage insurance claims lifecycle',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: insuranceClaimsManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: insuranceClaimsManagePermission.id,
    },
  });

  const insuranceReportsReadPermission = await prisma.permission.upsert({
    where: { name: 'insurance:reports:read' },
    update: { description: 'View insurance reports' },
    create: {
      name: 'insurance:reports:read',
      description: 'View insurance reports',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: insuranceReportsReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: insuranceReportsReadPermission.id,
    },
  });

  const insuranceReportsExportPermission = await prisma.permission.upsert({
    where: { name: 'insurance:reports:export' },
    update: { description: 'Export insurance reports' },
    create: {
      name: 'insurance:reports:export',
      description: 'Export insurance reports',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: insuranceReportsExportPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: insuranceReportsExportPermission.id,
    },
  });

  const surgeryReadPermission = await prisma.permission.upsert({
    where: { name: 'surgery:read' },
    update: { description: 'View surgery requests, schedules, and records' },
    create: {
      name: 'surgery:read',
      description: 'View surgery requests, schedules, and records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: surgeryReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: surgeryReadPermission.id,
    },
  });

  const surgeryManagePermission = await prisma.permission.upsert({
    where: { name: 'surgery:manage' },
    update: { description: 'Manage surgery requests, scheduling, and records' },
    create: {
      name: 'surgery:manage',
      description: 'Manage surgery requests, scheduling, and records',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: surgeryManagePermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: surgeryManagePermission.id,
    },
  });

  const phase1Permissions: Array<{ name: string; description: string }> = [
    { name: 'billing:read', description: 'View invoices and billing records' },
    { name: 'billing:manage', description: 'Create and update invoices' },
    { name: 'payments:read', description: 'View payment records' },
    { name: 'payments:manage', description: 'Initiate and manage payments' },
    { name: 'refunds:read', description: 'View refund records' },
    { name: 'refunds:manage', description: 'Initiate and manage refunds' },
    {
      name: 'refunds:approve',
      description: 'Approve or reject refund requests',
    },
    {
      name: 'scheduling:read',
      description: 'View scheduling resources and appointments',
    },
    {
      name: 'scheduling:manage',
      description: 'Manage scheduling resources and appointments',
    },
    { name: 'attendance:read', description: 'View attendance records' },
    { name: 'attendance:manage', description: 'Manage attendance clock events' },
    {
      name: 'attendance:export',
      description: 'Export payroll-ready attendance summaries',
    },
    { name: 'roster:read', description: 'View roster entries' },
    { name: 'roster:manage', description: 'Manage roster entries' },
    { name: 'work-schedules:read', description: 'View work schedules' },
    { name: 'work-schedules:manage', description: 'Manage work schedules' },
    { name: 'booking-rules:read', description: 'View booking rules' },
    { name: 'booking-rules:manage', description: 'Manage booking rules' },
    { name: 'leave:read', description: 'View provider leave' },
    { name: 'leave:manage', description: 'Manage provider leave' },
    { name: 'audit:read', description: 'View hospital audit logs' },
    { name: 'audit:export', description: 'Export hospital audit logs' },
    { name: 'reports:read', description: 'View financial and GST reports' },
    { name: 'reports:export', description: 'Export financial and GST reports' },
    {
      name: 'staff-notifications:read',
      description: 'View in-app staff notifications',
    },
    {
      name: 'staff-notifications:manage',
      description: 'Mark staff notifications read',
    },
    {
      name: 'notifications:delivery:read',
      description: 'View internal notification delivery statistics',
    },
    { name: 'hospitals:read', description: 'View hospital profile' },
    { name: 'hospitals:manage', description: 'Update hospital profile' },
    { name: 'branches:read', description: 'View branches' },
    { name: 'branches:manage', description: 'Create and manage branches' },
  ];

  for (const entry of phase1Permissions) {
    const permission = await upsertPermission(entry.name, entry.description);
    await grantPermission(role.id, permission.id);
  }

  const rbacPermissions = [
    { name: 'roles:read', description: 'View roles and permission catalogue' },
    { name: 'roles:manage', description: 'Create and manage roles and permissions' },
    { name: 'users:read', description: 'View users for role assignment' },
    { name: 'users:manage', description: 'Assign roles to users' },
    { name: 'plans:read', description: 'View subscription plans and hospital plan assignment' },
    { name: 'plans:manage', description: 'Manage plans and hospital plan assignment' },
  ];

  for (const entry of rbacPermissions) {
    const permission = await upsertPermission(entry.name, entry.description);
    await grantPermission(role.id, permission.id);
  }

  const patientPrivacyPermission = await upsertPermission(
    'patients:privacy:manage',
    'Approve and execute patient privacy erasure',
  );
  await grantPermission(role.id, patientPrivacyPermission.id);

  const receptionistPermissionNames = [
    'patients:read',
    'patients:create',
    'patients:update',
    'opd:read',
    'opd:manage',
    'scheduling:read',
    'billing:read',
    'payments:read',
  ];

  for (const permissionName of receptionistPermissionNames) {
    const permission = await prisma.permission.findUnique({
      where: { name: permissionName },
    });
    if (permission) {
      await grantPermission(receptionistRole.id, permission.id);
    }
  }

  const demoPassword =
    process.env.SEED_ADMIN_PASSWORD?.trim() || 'MediOS@12345';
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  await prisma.user.upsert({
    where: {
      hospitalId_email: {
        hospitalId: hospital.id,
        email: 'admin@test.com',
      },
    },
    update: {
      roleId: role.id,
      name: 'Demo Admin',
      passwordHash,
      status: 'ACTIVE',
    },
    create: {
      hospitalId: hospital.id,
      roleId: role.id,
      email: 'admin@test.com',
      name: 'Demo Admin',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const bootstrapResult = await bootstrapHospitalRoleCatalogue(prisma, hospital.id);

  await bootstrapPlanCatalogue(prisma);
  await bootstrapHospitalEnterprisePlan(prisma, hospital.id);

  // DEVELOPMENT FIXTURE ONLY — not a complete WHO ICD-10 catalogue.
  await upsertDevelopmentIcd10Fixture(prisma);

  console.log('Development seed complete');
  console.log({
    hospitalId: hospital.id,
    hospitalCode: hospital.code,
    adminRoleId: role.id,
    receptionistRoleId: receptionistRole.id,
    demoAdminEmail: 'admin@test.com',
    bootstrapCreatedRoles: bootstrapResult.createdRoleNames,
    bootstrapSkippedRoles: bootstrapResult.skippedExistingRoleNames,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
