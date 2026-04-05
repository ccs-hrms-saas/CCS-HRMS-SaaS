import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ccs-hrms.vercel.app'

export async function POST(req: Request) {
  try {
    const { to_email, to_name, temp_password, designation } = await req.json()
    if (!to_email || !to_name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const { error } = await resend.emails.send({
      from: 'CCS-HRMS <onboarding@resend.dev>',
      to: [to_email],
      subject: `Welcome to CCS-HRMS, ${to_name.split(' ')[0]}! 🎉`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:20px;overflow:hidden;border:1px solid rgba(99,102,241,0.3);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:40px 32px;text-align:center;">
      <div style="width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;">🏢</div>
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Welcome to CCS-HRMS</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Your HR workspace is ready</p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:#e2e8f0;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Hi <strong style="color:#fff;">${to_name.split(' ')[0]}</strong>,
      </p>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 28px;">
        Your account has been created on <strong style="color:#e2e8f0;">CCS-HRMS</strong>${designation ? ` as <strong style="color:#e2e8f0;">${designation}</strong>` : ''}. 
        You can now access your profile, apply for leaves, check policies, and more.
      </p>

      <!-- Credentials Box -->
      <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:20px;margin-bottom:28px;">
        <p style="color:#a5b4fc;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Your Login Credentials</p>
        <div style="margin-bottom:10px;">
          <span style="color:#64748b;font-size:13px;">Email</span><br>
          <span style="color:#e2e8f0;font-size:15px;font-weight:600;">${to_email}</span>
        </div>
        ${temp_password ? `
        <div>
          <span style="color:#64748b;font-size:13px;">Temporary Password</span><br>
          <span style="color:#e2e8f0;font-size:15px;font-weight:600;font-family:monospace;background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:6px;">${temp_password}</span>
        </div>
        ` : ''}
      </div>

      ${temp_password ? `<p style="color:#f59e0b;font-size:13px;margin:0 0 28px;">⚠️ Please change your password after first login via <strong>My Profile → Change Password</strong>.</p>` : ''}

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${APP_URL}/login" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">
          Sign In to Your Account →
        </a>
      </div>

      <p style="color:#475569;font-size:13px;text-align:center;margin:0;">
        If you have any issues, contact your HR administrator.<br>
        <strong style="color:#6366f1;">CCS-HRMS</strong> — Your Digital HR Workspace
      </p>
    </div>
  </div>
</body>
</html>
      `
    })

    if (error) return NextResponse.json({ error: (error as any).message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
