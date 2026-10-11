const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');

const mappings = [
  ['reports/reports.controller.ts', 'REPORTING', 'JwtAuthGuard'],
  ['attendance/attendance.controller.ts', 'ATTENDANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['billing/billing.controller.ts', 'BILLING', 'JwtAuthGuard, PermissionsGuard'],
  ['billing/payments.controller.ts', 'BILLING', 'JwtAuthGuard, PermissionsGuard'],
  ['billing/refunds.controller.ts', 'BILLING', 'JwtAuthGuard, PermissionsGuard'],
  ['billing/billing-config.controller.ts', 'BILLING', 'JwtAuthGuard, PermissionsGuard'],
  ['scheduling/appointments/appointments.controller.ts', 'SCHEDULING', 'JwtAuthGuard, PermissionsGuard'],
  ['scheduling/resources/resources.controller.ts', 'SCHEDULING', 'JwtAuthGuard, PermissionsGuard'],
  ['booking-rules/booking-rules.controller.ts', 'SCHEDULING', 'JwtAuthGuard, PermissionsGuard'],
  ['work-schedules/work-schedules.controller.ts', 'SCHEDULING', 'JwtAuthGuard, PermissionsGuard'],
  ['roster/roster.controller.ts', 'SCHEDULING', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-product.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-batch.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-stock.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-dispensing.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-supplier.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-purchase-order.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['pharmacy/pharmacy-prescription-work-item.controller.ts', 'PHARMACY', 'JwtAuthGuard, PermissionsGuard'],
  ['diagnostics/diagnostic-order.controller.ts', 'DIAGNOSTICS', 'JwtAuthGuard, PermissionsGuard'],
  ['diagnostics/diagnostic-order-item.controller.ts', 'DIAGNOSTICS', 'JwtAuthGuard, PermissionsGuard'],
  ['diagnostics/patient-diagnostics.controller.ts', 'DIAGNOSTICS', 'JwtAuthGuard, PermissionsGuard'],
  ['insurance/insurance-claim.controller.ts', 'INSURANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['insurance/insurance-package.controller.ts', 'INSURANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['insurance/insurance-preauth.controller.ts', 'INSURANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['insurance/insurance-policy.controller.ts', 'INSURANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['insurance/insurance-empanelment.controller.ts', 'INSURANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['insurance/insurance-provider.controller.ts', 'INSURANCE', 'JwtAuthGuard, PermissionsGuard'],
  ['abdm/abdm.controller.ts', 'ABDM', 'JwtAuthGuard, PermissionsGuard'],
  ['abdm/abdm-consent.controller.ts', 'ABDM', 'JwtAuthGuard, PermissionsGuard'],
  ['abdm/patient-abha.controller.ts', 'ABDM', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/clinical-encounter.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/clinical-prescription.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/clinical-diagnosis.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/patient-clinical.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/drugs/clinical-drug.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/attachments/clinical-attachment.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['clinical/attachments/clinical-encounter-attachment.controller.ts', 'CLINICAL', 'JwtAuthGuard, PermissionsGuard'],
  ['ipd/ipd-admission.controller.ts', 'IPD', 'JwtAuthGuard, PermissionsGuard'],
  ['ipd/ipd-bed.controller.ts', 'IPD', 'JwtAuthGuard, PermissionsGuard'],
  ['emergency/emergency-visit.controller.ts', 'EMERGENCY', 'JwtAuthGuard, PermissionsGuard'],
  ['surgery/surgery-request.controller.ts', 'SURGERY', 'JwtAuthGuard, PermissionsGuard'],
  ['surgery/surgery-schedule.controller.ts', 'SURGERY', 'JwtAuthGuard, PermissionsGuard'],
  ['opd/opd-queue.controller.ts', 'OPD', 'JwtAuthGuard, PermissionsGuard'],
  ['portal/portal-patients/portal-patients.controller.ts', 'PATIENT_PORTAL', 'PortalJwtAuthGuard, PortalPrincipalGuard'],
  ['portal/portal-appointments/portal-appointments.controller.ts', 'PATIENT_PORTAL', 'PortalJwtAuthGuard, PortalPrincipalGuard'],
  ['portal/portal-records/portal-patient-records.controller.ts', 'PATIENT_PORTAL', 'PortalJwtAuthGuard, PortalPrincipalGuard'],
  ['portal/portal-billing/portal-billing.controller.ts', 'PATIENT_PORTAL', 'PortalJwtAuthGuard, PortalPrincipalGuard'],
  ['portal/portal-privacy/portal-privacy.controller.ts', 'PATIENT_PORTAL', 'PortalJwtAuthGuard, PortalPrincipalGuard'],
];

const importBlock = (depth) => {
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  return [
    `import { FeatureGuard } from '${prefix}plans/feature.guard';`,
    `import { RequireFeature } from '${prefix}plans/require-feature.decorator';`,
    `import { FeatureKey } from '${prefix}plans/feature-keys';`,
  ];
};

function depthFor(file) {
  return file.split('/').length - 1;
}

for (const [rel, feature, guards] of mappings) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    console.warn('skip missing', rel);
    continue;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('RequireFeature')) {
    continue;
  }

  const depth = depthFor(rel);
  const planPrefix = depth === 0 ? './plans/' : '../'.repeat(depth) + 'plans/';
  const imports = [
    `import { FeatureGuard } from '${planPrefix}feature.guard';`,
    `import { RequireFeature } from '${planPrefix}require-feature.decorator';`,
    `import { FeatureKey } from '${planPrefix}feature-keys';`,
  ].join('\n');

  const importBlock = content.match(/^(?:import[\s\S]*?;\r?\n)+/);
  if (!importBlock) {
    console.warn('no import block', rel);
    continue;
  }
  const insertAt = importBlock[0].length;
  content = content.slice(0, insertAt) + imports + '\n' + content.slice(insertAt);

  const guardPattern = `@UseGuards(${guards})`;
  const replacement = `@UseGuards(${guards}, FeatureGuard)\n@RequireFeature(FeatureKey.${feature})`;
  if (!content.includes(guardPattern)) {
    const jwtOnly = '@UseGuards(JwtAuthGuard)';
    if (guards.includes('PermissionsGuard') && content.includes(jwtOnly)) {
      content = content.replace(
        jwtOnly,
        `@UseGuards(JwtAuthGuard, FeatureGuard)\n@RequireFeature(FeatureKey.${feature})`,
      );
    } else {
      console.warn('guard pattern not found', rel);
      continue;
    }
  } else {
    content = content.replace(guardPattern, replacement);
  }

  fs.writeFileSync(filePath, content);
  console.log('patched', rel);
}
