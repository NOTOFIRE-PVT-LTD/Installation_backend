
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');

const { PayflowCategory } = require('../models/Payflow.model');

function text(value) {
    return value == null ? '' : String(value).trim();
}

function validDate(value, fieldName) {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${fieldName}`);
    }

    return date;
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from Backend/.env');
    }

    const csvPath = path.resolve(__dirname, '../../categories.csv');

    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }

    const rows = parse(fs.readFileSync(csvPath, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });

    console.log('Categories in CSV:', rows.length);

    await mongoose.connect(process.env.MONGODB_URI);

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    try {
        for (const row of rows) {
            try {
                const id = text(row.id);
                const name = text(row.name);

                if (!id || !name) {
                    throw new Error('Missing category ID or name');
                }

                const document = {
                    legacySupabaseId: id,
                    name,
                    description: text(row.description),
                    status: text(row.status) || 'pending',
                    sourceAddedBy: text(row.added_by) || null,
                    createdAt: validDate(row.created_at, 'created_at'),
                    updatedAt: validDate(row.updated_at, 'updated_at'),
                };

                const result = await PayflowCategory.updateOne(
                    { legacySupabaseId: id },
                    { $set: document },
                    { upsert: true, runValidators: true }
                );

                if (result.upsertedCount > 0) {
                    inserted++;
                } else {
                    updated++;
                }
            } catch (error) {
                failed++;
                console.error(
                    `Failed category ${row.id || '(no ID)'}: ${error.message}`
                );
            }
        }

        console.log('\nMigration summary');
        console.log('CSV records:', rows.length);
        console.log('Inserted:', inserted);
        console.log('Updated:', updated);
        console.log('Failed:', failed);

        console.log(
            'Categories with source IDs:',
            await PayflowCategory.countDocuments({
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
