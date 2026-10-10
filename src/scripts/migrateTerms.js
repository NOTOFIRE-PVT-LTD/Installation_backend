
require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const QuotationMaster = require('../models/QuotationMaster.model');

async function migrateTerms() {
  let supabaseClient;

  try {
    console.log('======================================');
    console.log('  TERMS & CONDITIONS MIGRATION');
    console.log('  Supabase → MongoDB');
    console.log('======================================');

    if (!process.env.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is missing in .env');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing in .env');
    }

    // Connect to Supabase
    console.log('\nConnecting to Supabase...');

    supabaseClient = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
    });

    await supabaseClient.connect();
    console.log('✓ Connected to Supabase');

    // Fetch terms and conditions
    console.log('\nFetching terms and conditions...');

    const result = await supabaseClient.query(`
      SELECT
        id,
        title,
        content,
        is_active,
        created_at,
        updated_at
      FROM public.terms_and_conditions
      ORDER BY created_at ASC
    `);

    const termsList = result.rows;
    console.log(`✓ Found ${termsList.length} terms records`);

    if (termsList.length === 0) {
      console.log('No terms found. Nothing to migrate.');
      return;
    }

    // Check duplicate Supabase IDs
    const ids = termsList.map((term) => term.id);
    const uniqueIds = new Set(ids);

    if (uniqueIds.size !== ids.length) {
      throw new Error('Duplicate Supabase terms IDs found');
    }

    // Connect to MongoDB
    console.log('\nConnecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Migrate records
    console.log('\nStarting migration...\n');

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < termsList.length; i++) {
      const term = termsList[i];

      try {
        const name = term.title?.trim() || '';

        if (!name) {
          throw new Error('Term title is empty');
        }

        const mongoTerm = {
          legacySupabaseId: term.id,
          kind: 'terms',
          name,
          content: term.content || '',
          isActive: term.is_active ?? true,

          // Supabase UUIDs aren't MongoDB ObjectIds.
          createdBy: null,
          updatedBy: null,

          createdAt: term.created_at
            ? new Date(term.created_at)
            : new Date(),

          updatedAt: term.updated_at
            ? new Date(term.updated_at)
            : new Date(),
        };

        const filter = {
          legacySupabaseId: term.id,
          kind: 'terms',
        };

        const existing = await QuotationMaster.findOne(filter);

        if (existing) {
          await QuotationMaster.updateOne(
            filter,
            { $set: mongoTerm }
          );
          updated++;
        } else {
          await QuotationMaster.create(mongoTerm);
          inserted++;
        }

        console.log(`[${i + 1}/${termsList.length}] ✓ ${name}`);
      } catch (error) {
        failed++;
        console.error(
          `[${i + 1}/${termsList.length}] ✗ ${term.title || term.id}`
        );
        console.error(`   ${error.message}`);
      }
    }

    const mongoCount = await QuotationMaster.countDocuments({
      kind: 'terms',
    });

    console.log('\n======================================');
    console.log('  MIGRATION COMPLETE');
    console.log('======================================');
    console.log(`Supabase terms : ${termsList.length}`);
    console.log(`Inserted       : ${inserted}`);
    console.log(`Updated        : ${updated}`);
    console.log(`Failed         : ${failed}`);
    console.log(`MongoDB terms  : ${mongoCount}`);

    if (failed === 0) {
      console.log('\n✓ All terms migrated successfully.');
    } else {
      console.log(`\n⚠ Migration completed with ${failed} failures.`);
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

migrateTerms();
