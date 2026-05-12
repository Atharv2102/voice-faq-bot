import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

const devMode = !process.env.SMTP_HOST;

function createTransport() {
  if (devMode) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function makeQuickToken(suggestionId, action, adminEmail) {
  return jwt.sign(
    { suggestionId, action, adminEmail, singleUse: true },
    process.env.JWT_SECRET || 'replace-me',
    { expiresIn: '7d' }
  );
}

function quickLink(suggestionId, action, adminEmail) {
  const token = makeQuickToken(suggestionId, action, adminEmail);
  const base = process.env.ADMIN_PANEL_URL || 'http://localhost:5173';
  return `${process.env.BOT_URL || 'http://localhost:3000'}/api/suggestions/quick/${token}`;
}

function suggestionEmailHtml(suggestion, adminEmail) {
  const panelUrl = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/suggestions`;
  const approveLink = quickLink(suggestion.id, 'approve', adminEmail);
  const rejectLink = quickLink(suggestion.id, 'reject', adminEmail);
  const submitter = suggestion.submitted_by;
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1F1F1F">
  <h2 style="color:#0F6E56">New FAQ Suggestion — ${suggestion.id}</h2>
  <p><strong>Submitted by:</strong> ${submitter.name ?? 'Unknown'} (${submitter.email ?? 'no email'})</p>
  <p><strong>Type:</strong> ${suggestion.type}</p>
  <p><strong>Target FAQ:</strong> ${suggestion.target_question_snippet ?? suggestion.proposed_question ?? '—'}</p>
  ${suggestion.current_answer ? `<p><strong>Current answer:</strong></p><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555">${suggestion.current_answer}</blockquote>` : ''}
  ${suggestion.proposed_answer ? `<p><strong>Proposed answer:</strong></p><blockquote style="border-left:3px solid #0F6E56;padding-left:12px">${suggestion.proposed_answer}</blockquote>` : ''}
  <p style="color:#777;font-size:13px">Submitted at: ${suggestion.created_at}</p>
  <div style="margin-top:24px;display:flex;gap:12px">
    <a href="${panelUrl}" style="background:#1F1F1F;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">View in panel</a>
    <a href="${approveLink}" style="background:#0F6E56;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">Approve</a>
    <a href="${rejectLink}" style="background:#c0392b;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">Reject</a>
  </div>
  <p style="font-size:11px;color:#aaa;margin-top:20px">One-click approve/reject links expire in 7 days and are single-use.</p>
</div>`;
}

async function send(to, subject, html) {
  if (devMode) {
    console.log('\n📧 [EMAIL — dev mode, not sent]');
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body preview: ${html.replace(/<[^>]+>/g, ' ').slice(0, 200).trim()}...`);
    console.log('');
    return;
  }
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || 'FAQ Bot <noreply@example.com>',
    to,
    subject,
    html,
  });
}

export async function sendSuggestionAlert(suggestion, admins) {
  const targets = admins.filter(a => a.notifications_enabled && a.active && a.email);
  for (const admin of targets) {
    try {
      await send(
        admin.email,
        `New FAQ suggestion from ${suggestion.submitted_by.name ?? 'a user'} — ${suggestion.id}`,
        suggestionEmailHtml(suggestion, admin.email)
      );
    } catch (err) {
      console.error(`Email to ${admin.email} failed:`, err.message);
      // don't throw — suggestion is already saved
    }
  }
}

export async function sendApprovalNotice(suggestion) {
  const email = suggestion.submitted_by?.email;
  if (!email) return;
  try {
    await send(email, `Your FAQ suggestion ${suggestion.id} was approved`,
      `<p>Hi ${suggestion.submitted_by.name ?? 'there'},</p>
       <p>Your suggestion (${suggestion.id}) was <strong style="color:#0F6E56">approved</strong> and the FAQ has been updated. Thank you!</p>`
    );
  } catch (err) {
    console.error('Approval notice email failed:', err.message);
  }
}

export async function sendRejectionNotice(suggestion, reason) {
  const email = suggestion.submitted_by?.email;
  if (!email) return;
  try {
    await send(email, `Your FAQ suggestion ${suggestion.id} was not approved`,
      `<p>Hi ${suggestion.submitted_by.name ?? 'there'},</p>
       <p>Your suggestion (${suggestion.id}) was <strong style="color:#c0392b">rejected</strong>.</p>
       ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
       <p>You can submit a revised suggestion at any time.</p>`
    );
  } catch (err) {
    console.error('Rejection notice email failed:', err.message);
  }
}

export { makeQuickToken };
