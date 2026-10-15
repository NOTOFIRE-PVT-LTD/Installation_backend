const NAME_STOP_WORDS = new Set([
  'M/S',
  'MS',
  'PVT',
  'PRIVATE',
  'LTD',
  'LIMITED',
  'LLP',
  'CO',
  'COMPANY',
  'AND',
  '&',
  'OF',
  'THE',
]);

function text(value) {
  return String(value ?? '').trim();
}

/** Indian financial year (April-March): "2026-27", or "26-27" with { short: true }. */
function fiscalYearOf(date, { short = false } = {}) {
  const d = date ? new Date(date) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const start = valid.getMonth() >= 3 ? valid.getFullYear() : valid.getFullYear() - 1;
  const end = String((start + 1) % 100).padStart(2, '0');
  return short ? `${String(start % 100).padStart(2, '0')}-${end}` : `${start}-${end}`;
}

function initials(name, maxLength = 6) {
  const words = text(name)
    .replace(/[^A-Za-z0-9&/\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !NAME_STOP_WORDS.has(word.toUpperCase()));
  return words
    .map((word) => word[0].toUpperCase())
    .join('')
    .slice(0, maxLength);
}

/** Single-word names: first letter + first consonant of the second half (NOTOFIRE -> NF, VALUECON -> VC). */
function singleWordCode(word) {
  const upper = word.toUpperCase();
  const consonant = upper.slice(Math.ceil(upper.length / 2)).match(/[B-DF-HJ-NP-TV-Z]/);
  return consonant ? `${upper[0]}${consonant[0]}` : upper.slice(0, 2);
}

/** Document prefix for a seller company: its saved code (e.g. NF) or one derived from its name. */
function companyCodeOf(company, fallback = 'PI') {
  const saved = text(company?.code).toUpperCase();
  if (saved) return saved;
  const derived = initials(company?.name, 4);
  if (derived.length === 1) {
    const word = text(company.name)
      .split(/\s+/)
      .find((w) => !NAME_STOP_WORDS.has(w.toUpperCase()));
    return singleWordCode(word || derived);
  }
  return derived || fallback;
}

module.exports = { fiscalYearOf, initials, companyCodeOf };
