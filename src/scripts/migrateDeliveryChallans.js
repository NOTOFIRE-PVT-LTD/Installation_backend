
require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const DeliveryChallan = require('../models/DeliveryChallan.model');
const QuotationMaster = require('../models/QuotationMaster.model');

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const MONGODB_URI = process.env.MONGODB_URI;

function toText(value) {
  return value == null ? '' : String(value).trim();
}

function toNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;

  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDate(value, fallback = new Date()) {
  if (!value) return fallback;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseChallanNumber(dcNumber) {
  const value = toText(dcNumber);
  const match = value.match(/^(.*\/)(\d+)$/);

  if (!match) {
    return { series: '', seq: null };
  }

  return {
    series: match[1].slice(0, -1),
    seq: Number(match[2]),
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    name: toText(item.name),
    hsnCode: toText(item.hsnCode ?? item.hsn_code),
    qty: toNumber(item.qty ?? item.quantity),
    uom: toText(item.uom ?? item.unit) || 'Nos',
    rate: toNumber(item.rate),
    value: toNumber(item.value),
    serialNumber: toText(item.serialNumber ?? item.serial_number),
  }));
}

function normalizeAttachments(attachments, dcNumber) {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .filter((attachment) => {
      if (attachment && attachment.url) return true;

      console.warn(
        `Skipping attachment without URL in challan ${dcNumber}`
      );
      return false;
    })
    .map((attachment) => ({
      url: toText(attachment.url),
      name: toText(attachment.name),
      type: toText(attachment.type),
      size: toNumber(attachment.size),
      publicId: toText(attachment.publicId ?? attachment.public_id),
      resourceType: toText(
        attachment.resourceType ?? attachment.resource_type
      ),
    }));
}

async function findCompany(sellerCompany) {
  const seller = toText(sellerCompany).toLowerCase();

  if (!seller) return null;

  const companyAliases = {
    notofire: /notofire/i,
    valuecon: /valuecon/i,
  };

  const namePattern = companyAliases[seller];
  if (!namePattern) {
    console.warn(`Unknown seller_company: ${sellerCompany}`);
    return null;
  }

  return QuotationMaster.findOne({
    kind: 'company',
    name: namePattern,
  }).lean();
}

