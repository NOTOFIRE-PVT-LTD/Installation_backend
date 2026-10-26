const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  findDuplicateMatches,
  gstinLooksValid,
  normalizeCompanyName,
  normalizeGstin,
  normalizePhone,
} = require('./customerNormalize');

describe('customerNormalize', () => {
  it('normalizes company names', () => {
    assert.equal(normalizeCompanyName('  ABC   Pvt. Ltd '), 'abc pvt ltd');
  });

  it('normalizes Indian phone numbers', () => {
    assert.equal(normalizePhone('+91 98765 43210'), '9876543210');
    assert.equal(normalizePhone('09876543210'), '9876543210');
  });

  it('validates GSTIN format', () => {
    assert.equal(normalizeGstin(' 27abcde1234f1z5 '), '27ABCDE1234F1Z5');
    assert.equal(gstinLooksValid('27ABCDE1234F1Z5'), true);
    assert.equal(gstinLooksValid('bad'), false);
  });

  it('matches duplicates by GSTIN, then phone, then name+city', () => {
    const existing = [
      {
        _id: '1',
        companyName: 'ABC Company',
        city: 'Pune',
        phone: '9876543210',
        phoneNormalized: '9876543210',
        gstin: '27ABCDE1234F1Z5',
        gstinNormalized: '27ABCDE1234F1Z5',
        normalizedCompanyName: 'abc company',
      },
    ];
    assert.equal(
      findDuplicateMatches({ companyName: 'Other', city: 'Mumbai', phone: '', gstin: '27ABCDE1234F1Z5' }, existing)[0]
        ?.matchType,
      'GSTIN'
    );
    assert.equal(
      findDuplicateMatches({ companyName: 'Other', city: 'Mumbai', phone: '9876543210', gstin: '' }, existing)[0]
        ?.matchType,
      'PHONE'
    );
    assert.equal(
      findDuplicateMatches({ companyName: 'ABC Company', city: 'Pune', phone: '', gstin: '' }, existing)[0]?.matchType,
      'NAME_CITY'
    );
  });
});
