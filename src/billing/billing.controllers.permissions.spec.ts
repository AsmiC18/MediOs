import { readFileSync } from 'fs';
import { join } from 'path';

describe('Billing controller permission metadata', () => {
  const billingControllerPath = join(__dirname, 'billing.controller.ts');
  const billingConfigControllerPath = join(
    __dirname,
    'billing-config.controller.ts',
  );
  const razorpayWebhookPath = join(__dirname, 'razorpay-webhook.controller.ts');
  const portalBillingPath = join(
    __dirname,
    '..',
    'portal',
    'portal-billing',
    'portal-billing.controller.ts',
  );
  const paymentsControllerPath = join(__dirname, 'payments.controller.ts');

  it('wires invoice RBAC on BillingController', () => {
    const source = readFileSync(billingControllerPath, 'utf8');

    expect(source).toContain('@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)');
    expect(source).toContain("RequirePermissions('billing:read')");
    expect(source).toContain("RequirePermissions('billing:manage')");
    expect(source).toContain("RequirePermissions('payments:read')");
    expect(source).toContain("RequirePermissions('payments:manage')");
    expect(source).toContain('FeatureKey.BILLING');

    expect(source).toMatch(/@Get\(\)[\s\S]*@RequirePermissions\('billing:read'\)/);
    expect(source).toMatch(
      /@Post\(\)[\s\S]*@RequirePermissions\('billing:manage'\)/,
    );
    expect(source).toMatch(
      /@Patch\(':id'\)[\s\S]*@RequirePermissions\('billing:manage'\)/,
    );
    expect(source).toMatch(
      /@Patch\(':id\/status'\)[\s\S]*@RequirePermissions\('billing:manage'\)/,
    );
    expect(source).toMatch(
      /@Post\(':id\/payment'\)[\s\S]*@RequirePermissions\('payments:manage'\)/,
    );
  });

  it('registers consultation fee config controller with billing permissions', () => {
    const source = readFileSync(billingConfigControllerPath, 'utf8');

    expect(source).toContain('@Controller(\'billing/config\')');
    expect(source).toContain('@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)');
    expect(source).toContain("@Get('consultation-fee')");
    expect(source).toContain("@Patch('consultation-fee')");
    expect(source).toContain("RequirePermissions('billing:read')");
    expect(source).toContain("RequirePermissions('billing:manage')");
  });

  it('does not attach staff permissions to Razorpay webhook', () => {
    const source = readFileSync(razorpayWebhookPath, 'utf8');
    expect(source).not.toContain('PermissionsGuard');
    expect(source).not.toContain('@RequirePermissions');
  });

  it('requires payments:read on standalone GET /payments/:id', () => {
    const source = readFileSync(paymentsControllerPath, 'utf8');
    expect(source).toContain(
      '@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)',
    );
    expect(source).toMatch(
      /@Get\(':id'\)[\s\S]*@RequirePermissions\('payments:read'\)[\s\S]*getPayment/,
    );
  });

  it('does not attach staff billing permissions to portal billing', () => {
    const source = readFileSync(portalBillingPath, 'utf8');
    expect(source).not.toContain('PermissionsGuard');
    expect(source).not.toContain('@RequirePermissions');
    expect(source).toContain('PortalJwtAuthGuard');
    expect(source).toContain('FeatureKey.PATIENT_PORTAL');
  });
});

describe('BillingModule controller wiring', () => {
  it('includes BillingConfigController', () => {
    const source = readFileSync(join(__dirname, 'billing.module.ts'), 'utf8');
    expect(source).toContain('BillingConfigController');
    expect(source).toContain('BillingController');
  });
});
