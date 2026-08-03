const mongoose = require('mongoose');

const { Schema } = mongoose;

const BG_TYPES = ['Physical BG', 'FCY BG', 'e-BG', 'GEM BG'];
const APPLICATION_TYPES = ['Fresh Issuance', 'Amendment'];
const BG_NATURES = [
  'Financial Guarantee',
  'Performance Guarantee',
  'Deferred Payment Guarantee',
  'Advance Payment Guarantee',
  'Others',
];

const bgApplicationSchema = new Schema(
  {
    // Top of form
    accountNumber: { type: String, default: '', trim: true },
    branchCode: { type: String, default: '', trim: true },
    branchName: { type: String, default: '', trim: true },

    // 1. Type of Application
    typeOfApplication: { type: String, enum: [...APPLICATION_TYPES, ''], default: '' },
    amendmentExistingGuaranteeNumber: { type: String, default: '', trim: true },

    // 2. Applicant Details
    applicantNameAddress: { type: String, required: true, trim: true },
    applicantContactPersonMobile: { type: String, default: '', trim: true },
    applicantPan: { type: String, default: '', trim: true },
    applicantDateOfIncorporation: { type: Date, default: null },
    applicantLeiCode: { type: String, default: '', trim: true },
    applicantEmail: { type: String, default: '', trim: true },
    applicantRegisteredAddress: { type: String, default: '', trim: true },

    // 3. Nature of Bank Guarantee
    natureOfBankGuarantee: { type: String, enum: [...BG_NATURES, ''], default: '' },

    // 4. Type of BG
    typeOfBG: { type: String, enum: [...BG_TYPES, ''], default: '' },

    // 5. Details of Bank Guarantee
    purpose: { type: String, default: '', trim: true },
    bgAmountFigures: { type: String, default: '', trim: true },
    bgAmountWords: { type: String, default: '', trim: true },
    expiryDate: { type: Date, default: null },
    claimExpiryDate: { type: Date, default: null },
    bgTenorMonths: { type: Number, min: 0, default: 0 },
    bgTenorDays: { type: Number, min: 0, default: 0 },

    // 6. Beneficiary Details
    beneficiaryNameAddress: { type: String, required: true, trim: true },
    beneficiaryContactPersonMobile: { type: String, default: '', trim: true },
    beneficiaryEmail: { type: String, default: '', trim: true },
    beneficiaryGstNumber: { type: String, default: '', trim: true },
    beneficiaryPan: { type: String, default: '', trim: true },
    beneficiaryDateOfIncorporation: { type: Date, default: null },
    beneficiaryLeiCode: { type: String, default: '', trim: true },

    // 7. Beneficiary Bank Details for SFMS
    beneficiaryBankNameAddress: { type: String, default: '', trim: true },
    beneficiaryBankIfscSwift: { type: String, default: '', trim: true },

    // 8. Advising Bank Details
    advisingBankNameAddress: { type: String, default: '', trim: true },
    advisingBankIfscSwift: { type: String, default: '', trim: true },

    // 9. Margin Details
    marginFdNo: { type: String, default: '', trim: true },
    marginFdAmount: { type: Number, min: 0, default: 0 },
    marginOther: { type: String, default: '', trim: true },
    marginNewFdDebitAccount: { type: String, default: '', trim: true },
    marginNewFdAmount: { type: Number, min: 0, default: 0 },

    // 11. General Declaration — inline blanks
    claimDebitAccountNumber: { type: String, default: '', trim: true },
    delayedPaymentInterestPercent: { type: Number, min: 0, default: 0 },
    declarationDate: { type: Date, default: null },

    // Details of documents enclosed
    documentsContractAgreementCopy: { type: Boolean, default: false },
    documentsBankGuaranteeText: { type: Boolean, default: false },
    documentsCounterGuarantee: { type: Boolean, default: false },
    documentsOther: { type: Boolean, default: false },
    otherDocumentsSpecify: { type: String, default: '', trim: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

bgApplicationSchema.index({ applicantNameAddress: 'text', beneficiaryNameAddress: 'text', natureOfBankGuarantee: 'text' });

module.exports = mongoose.model('BgApplication', bgApplicationSchema);
module.exports.BG_TYPES = BG_TYPES;
module.exports.APPLICATION_TYPES = APPLICATION_TYPES;
module.exports.BG_NATURES = BG_NATURES;
