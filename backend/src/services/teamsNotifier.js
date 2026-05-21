/**
 * Push a proactive Teams DM to a user via the bot's /api/proactive endpoint.
 * Fails silently — Teams DM is best-effort and must never block the flow.
 */
import axios from 'axios';

const BOT_URL = process.env.BOT_URL || 'http://localhost:3978';
const SECRET  = () => process.env.BOT_PROACTIVE_SECRET;

export async function notifyUser(teamsUserId, message) {
  if (!teamsUserId || !message) return;
  try {
    await axios.post(`${BOT_URL}/api/proactive`, {
      teamsUserId,
      message,
      secret: SECRET(),
    }, { timeout: 5000 });
  } catch (err) {
    console.warn(`[teamsNotifier] DM to ${teamsUserId} failed:`, err.response?.data?.error || err.message);
  }
}

/**
 * Notify all admins of a new suggestion. Admins without a linked Teams ID
 * are skipped (they'll still get the email).
 */
export async function notifyAdminsOfSuggestion(suggestion, admins) {
  const targets = admins.filter(a =>
    a.active &&
    a.notifications_enabled &&
    a.teams_user_id &&
    (a.role || 'admin').toLowerCase() === 'admin'
  );

  const submitter = suggestion.submitted_by?.name || 'A user';
  const target    = suggestion.target_question_snippet || suggestion.proposed_question || '—';
  const proposed  = suggestion.proposed_answer ? `\n**Proposed:** "${suggestion.proposed_answer}"` : '';
  const current   = suggestion.current_answer ? `\n**Current:** "${suggestion.current_answer}"` : '';

  const text =
    `📋 **New suggestion ${suggestion.id}** from **${submitter}**\n` +
    `**Type:** ${suggestion.type}\n` +
    `**FAQ:** "${target}"${current}${proposed}\n\n` +
    `Reply \`approve suggestion ${suggestion.id}\` or \`reject suggestion ${suggestion.id}\` to act on it, or open the admin panel.`;

  await Promise.all(targets.map(a => notifyUser(a.teams_user_id, text)));
}
