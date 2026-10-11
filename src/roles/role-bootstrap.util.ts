import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_TEMPLATES, RoleTemplateDefinition } from './role-templates';
import { SYSTEM_ADMIN_ROLE_NAME } from './role.constants';

export type RoleBootstrapResult = {
  createdRoleNames: string[];
  skippedExistingRoleNames: string[];
};

async function grantPermissionsToRole(
  prisma: PrismaClient,
  roleId: string,
  permissionNames: string[],
): Promise<void> {
  for (const name of permissionNames) {
    const permission = await prisma.permission.findUnique({ where: { name } });
    if (!permission) {
      continue;
    }
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId: permission.id },
      },
      update: {},
      create: { roleId, permissionId: permission.id },
    });
  }
}

async function resolveTemplatePermissions(
  prisma: PrismaClient,
  template: RoleTemplateDefinition,
): Promise<string[]> {
  if (template.name === SYSTEM_ADMIN_ROLE_NAME) {
    const all = await prisma.permission.findMany({ select: { name: true } });
    return all.map((p) => p.name).sort();
  }
  return [...template.permissions];
}

/**
 * Creates missing default roles for a hospital and assigns template permissions
 * only when the role is newly created. Existing roles are never modified.
 */
export async function bootstrapHospitalRoleCatalogue(
  prisma: PrismaClient,
  hospitalId: string,
): Promise<RoleBootstrapResult> {
  const createdRoleNames: string[] = [];
  const skippedExistingRoleNames: string[] = [];

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const existing = await prisma.role.findUnique({
      where: {
        hospitalId_name: {
          hospitalId,
          name: template.name,
        },
      },
    });

    if (existing) {
      skippedExistingRoleNames.push(template.name);
      continue;
    }

    const role = await prisma.role.create({
      data: {
        hospitalId,
        name: template.name,
        description: template.description,
      },
    });

    const permissionNames = await resolveTemplatePermissions(prisma, template);
    await grantPermissionsToRole(prisma, role.id, permissionNames);
    createdRoleNames.push(template.name);
  }

  return { createdRoleNames, skippedExistingRoleNames };
}
