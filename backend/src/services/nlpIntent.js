/**
 * LLM-based intent classifier (Anthropic Claude) — fallback when the regex
 * parser (intent.js) returns null. Lets users phrase commands informally.
 *
 * Returns the same shape as parseIntent(). If ANTHROPIC_API_KEY is missing,
 * returns { action: null } and the caller falls through to FAQ lookup.
 *
 * Uses prompt caching on the long, fixed system prompt — cuts cost and
 * latency on every call after the first.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_INTENT_MODEL || 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are an intent classifier for an FAQ bot. Read the user's message and decide which of these actions, if any, they want to take. Reply with JSON only — no prose, no markdown fences.

Possible actions and their required fields:

ADMIN ACTIONS (only meaningful if the user is an admin):
- "add"        { question, answer }            → create a new FAQ
- "update"     { target, newAnswer }           → change an existing FAQ's answer
- "delete"     { target }                      → remove a FAQ
- "disable"    { target }                      → hide a FAQ
- "enable"     { target }                      → un-hide a FAQ
- "list"       { topic? }                      → list FAQs (optionally filtered)
- "count"      {}                              → count FAQs
- "audit_recent"      {}                       → show recent changes
- "audit_by_actor"    { name }                 → show changes by a person
- "audit_by_time"     { period }               → period in {today,yesterday,this week,this month}
- "audit_by_topic"    { topic }                → show changes to a topic
- "audit_by_faq"      { target }               → who edited a specific FAQ
- "revert"            {}                       → undo last change
- "suggestions_pending"        {}              → list pending suggestions
- "suggestions_by_submitter"   { name }        → list suggestions by a person
- "suggestion_approve"         { id }          → approve suggestion (id like "S-001")
- "suggestion_reject"          { id }          → reject suggestion

USER ACTIONS (anyone):
- "suggest_update" { target, newAnswer }       → suggest changing an FAQ's answer
- "suggest_add"    { question, answer }        → suggest a new FAQ
- "suggest_report" { target }                  → flag a wrong/outdated answer
- "my_suggestions" {}                          → show user's own suggestions

META:
- "help"           {}                          → show command help
- "confirm"        {}                          → yes / confirm
- "cancel"         {}                          → no / cancel
- "pick"           { number }                  → user picked a numbered option (1-9)

If the message is a question the user wants answered (e.g. "what are the office hours"), DO NOT classify as a command — return { "action": null }.

Examples:
"hey can you add a question about the wifi password being guest2026"
→ {"action":"add","question":"wifi password","answer":"guest2026"}

"the wifi password should be changed to guest2026"
→ {"action":"suggest_update","target":"wifi password","newAnswer":"guest2026"}

"can you remove the parking faq"
→ {"action":"delete","target":"parking"}

"who changed the office hours lately"
→ {"action":"audit_by_faq","target":"office hours"}

"please approve suggestion 5"
→ {"action":"suggestion_approve","id":"S-005"}

"sure go ahead"
→ {"action":"confirm"}

"what time does the office open"
→ {"action":null}

Always return strict JSON with at minimum an "action" key. Be conservative — when in doubt, return {"action":null}.`;

export async function parseIntentNLP(text) {
  if (!client) return { action: null };
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: text }],
    });

    // Claude returns content as an array of blocks; we expect a single text block of JSON.
    const raw = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    // Strip any accidental code fences just in case.
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(json);

    if (!parsed.action) return { action: null };

    // Normalise suggestion IDs (e.g. "5" → "S-005", "S5" → "S-5")
    if (parsed.id && typeof parsed.id === 'string') {
      let s = parsed.id.toUpperCase().replace(/\s+/g, '');
      if (s.startsWith('S-')) parsed.id = s;
      else if (s.startsWith('S')) parsed.id = `S-${s.slice(1)}`;
      else parsed.id = `S-${s}`;
    }

    const usage = resp.usage ?? {};
    console.log(
      `[NLP intent] "${text}" → ${parsed.action}` +
        (usage.cache_read_input_tokens
          ? ` (cache hit: ${usage.cache_read_input_tokens}t)`
          : usage.cache_creation_input_tokens
          ? ` (cache write: ${usage.cache_creation_input_tokens}t)`
          : '')
    );
    return parsed;
  } catch (err) {
    console.error('[NLP intent] error:', err.message);
    return { action: null };
  }
}
