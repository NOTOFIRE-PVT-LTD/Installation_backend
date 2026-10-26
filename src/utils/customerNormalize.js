function normalizeCompanyName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function normalizeGstin(gstin) {
  const value = String(gstin || '').replace(/\s/g, '').toUpperCase();
  return value || null;
}

function gstinLooksValid(gstin) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
}

function findDuplicateMatches(input, existing) {
  const company = normalizeCompanyName(input.companyName);
  const city = String(input.city || '').trim().toLowerCase();
  const phone = input.phone ? normalizePhone(input.phone) : '';
  const gstin = input.gstin ? normalizeGstin(input.gstin) : null;
  const matches = [];

  for (const row of existing) {
    if (gstin && row.gstinNormalized === gstin) {
      matches.push({ ...serializeMatch(row), matchType: 'GSTIN' });
      continue;
    }
    if (phone && row.phoneNormalized === phone) {
      matches.push({ ...serializeMatch(row), matchType: 'PHONE' });
      continue;
    }
    if (
      company &&
      city &&
      row.normalizedCompanyName === company &&
      String(row.city || '')
        .trim()
        .toLowerCase() === city
    ) {
      matches.push({ ...serializeMatch(row), matchType: 'NAME_CITY' });
    }
  }

  return matches;
}

function serializeMatch(row) {
  return {
    _id: row._id,
    companyName: row.companyName,
    city: row.city || null,
    phone: row.phone || null,
    gstin: row.gstin || null,
  };
}

module.exports = {
  normalizeCompanyName,
  normalizePhone,
  normalizeGstin,
  gstinLooksValid,
  findDuplicateMatches,
};
