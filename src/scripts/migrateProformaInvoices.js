
require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const ProformaInvoice = require('../models/ProformaInvoice.model');
const Quotation = require('../models/Quotation.model');
const QuotationMaster = require('../models/QuotationMaster.model');

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = typeof value === 'string'
      ? JSON.parse(value)
      : value;

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error('Invalid items JSON');
  }
}

function getPISequence(piNumber) {
  const match = String(piNumber || '').match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function getFiscalYear(piNumber) {
  const match = String(piNumber || '').match(/(\d{4}-\d{2})/);
  return match ? match[1] : '';
}

function getCompanyCode(sellerCompany) {
  const value = String(sellerCompany || '').toLowerCase();

  if (value.includes('valuecon') || value.startsWith('vc/')) {
    return 'VC';
  }

  if (value.includes('notofire') || value.startsWith('nf/')) {
    return 'NF';
  }

  return value.toUpperCase();
}

async function migrateProformaInvoices() {
  let supabaseClient;

  try {
    if (!process.env.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is missing in .env');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing in .env');
    }

    console.log('Connecting to Supabase...');

    supabaseClient = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
    });

    await supabaseClient.connect();
    console.log('✓ Supabase connected');

    const result = await supabaseClient.query(`
      SELECT *
      FROM public.proforma_invoices
      ORDER BY created_at ASC
    `);

    const invoices = result.rows;
    console.log(`✓ Found ${invoices.length} PI records`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected');

    let inserted = 0;
    let updated = 0;
    let failed = 0;
    let missingQuotations = 0;
    let missingCompanies = 0;

    for (let i = 0; i < invoices.length; i++) {
      const pi = invoices[i];

      try {
        if (!pi.pi_number?.trim()) {
          throw new Error('PI number is missing');
        }

        const sourceItems = parseItems(pi.items);

        const items = sourceItems.map((item) => ({
          description: item.description || '',
          modelNo: item.modelNo || '',
          qty: Math.max(0, asNumber(item.boqQty, 1)),
          unit: item.unit || 'Nos',
          rate: Math.max(0, asNumber(item.basicUnitRate)),
          amount: Math.max(0, asNumber(item.basicAmount)),
        }));

        const totalExGst = items.reduce(
          (sum, item) => sum + item.amount,
          0
        );

        const freight = Math.max(0, asNumber(pi.freight));
        const gstRate = Math.max(0, asNumber(pi.gst_percent, 18));

        // Calculate totals because the Supabase PI table
        // does not have separate total columns.
        const taxableAmount = totalExGst + freight;
        const gstAmount = taxableAmount * gstRate / 100;
        const netAmount = taxableAmount + gstAmount;

        // Resolve the linked quotation by its original Supabase ID.
        let quotationSnapshot = {
          ref: null,
          quotationNo: '',
        };

        if (pi.quotation_id) {
          const quotation = await Quotation.findOne({
            legacySupabaseId: pi.quotation_id,
          }).select('_id quotationNo').lean();

          if (quotation) {
            quotationSnapshot = {
              ref: quotation._id,
              quotationNo: quotation.quotationNo || '',
            };
          } else {
            missingQuotations++;
            console.warn(
              `   ⚠ Quotation not found for PI ${pi.pi_number}: ${pi.quotation_id}`
            );
          }
        }

        // Resolve seller company using the seller_company field.
        const seller = String(pi.seller_company || '').toLowerCase();

        let companyMaster = null;

        if (seller.includes('valuecon') || seller.startsWith('vc/')) {
          companyMaster = await QuotationMaster.findOne({
            kind: 'company',
            name: /valuecon/i,
          }).lean();
        } else if (
          seller.includes('notofire') ||
          seller.startsWith('nf/')
        ) {
          companyMaster = await QuotationMaster.findOne({
            kind: 'company',
            name: /notofire/i,
          }).lean();
        }

        if (!companyMaster) {
          missingCompanies++;
          console.warn(
            `   ⚠ Seller company not found for PI ${pi.pi_number}: ${pi.seller_company}`
          );
        }

        const company = {
          ref: companyMaster?._id || null,
          name: companyMaster?.name || pi.seller_company || '',
          gstin: companyMaster?.gstin || pi.gst_number || '',
          phone: companyMaster?.phone || '',
          email: pi.email || companyMaster?.email || '',
          address: companyMaster?.address || '',
        };

        // Customer details are stored directly on the PI in Supabase.
        const party = {
          ref: null,
          name: pi.to_name || '',
          gstin: pi.to_gst || '',
        };

        const mongoPI = {
          legacySupabaseId: pi.id,
          piNumber: pi.pi_number.trim(),
          companyCode: getCompanyCode(pi.seller_company),
          fiscalYear: getFiscalYear(pi.pi_number),
          seq: getPISequence(pi.pi_number),
          piDate: pi.pi_date ? new Date(pi.pi_date) : new Date(),
          template: 'standard',

          company,
          party,

          poNumber: pi.po_number || '',
          deliveryAddress: pi.delivery_address || '',
          quotation: quotationSnapshot,
          items,

          freight,
          gstRate,
          totalExGst,
          gstAmount,
          totalAmount: taxableAmount,
          netAmount,

          terms: pi.terms_and_conditions || '',

          bank: {
            accountName: pi.bank_account_name || '',
            accountNo: pi.bank_account_no || '',
            bankName: pi.bank_name || '',
            ifsc: pi.bank_ifsc || '',
            branch: pi.bank_branch || '',
          },

          preparedBy: pi.prepared_by || '',
          checkedBy: pi.checked_by || '',
          kindAttention: pi.kindly_attention || '',
          remarks: pi.any_remarks || '',
          email: pi.email || '',
          inspectionAuthority: pi.inspection_authority || '',

          // Supabase user UUIDs aren't MongoDB ObjectIds.
          createdBy: null,
          updatedBy: null,

          createdAt: pi.created_at
            ? new Date(pi.created_at)
            : new Date(),
          updatedAt: pi.updated_at
            ? new Date(pi.updated_at)
            : new Date(),
        };

        // Idempotent migration: update by original Supabase ID.
        const existing = await ProformaInvoice.findOne({
          legacySupabaseId: pi.id,
        }).select('_id').lean();

        if (existing) {
          await ProformaInvoice.updateOne(
            { _id: existing._id },
            { $set: mongoPI }
          );
          updated++;
        } else {
          // Prevent overwriting a manually created invoice with
          // a different Supabase ID but the same PI number.
          const sameNumber = await ProformaInvoice.findOne({
            piNumber: mongoPI.piNumber,
          }).select('_id legacySupabaseId').lean();

          if (sameNumber) {
            throw new Error(
              `PI number already exists with another ID: ${mongoPI.piNumber}`
            );
          }

          await ProformaInvoice.create(mongoPI);
          inserted++;
        }

        console.log(
          `[${i + 1}/${invoices.length}] ✓ ${pi.pi_number}`
        );
      } catch (error) {
        failed++;
        console.error(
          `[${i + 1}/${invoices.length}] ✗ ${pi.pi_number || pi.id}: ${error.message}`
        );
      }
    }

    console.log('\n======================================');
    console.log('  PROFORMA INVOICE MIGRATION COMPLETE');
    console.log('======================================');
    console.log(`Supabase PI records : ${invoices.length}`);
    console.log(`Inserted            : ${inserted}`);
    console.log(`Updated             : ${updated}`);
    console.log(`Failed              : ${failed}`);
    console.log(`Missing quotations  : ${missingQuotations}`);
    console.log(`Missing companies   : ${missingCompanies}`);
    console.log(
      `MongoDB PI records  : ${await ProformaInvoice.countDocuments()}`
    );
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
  } finally {
    if (supabaseClient) {
      await supabaseClient.end().catch(() => {});
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log('Connections closed.');
  }
}

migrateProformaInvoices();
