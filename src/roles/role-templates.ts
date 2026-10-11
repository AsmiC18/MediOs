export type RoleTemplateDefinition = {
  name: string;
  description: string;
  permissions: string[];
};

/** Default hospital role catalogue (Role.name = code). ADMIN permissions applied via all catalogue entries at bootstrap create-time. */
export const DEFAULT_ROLE_TEMPLATES: RoleTemplateDefinition[] = [
  {
    name: 'ADMIN',
    description: 'Hospital administrator with full operational access',
    permissions: [],
  },
  {
    name: 'RECEPTIONIST',
    description: 'Front desk and patient intake',
    permissions: [
      'patients:read',
      'patients:create',
      'patients:update',
      'patients:engagement:read',
      'patients:engagement:manage',
      'opd:read',
      'opd:manage',
      'scheduling:read',
      'billing:read',
      'payments:read',
    ],
  },
  {
    name: 'DOCTOR',
    description: 'Consulting physician',
    permissions: [
      'clinical:read',
      'clinical:manage',
      'patients:read',
      'scheduling:read',
      'opd:read',
      'diagnostics:read',
    ],
  },
  {
    name: 'NURSE',
    description: 'Clinical nursing support',
    permissions: ['clinical:read', 'ipd:read', 'emergency:read', 'patients:read'],
  },
  {
    name: 'CLINICAL_LEAD',
    description: 'Senior clinical oversight',
    permissions: [
      'clinical:read',
      'clinical:manage',
      'clinical:safety_override',
      'diagnostics:read',
      'diagnostics:manage',
    ],
  },
  {
    name: 'OPD_COORDINATOR',
    description: 'OPD queue and patient flow',
    permissions: ['opd:manage', 'scheduling:read', 'scheduling:manage', 'patients:read'],
  },
  {
    name: 'IPD_WARD_STAFF',
    description: 'Inpatient ward operations',
    permissions: ['ipd:read', 'ipd:manage', 'clinical:read', 'patients:read'],
  },
  {
    name: 'EMERGENCY_STAFF',
    description: 'Emergency department staff',
    permissions: [
      'emergency:read',
      'emergency:manage',
      'clinical:read',
      'clinical:manage',
      'patients:read',
      'patients:create',
    ],
  },
  {
    name: 'PHARMACIST',
    description: 'Pharmacy dispensing',
    permissions: ['pharmacy:read', 'pharmacy:manage', 'clinical:read'],
  },
  {
    name: 'PHARMACY_INVENTORY',
    description: 'Pharmacy inventory and purchasing',
    permissions: ['pharmacy:read', 'pharmacy:manage'],
  },
  {
    name: 'LAB_TECH',
    description: 'Diagnostic laboratory technician',
    permissions: ['diagnostics:read', 'diagnostics:manage', 'patients:read'],
  },
  {
    name: 'DIAGNOSTICS_SUPERVISOR',
    description: 'Diagnostics department lead',
    permissions: ['diagnostics:read', 'diagnostics:manage', 'audit:read'],
  },
  {
    name: 'BILLING_EXEC',
    description: 'Billing and invoicing',
    permissions: ['billing:read', 'billing:manage', 'patients:read', 'payments:read'],
  },
  {
    name: 'CASHIER',
    description: 'Payment collection',
    permissions: ['billing:read', 'payments:manage', 'refunds:read'],
  },
  {
    name: 'FINANCE_MANAGER',
    description: 'Finance and reporting',
    permissions: [
      'billing:read',
      'payments:read',
      'refunds:read',
      'refunds:approve',
      'reports:read',
      'reports:export',
      'audit:read',
    ],
  },
  {
    name: 'INSURANCE_DESK',
    description: 'Insurance desk and claims',
    permissions: ['insurance:read', 'insurance:manage', 'patients:read', 'billing:read'],
  },
  {
    name: 'TPA_ANALYST',
    description: 'TPA reporting and analytics',
    permissions: ['insurance:read', 'insurance:reports:read', 'insurance:reports:export'],
  },
  {
    name: 'SURGEON',
    description: 'Surgical provider',
    permissions: ['surgery:read', 'surgery:manage', 'clinical:read', 'clinical:manage'],
  },
  {
    name: 'OT_COORDINATOR',
    description: 'Operation theatre scheduling',
    permissions: ['surgery:read', 'surgery:manage', 'scheduling:read', 'scheduling:manage'],
  },
  {
    name: 'HR_ATTENDANCE',
    description: 'HR attendance and payroll inputs',
    permissions: [
      'attendance:read',
      'attendance:manage',
      'attendance:export',
      'roster:read',
      'roster:manage',
      'leave:read',
      'leave:manage',
    ],
  },
  {
    name: 'ROSTER_PLANNER',
    description: 'Staff roster planning',
    permissions: [
      'roster:read',
      'roster:manage',
      'leave:read',
      'leave:manage',
      'work-schedules:read',
      'work-schedules:manage',
    ],
  },
  {
    name: 'SCHEDULING_COORD',
    description: 'Appointment scheduling',
    permissions: ['scheduling:read', 'scheduling:manage', 'booking-rules:read', 'booking-rules:manage'],
  },
  {
    name: 'REPORTS_ANALYST',
    description: 'Operational and financial reports',
    permissions: ['reports:read', 'reports:export', 'attendance:read'],
  },
  {
    name: 'AUDIT_VIEWER',
    description: 'Audit log review',
    permissions: ['audit:read', 'audit:export'],
  },
  {
    name: 'ABDM_COORDINATOR',
    description: 'ABHA and consent coordination',
    permissions: [
      'abdm:read',
      'abdm:manage',
      'abdm:consent:read',
      'abdm:consent:manage',
      'patients:read',
    ],
  },
  {
    name: 'BRANCH_MANAGER',
    description: 'Branch operational oversight',
    permissions: [
      'patients:read',
      'opd:read',
      'ipd:read',
      'scheduling:read',
      'billing:read',
      'reports:read',
      'attendance:read',
      'branches:read',
    ],
  },
  {
    name: 'HOSPITAL_CONFIG',
    description: 'Hospital configuration and rules',
    permissions: [
      'work-schedules:read',
      'work-schedules:manage',
      'booking-rules:read',
      'booking-rules:manage',
      'billing:read',
      'billing:manage',
      'hospitals:read',
      'hospitals:manage',
      'branches:read',
      'branches:manage',
    ],
  },
];
