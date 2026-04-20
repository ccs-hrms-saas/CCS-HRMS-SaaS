/**
 * tier-definitions.ts
 *
 * Canonical "pure tier" boolean feature map for every tiered module.
 * These are the SOURCE OF TRUTH for what Basic / Standard / Advanced means.
 *
 * The TierStatusBadge component diffs a tenant's actual properties
 * against these to identify Pure / Modified / Override states.
 *
 * Rules:
 *  - false = this feature is OFF at this tier (locked)
 *  - true  = this feature is ON at this tier (included)
 *  - null  = numeric/string field, not compared as a boolean gate
 */

export type TierKey = 'basic' | 'standard' | 'advanced';

export interface TierFeatureMap {
  [feature: string]: boolean | null; // null = numeric, skip from boolean diff
}

// ── Payroll ──────────────────────────────────────────────────────────────────
export const PAYROLL_TIER_DEFAULTS: Record<TierKey, TierFeatureMap> = {
  basic: {
    lwp_auto_compute:             false,
    payroll_lock_enabled:         false,
    deficit_tracking:             false,
    shift_based_calc:             false,
    differential_rules_enabled:   false,
    ml_lapse_tracking:            false,
    // numeric fields — values compared separately, not as boolean gates
    salary_denominator:   null,
    daily_working_hours:  null,
    pay_day:              null,
  },
  standard: {
    lwp_auto_compute:             true,
    payroll_lock_enabled:         true,
    deficit_tracking:             true,
    shift_based_calc:             false,
    differential_rules_enabled:   false,
    ml_lapse_tracking:            false,
    salary_denominator:   null,
    daily_working_hours:  null,
    pay_day:              null,
  },
  advanced: {
    lwp_auto_compute:             true,
    payroll_lock_enabled:         true,
    deficit_tracking:             true,
    shift_based_calc:             true,
    differential_rules_enabled:   true,
    ml_lapse_tracking:            true,
    salary_denominator:   null,
    daily_working_hours:  null,
    pay_day:              null,
  },
};

// ── Leave Settings ────────────────────────────────────────────────────────────
export const LEAVE_TIER_DEFAULTS: Record<TierKey, TierFeatureMap> = {
  basic: {
    allow_carryforward:            false,
    partial_day_support:           false,
    cl_consecutive_limit_enabled:  false,
    ml_leave_enabled:              false,
    short_leave_enabled:           false,
    compoff_enabled:               false,
    week_off_customization:        false,
    lwp_payroll_link:              false,
    deficit_adjustment_enabled:    false,
    approval_chain_depth: null,
  },
  standard: {
    allow_carryforward:            true,
    partial_day_support:           true,
    cl_consecutive_limit_enabled:  true,
    ml_leave_enabled:              false,
    short_leave_enabled:           false,
    compoff_enabled:               false,
    week_off_customization:        false,
    lwp_payroll_link:              false,
    deficit_adjustment_enabled:    false,
    approval_chain_depth: null,
  },
  advanced: {
    allow_carryforward:            true,
    partial_day_support:           true,
    cl_consecutive_limit_enabled:  true,
    ml_leave_enabled:              true,
    short_leave_enabled:           true,
    compoff_enabled:               true,
    week_off_customization:        true,
    lwp_payroll_link:              true,
    deficit_adjustment_enabled:    true,
    approval_chain_depth: null,
  },
};

// ── Reimbursements ────────────────────────────────────────────────────────────
export const REIMB_TIER_DEFAULTS: Record<TierKey, TierFeatureMap> = {
  basic: {
    admin_can_approve:             false,
    allow_optional_receipt:        false,
    partial_approval_enabled:      false,
    bulk_submission_enabled:       false,
    show_in_payslip:               false,
    job_role_approver_enabled:     false,
    department_approver_enabled:   false,
    person_approver_enabled:       false,
    max_categories:       null,
    max_claims_per_month: null,
    receipt_retention_days: null,
  },
  standard: {
    admin_can_approve:             true,
    allow_optional_receipt:        false,
    partial_approval_enabled:      false,
    bulk_submission_enabled:       false,
    show_in_payslip:               false,
    job_role_approver_enabled:     false,
    department_approver_enabled:   false,
    person_approver_enabled:       false,
    max_categories:       null,
    max_claims_per_month: null,
    receipt_retention_days: null,
  },
  advanced: {
    admin_can_approve:             true,
    allow_optional_receipt:        true,
    partial_approval_enabled:      true,
    bulk_submission_enabled:       true,
    show_in_payslip:               true,
    job_role_approver_enabled:     true,
    department_approver_enabled:   true,
    person_approver_enabled:       true,
    max_categories:       null,
    max_claims_per_month: null,
    receipt_retention_days: null,
  },
};

