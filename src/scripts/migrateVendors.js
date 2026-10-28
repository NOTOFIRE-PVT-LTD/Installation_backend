
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const { PayflowVendor } = require('../models/Payflow.model');

function text(value) {
    return value == null ? '' : String(value).trim();
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from Backend/.env');
    }

    const csvPath = path.resolve(__dirname, '../../vendors.csv');

    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }

    const rows = parse(fs.readFileSync(csvPath, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });

    console.log('Vendor records in CSV:', rows.length);

    await mongoose.connect(process.env.MONGODB_URI);

    let imported = 0;
    let updated = 0;
    let failed = 0;

    try {
        for (const row of rows) {
            try {
                const id = text(row.id);
                const name = text(row.name).toUpperCase();
                const accountNumber = text(row.account_number);
                const ifscCode = text(row.ifsc_code).toUpperCase();

                if (!id || !name || !accountNumber || !ifscCode) {
                    throw new Error(
                        'Missing id, name, account_number, or ifsc_code'
                    );
                }

                const existing = await PayflowVendor.findOne({
                    legacySupabaseId: id,
                }).select('_id').lean();

                const document = {
                    legacySupabaseId: id,
                    name,
                    accountNumber,
                    ifscCode,
                    status: text(row.status),
                    sourceAddedBy: text(row.added_by) || null,
                    createdAt: row.created_at
                        ? new Date(row.created_at)
                        : new Date(),
                    updatedAt: row.updated_at
                        ? new Date(row.updated_at)
                        : new Date(),
                };

                if (
                    Number.isNaN(document.createdAt.getTime()) ||
                    Number.isNaN(document.updatedAt.getTime())
                ) {
                    throw new Error('Invalid created_at or updated_at date');
                }

                // Update by source ID; insert if it does not exist.
                // Do not overwrite the audit fields createdBy/updatedBy.
                await PayflowVendor.updateOne(
                    { legacySupabaseId: id },
                    { $set: document },
                    { upsert: true, runValidators: true }
                );

                if (existing) {
                    updated++;
                } else {
                    imported++;
                }
            } catch (error) {
                failed++;
                console.error(
                    `Failed vendor ${row.id || '(no ID)'}: ${error.message}`
                );
            }
        }

        console.log('\nMigration summary');
        console.log('CSV records:', rows.length);
        console.log('Inserted:', imported);
        console.log('Updated:', updated);
        console.log('Failed:', failed);

        console.log(
            'Vendors with legacy IDs:',
            await PayflowVendor.countDocuments({
                legacySupabaseId: { $exists: true, $ne: null },
            })
        );
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error('Migration stopped:', error.message);
    process.exitCode = 1;
});
