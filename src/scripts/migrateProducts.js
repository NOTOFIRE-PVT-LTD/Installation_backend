require('dotenv').config();

const mongoose = require('mongoose');
const { Client } = require('pg');

const QuotationProduct = require('../models/QuotationProduct.model');

async function migrateProducts() {
  let supabaseClient;

  try {
    console.log('======================================');
    console.log('  PRODUCTS MIGRATION');
    console.log('  Supabase → MongoDB');
    console.log('======================================');

    // -----------------------------------
    // 1. Validate environment variables
    // -----------------------------------

    if (!process.env.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is missing in .env');
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing in .env');
    }

    // -----------------------------------
    // 2. Connect to Supabase PostgreSQL
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
    // 3. Get ALL products
    // -----------------------------------

    console.log('\nFetching products...');

    const result = await supabaseClient.query(`
      SELECT
        id,
        description,
        model_no,
        price,
        category,
        approvals,
        datasheet,
        picture_url,
        created_at,
        updated_at
      FROM public.products
      ORDER BY created_at ASC
    `);

    const products = result.rows;

    console.log(`✓ Found ${products.length} products`);

    if (products.length === 0) {
      console.log('No products found. Nothing to migrate.');
      return;
    }

    // -----------------------------------
    // 4. Check duplicate Supabase IDs
    // -----------------------------------

    const ids = products.map((product) => product.id);

    const duplicateIds = ids.filter(
      (id, index) => ids.indexOf(id) !== index
    );

    if (duplicateIds.length > 0) {
      throw new Error(
        `Duplicate Supabase product IDs found: ${[
          ...new Set(duplicateIds),
        ].join(', ')}`
      );
    }

    // -----------------------------------
    // 5. Check duplicate model numbers
    // -----------------------------------

    const modelNumbers = products
      .map((product) => product.model_no?.trim())
      .filter(Boolean);

    const duplicateModels = modelNumbers.filter(
      (model, index) => modelNumbers.indexOf(model) !== index
    );

    if (duplicateModels.length > 0) {
      console.log('\n⚠ Duplicate model numbers found:');

      [...new Set(duplicateModels)].forEach((model) => {
        console.log(`   - ${model}`);
      });

      console.log(
        '\nMigration will continue because your MongoDB model does not require unique modelNo.'
      );
    }

    // -----------------------------------
    // 6. Connect to MongoDB
    // -----------------------------------

    console.log('\nConnecting to MongoDB...');

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('✓ Connected to MongoDB');

    // -----------------------------------
    // 7. Migrate products
    // -----------------------------------

    console.log('\nStarting migration...\n');

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        const modelNo = product.model_no?.trim() || '';
        const description = product.description?.trim() || '';
        const category = product.category?.trim() || '';
        const approvals = product.approvals?.trim() || '';

        const price =
          product.price === null ||
          product.price === undefined ||
          product.price === ''
            ? 0
            : Number(product.price);

        if (Number.isNaN(price)) {
          throw new Error(
            `Invalid price: ${product.price}`
          );
        }

        // -----------------------------------
        // Datasheet
        // -----------------------------------

        let datasheet = null;

        if (product.datasheet) {
          datasheet = {
            url: product.datasheet,
            publicId: '',
            resourceType: 'raw',
            originalName: '',
          };
        }

        // -----------------------------------
        // Picture
        // -----------------------------------

        let picture = null;

        if (product.picture_url) {
          picture = {
            url: product.picture_url,
            publicId: '',
            resourceType: 'image',
            originalName: '',
          };
        }

        const mongoProduct = {
          legacySupabaseId: product.id,

          modelNo,
          description,
          price,

          category,

          unit: 'Nos',

          approvals,

          datasheet,
          picture,

          isActive: true,

          createdBy: null,
          updatedBy: null,

          createdAt: product.created_at
            ? new Date(product.created_at)
            : new Date(),

          updatedAt: product.updated_at
            ? new Date(product.updated_at)
            : new Date(),
        };

        // -----------------------------------
        // Upsert
        // -----------------------------------

        const existing =
          await QuotationProduct.findOne({
            legacySupabaseId: product.id,
          });

        if (existing) {
          await QuotationProduct.updateOne(
            { legacySupabaseId: product.id },
            {
              $set: mongoProduct,
            }
          );

          updated++;
        } else {
          await QuotationProduct.create(
            mongoProduct
          );

          inserted++;
        }

        console.log(
          `[${i + 1}/${products.length}] ✓ ${
            modelNo || description
          }`
        );
      } catch (error) {
        failed++;

        console.error(
          `[${i + 1}/${products.length}] ✗ ${
            product.model_no || product.description
          }`
        );

        console.error(`   ${error.message}`);
      }
    }

    // -----------------------------------
    // 8. Final verification
    // -----------------------------------

    const mongoCount =
      await QuotationProduct.countDocuments();

    console.log('\n======================================');
    console.log('  MIGRATION COMPLETE');
    console.log('======================================');

    console.log(`Supabase products : ${products.length}`);
    console.log(`Inserted          : ${inserted}`);
    console.log(`Updated           : ${updated}`);
    console.log(`Failed            : ${failed}`);
    console.log(`MongoDB total     : ${mongoCount}`);

    if (failed === 0) {
      console.log('\n✓ All products migrated successfully.');
    } else {
      console.log(
        `\n⚠ Migration completed with ${failed} failures.`
      );
    }
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error);
  } finally {
    // -----------------------------------
    // Close connections
    // -----------------------------------

    if (supabaseClient) {
      await supabaseClient.end().catch(() => {});
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log('\nConnections closed.');
  }
}

migrateProducts();