// ── Profiles ──────────────────────────────────────────────────────────────────
export const PROFILES_TIER_DEFAULTS: Record<TierKey, TierFeatureMap> = {
  basic: {
    manager_can_view_team:              true,
    manager_can_edit_team:              false,
    admin_can_create:                   false,
    admin_can_edit:                     false,
    salary_change_requires_approval:    false,
    custom_job_roles_enabled:           false,
    designation_change_approval:        false,
    granular_field_permissions:         false,
    team_scoped_manager_edit:           false,
  },
  standard: {
    manager_can_view_team:              true,
    manager_can_edit_team:              false,
    admin_can_create:                   true,
    admin_can_edit:                     true,
    salary_change_requires_approval:    true,
    custom_job_roles_enabled:           false,
    designation_change_approval:        false,
    granular_field_permissions:         false,
    team_scoped_manager_edit:           false,
  },
  advanced: {
    manager_can_view_team:              true,
    manager_can_edit_team:              true,
    admin_can_create:                   true,
    admin_can_edit:                     true,
    salary_change_requires_approval:    true,
    custom_job_roles_enabled:           true,
    designation_change_approval:        true,
    granular_field_permissions:         true,
    team_scoped_manager_edit:           true,
  },
};

// ── Module map ────────────────────────────────────────────────────────────────
export const MODULE_TIER_DEFAULTS: Record<string, Record<TierKey, TierFeatureMap>> = {
  payroll:        PAYROLL_TIER_DEFAULTS,
  leave_settings: LEAVE_TIER_DEFAULTS,
  reimbursements: REIMB_TIER_DEFAULTS,
  profiles:       PROFILES_TIER_DEFAULTS,
};

// ── Human readable feature labels ─────────────────────────────────────────────
export const FEATURE_LABELS: Record<string, string> = {
  // Payroll
  lwp_auto_compute:           'LWP Auto-Compute from Hours',
  payroll_lock_enabled:       'Payroll Record Lock',
  deficit_tracking:           'Hour Deficit Tracking',
  shift_based_calc:           'Shift-Based Calculation',
  differential_rules_enabled: 'Differential Rules Per Employee',
  ml_lapse_tracking:          'ML Lapse Reward Engine',
  // Leave
  allow_carryforward:               'Carry-Forward',
  partial_day_support:              'Half-Day Leave',
  cl_consecutive_limit_enabled:     'CL Consecutive Limit',
  ml_leave_enabled:                 'Menstruation Leave (ML)',
  short_leave_enabled:              'Short Leave (N-Hour)',
  compoff_enabled:                  'Comp-Off (CO)',
  week_off_customization:           'Week-Off Customisation',
  lwp_payroll_link:                 'LWP → Payroll Linkage',
  deficit_adjustment_enabled:       'Deficit Adjustment Pool',
  // Reimbursements
  admin_can_approve:           'Admin Can Approve',
  allow_optional_receipt:      'Optional Receipt per Category',
  partial_approval_enabled:    'Partial Approval',
  bulk_submission_enabled:     'Bulk Submission',
  show_in_payslip:             'Show in Payslip',
  job_role_approver_enabled:   'Job-Role Based Approver',
  department_approver_enabled: 'Department-Based Approver',
  person_approver_enabled:     'Specific Person Approver',
  // Profiles
  manager_can_view_team:            'Manager View Team',
  manager_can_edit_team:            'Manager Edit Team',
  admin_can_create:                 'Admin Can Create Profiles',
  admin_can_edit:                   'Admin Can Edit Profiles',
  salary_change_requires_approval:  'Salary Change Approval',
  custom_job_roles_enabled:         'Custom Job Roles',
  designation_change_approval:      'Designation Change Approval',
  granular_field_permissions:       'Granular Field Permissions',
  team_scoped_manager_edit:         'Team-Scoped Manager Edit',
};

// ── Diff engine ───────────────────────────────────────────────────────────────
export type DeviationType = 'modified' | 'override';

export interface Deviation {
  feature:    string;       // property key
  label:      string;       // human-readable
  type:       DeviationType;
  actual:     boolean;
  canonical:  boolean;
}

export interface TierStatus {
  tier:       TierKey;
  isPure:     boolean;
  deviations: Deviation[];
  // Summary counts
  modified:   number;  // tier feature turned OFF (within-tier restriction)
  overrides:  number;  // below-tier feature turned ON (cross-tier grant)
}

export function computeTierStatus(
  moduleKey: string,
  properties: Record<string, any>,
): TierStatus | null {
  const tierDefaults = MODULE_TIER_DEFAULTS[moduleKey];
  if (!tierDefaults) return null;

  const tier = (properties.tier ?? 'basic') as TierKey;
  const canonical = tierDefaults[tier];
  if (!canonical) return null;

  const deviations: Deviation[] = [];

  for (const [feature, canonicalVal] of Object.entries(canonical)) {
    if (canonicalVal === null) continue; // skip numeric fields
    const actualVal = properties[feature];
    if (typeof actualVal !== 'boolean') continue;
    if (actualVal === canonicalVal) continue; // matches canonical — pure

    // Determine deviation type:
    // "modified" = canonical is true (tier includes it) but actual is false (developer turned it off)
    // "override" = canonical is false (tier excludes it) but actual is true (developer cross-tier granted)
    const type: DeviationType = canonicalVal === true ? 'modified' : 'override';

    deviations.push({
      feature,
      label: FEATURE_LABELS[feature] ?? feature.replace(/_/g, ' '),
      type,
      actual: actualVal,
      canonical: canonicalVal,
    });
  }

  const modified  = deviations.filter(d => d.type === 'modified').length;
  const overrides = deviations.filter(d => d.type === 'override').length;

  return { tier, isPure: deviations.length === 0, deviations, modified, overrides };
}
