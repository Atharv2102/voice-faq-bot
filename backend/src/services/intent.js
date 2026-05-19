/**
 * Pure-function intent parser. First match wins. Case-insensitive.
 * Returns { action, ...fields } or { action: null }.
 */
export function parseIntent(text) {
  const t = text.trim();
  let m;

  // --- Admin FAQ management ---
  m = t.match(/^add question (.+?) answer (.+)$/i);
  if (m) return { action: 'add', question: m[1].trim(), answer: m[2].trim() };

  m = t.match(/^update answer for (.+?) to (.+)$/i);
  if (m) return { action: 'update', target: m[1].trim(), newAnswer: m[2].trim() };

  m = t.match(/^delete question (?:about )?(.+)$/i);
  if (m) return { action: 'delete', target: m[1].trim() };

  m = t.match(/^disable question (?:about )?(.+)$/i);
  if (m) return { action: 'disable', target: m[1].trim() };

  m = t.match(/^enable question (?:about )?(.+)$/i);
  if (m) return { action: 'enable', target: m[1].trim() };

  m = t.match(/^list questions(?: about (.+))?$/i);
  if (m) return { action: 'list', topic: m[1] ? m[1].trim() : null };

  m = t.match(/^how many questions(?: are there)?$/i);
  if (m) return { action: 'count' };

  // --- Audit retrieval (admin) ---
  m = t.match(/^show recent changes$/i);
  if (m) return { action: 'audit_recent' };

  m = t.match(/^show changes by (.+)$/i);
  if (m) return { action: 'audit_by_actor', name: m[1].trim() };

  m = t.match(/^show changes (today|yesterday|this week|this month)$/i);
  if (m) return { action: 'audit_by_time', period: m[1].toLowerCase() };

  m = t.match(/^show changes to (.+)$/i);
  if (m) return { action: 'audit_by_topic', topic: m[1].trim() };

  m = t.match(/^who edited (.+)$/i);
  if (m) return { action: 'audit_by_faq', target: m[1].trim() };

  m = t.match(/^revert last change$/i);
  if (m) return { action: 'revert' };

  // --- User suggestions ---
  // "suggest a change to <topic>: <new answer>"   (canonical, colon-separated)
  // "suggest change to <topic>: <new answer>"
  // "suggest update for <topic> to <new answer>"
  // "change <topic> to <new answer>"             (only if no admin action matched above)
  // "update <topic>: <new answer>"               (informal)
  m = t.match(/^suggest (?:a )?(?:change|update|edit) (?:to|for) (.+?)\s*[:\-]\s*(.+)$/i);
  if (m) return { action: 'suggest_update', target: m[1].trim(), newAnswer: m[2].trim() };

  m = t.match(/^suggest (?:a )?(?:change|update|edit) (?:to|for) (.+?)\s+to\s+(.+)$/i);
  if (m) return { action: 'suggest_update', target: m[1].trim(), newAnswer: m[2].trim() };

  // "suggest adding <Q> with answer <A>", also "suggest a new question <Q>: <A>"
  m = t.match(/^suggest (?:adding|add)\s+(.+?)\s+with answer\s+(.+)$/i);
  if (m) return { action: 'suggest_add', question: m[1].trim(), answer: m[2].trim() };

  m = t.match(/^suggest (?:a )?new (?:question|faq)\s+(.+?)\s*[:\-]\s*(.+)$/i);
  if (m) return { action: 'suggest_add', question: m[1].trim(), answer: m[2].trim() };

  m = t.match(/^(?:report|flag) (?:wrong|incorrect|bad) (?:answer )?(?:for|on|about) (.+)$/i);
  if (m) return { action: 'suggest_report', target: m[1].trim() };

  m = t.match(/^(?:the )?answer (?:about |for |to )?(.+?) is (?:outdated|wrong|incorrect|stale)$/i);
  if (m) return { action: 'suggest_report', target: m[1].trim() };

  m = t.match(/^(?:my|show my) suggestions$/i);
  if (m) return { action: 'my_suggestions' };

  // --- Suggestion management (admin) ---
  m = t.match(/^show pending suggestions$/i);
  if (m) return { action: 'suggestions_pending' };

  m = t.match(/^show suggestions by (.+)$/i);
  if (m) return { action: 'suggestions_by_submitter', name: m[1].trim() };

  // Tolerant suggestion ID: "S-042", "S 042", "s zero forty two", etc.
  m = t.match(/^approve suggestion (.+)$/i);
  if (m) return { action: 'suggestion_approve', id: normalizeSuggestionId(m[1]) };

  m = t.match(/^reject suggestion (.+)$/i);
  if (m) return { action: 'suggestion_reject', id: normalizeSuggestionId(m[1]) };

  // --- Account linking ---
  // "link 123456" or "link account 123456" — connects this Teams user to a web admin account.
  m = t.match(/^link(?:\s+account)?\s+(\d{4,8})$/i);
  if (m) return { action: 'link_account', code: m[1] };

  // --- Meta ---
  m = t.match(/^help$/i);
  if (m) return { action: 'help' };

  m = t.match(/^(yes|confirm|confirmed|ok|okay|yeah|yep|sure)$/i);
  if (m) return { action: 'confirm' };

  m = t.match(/^(no|cancel|nevermind|never mind|nope|nah)$/i);
  if (m) return { action: 'cancel' };

  // Number response for disambiguation (1–9)
  m = t.match(/^([1-9])$/);
  if (m) return { action: 'pick', number: parseInt(m[1]) };

  return { action: null };
}

const WORD_NUMS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

function normalizeSuggestionId(raw) {
  // Replace word numbers, remove spaces, ensure S- prefix
  let s = raw.toLowerCase();
  for (const [word, digit] of Object.entries(WORD_NUMS)) s = s.replace(new RegExp(word, 'g'), digit);
  s = s.replace(/\s+/g, '');
  if (s.startsWith('s-')) return `S-${s.slice(2)}`;
  if (s.startsWith('s')) return `S-${s.slice(1)}`;
  return `S-${s}`;
}
