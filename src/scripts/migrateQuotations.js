require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const Quotation = require('../models/Quotation.model');
const QuotationProduct = require('../models/QuotationProduct.model');
const QuotationMaster = require('../models/QuotationMaster.model');

function text(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function num(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    throw new Error(`Invalid number: ${value}`);
  }

  return number;
}

/**
 * Parse quotation numbers such as:
 *
 * QT-0054-25
 * QT-0054-25-R2
 * QT-0623-26A
 * QT-0623-26B
 */
function parseQuotationNumber(quotationNumber) {
  const value = text(quotationNumber);

  const match = value.match(
    /^QT-(\d+)-(\d{2})(?:-(R\d+)|([A-Z]))?$/
  );

  if (!match) {
    throw new Error(
      `Unsupported quotation number format: ${value}`
    );
  }

  const seq = Number(match[1]);
  const shortYear = Number(match[2]);

  // Convert 25 → 2025 and 26 → 2026.
  const seqYear = 2000 + shortYear;

  const quotationSuffix = match[3] || match[4] || '';

  return {
    seq,
    seqYear,
    quotationSuffix,
  };
}

async function migrateQuotations() {
  let supabaseClient;

  try {
    console.log('======================================');
    console.log('  QUOTATIONS MIGRATION');
    console.log('  Supabase → MongoDB');
    console.log('======================================');

    if (!process.env.SUPABASE_DB_URL) {
      throw new Error(
        'SUPABASE_DB_URL is missing in .env'
      );
    }

    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is missing in .env'
      );
    }

    // -----------------------------------
    // Connect to Supabase
    // -----------------------------------

    console.log('\nConnecting to Supabase...');

    supabaseClient = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    await supabaseClient.connect();

    console.log('✓ Connected to Supabase');

    // -----------------------------------
    // Fetch quotations
    // -----------------------------------

    console.log('\nFetching quotations...');

    const quotationResult =
      await supabaseClient.query(`
        SELECT
          id,
          quotation_number,
          company_id,
          party_id,
          terms_id,
          salesperson,
          subtotal,
          discount_percent,
          discount_amount,
          gst_percent,
          gst_amount,
          packing_freight,
          total_amount,
          status,
          version,
          original_quotation_id,
          notes,
          created_at,
          updated_at,
          prepared_by,
          sent_date,
          follow_up_required,
          last_reminder_sent,
          reminder_count,
          po_status,
          po_not_received_remarks,
          technical_checked_by,
          checked_by,
          created_by,
          deleted_at,
          is_deleted,
          project_name
        FROM public.quotations
        ORDER BY created_at ASC
      `);

    const quotations = quotationResult.rows;

    console.log(
      `✓ Found ${quotations.length} quotations`
    );

    if (quotations.length === 0) {
      console.log(
        'No quotations found. Nothing to migrate.'
      );
      return;
    }

    // -----------------------------------
    // Fetch quotation items
    // -----------------------------------

    console.log('\nFetching quotation items...');

    const itemResult =
      await supabaseClient.query(`
        SELECT
          id,
          quotation_id,
          product_id,
          model_no,
          description,
          quantity,
          price_per_unit,
          total_price,
          serial_number,
          created_at,
          updated_at,
          unit,
          serial_type
        FROM public.quotation_items
        ORDER BY created_at ASC
      `);

    const quotationItems = itemResult.rows;

    console.log(
      `✓ Found ${quotationItems.length} quotation items`
    );

    // -----------------------------------
    // Group items by quotation
    // -----------------------------------

    const itemsByQuotation = new Map();

    for (const item of quotationItems) {
      const quotationId = text(item.quotation_id);

      if (!itemsByQuotation.has(quotationId)) {
        itemsByQuotation.set(quotationId, []);
      }

      itemsByQuotation.get(quotationId).push(item);
    }

    // -----------------------------------
    // Connect MongoDB
    // -----------------------------------

    console.log('\nConnecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('✓ Connected to MongoDB');

    // -----------------------------------
    // Migration
    // -----------------------------------

    console.log('\nStarting migration...\n');

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    let totalItemsMigrated = 0;

    for (let i = 0; i < quotations.length; i++) {
      const quotation = quotations[i];

      try {
        const quotationId = text(quotation.id);

        const quotationNo =
          text(quotation.quotation_number);

        if (!quotationNo) {
          throw new Error(
            'Quotation number is empty'
          );
        }

        // -----------------------------------
        // Parse quotation number
        // -----------------------------------

        const {
          seq,
          seqYear,
          quotationSuffix,
        } = parseQuotationNumber(quotationNo);

        // -----------------------------------
        // Company snapshot
        // -----------------------------------

        let companySnapshot = {
            ref: null,
            name: '',
            gstin: '',
            contactPerson: '',
            phone: '',
            email: '',
            address: '',
        };
          
        if (quotation.company_id) {
            const companyMaster = await QuotationMaster.findOne({
              legacySupabaseId: quotation.company_id,
              kind: 'company',
            }).lean();
          
            if (companyMaster) {
              companySnapshot = {
                ref: companyMaster._id,
                name: companyMaster.name || '',
                gstin: companyMaster.gstin || '',
                contactPerson: companyMaster.contactPerson || '',
                phone: companyMaster.phone || '',
                email: companyMaster.email || '',
                address: companyMaster.address || '',
              };
            } else {
              console.log(
                `   ⚠ Company not found: ${quotation.company_id}`
              );
            }
        }

        // -----------------------------------
        // Party snapshot
        // -----------------------------------

        let partySnapshot = {
            ref: null,
            name: '',
            gstin: '',
            contactPerson: '',
            phone: '',
            email: '',
            address: '',
        };
          
        if (quotation.party_id) {
            const partyMaster = await QuotationMaster.findOne({
              legacySupabaseId: quotation.party_id,
              kind: 'party',
            }).lean();
          
            if (partyMaster) {
              partySnapshot = {
                ref: partyMaster._id,
                name: partyMaster.name || '',
                gstin: partyMaster.gstin || '',
                contactPerson: partyMaster.contactPerson || '',
                phone: partyMaster.phone || '',
                email: partyMaster.email || '',
                address: partyMaster.address || '',
              };
            } else {
              console.log(
                `   ⚠ Party not found: ${quotation.party_id}`
              );
            }
        }

        // -----------------------------------
        // Terms snapshot
        // -----------------------------------

        let terms = {
          ref: null,
          title: '',
          content: '',
        };

        if (quotation.terms_id) {
          const termsMaster =
            await QuotationMaster.findOne({
              legacySupabaseId:
                quotation.terms_id,
              kind: 'terms',
            }).lean();

          if (termsMaster) {
            terms = {
              ref: termsMaster._id,
              title: termsMaster.name || '',
              content: termsMaster.content || '',
            };
          }
        }

        // -----------------------------------
        // Quotation items
        // -----------------------------------

        const sourceItems =
          itemsByQuotation.get(quotationId) || [];

        const items = [];

        for (const sourceItem of sourceItems) {
          let product = null;

          if (sourceItem.product_id) {
            product =
              await QuotationProduct.findOne({
                legacySupabaseId:
                  sourceItem.product_id,
              }).lean();
          }

          items.push({
            lineType: 'main',

            masterItem: null,

            modelNo:
              text(sourceItem.model_no) ||
              product?.modelNo ||
              '',

            description:
              text(sourceItem.description) ||
              product?.description ||
              '',

            category:
              product?.category || '',

            qty: num(sourceItem.quantity),

            unit:
              text(sourceItem.unit) ||
              product?.unit ||
              'Nos',

            price: num(
              sourceItem.price_per_unit
            ),

            total: num(
              sourceItem.total_price
            ),
          });
        }

        totalItemsMigrated += items.length;

        // -----------------------------------
        // MongoDB quotation document
        // -----------------------------------

        const mongoQuotation = {
          legacySupabaseId: quotationId,

          quotationNo,

          seq,

          seqYear,

          quotationSuffix,

          quotationDate: quotation.created_at
            ? new Date(quotation.created_at)
            : new Date(),

          company: companySnapshot,

          party: partySnapshot,

          salesperson:
            text(quotation.salesperson),

          projectName:
            text(quotation.project_name),

          preparedBy:
            text(quotation.prepared_by),

          techSpecCheckedBy:
            text(quotation.technical_checked_by),

          checkedBy:
            text(quotation.checked_by),

          items,

          discountPercent:
            num(quotation.discount_percent),

          gstRate:
            num(quotation.gst_percent),

          packingFreight:
            num(quotation.packing_freight),

          subtotal:
            num(quotation.subtotal),

          discountAmount:
            num(quotation.discount_amount),

          afterDiscount:
            num(quotation.subtotal) -
            num(quotation.discount_amount),

          gstAmount:
            num(quotation.gst_amount),

          totalAmount:
            num(quotation.total_amount),

          terms,

          notes:
            text(quotation.notes),

          status:
            text(quotation.status) || 'draft',

          isDeleted:
            Boolean(quotation.is_deleted),

          deletedAt:
            quotation.deleted_at
              ? new Date(quotation.deleted_at)
              : null,

          createdBy: null,

          updatedBy: null,

          createdAt: quotation.created_at
            ? new Date(quotation.created_at)
            : new Date(),

          updatedAt: quotation.updated_at
            ? new Date(quotation.updated_at)
            : new Date(),
        };

        // -----------------------------------
        // Insert / update
        // -----------------------------------

        const existing =
          await Quotation.findOne({
            legacySupabaseId: quotationId,
          });

        if (existing) {
          await Quotation.updateOne(
            {
              legacySupabaseId: quotationId,
            },
            {
              $set: mongoQuotation,
            }
          );

          updated++;
        } else {
          await Quotation.create(
            mongoQuotation
          );

          inserted++;
        }

        console.log(
          `[${i + 1}/${quotations.length}] ✓ ${
            quotationNo
          } | items: ${items.length}`
        );
      } catch (error) {
        failed++;

        console.error(
          `[${i + 1}/${quotations.length}] ✗ ${
            quotation.quotation_number ||
            quotation.id
          }`
        );

        console.error(
          `   ${error.message}`
        );
      }
    }

    // -----------------------------------
    // Final counts
    // -----------------------------------

    const mongoQuotationCount =
      await Quotation.countDocuments();

    const mongoItemCount =
      await Quotation.aggregate([
        {
          $project: {
            count: {
              $size: {
                $ifNull: ['$items', []],
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$count',
            },
          },
        },
      ]);

    const totalMongoItems =
      mongoItemCount[0]?.total || 0;

    console.log('\n======================================');
    console.log('  MIGRATION COMPLETE');
    console.log('======================================');

    console.log(
      `Supabase quotations : ${quotations.length}`
    );

    console.log(
      `Supabase items      : ${quotationItems.length}`
    );

    console.log(
      `Inserted            : ${inserted}`
    );

    console.log(
      `Updated             : ${updated}`
    );

    console.log(
      `Failed              : ${failed}`
    );

    console.log(
      `MongoDB quotations  : ${mongoQuotationCount}`
    );

    console.log(
      `MongoDB items       : ${totalMongoItems}`
    );

    console.log(
      `Items processed     : ${totalItemsMigrated}`
    );

    if (failed === 0) {
      console.log(
        '\n✓ All quotations migrated successfully.'
      );
    } else {
      console.log(
        `\n⚠ Migration completed with ${failed} failures.`
      );
    }
  } catch (error) {
    console.error(
      '\n❌ Migration failed:'
    );

    console.error(error);
  } finally {
    if (supabaseClient) {
      await supabaseClient.end().catch(() => {});
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log('\nConnections closed.');
  }
}

migrateQuotations();