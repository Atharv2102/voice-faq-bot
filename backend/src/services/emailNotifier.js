import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import axios from 'axios';

/**
 * Three transport modes — auto-selected from env:
 *
 *   1. Microsoft Graph (service account) — preferred for M365 orgs.
 *      Set: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
 *           GRAPH_SENDER_EMAIL (a mailbox the app can send-as).
 *      Requires Mail.Send application permission on the App Registration
 *      with admin consent granted.
 *
 *   2. SMTP — Nodemailer with username/password.
 *      Set: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 *
 *   3. Console — neither configured. Emails are logged to stdout.
 *      Useful during dev or before InfoSec approves an email channel.
 */

const GRAPH_TENANT     = process.env.GRAPH_TENANT_ID;
const GRAPH_CLIENT     = process.env.GRAPH_CLIENT_ID;
const GRAPH_SECRET     = process.env.GRAPH_CLIENT_SECRET;
const GRAPH_SENDER     = process.env.GRAPH_SENDER_EMAIL;
const SMTP_HOST        = process.env.SMTP_HOST;

const MODE = (GRAPH_TENANT && GRAPH_CLIENT && GRAPH_SECRET && GRAPH_SENDER) ? 'graph'
           : SMTP_HOST ? 'smtp'
           : 'console';

console.log(`[emailNotifier] mode = ${MODE}${MODE === 'graph' ? ` (sender: ${GRAPH_SENDER})` : ''}`);

// ── Graph token cache (~55 min) ──────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

async function getGraphToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const { data } = await axios.post(
    `https://login.microsoftonline.com/${GRAPH_TENANT}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: GRAPH_CLIENT,
      client_secret: GRAPH_SECRET,
      scope: 'https://graph.microsoft.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

async function sendViaGraph(to, subject, html) {
  const token = await getGraphToken();
  await axios.post(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_SENDER)}/sendMail`,
    {
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: 'true',
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// ── SMTP transport (only built when needed) ──────────────────────────────────
let smtpTransport = null;
function getSmtp() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return smtpTransport;
}

async function sendViaSmtp(to, subject, html) {
  await getSmtp().sendMail({
    from: process.env.SMTP_FROM || 'FAQ Bot <noreply@example.com>',
    to, subject, html,
  });
}

function logToConsole(to, subject, html) {
  console.log('\n📧 [EMAIL — console mode, not actually sent]');
  console.log(`  To:       ${to}`);
  console.log(`  Subject:  ${subject}`);
  console.log(`  Body:     ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 240).trim()}...`);
  console.log('');
}

// Single entrypoint
async function send(to, subject, html) {
  try {
    if (MODE === 'graph') return await sendViaGraph(to, subject, html);
    if (MODE === 'smtp')  return await sendViaSmtp(to, subject, html);
    return logToConsole(to, subject, html);
  } catch (err) {
    console.error(`[emailNotifier] ${MODE} send to ${to} failed:`, err.response?.data?.error?.message || err.message);
    // Never throw — email failures must not block the suggestion flow
  }
}

// ── Tokens for one-click email actions (unchanged) ───────────────────────────
function makeQuickToken(suggestionId, action, adminEmail) {
  return jwt.sign(
    { suggestionId, action, adminEmail, singleUse: true },
    process.env.JWT_SECRET || 'replace-me',
    { expiresIn: '7d' }
  );
}

function quickLink(suggestionId, action, adminEmail) {
  const token = makeQuickToken(suggestionId, action, adminEmail);
  return `${process.env.BOT_URL || 'http://localhost:3000'}/api/suggestions/quick/${token}`;
}

function suggestionEmailHtml(suggestion, adminEmail) {
  const panelUrl = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/suggestions`;
  const approveLink = quickLink(suggestion.id, 'approve', adminEmail);
  const rejectLink  = quickLink(suggestion.id, 'reject',  adminEmail);
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

export async function sendSuggestionAlert(suggestion, admins) {
  const targets = admins.filter(a => a.notifications_enabled && a.active && a.email);
  for (const admin of targets) {
    await send(
      admin.email,
      `New FAQ suggestion from ${suggestion.submitted_by.name ?? 'a user'} — ${suggestion.id}`,
      suggestionEmailHtml(suggestion, admin.email)
    );
  }
}

export async function sendApprovalNotice(suggestion) {
  const email = suggestion.submitted_by?.email;
  if (!email) return;
  await send(email, `Your FAQ suggestion ${suggestion.id} was approved`,
    `<p>Hi ${suggestion.submitted_by.name ?? 'there'},</p>
     <p>Your suggestion (${suggestion.id}) was <strong style="color:#0F6E56">approved</strong> and the FAQ has been updated. Thank you!</p>`
  );
}

export async function sendRejectionNotice(suggestion, reason) {
  const email = suggestion.submitted_by?.email;
  if (!email) return;
  await send(email, `Your FAQ suggestion ${suggestion.id} was not approved`,
    `<p>Hi ${suggestion.submitted_by.name ?? 'there'},</p>
     <p>Your suggestion (${suggestion.id}) was <strong style="color:#c0392b">rejected</strong>.</p>
     ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
     <p>You can submit a revised suggestion at any time.</p>`
  );
}

export { makeQuickToken };
