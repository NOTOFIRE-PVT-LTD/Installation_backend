require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');

const User = require('../models/User.model');

const CSV_PATH = path.join(process.cwd(), 'users.csv');

function clean(value) {
    return String(value ?? '').trim();
}

function normalizeRole(value) {
    const role = clean(value).toLowerCase();
    return role === 'admin' ? 'Admin' : 'User';
}

function normalizeStatus(value) {
    const status = clean(value).toLowerCase();
    return status === 'inactive' ? 'inactive' : 'active';
}

async function main() {
    if (!fs.existsSync(CSV_PATH)) {
        throw new Error(`CSV file not found: ${CSV_PATH}`);
    }

    const rows = parse(fs.readFileSync(CSV_PATH, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });

    console.log(`Loaded ${rows.length} user rows.`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of rows) {
        const legacySupabaseId = clean(row.id);
        const email = clean(row.email).toLowerCase();
        const name = clean(row.name);

        if (!legacySupabaseId || !email || !name) {
            skipped++;
            errors.push({
                id: legacySupabaseId,
                email,
                error: 'Missing id, email, or name',
            });
            continue;
        }

        try {
            const existing = await User.findOne({
                $or: [
                    { legacySupabaseId },
                    { email },
                ],
            });

            const userData = {
                legacySupabaseId,
                name,
                email,
                company: clean(row.company),
                role: normalizeRole(row.role),
                status: normalizeStatus(row.status),
            };

            if (existing) {
                // Avoid overwriting an existing account's password or mobile.
                Object.assign(existing, userData);
                await existing.save();
                updated++;
            } else {
                await User.create(userData);
                imported++;
            }
        } catch (error) {
            skipped++;
            errors.push({
                id: legacySupabaseId,
                email,
                error: error.message,
            });
        }
    }

    console.log('\nUser migration finished.');
    console.log({
        total: rows.length,
        imported,
        updated,
        skipped,
        errors,
    });

    fs.writeFileSync(
        path.join(process.cwd(), 'user-migration-report.json'),
        JSON.stringify({ total: rows.length, imported, updated, skipped, errors }, null, 2)
    );
}

main()
    .catch(error => {
        console.error('User migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });