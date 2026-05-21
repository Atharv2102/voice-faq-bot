import { randomUUID } from 'crypto';
import * as fileStore from './fileStore.js';
import * as pending from './pendingActions.js';
import * as lockManager from './lockManager.js';
import * as excelLogger from './excelLogger.js';
import * as emailNotifier from './emailNotifier.js';
import * as teamsNotifier from './teamsNotifier.js';
import * as conversationStore from './conversationStore.js';
import { parseIntent } from './intent.js';
import { parseIntentNLP } from './nlpIntent.js';
import { findBestMatch, findTopMatches } from './matcher.js';
import * as access from './access.js';
import axios from 'axios';

// How recent must a change be (hours) to be revertable. Default 7 days.
const REVERT_WINDOW_HOURS = Number(process.env.REVERT_WINDOW_HOURS || 168);

// ---------- helpers ----------

function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('en-IN') : '—'; }

function isAdmin(teamsUserId) {
  const { admins } = fileStore.read('admins');
  return admins.some(a => a.teams_user_id === teamsUserId && a.active);
}

function getAdmin(teamsUserId) {
  const { admins } = fileStore.read('admins');
  return admins.find(a => a.teams_user_id === teamsUserId && a.active) ?? null;
}

function getFaqs() { return fileStore.read('faqs').questions; }

function nextFaqId() {
  const faqs = getFaqs();
  const nums = faqs.map(q => parseInt(q.id.replace('q_', ''))).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `q_${String(max + 1).padStart(3, '0')}`;
}

function periodToRange(period) {
  const now = new Date();
  if (period === 'today') {
    const from = new Date(now); from.setHours(0,0,0,0);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (period === 'yesterday') {
    const from = new Date(now); from.setDate(from.getDate() - 1); from.setHours(0,0,0,0);
    const to = new Date(from); to.setHours(23,59,59,999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'this week') {
    const from = new Date(now); from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (period === 'this month') {
    const from = new Date(now); from.setDate(1); from.setHours(0,0,0,0);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  return {};
}

function formatAuditRows(rows) {
  if (!rows.length) return 'No audit entries found.';
  return rows.slice(0, 10).map(r =>
    `• [${fmtDate(r.timestamp)}] ${r.actor_email} — **${r.action}** "${r.question_snippet}" (${r.source})`
  ).join('\n');
}

function candidatesList(matches) {
  return matches.map((m, i) =>
    `${i + 1}. "${m.faq.question}" (${Math.round(m.score * 100)}% match)`
  ).join('\n');
}

async function notifyBot(teamsUserId, message) {
  const botUrl = process.env.BOT_URL || 'http://localhost:3978';
  const secret = process.env.BOT_PROACTIVE_SECRET;
  try {
    await axios.post(`${botUrl}/api/proactive`, { teamsUserId, message, secret });
  } catch (err) {
    console.error('Proactive notify failed:', err.message);
  }
}

// ---------- suggestion approval / rejection (shared by voice and web) ----------

export async function approveSuggestion(suggestionId, reviewer) {
  const { suggestions, next_id } = fileStore.read('suggestions');
  const idx = suggestions.findIndex(s => s.id === suggestionId);
  if (idx === -1) return { ok: false, message: `Suggestion ${suggestionId} not found.` };

  const s = suggestions[idx];
  if (s.status !== 'pending') return { ok: false, message: `Suggestion ${suggestionId} is already ${s.status}.` };

  let before = null, after = null, actionType = 'suggestion_approved';
  const faqs = getFaqs();

  if (s.type === 'update' && s.target_faq_id) {
    const faqIdx = faqs.findIndex(f => f.id === s.target_faq_id);
    if (faqIdx !== -1) {
      before = faqs[faqIdx].answer;
      if (s.proposed_answer) faqs[faqIdx].answer = s.proposed_answer;
      if (s.proposed_question) faqs[faqIdx].question = s.proposed_question;
      faqs[faqIdx].updated_by = reviewer.email;
      faqs[faqIdx].updated_at = new Date().toISOString();
      after = faqs[faqIdx].answer;
      await fileStore.update('faqs', data => { data.questions = faqs; data.last_updated = new Date().toISOString(); });
    }
    suggestions[idx].applied = true;
  } else if (s.type === 'add' && s.proposed_question && s.proposed_answer) {
    const newFaq = {
      id: nextFaqId(), question: s.proposed_question, alternates: [],
      answer: s.proposed_answer, category: 'General', active: true,
      created_by: reviewer.email, created_at: new Date().toISOString(),
      updated_by: reviewer.email, updated_at: new Date().toISOString(),
    };
    after = newFaq.answer;
    await fileStore.update('faqs', data => { data.questions.push(newFaq); data.last_updated = new Date().toISOString(); });
    suggestions[idx].applied = true;
  } else {
    suggestions[idx].applied = false; // report type — no auto-apply
  }

  suggestions[idx].status = 'approved';
  suggestions[idx].reviewed_by = reviewer.email;
  suggestions[idx].reviewed_at = new Date().toISOString();
  await fileStore.write('suggestions', { next_id, suggestions });

  await excelLogger.appendAudit({
    actor_name: reviewer.name ?? reviewer.email,
    actor_email: reviewer.email,
    action: actionType,
    source: 'suggestion',
    faq_id: s.target_faq_id ?? '',
    question_snippet: s.target_question_snippet ?? s.proposed_question ?? '',
    before_answer: before ?? '',
    after_answer: after ?? '',
    notes: `Suggestion ${suggestionId} by ${s.submitted_by?.name ?? '?'}`,
  });

  emailNotifier.sendApprovalNotice(s).catch(console.error);
  if (s.submitted_by?.teams_user_id) {
    notifyBot(s.submitted_by.teams_user_id, `✅ Your suggestion **${suggestionId}** was approved. The FAQ has been updated. Thank you!`);
  }

  return { ok: true, message: `Suggestion ${suggestionId} approved.` };
}

export async function rejectSuggestion(suggestionId, reviewer, reason = '') {
  const data = fileStore.read('suggestions');
  const idx = data.suggestions.findIndex(s => s.id === suggestionId);
  if (idx === -1) return { ok: false, message: `Suggestion ${suggestionId} not found.` };

  const s = data.suggestions[idx];
  if (s.status !== 'pending') return { ok: false, message: `Suggestion ${suggestionId} is already ${s.status}.` };

  data.suggestions[idx] = { ...s, status: 'rejected', reviewed_by: reviewer.email, reviewed_at: new Date().toISOString(), review_reason: reason };
  await fileStore.write('suggestions', data);

  await excelLogger.appendAudit({
    actor_name: reviewer.name ?? reviewer.email,
    actor_email: reviewer.email,
    action: 'suggestion_rejected',
    source: 'suggestion',
    faq_id: s.target_faq_id ?? '',
    question_snippet: s.target_question_snippet ?? '',
    notes: `Suggestion ${suggestionId} rejected. Reason: ${reason || 'none'}`,
  });

  emailNotifier.sendRejectionNotice(s, reason).catch(console.error);
  if (s.submitted_by?.teams_user_id) {
    notifyBot(s.submitted_by.teams_user_id, `Your suggestion **${suggestionId}** was not approved${reason ? `: ${reason}` : '.'}  You can submit a revised suggestion anytime.`);
  }

  return { ok: true, message: `Suggestion ${suggestionId} rejected.` };
}

// ---------- main handler ----------

export async function handle({ text, teamsUserId, userEmail, userName, conversationReference }) {
  // Store conversation reference
  if (conversationReference) conversationStore.store(teamsUserId, conversationReference);

  let intent = parseIntent(text);
  // If the strict regex didn't match anything, ask the LLM to interpret.
  // It returns { action: null } if OPENAI_API_KEY is missing or the text is just
  // a question — in which case we fall through to FAQ lookup as before.
  if (intent.action === null) {
    const nlp = await parseIntentNLP(text);
    if (nlp.action) intent = nlp;
  }
  const admin = getAdmin(teamsUserId) || access.getAdminEntry(teamsUserId, userEmail);
  const role = access.getRole(teamsUserId, userEmail);
  const adminOnly = ['add','update','delete','disable','enable','list','count','audit_recent','audit_by_actor','audit_by_time','audit_by_topic','audit_by_faq','revert','revert_faq','suggestions_pending','suggestions_by_submitter','suggestion_approve','suggestion_reject','show_query_log','show_unanswered'];
  const ltAllowed = ['suggest_update','suggest_add','suggest_report','my_suggestions','help','link_account'];
  const userAllowed = ['help','link_account','greet'];

  // Handle confirm/cancel before all else
  if (intent.action === 'confirm' || intent.action === 'cancel' || intent.action === 'pick') {
    return { type: 'confirm_or_cancel', action: intent.action, number: intent.number };
  }

  if (intent.action === null) return { type: 'not_a_command' };

  // --- Account linking (no admin status required) ---
  if (intent.action === 'link_account') {
    try {
      const resp = await fetch(`http://localhost:${process.env.PORT || 3000}/api/auth/link-claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: intent.code,
          teamsUserId,
          secret: process.env.BOT_PROACTIVE_SECRET,
        }),
      });
      if (resp.status === 404) {
        return { type: 'error', message: '❌ That code is invalid or has expired. Generate a fresh one from the admin panel.' };
      }
      if (!resp.ok) {
        return { type: 'error', message: `Couldn't link account (HTTP ${resp.status}).` };
      }
      const data = await resp.json();
      return { type: 'executed', message: `✅ Linked to **${data.name}** (${data.email}). You can now use admin commands here. Try \`help\` to see them.` };
    } catch (err) {
      console.error('link_account error:', err);
      return { type: 'error', message: 'Something went wrong linking your account. Please try again.' };
    }
  }

  // Access control — anyone not on an allowlist is rejected entirely.
  if (role === null) {
    return {
      type: 'not_authorized',
      message: "You don't have access to this FAQ bot yet. Please ask your admin to add you to the allowed users list.",
    };
  }

  // LT can suggest + my_suggestions + help; can't do admin actions.
  if (role === 'lt' && adminOnly.includes(intent.action)) {
    return {
      type: 'not_admin',
      message: "Only admins can do that. As an LT member you can suggest a change or report a wrong answer — say `help` to see how.",
    };
  }

  // Regular user — can only ask questions (handled via not_a_command fallback)
  // and use meta commands (help / link).
  if (role === 'user' && !userAllowed.includes(intent.action)) {
    return {
      type: 'not_admin',
      message: "You can ask any question, but only admins or LT members can manage FAQs. Say `help` for what you can do.",
    };
  }

  // Admin-only gate (now redundant with role check but kept as a safety net)
  if (adminOnly.includes(intent.action) && !admin) {
    return {
      type: 'not_admin',
      message: "Only admins can do that.",
    };
  }

  const faqs = getFaqs();
  const actor = admin ? { email: admin.email, name: admin.name } : { email: userEmail, name: userName };

  // --- greeting → role-appropriate welcome ---
  if (intent.action === 'greet') {
    const who = userName ? `, ${userName.split(' ')[0]}` : '';
    let intro;
    if (role === 'admin') {
      intro =
        `👋 Hi${who}! I'm the **FAQ Bot**.\n\n` +
        `You're signed in as an **Admin** — here's what you can do:\n\n` +
        `🔎 **Ask** — type any question to get an answer\n` +
        `✏️ **Manage FAQs** — \`add question X answer Y\`, \`update answer for X to Y\`, \`delete question about X\`\n` +
        `📥 **Review suggestions** — \`show pending suggestions\`, \`approve suggestion S-001\`\n` +
        `📜 **Logs & history** — \`show recent changes\`, \`show recent queries\`, \`who edited <topic>\`\n` +
        `↩️ **Undo** — \`revert last change\`, \`revert the answer for <topic>\`\n\n` +
        `Say \`help\` any time for the full command list.`;
    } else if (role === 'lt') {
      intro =
        `👋 Hi${who}! I'm the **FAQ Bot**.\n\n` +
        `You're signed in as an **LT member** — here's what you can do:\n\n` +
        `🔎 **Ask** — type any question to get an answer\n` +
        `✏️ **Suggest a change** — \`suggest a change to <topic>: <new answer>\`\n` +
        `➕ **Suggest a new FAQ** — \`suggest adding <question> with answer <answer>\`\n` +
        `🚩 **Flag a wrong answer** — \`report wrong answer for <topic>\`\n` +
        `📋 **See your submissions** — \`my suggestions\`\n\n` +
        `Say \`help\` any time for the full command list.`;
    } else if (role === 'user') {
      intro =
        `👋 Hi${who}! I'm the **FAQ Bot**.\n\n` +
        `Just **ask me anything** — by text or voice — and I'll find the answer.\n\n` +
        `_Examples:_\n` +
        `• \`what are the office hours?\`\n` +
        `• \`wifi password\`\n` +
        `• \`how do I claim travel expenses\`\n\n` +
        `If something looks wrong, let your admin know so they can fix it.`;
    } else {
      // Shouldn't reach here — access gate would have already rejected null role
      intro = '👋 Hi! Ask your admin to add you to the FAQ Bot access list.';
    }
    return { type: 'result', formatted_message: intro };
  }

  // --- help ---
  if (intent.action === 'help') {
    const isAdm = role === 'admin';
    const isLt  = role === 'lt';
    const lines = [
      '👋 **Hi! I\'m the FAQ Bot.** Here\'s what I can do:',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🔎 **Ask me anything**',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'Just type or say your question — no special format needed.',
      '   _Examples:_',
      '   • `what are the office hours?`',
      '   • `how do I claim travel expenses`',
      '   • `wifi password`',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '✏️ **Suggest a fix or addition** _(anyone)_',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '**Fix an existing answer** — use a colon (`:`) before the new value:',
      '   `suggest a change to office hours: 10am to 6pm`',
      '   `suggest update for wifi password: guest2026`',
      '',
      '**Add a brand new FAQ:**',
      '   `suggest adding what is the dress code with answer business casual`',
      '   `suggest new question parking hours: 8am to 9pm`',
      '',
      '**Report a wrong answer:**',
      '   `report wrong answer for wifi password`',
      '   `the answer for office hours is outdated`',
      '',
      '**See what you\'ve submitted:**   `my suggestions`',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🔗 **Link a web admin account**',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      'If you have a web admin account on the FAQ Bot admin panel, generate a 6-digit code there and send:',
      '   `link 123456`',
      'This grants you admin powers in Teams too.',
    ];
    if (!isAdm && !isLt) {
      // Regular user — strip the suggest section
      lines.length = 0;
      lines.push(
        '👋 **Hi! I\'m the FAQ Bot.**',
        '',
        '🔎 **Ask me anything** — just type or say your question.',
        '   _Examples:_',
        '   • `what are the office hours?`',
        '   • `wifi password`',
        '   • `how do I claim travel expenses`',
        '',
        '💡 If something looks wrong, please flag it to your admin so they can fix it.',
      );
    }

    if (isAdm) lines.push(
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🛠️  **Manage FAQs** _(admin only)_',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '   `add question <Q> answer <A>`',
      '   `update answer for <Q> to <new answer>`',
      '   `delete question about <topic>`',
      '   `disable question about <topic>` / `enable question about <topic>`',
      '   `list questions` / `list questions about <topic>`',
      '   `how many questions`',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📥 **Review suggestions** _(admin only)_',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '   `show pending suggestions`',
      '   `approve suggestion S-001`   /   `reject suggestion S-001`',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📜 **Audit & logs** _(admin only)_',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '   `show recent changes`',
      '   `show changes today` / `show changes this week`',
      '   `show changes by <name>`',
      '   `who edited <topic>`',
      '   `show recent queries` / `show unanswered queries`',
      '   `revert last change`  (only within last ' + REVERT_WINDOW_HOURS + 'h)',
      '   `revert the answer for <topic>`  (per-FAQ rollback)',
    );
    lines.push(
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '💡 **Tip** — I always ask `yes` / `no` before saving anything.',
    );
    return { type: 'result', formatted_message: lines.join('\n') };
  }

  // --- count ---
  if (intent.action === 'count') {
    const active = faqs.filter(f => f.active).length;
    return { type: 'result', formatted_message: `There are **${active}** active FAQs (${faqs.length} total including disabled).` };
  }

  // --- list ---
  if (intent.action === 'list') {
    let filtered = faqs.filter(f => f.active);
    if (intent.topic) filtered = filtered.filter(f => f.question.toLowerCase().includes(intent.topic.toLowerCase()));
    if (!filtered.length) return { type: 'result', formatted_message: `No active FAQs found${intent.topic ? ` about "${intent.topic}"` : ''}.` };
    const lines = filtered.map((f, i) => `${i + 1}. **${f.question}** — ${f.answer.slice(0, 80)}${f.answer.length > 80 ? '…' : ''}`);
    return { type: 'result', formatted_message: `**FAQs${intent.topic ? ` about "${intent.topic}"` : ''}** (${filtered.length}):\n${lines.join('\n')}` };
  }

  // --- my suggestions ---
  if (intent.action === 'my_suggestions') {
    const { suggestions } = fileStore.read('suggestions');
    const mine = suggestions.filter(s => s.submitted_by?.teams_user_id === teamsUserId);
    if (!mine.length) return { type: 'result', formatted_message: "You haven't submitted any suggestions yet." };
    const lines = mine.map(s =>
      `• **${s.id}** — ${s.type} — "${s.target_question_snippet ?? s.proposed_question ?? '?'}" — *${s.status}*`
    );
    return { type: 'result', formatted_message: `**Your suggestions:**\n${lines.join('\n')}` };
  }

  // --- audit commands ---
  if (intent.action === 'audit_recent') {
    const rows = await excelLogger.readAuditLog({ limit: 10 });
    return { type: 'result', formatted_message: `**Recent changes:**\n${formatAuditRows(rows)}` };
  }
  if (intent.action === 'audit_by_actor') {
    const rows = await excelLogger.readAuditLog({ actor: intent.name, limit: 10 });
    return { type: 'result', formatted_message: `**Changes by "${intent.name}":**\n${formatAuditRows(rows)}` };
  }
  if (intent.action === 'audit_by_time') {
    const range = periodToRange(intent.period);
    const rows = await excelLogger.readAuditLog({ ...range, limit: 20 });
    return { type: 'result', formatted_message: `**Changes ${intent.period}:**\n${formatAuditRows(rows)}` };
  }
  if (intent.action === 'audit_by_topic') {
    const rows = await excelLogger.readAuditLog({ limit: 50 });
    const filtered = rows.filter(r => String(r.question_snippet).toLowerCase().includes(intent.topic.toLowerCase())).slice(0, 10);
    return { type: 'result', formatted_message: `**Changes related to "${intent.topic}":**\n${formatAuditRows(filtered)}` };
  }
  if (intent.action === 'audit_by_faq') {
    const match = findBestMatch(faqs, intent.target);
    if (!match) return { type: 'not_found', message: `Couldn't find a FAQ matching "${intent.target}".` };
    const rows = await excelLogger.readAuditLog({ faqId: match.faq.id, limit: 10 });
    return { type: 'result', formatted_message: `**Edit history for "${match.faq.question}":**\n${formatAuditRows(rows)}` };
  }
  if (intent.action === 'revert') {
    const rows = await excelLogger.readAuditLog({ limit: 1 });
    if (!rows.length || !rows[0].before_answer || rows[0].action === 'delete') {
      return { type: 'result', formatted_message: "Nothing to revert (no revertible change found in audit log)." };
    }
    const last = rows[0];
    const hoursAgo = (Date.now() - new Date(last.timestamp).getTime()) / 3600000;
    if (hoursAgo > REVERT_WINDOW_HOURS) {
      return { type: 'result', formatted_message: `That change was made ${Math.round(hoursAgo)}h ago. Reverts are only allowed within the last ${REVERT_WINDOW_HOURS}h to prevent accidental rollbacks of long-standing content.` };
    }
    const faqIdx = faqs.findIndex(f => f.id === last.faq_id);
    if (faqIdx === -1) return { type: 'result', formatted_message: `FAQ ${last.faq_id} no longer exists, cannot revert.` };
    pending.set(teamsUserId, 'revert', { faqId: last.faq_id, answer: last.before_answer, actor });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll revert "${last.question_snippet}" back to:\n"${last.before_answer}"\n_(change made ${Math.round(hoursAgo)}h ago)_\nSay yes to confirm or cancel to abort.`,
    };
  }

  // --- revert a specific FAQ (within REVERT_WINDOW_HOURS) ---
  if (intent.action === 'revert_faq') {
    const match = findBestMatch(faqs, intent.target);
    if (!match) return { type: 'not_found', message: `Couldn't find a FAQ matching "${intent.target}".` };
    const rows = await excelLogger.readAuditLog({ faqId: match.faq.id, limit: 5 });
    const last = rows.find(r => r.before_answer && r.action !== 'delete');
    if (!last) return { type: 'result', formatted_message: `No revertible change found for "${match.faq.question}".` };
    const hoursAgo = (Date.now() - new Date(last.timestamp).getTime()) / 3600000;
    if (hoursAgo > REVERT_WINDOW_HOURS) {
      return { type: 'result', formatted_message: `Last change to "${match.faq.question}" was ${Math.round(hoursAgo)}h ago — outside the ${REVERT_WINDOW_HOURS}h revert window.` };
    }
    pending.set(teamsUserId, 'revert', { faqId: match.faq.id, answer: last.before_answer, actor });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll revert "${match.faq.question}" back to:\n"${last.before_answer}"\n_(change made ${Math.round(hoursAgo)}h ago)_\nSay yes to confirm or cancel to abort.`,
    };
  }

  // --- query log: what users have been asking ---
  if (intent.action === 'show_query_log') {
    const rows = await excelLogger.readQueryLog({ limit: 15 });
    if (!rows.length) return { type: 'result', formatted_message: 'No queries logged yet.' };
    const lines = rows.map(r => {
      const status = r.answered ? '✓' : '✗';
      const who = r.user_name || r.user_email || 'unknown';
      return `${status} _${fmtDate(r.timestamp)}_  **${who}**  — "${r.query}"`;
    });
    return { type: 'result', formatted_message: `**Recent queries (last ${rows.length}):**\n${lines.join('\n')}` };
  }

  if (intent.action === 'show_unanswered') {
    const all = await excelLogger.readQueryLog({ limit: 200 });
    const rows = all.filter(r => !r.answered).slice(0, 15);
    if (!rows.length) return { type: 'result', formatted_message: 'No unanswered queries — your knowledge base is covering everything users have asked!' };
    const lines = rows.map(r => `• "${r.query}"  _(${fmtDate(r.timestamp)} — ${r.user_name || 'unknown'})_`);
    return { type: 'result', formatted_message: `**Unanswered queries (${rows.length}):**\n${lines.join('\n')}` };
  }

  // --- suggestions_pending (admin) ---
  if (intent.action === 'suggestions_pending') {
    const { suggestions } = fileStore.read('suggestions');
    const pend = suggestions.filter(s => s.status === 'pending');
    if (!pend.length) return { type: 'result', formatted_message: 'No pending suggestions.' };
    const lines = pend.map(s =>
      `• **${s.id}** — ${s.type} — "${s.target_question_snippet ?? s.proposed_question ?? '?'}" by ${s.submitted_by?.name ?? '?'} (${fmtDate(s.created_at)})`
    );
    return { type: 'result', formatted_message: `**Pending suggestions (${pend.length}):**\n${lines.join('\n')}\n\nSay "approve suggestion S-XXX" or "reject suggestion S-XXX".` };
  }

  // --- suggestions_by_submitter (admin) ---
  if (intent.action === 'suggestions_by_submitter') {
    const { suggestions } = fileStore.read('suggestions');
    const filtered = suggestions.filter(s =>
      (s.submitted_by?.name ?? '').toLowerCase().includes(intent.name.toLowerCase()) ||
      (s.submitted_by?.email ?? '').toLowerCase().includes(intent.name.toLowerCase())
    );
    if (!filtered.length) return { type: 'result', formatted_message: `No suggestions found from "${intent.name}".` };
    const lines = filtered.map(s => `• **${s.id}** — ${s.type} — *${s.status}* — ${fmtDate(s.created_at)}`);
    return { type: 'result', formatted_message: `**Suggestions by "${intent.name}":**\n${lines.join('\n')}` };
  }

  // --- suggestion_approve / reject (admin via voice) ---
  if (intent.action === 'suggestion_approve') {
    pending.set(teamsUserId, 'suggestion_approve', { suggestionId: intent.id, actor });
    return { type: 'needs_confirmation', confirmation_prompt: `Approve suggestion **${intent.id}**? Say yes to confirm or cancel to abort.` };
  }
  if (intent.action === 'suggestion_reject') {
    pending.set(teamsUserId, 'suggestion_reject', { suggestionId: intent.id, actor, reason: '' });
    return { type: 'needs_confirmation', confirmation_prompt: `Reject suggestion **${intent.id}**? Say yes to confirm or cancel to abort.` };
  }

  // --- user suggestion intents ---
  if (intent.action === 'suggest_update') {
    const matches = findTopMatches(faqs, intent.target, 3);
    if (!matches.length) return { type: 'not_found', message: `I couldn't find a FAQ matching "${intent.target}". Try "suggest adding <question> with answer <answer>".` };
    if (matches.length > 1 && matches[0].score < 0.85) {
      pending.set(teamsUserId, 'suggest_pick_target', { candidates: matches, intent, actor, userEmail, userName });
      return {
        type: 'needs_confirmation',
        confirmation_prompt: `I found multiple FAQs matching "${intent.target}":\n${candidatesList(matches)}\n\nWhich one? Reply with 1, 2, or 3.`,
      };
    }
    const faq = matches[0].faq;
    const suggestion = buildSuggestion('update', faq, intent.newAnswer, { teams_user_id: teamsUserId, email: userEmail, name: userName });
    pending.set(teamsUserId, 'submit_suggestion', { suggestion, actor, userEmail, userName });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll send this to admins:\n\n📋 **FAQ:** "${faq.question}"\n**Current:** "${faq.answer}"\n**You're suggesting:** "${intent.newAnswer}"\n\nSubmit? Say yes to confirm.`,
    };
  }

  if (intent.action === 'suggest_add') {
    const suggestion = buildSuggestion('add', null, intent.answer, { teams_user_id: teamsUserId, email: userEmail, name: userName }, intent.question);
    pending.set(teamsUserId, 'submit_suggestion', { suggestion, actor, userEmail, userName });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll suggest adding:\n\n📋 **Question:** "${intent.question}"\n**Answer:** "${intent.answer}"\n\nSubmit? Say yes to confirm.`,
    };
  }

  if (intent.action === 'suggest_report') {
    const matches = findTopMatches(faqs, intent.target, 3);
    if (!matches.length) return { type: 'not_found', message: `I couldn't find a FAQ matching "${intent.target}".` };
    const faq = matches.length === 1 || matches[0].score >= 0.85 ? matches[0].faq : null;
    if (!faq) {
      pending.set(teamsUserId, 'suggest_pick_target', { candidates: matches, intent: { ...intent, action: 'suggest_report' }, actor, userEmail, userName });
      return {
        type: 'needs_confirmation',
        confirmation_prompt: `I found multiple matches:\n${candidatesList(matches)}\n\nWhich FAQ has the wrong answer? Reply with 1, 2, or 3.`,
      };
    }
    const suggestion = buildSuggestion('report', faq, null, { teams_user_id: teamsUserId, email: userEmail, name: userName });
    pending.set(teamsUserId, 'submit_suggestion', { suggestion, actor, userEmail, userName });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll flag this FAQ as having a wrong/outdated answer:\n\n📋 **"${faq.question}"**\n**Current answer:** "${faq.answer}"\n\nReport it? Say yes to confirm.`,
    };
  }

  // --- admin destructive actions ---
  const resolveTarget = (target) => {
    const matches = findTopMatches(faqs, target, 3);
    if (!matches.length) return { err: `I couldn't find a FAQ matching "${target}".` };
    if (matches.length > 1 && matches[0].score < 0.85) return { candidates: matches };
    return { faq: matches[0].faq };
  };

  if (intent.action === 'add') {
    pending.set(teamsUserId, 'add', { question: intent.question, answer: intent.answer, actor });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll add a new FAQ:\n📋 **Q:** "${intent.question}"\n**A:** "${intent.answer}"\n\nSay yes to confirm or cancel to abort.`,
    };
  }

  if (intent.action === 'update') {
    const r = resolveTarget(intent.target);
    if (r.err) return { type: 'not_found', message: r.err };
    if (r.candidates) {
      pending.set(teamsUserId, 'pick_for_update', { candidates: r.candidates, newAnswer: intent.newAnswer, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `Multiple matches for "${intent.target}":\n${candidatesList(r.candidates)}\n\nWhich one? Reply 1, 2, or 3.` };
    }
    pending.set(teamsUserId, 'update', { faqId: r.faq.id, newAnswer: intent.newAnswer, actor });
    return {
      type: 'needs_confirmation',
      confirmation_prompt: `I'll update "${r.faq.question}" answer to:\n"${intent.newAnswer}"\n\nSay yes to confirm or cancel to abort.`,
    };
  }

  if (intent.action === 'delete') {
    const r = resolveTarget(intent.target);
    if (r.err) return { type: 'not_found', message: r.err };
    if (r.candidates) {
      pending.set(teamsUserId, 'pick_for_delete', { candidates: r.candidates, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `Multiple matches:\n${candidatesList(r.candidates)}\n\nWhich one to delete? Reply 1, 2, or 3.` };
    }
    pending.set(teamsUserId, 'delete', { faqId: r.faq.id, question: r.faq.question, actor });
    return { type: 'needs_confirmation', confirmation_prompt: `I'll delete "${r.faq.question}". Say yes to confirm or cancel to abort.` };
  }

  if (intent.action === 'disable') {
    const r = resolveTarget(intent.target);
    if (r.err) return { type: 'not_found', message: r.err };
    if (r.candidates) {
      pending.set(teamsUserId, 'pick_for_disable', { candidates: r.candidates, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `Multiple matches:\n${candidatesList(r.candidates)}\n\nWhich one to disable? Reply 1, 2, or 3.` };
    }
    pending.set(teamsUserId, 'disable', { faqId: r.faq.id, question: r.faq.question, actor });
    return { type: 'needs_confirmation', confirmation_prompt: `I'll disable "${r.faq.question}". Say yes to confirm or cancel to abort.` };
  }

  if (intent.action === 'enable') {
    const r = resolveTarget(intent.target);
    if (r.err) return { type: 'not_found', message: r.err };
    if (r.candidates) {
      pending.set(teamsUserId, 'pick_for_enable', { candidates: r.candidates, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `Multiple matches:\n${candidatesList(r.candidates)}\n\nWhich one to enable? Reply 1, 2, or 3.` };
    }
    pending.set(teamsUserId, 'enable', { faqId: r.faq.id, question: r.faq.question, actor });
    return { type: 'needs_confirmation', confirmation_prompt: `I'll enable "${r.faq.question}". Say yes to confirm or cancel to abort.` };
  }

  return { type: 'not_a_command' };
}

// ---------- confirm handler ----------

export async function confirm({ teamsUserId, response }) {
  const intent = parseIntent(response.trim());
  const entry = pending.get(teamsUserId);

  if (!entry) return { type: 'no_pending', message: "There's no pending action. Nothing to confirm." };

  if (intent.action === 'cancel') {
    pending.clear(teamsUserId);
    return { type: 'cancelled', message: 'Action cancelled.' };
  }

  // Handle disambiguation (pick 1/2/3)
  if (entry.action.startsWith('pick_for_') || entry.action === 'suggest_pick_target') {
    if (intent.action !== 'pick') {
      return { type: 'needs_confirmation', confirmation_prompt: 'Please reply with a number: 1, 2, or 3.' };
    }
    const { candidates, newAnswer, actor, intent: savedIntent, userEmail, userName } = entry.payload;
    const idx = intent.number - 1;
    if (idx < 0 || idx >= candidates.length) return { type: 'needs_confirmation', confirmation_prompt: `Please pick a number between 1 and ${candidates.length}.` };
    const faq = candidates[idx].faq;
    pending.clear(teamsUserId);

    if (entry.action === 'pick_for_update') {
      pending.set(teamsUserId, 'update', { faqId: faq.id, newAnswer, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `I'll update "${faq.question}" answer to:\n"${newAnswer}"\n\nSay yes to confirm or cancel to abort.` };
    }
    if (entry.action === 'pick_for_delete') {
      pending.set(teamsUserId, 'delete', { faqId: faq.id, question: faq.question, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `I'll delete "${faq.question}". Say yes to confirm or cancel to abort.` };
    }
    if (entry.action === 'pick_for_disable') {
      pending.set(teamsUserId, 'disable', { faqId: faq.id, question: faq.question, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `I'll disable "${faq.question}". Say yes to confirm or cancel to abort.` };
    }
    if (entry.action === 'pick_for_enable') {
      pending.set(teamsUserId, 'enable', { faqId: faq.id, question: faq.question, actor });
      return { type: 'needs_confirmation', confirmation_prompt: `I'll enable "${faq.question}". Say yes to confirm or cancel to abort.` };
    }
    if (entry.action === 'suggest_pick_target') {
      const newSuggestion = buildSuggestion(savedIntent.action === 'suggest_report' ? 'report' : 'update', faq, savedIntent.newAnswer ?? null, { teams_user_id: teamsUserId, email: userEmail, name: userName });
      pending.set(teamsUserId, 'submit_suggestion', { suggestion: newSuggestion, actor, userEmail, userName });
      return {
        type: 'needs_confirmation',
        confirmation_prompt: `I'll send this suggestion for "${faq.question}". Submit? Say yes to confirm.`,
      };
    }
  }

  if (intent.action !== 'confirm') {
    return { type: 'needs_confirmation', confirmation_prompt: 'Please say yes to confirm or cancel to abort.' };
  }

  // Execute confirmed action
  pending.clear(teamsUserId);
  const { action, payload } = entry;

  if (action === 'add') {
    const id = nextFaqId();
    await fileStore.update('faqs', data => {
      data.questions.push({ id, question: payload.question, alternates: [], answer: payload.answer, category: 'General', active: true, created_by: payload.actor.email, created_at: new Date().toISOString(), updated_by: payload.actor.email, updated_at: new Date().toISOString() });
      data.last_updated = new Date().toISOString();
    });
    await excelLogger.appendAudit({ actor_name: payload.actor.name, actor_email: payload.actor.email, action: 'add', source: 'voice', faq_id: id, question_snippet: payload.question, after_answer: payload.answer });
    return { type: 'executed', message: `FAQ added: "${payload.question}"` };
  }

  if (action === 'update') {
    let before;
    await fileStore.update('faqs', data => {
      const faq = data.questions.find(f => f.id === payload.faqId);
      if (faq) { before = faq.answer; faq.answer = payload.newAnswer; faq.updated_by = payload.actor.email; faq.updated_at = new Date().toISOString(); }
      data.last_updated = new Date().toISOString();
    });
    const faq = getFaqs().find(f => f.id === payload.faqId);
    await excelLogger.appendAudit({ actor_name: payload.actor.name, actor_email: payload.actor.email, action: 'update', source: 'voice', faq_id: payload.faqId, question_snippet: faq?.question ?? '', before_answer: before, after_answer: payload.newAnswer });
    return { type: 'executed', message: `FAQ updated.` };
  }

  if (action === 'delete') {
    await fileStore.update('faqs', data => {
      const idx = data.questions.findIndex(f => f.id === payload.faqId);
      if (idx !== -1) data.questions.splice(idx, 1);
      data.last_updated = new Date().toISOString();
    });
    await excelLogger.appendAudit({ actor_name: payload.actor.name, actor_email: payload.actor.email, action: 'delete', source: 'voice', faq_id: payload.faqId, question_snippet: payload.question });
    return { type: 'executed', message: `FAQ deleted: "${payload.question}"` };
  }

  if (action === 'disable' || action === 'enable') {
    const flag = action === 'enable';
    await fileStore.update('faqs', data => {
      const faq = data.questions.find(f => f.id === payload.faqId);
      if (faq) { faq.active = flag; faq.updated_by = payload.actor.email; faq.updated_at = new Date().toISOString(); }
      data.last_updated = new Date().toISOString();
    });
    await excelLogger.appendAudit({ actor_name: payload.actor.name, actor_email: payload.actor.email, action, source: 'voice', faq_id: payload.faqId, question_snippet: payload.question });
    return { type: 'executed', message: `FAQ ${action}d: "${payload.question}"` };
  }

  if (action === 'revert') {
    await fileStore.update('faqs', data => {
      const faq = data.questions.find(f => f.id === payload.faqId);
      if (faq) { faq.answer = payload.answer; faq.updated_by = payload.actor.email; faq.updated_at = new Date().toISOString(); }
      data.last_updated = new Date().toISOString();
    });
    await excelLogger.appendAudit({ actor_name: payload.actor.name, actor_email: payload.actor.email, action: 'revert', source: 'voice', faq_id: payload.faqId, after_answer: payload.answer });
    return { type: 'executed', message: `Reverted successfully.` };
  }

  if (action === 'submit_suggestion') {
    return await saveSuggestion(payload.suggestion, payload.actor);
  }

  if (action === 'suggestion_approve') {
    const result = await approveSuggestion(payload.suggestionId, payload.actor);
    return { type: result.ok ? 'executed' : 'error', message: result.message };
  }

  if (action === 'suggestion_reject') {
    const result = await rejectSuggestion(payload.suggestionId, payload.actor, payload.reason);
    return { type: result.ok ? 'executed' : 'error', message: result.message };
  }

  return { type: 'error', message: 'Unknown pending action.' };
}

// ---------- suggestion save ----------

async function saveSuggestion(suggestion, actor) {
  const { admins } = fileStore.read('admins');
  await fileStore.update('suggestions', data => {
    suggestion.id = `S-${String(data.next_id).padStart(3, '0')}`;
    suggestion.created_at = new Date().toISOString();
    data.suggestions.push(suggestion);
    data.next_id++;
  });
  emailNotifier.sendSuggestionAlert(suggestion, admins).catch(console.error);
  teamsNotifier.notifyAdminsOfSuggestion(suggestion, admins).catch(console.error);
  return { type: 'executed', message: `Suggestion submitted as **${suggestion.id}**. You'll be notified when an admin reviews it.` };
}

function buildSuggestion(type, targetFaq, proposedAnswer, submitter, proposedQuestion = null) {
  return {
    id: null, // set on save
    type,
    submitted_by: { ...submitter, conversation_reference: null },
    target_faq_id: targetFaq?.id ?? null,
    target_question_snippet: targetFaq?.question ?? null,
    current_answer: targetFaq?.answer ?? null,
    proposed_question: proposedQuestion,
    proposed_answer: proposedAnswer,
    status: 'pending',
    created_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_reason: null,
    applied: false,
  };
}
