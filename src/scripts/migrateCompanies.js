require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const QuotationMaster = require('../models/QuotationMaster.model');

async function migrateCompanies() {
  let supabaseClient;

  try {
    console.log('======================================');
    console.log('  COMPANIES MIGRATION');
    console.log('  Supabase → MongoDB');
    console.log('======================================');

    if (!process.env.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is missing in .env');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing in .env');
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
    // Fetch companies
    // -----------------------------------

    console.log('\nFetching companies...');

    const result = await supabaseClient.query(`
      SELECT
        id,
        name,
        address,
        gst_number,
        contact_details,
        created_at,
        updated_at
      FROM public.companies
      ORDER BY created_at ASC
    `);

    const companies = result.rows;

    console.log(`✓ Found ${companies.length} companies`);

    if (companies.length === 0) {
      console.log('No companies found. Nothing to migrate.');
      return;
    }

    // -----------------------------------
    // Check duplicate Supabase IDs
    // -----------------------------------

    const ids = companies.map((company) => company.id);

    const duplicateIds = ids.filter(
      (id, index) => ids.indexOf(id) !== index
    );

    if (duplicateIds.length > 0) {
      throw new Error(
        `Duplicate Supabase company IDs found: ${[
          ...new Set(duplicateIds),
        ].join(', ')}`
      );
    }

    // -----------------------------------
    // Connect to MongoDB
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

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];

      try {
        const name = company.name?.trim() || '';

        if (!name) {
          throw new Error('Company name is empty');
        }

        /*
         * contact_details in Supabase contains either:
         * - contact person + phone
         * - email
         * - or other contact information
         *
         * We keep the complete value in the phone field
         * so no original contact information is lost.
         */
        const contactDetails =
          company.contact_details?.trim() || '';

        const mongoCompany = {
          legacySupabaseId: company.id,

          kind: 'company',

          name,

          gstin:
            company.gst_number?.trim() || '',

          contactPerson: '',

          phone: contactDetails,

          email: '',

          address:
            company.address?.trim() || '',

          content: '',

          isActive: true,

          // Supabase UUID cannot be directly stored
          // in MongoDB ObjectId field.
          createdBy: null,
          updatedBy: null,

          createdAt: company.created_at
            ? new Date(company.created_at)
            : new Date(),

          updatedAt: company.updated_at
            ? new Date(company.updated_at)
            : new Date(),
        };

        // -----------------------------------
        // Check if already migrated
        // -----------------------------------

        const existing =
          await QuotationMaster.findOne({
            legacySupabaseId: company.id,
            kind: 'company',
          });

        if (existing) {
          await QuotationMaster.updateOne(
            {
              legacySupabaseId: company.id,
              kind: 'company',
            },
            {
              $set: mongoCompany,
            }
          );

          updated++;
        } else {
          await QuotationMaster.create(mongoCompany);

          inserted++;
        }

        console.log(
          `[${i + 1}/${companies.length}] ✓ ${name}`
        );
      } catch (error) {
        failed++;

        console.error(
          `[${i + 1}/${companies.length}] ✗ ${
            company.name || company.id
          }`
        );

        console.error(`   ${error.message}`);
      }
    }

    // -----------------------------------
    // Final count
    // -----------------------------------

    const mongoCompanyCount =
      await QuotationMaster.countDocuments({
        kind: 'company',
      });

    console.log('\n======================================');
    console.log('  MIGRATION COMPLETE');
    console.log('======================================');

    console.log(`Supabase companies : ${companies.length}`);
    console.log(`Inserted           : ${inserted}`);
    console.log(`Updated            : ${updated}`);
    console.log(`Failed             : ${failed}`);
    console.log(`MongoDB companies  : ${mongoCompanyCount}`);

    if (failed === 0) {
      console.log(
        '\n✓ All companies migrated successfully.'
      );
    } else {
      console.log(
        `\n⚠ Migration completed with ${failed} failures.`
      );
    }

  } catch (error) {
    console.error('\n❌ Migration failed:');
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

migrateCompanies();