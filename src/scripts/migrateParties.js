require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const QuotationMaster = require('../models/QuotationMaster.model');

async function migrateParties() {
  let supabaseClient;

  try {
    console.log('======================================');
    console.log('  PARTIES MIGRATION');
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
    // Fetch parties
    // -----------------------------------

    console.log('\nFetching parties...');

    const result = await supabaseClient.query(`
      SELECT
        id,
        company_name,
        company_address,
        gst_number,
        contact_person_name,
        email,
        whatsapp_number,
        created_at,
        updated_at,
        created_by
      FROM public.parties
      ORDER BY created_at ASC
    `);

    const parties = result.rows;

    console.log(`✓ Found ${parties.length} parties`);

    if (parties.length === 0) {
      console.log('No parties found. Nothing to migrate.');
      return;
    }

    // -----------------------------------
    // Check duplicate Supabase IDs
    // -----------------------------------

    const ids = parties.map((party) => party.id);

    const duplicateIds = ids.filter(
      (id, index) => ids.indexOf(id) !== index
    );

    if (duplicateIds.length > 0) {
      throw new Error(
        `Duplicate Supabase party IDs found: ${[
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

    for (let i = 0; i < parties.length; i++) {
      const party = parties[i];

      try {
        const name = party.company_name?.trim() || '';

        if (!name) {
          throw new Error('Company name is empty');
        }

        const mongoParty = {
          legacySupabaseId: party.id,

          kind: 'party',

          name,

          gstin: party.gst_number?.trim() || '',

          contactPerson:
            party.contact_person_name?.trim() || '',

          phone:
            party.whatsapp_number?.trim() || '',

          email: party.email?.trim() || '',

          address:
            party.company_address?.trim() || '',

          content: '',

          isActive: true,

          // Supabase UUID cannot be directly stored
          // in MongoDB ObjectId field.
          createdBy: null,
          updatedBy: null,

          createdAt: party.created_at
            ? new Date(party.created_at)
            : new Date(),

          updatedAt: party.updated_at
            ? new Date(party.updated_at)
            : new Date(),
        };

        // -----------------------------------
        // Check if already migrated
        // -----------------------------------

        const existing =
          await QuotationMaster.findOne({
            legacySupabaseId: party.id,
            kind: 'party',
          });

        if (existing) {
          await QuotationMaster.updateOne(
            {
              legacySupabaseId: party.id,
              kind: 'party',
            },
            {
              $set: mongoParty,
            }
          );

          updated++;
        } else {
          await QuotationMaster.create(mongoParty);

          inserted++;
        }

        console.log(
          `[${i + 1}/${parties.length}] ✓ ${
            name || party.id
          }`
        );
      } catch (error) {
        failed++;

        console.error(
          `[${i + 1}/${parties.length}] ✗ ${
            party.company_name || party.id
          }`
        );

        console.error(`   ${error.message}`);
      }
    }

    // -----------------------------------
    // Final count
    // -----------------------------------

    const mongoPartyCount =
      await QuotationMaster.countDocuments({
        kind: 'party',
      });

    console.log('\n======================================');
    console.log('  MIGRATION COMPLETE');
    console.log('======================================');

    console.log(`Supabase parties : ${parties.length}`);
    console.log(`Inserted         : ${inserted}`);
    console.log(`Updated          : ${updated}`);
    console.log(`Failed           : ${failed}`);
    console.log(`MongoDB parties  : ${mongoPartyCount}`);

    if (failed === 0) {
      console.log(
        '\n✓ All parties migrated successfully.'
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

migrateParties();