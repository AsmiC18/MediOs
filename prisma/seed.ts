import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  const whatsappSendPermission = await prisma.permission.upsert({
    where: {
      name: 'whatsapp:send',
    },
    update: {
      description: 'Send WhatsApp messages',
    },
    create: {
      name: 'whatsapp:send',
      description: 'Send WhatsApp messages',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: whatsappSendPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: whatsappSendPermission.id,
    },
  });

  const whatsappReadPermission = await prisma.permission.upsert({
    where: {
      name: 'whatsapp:read',
    },
    update: {
      description: 'Read WhatsApp messages and conversations',
    },
    create: {
      name: 'whatsapp:read',
      description: 'Read WhatsApp messages and conversations',
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: whatsappReadPermission.id,
      },
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: whatsappReadPermission.id,
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

  console.log('Development seed complete');
  console.log({
    hospitalId: hospital.id,
    adminRoleId: role.id,
    receptionistRoleId: receptionistRole.id,
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
