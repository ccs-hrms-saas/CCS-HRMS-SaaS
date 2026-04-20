# CCS HRMS SaaS — Tenant Login & Credentials — Complete Process

## How it all works (Model A — You manage everything manually)

---

## 1. You Create the Tenant

**Developer Panel → Overview → "Deploy Tenant"**

You fill in:
- Company Name: `Acme Corp`
- Subdomain: `acme`
- Admin Email: `hr@acmecorp.com`  ← **this is the tenant's username forever**
- Admin Password: `Welcome@123`   ← **you set this initial password**

After clicking Deploy → a **Credentials Card** appears with:
- Login URL
- Email
- Password (shown plaintext so you can copy it)
- A "Copy Full Message" button for WhatsApp/email

---

## 2. You Send Credentials to the Client

Copy the ready-to-send message. Send via WhatsApp / email:

```
Your CCS HRMS workspace is ready! 🎉

Login URL: https://ccs-hrms-saas.vercel.app/login
Email: hr@acmecorp.com
Password: Welcome@123

Please change your password after first login.
```

> **Note:** ALL tenants use the SAME login URL. The system identifies which
> company they belong to by their email address (linked to their Supabase
> account → profile → company_id). There is NO separate URL per tenant
> at this stage (custom domains come later).

---

## 3. Tenant Logs In for the First Time

1. Client opens: `https://ccs-hrms-saas.vercel.app/login`
2. Enters: `hr@acmecorp.com` + `Welcome@123`
3. System logs them in → checks their profile role → routes to `/dashboard`
4. Since `setup_completed = false` (new tenant) → **automatically redirected to `/setup`**
5. They complete the 4-step setup wizard (work schedule, departments, leave types)
6. Redirected to their company dashboard — fully isolated to their company's data

---

## 4. Finding Credentials for an Existing Tenant

**If you forgot what credentials you set:**

Developer Panel → Tenants → [Any Tenant] → **Overview tab → "🔑 Superadmin Credentials"**

This section shows:
| Field | Value |
|---|---|
| Admin Email | The email address you used (always visible) |
| Login URL | The platform login URL (copy button) |

---

## 5. If the Tenant Forgets Their Password

**Two ways to handle this:**

### Option A — You reset it (Developer resets)
Developer Panel → Tenants → [Tenant] → Overview → **"🔑 Reset Admin Password"**

Clicking this:
1. Generates a new memorable password (e.g. `BrightFalcon421!`)
2. Updates it instantly in Supabase — old password stops working immediately
3. Shows the new email + password in a result card
4. "📋 Copy Full Message" → you paste it on WhatsApp to the client

Client uses the new password. They should change it after login.

### Option B — Tenant resets themselves (Self-service)
On the login page → **"Forgot Password?"** link

1. Client enters their email `hr@acmecorp.com`
2. System calls Supabase `resetPasswordForEmail()`
3. **Supabase sends a password reset email** to `hr@acmecorp.com` with a magic link
4. Client clicks the link → directed to `/reset-password` → sets their new password

> ⚠️ **Important:** Option B requires Supabase email to be configured.
> See Section 6 below.

---

## 6. Email Configuration (For Option B — Self-Service Password Reset)

Supabase sends the reset email automatically. You need to configure the SMTP:

**Supabase Dashboard → Project Settings → Auth → SMTP Settings**

You already have `resend` in your dependencies. Configuration:
- **SMTP Host:** `smtp.resend.com`
- **SMTP Port:** `465`
- **SMTP User:** `resend`
- **SMTP Password:** Your Resend API key (from resend.com)
- **Sender Email:** `noreply@ccshrms.com` (must be a verified domain in Resend)

Once configured, "Forgot Password?" works for all users (tenant admins + employees).

**If you don't configure SMTP:** Option B (self-service reset) won't work. 
You must always use Option A (Developer resets the password manually).

---

## 7. Employee Accounts (Within a Tenant)

Once the tenant superadmin is in their dashboard, they create employees:

Dashboard → Staff → Add Employee

- Enter employee name, email, role
- The system creates a Supabase auth user for them
- Employee gets an email invitation (if SMTP is configured) OR you tell the 
  superadmin to share the credentials manually (same Model A approach)

Employee logs in at the same URL: `https://ccs-hrms-saas.vercel.app/login`
System routes them to their company's employee dashboard view.

---

## Summary Table

| Scenario | Who acts | How |
|---|---|---|
| First login for new tenant | You send credentials | Deploy modal → Copy Full Message → WhatsApp |
| Tenant forgets password | You reset it | Developer Panel → Tenant → Reset Admin Password |
| Tenant forgets password (self-service) | Tenant clicks Forgot Password | Requires SMTP configured in Supabase |
| Finding existing tenant credentials | You look them up | Developer Panel → Tenant → Overview → Credentials card |
| Employee of tenant forgets password | Employee clicks Forgot Password | Same reset flow, same SMTP requirement |
