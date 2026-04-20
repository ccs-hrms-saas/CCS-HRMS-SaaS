/**
 * audit.ts — Client-side audit log utility
 *
 * Call logAudit() from any React component or client-side action to record
 * an event in platform_audit_log. Uses the anon Supabase client; the table's
 * RLS INSERT policy (WITH CHECK true) allows all authenticated writes.
 * The display (SELECT) policy restricts reads to platform-level users only.
 *
 * For server-side API routes, use the admin client directly (see /api/tenants).
 */

import { supabase } from "@/lib/supabase";

export type AuditAction =
  // Tenant lifecycle
  | "TENANT_CREATED"
  | "TENANT_UPDATED"
  | "TENANT_SUSPENDED"
  | "TENANT_ACTIVATED"
  | "TENANT_DELETED"
  // Module system
  | "MODULE_ENABLED"
  | "MODULE_DISABLED"
  | "MODULE_PROPERTIES_UPDATED"
  // Domain management
  | "DOMAIN_REQUEST_APPROVED"
  | "DOMAIN_DNS_VERIFIED"
  | "DOMAIN_ACTIVATED"
  | "DOMAIN_REJECTED"
  // Mobile & Kiosk
  | "KIOSK_PIN_GENERATED"
  | "KIOSK_DEVICE_REVOKED"
  | "EMPLOYEE_APP_CONFIGURED"
  // Platform admins
  | "ADMIN_INVITED"
  | "ADMIN_REVOKED";

export type AuditTargetType = "company" | "module" | "domain" | "user" | "device" | "plan";

interface AuditPayload {
  action:       AuditAction;
  target_type?: AuditTargetType;
  target_id?:   string;
  old_value?:   Record<string, any>;
  new_value?:   Record<string, any>;
  actor_role?:  string;
}

export async function logAudit(payload: AuditPayload) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // unauthenticated — skip

    await supabase.from("platform_audit_log").insert({
      actor_id:    user.id,
      actor_role:  payload.actor_role ?? "platform_owner",
      action:      payload.action,
      target_type: payload.target_type,
      target_id:   payload.target_id    ? payload.target_id    : undefined,
      old_value:   payload.old_value    ? payload.old_value    : undefined,
      new_value:   payload.new_value    ? payload.new_value    : undefined,
    });
  } catch {
    // Audit logging is non-blocking — never crash the UI for a log failure
  }
}