async function main() {
  if (!SUPABASE_DB_URL || !MONGODB_URI) {
    throw new Error(
      'Missing SUPABASE_DB_URL or MONGODB_URI in your .env file.'
    );
  }

  const pg = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let missingCompanies = 0;
  let skippedAttachments = 0;

  try {
    await mongoose.connect(MONGODB_URI);
    await pg.connect();

    console.log('Connected to Supabase and MongoDB.');

    const { rows } = await pg.query(`
      SELECT *
      FROM public.delivery_challans
      ORDER BY created_at ASC
    `);

    console.log(`Supabase delivery challans found: ${rows.length}`);

    for (const dc of rows) {
      try {
        if (!dc.id) {
          throw new Error('Record has no Supabase ID.');
        }

        const dcNumber = toText(dc.dc_number);

        if (!dcNumber) {
          throw new Error(`Missing dc_number for Supabase ID ${dc.id}`);
        }

        const companyMaster = await findCompany(dc.seller_company);

        if (!companyMaster) {
          missingCompanies++;
        }

        const items = normalizeItems(dc.items);
        const attachments = normalizeAttachments(
          dc.attachments,
          dcNumber
        );

        const sourceAttachments = Array.isArray(dc.attachments)
          ? dc.attachments.length
          : 0;

        skippedAttachments += sourceAttachments - attachments.length;

        const parsedNumber = parseChallanNumber(dcNumber);

        const totalValue = items.reduce(
          (sum, item) => sum + item.value,
          0
        );

        const data = {
          legacySupabaseId: String(dc.id),
          dcNumber,
          series: parsedNumber.series,
          seq: parsedNumber.seq,
          dcDate: toDate(dc.dc_date),

          company: {
            ref: companyMaster?._id ?? null,
            name: companyMaster?.name || toText(dc.seller_company),
            code: toText(dc.seller_company).toLowerCase(),
            gstin: toText(companyMaster?.gstin ?? dc.gst_number),
            cin: companyMaster?.cin || '',
            phone: toText(companyMaster?.phone),
            email: toText(companyMaster?.email),
            address: toText(companyMaster?.address),
          },
          sellerCompany: toText(dc.seller_company).toLowerCase(),

          receiverName: toText(dc.receiver_name),
          receiverNumber: toText(dc.receiver_number),

          recipient: {
            ref: null,
            name: toText(dc.to_name),
            gstin: toText(dc.to_gst),
            address: toText(dc.to_address),
          },

          placeOfSupply: toText(dc.place_of_supply),
          deliveryAddress: toText(dc.delivery_address),
          items,
          totalValue,
          amountInWords: toText(dc.amount_in_words),
          rateOfTax: toText(dc.rate_of_tax) || 'GST not applicable',
          taxAmount: toNumber(dc.tax_amount),
          modeOfDispatch: toText(dc.mode_of_dispatch),
          vehicleTransporter: toText(dc.vehicle_transporter),
          expectedDuration: toText(dc.expected_duration),
          originalInvoiceRef: toText(dc.original_invoice_ref),
          panelNo: toText(dc.pannel_no),
          complaintNo: toText(dc.complaint_no),
          fault: toText(dc.fault),
          approvedBy: toText(dc.approved_by),
          requestedBy: toText(dc.requested_by),
          notes: toText(dc.notes),
          attachments,

          // Supabase Auth UUIDs are not MongoDB ObjectIds.
          // Resolve users separately if you need user references.
          createdBy: null,
          updatedBy: null,

          createdAt: toDate(dc.created_at),
          updatedAt: toDate(dc.updated_at, toDate(dc.created_at)),
        };

        // First match by original Supabase ID.
        let existing = await DeliveryChallan.findOne({
          legacySupabaseId: String(dc.id),
        }).select('_id');

        // Adopt a matching manually-created MongoDB record if its
        // challan number already exists without a legacy Supabase ID.
        if (!existing) {
          existing = await DeliveryChallan.findOne({
            dcNumber,
          }).select('_id legacySupabaseId');

          if (
            existing &&
            existing.legacySupabaseId &&
            existing.legacySupabaseId !== String(dc.id)
          ) {
            throw new Error(
              `dcNumber ${dcNumber} belongs to another Supabase ID`
            );
          }
        }

        if (
            existing &&
            existing.legacySupabaseId &&
            existing.legacySupabaseId !== String(dc.id)
          ) {
            console.log({
              dcNumber,
              supabaseId: String(dc.id),
              existingMongoId: String(existing._id),
              existingLegacySupabaseId: existing.legacySupabaseId,
            });
          
            throw new Error(
              `dcNumber ${dcNumber} belongs to another Supabase ID`
            );
          }
          
        if (existing) {
          await DeliveryChallan.updateOne(
            { _id: existing._id },
            { $set: data },
            { runValidators: true }
          );
          updated++;
        } else {
          await DeliveryChallan.create(data);
          inserted++;
        }

        if ((inserted + updated) % 25 === 0) {
          console.log(
            `Processed ${inserted + updated}/${rows.length}`
          );
        }
      } catch (error) {
        failed++;
        console.error(
          `Failed challan ${dc.dc_number || dc.id}: ${error.message}`
        );
      }
    }

    const mongoCount = await DeliveryChallan.countDocuments();

    console.log('\n========== MIGRATION SUMMARY ==========');
    console.log(`Supabase records : ${rows.length}`);
    console.log(`Inserted         : ${inserted}`);
    console.log(`Updated          : ${updated}`);
    console.log(`Failed           : ${failed}`);
    console.log(`Missing companies: ${missingCompanies}`);
    console.log(`Skipped attachments: ${skippedAttachments}`);
    console.log(`MongoDB DC count : ${mongoCount}`);
    console.log('=======================================');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pg.end().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
