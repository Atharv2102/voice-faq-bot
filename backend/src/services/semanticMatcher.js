/**
 * Semantic rerank for FAQ matching.
 * Pipeline:
 *   1. Fuse.js returns top N candidates above a permissive threshold (handles
 *      typos and word-order variation cheaply).
 *   2. Claude reranks those candidates against the actual question to pick the
 *      semantically best match — or to say "none of these answer the question".
 *
 * Falls back gracefully when ANTHROPIC_API_KEY is missing: returns whatever
 * Fuse picked as best, applying the same confidence cutoff as before.
 */

import Anthropic from '@anthropic-ai/sdk';
import Fuse from 'fuse.js';

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODEL = process.env.ANTHROPIC_INTENT_MODEL || 'claude-haiku-4-5';

// Permissive — we want recall here; precision comes from the LLM rerank.
const FUSE_THRESHOLD = 0.6;
// If the top Fuse score is already strong, skip the LLM call (fast path).
const FUSE_FAST_PATH = 0.85;
// Minimum LLM confidence to accept the match.
const SEMANTIC_CUTOFF = 0.6;

const RERANK_SYSTEM = `You are a semantic matcher for an FAQ bot. The user asks a question, and you are given up to 5 candidate FAQs. Decide which (if any) actually answers the user's question.

Return strict JSON only — no prose, no markdown fences:
{ "best_index": <0-based index of the best FAQ, or null if none>, "confidence": <0.0 to 1.0> }

Rules:
- best_index = null when NONE of the candidates actually answer the user's question.
- Confidence reflects how well the chosen FAQ answers the question semantically.
- A paraphrase or synonym is a match (e.g. "office timings" ≈ "office hours", "kab khulta hai" ≈ "when does it open").
- A topically-related but different question is NOT a match (e.g. "office location" is not the same as "office hours").
- Use confidence >= 0.75 only when you are quite sure. Use 0.6–0.75 for plausible matches. Below 0.6 means reject.`;

/**
 * Get candidates from Fuse.
 */
function getCandidates(faqs, query, topN = 5) {
  const active = faqs.filter(f => f.active);
  if (!active.length) return [];
  const fuse = new Fuse(active, {
    keys: ['question', 'alternates'],
    threshold: FUSE_THRESHOLD,
    includeScore: true,
  });
  return fuse.search(query).slice(0, topN).map(r => ({
    faq: r.item,
    fuse_score: 1 - r.score, // higher is better
  }));
}

/**
 * Reranks Fuse candidates using Claude. Returns { faq, score } or null.
 * Falls back to top Fuse candidate when LLM is unavailable.
 */
export async function findBestMatchSemantic(faqs, query) {
  const candidates = getCandidates(faqs, query, 5);
  if (!candidates.length) return null;

  // Fast path: Fuse is already very confident. Skip LLM call.
  if (candidates[0].fuse_score >= FUSE_FAST_PATH) {
    return { faq: candidates[0].faq, score: candidates[0].fuse_score };
  }

  // No LLM available → behave like the old matcher.
  if (!client) {
    if (candidates[0].fuse_score < SEMANTIC_CUTOFF) return null;
    return { faq: candidates[0].faq, score: candidates[0].fuse_score };
  }

  try {
    const candidateList = candidates
      .map((c, i) => `${i}. "${c.faq.question}"`)
      .join('\n');

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: [
        {
          type: 'text',
          text: RERANK_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `User question: "${query}"\n\nCandidate FAQs:\n${candidateList}\n\nReturn JSON only.`,
        },
      ],
    });

    const raw = resp.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '');

    const parsed = JSON.parse(raw);
    const idx = parsed.best_index;
    const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

    console.log(
      `[semantic] "${query}" → idx=${idx} conf=${conf} ` +
      `(candidates: ${candidates.map(c => `${c.fuse_score.toFixed(2)}`).join(',')})`
    );

    if (idx === null || idx === undefined) return null;
    if (idx < 0 || idx >= candidates.length) return null;
    if (conf < SEMANTIC_CUTOFF) return null;
    return { faq: candidates[idx].faq, score: conf };
  } catch (err) {
    console.error('[semantic] error, falling back to Fuse:', err.message);
    if (candidates[0].fuse_score < SEMANTIC_CUTOFF) return null;
    return { faq: candidates[0].faq, score: candidates[0].fuse_score };
  }
}

/**
 * Always return top N for the "near matches" panel — uses Fuse only (cheap).
 */
export function getNearMatches(faqs, query, n = 3) {
  return getCandidates(faqs, query, n).map(c => ({ faq: c.faq, score: c.fuse_score }));
}
