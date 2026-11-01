"use strict";

/**
 * Pragmatic email check. Deliberately conservative: it rejects whitespace,
 * quotes, shell-significant characters and a leading "-" (which WP-CLI
 * could mistake for a flag).
 *
 * @param {string} input
 * @returns {boolean}
 */
const EMAIL_RE =
  /^[^\s@<>()[\]\\,;:"'`$&|*?!{}-][^\s@<>()[\]\\,;:"'`$&|*?!{}]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

function isValidEmail(input) {
  return typeof input === "string" && input.length <= 254 && EMAIL_RE.test(input);
}

/**
 * Maps over items with at most `limit` workers running at once.
 * Results keep the same order as the input. The worker should handle its
 * own errors; a thrown error aborts the whole run.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }
  );

  await Promise.all(runners);
  return results;
}

module.exports = { isValidEmail, mapWithConcurrency };
