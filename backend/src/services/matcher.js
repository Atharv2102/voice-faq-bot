import Fuse from 'fuse.js';

const FUSE_THRESHOLD = 0.4;
const CONFIDENCE_CUTOFF = 0.6;

/**
 * Find best matching active FAQ for a query.
 * Returns { faq, score } or null if below confidence cutoff.
 */
export function findBestMatch(faqs, query) {
  const active = faqs.filter(f => f.active);
  if (!active.length) return null;

  const fuse = new Fuse(active, {
    keys: ['question', 'alternates'],
    threshold: FUSE_THRESHOLD,
    includeScore: true,
  });

  const results = fuse.search(query);
  if (!results.length) return null;

  const top = results[0];
  const confidence = 1 - top.score;
  if (confidence < CONFIDENCE_CUTOFF) return null;

  return { faq: top.item, score: confidence };
}

/**
 * Return top N matches above a lower threshold — used for disambiguation.
 */
export function findTopMatches(faqs, query, n = 3) {
  const fuse = new Fuse(faqs, {
    keys: ['question', 'alternates'],
    threshold: 0.6,
    includeScore: true,
  });
  return fuse.search(query).slice(0, n).map(r => ({ faq: r.item, score: 1 - r.score }));
}
