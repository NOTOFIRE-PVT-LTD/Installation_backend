
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const {
    PayflowPaymentRequest,
} = require('../models/PayflowPaymentRequest.model');

function text(value) {
    if (value == null) return '';

    const result = String(value).trim();

    // Supabase CSV exports can represent NULL as the literal string "null".
    if (result.toLowerCase() === 'null') return '';

    return result;
}

function number(value, fallback = 0) {
    const cleaned = text(value);

    if (!cleaned) return fallback;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function date(value) {
    const cleaned = text(value);
    if (!cleaned) return new Date();

    const parsed = new Date(cleaned);

    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid date: ${cleaned}`);
    }

    return parsed;
}


function loadCsv(fileName) {
    const filePath = path.resolve(__dirname, '../../', fileName);

    if (!fs.existsSync(filePath)) {
        throw new Error(`CSV file not found: ${filePath}`);
    }

    return parse(fs.readFileSync(filePath, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });
}


function paymentStatus(value) {
    const status = text(value).toLowerCase().replace(/[\s-]+/g, '_');

    const statuses = {
        pending: 'Pending',
        approved: 'Approved',
        processed: 'Processed',
        rejected: 'Rejected',
        query: 'Query',
        query_raised: 'Query',
        postponed: 'Postponed',
    };

    return statuses[status] || 'Pending';
}

function paymentPriority(value) {
    const priority = text(value).toLowerCase();

    const priorities = {
        high: 'High',
        medium: 'Medium',
        low: 'Low',
    };

    return priorities[priority] || 'Medium';
}



function buildPaymentDocument(row, id, lookups) {
    const srNo = Number(text(row.serial_number));

    if (!Number.isFinite(srNo) || srNo <= 0) {
        throw new Error(`Invalid serial_number: ${row.serial_number}`);
    }

    const amount = number(row.payment_amount);

    if (amount < 0) {
        throw new Error(`Invalid negative payment_amount: ${amount}`);
    }

    const vendorId = text(row.vendor_id);
    const categoryId = text(row.category_id);
    const subcategoryId = text(row.subcategory_id);

    const vendorRecord = lookups.vendorMap.get(vendorId);

    return {
        legacySupabaseId: id,

        srNo,
        requestDate: date(row.date),

        company: text(row.company_name),
        branch: text(row.company_branch),
        vendor: text(row.vendor_name),

        vendorAccountNumber: vendorRecord?.accountNumber || '',
        vendorIfsc: vendorRecord?.ifscCode || '',

        category: lookups.categoryMap.get(categoryId) || '',
        subcategory: lookups.subcategoryMap.get(subcategoryId) || '',

        itemType: text(row.item_type),
        description: text(row.item_description),

        totalOutstanding: number(row.total_outstanding),
        balanceAmount: number(row.balance_amount),
        amount,

        bankName: text(row.bank_name),
        paymentMode: text(row.payment_mode),

        // Maps advance_details to Pay Against.
        // Confirm this matches the original application's meaning.
        payAgainst: text(row.advance_details),

        department: text(row.department),
        endUse: text(row.end_use),

        lpr: text(row.lpr),
        ioa: text(row.ioa),
        cpp: text(row.cpp),

        priority: paymentPriority(row.urgency_level),
        status: paymentStatus(row.status),

        requestedBy: null,

        legacyData: { ...row },
    };
}


async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from Backend/.env');
    }

    const csvPath = path.resolve(__dirname, '../../payments.csv');

    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }

    const rows = parse(fs.readFileSync(csvPath, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });

    console.log('Payment records in CSV:', rows.length);

    if (rows.length === 0) {
        console.log('No payment records to migrate.');
        return;
    }
    const vendors = loadCsv('vendors.csv');
    const categories = loadCsv('categories.csv');
    const subcategories = loadCsv('subcategories.csv');

    const vendorMap = new Map(
        vendors.map(row => [
            text(row.id),
            {
                accountNumber: text(row.account_number),
                ifscCode: text(row.ifsc_code),
            },
        ]).filter(([id]) => id)
    );

    const categoryMap = new Map(
        categories.map(row => [
            text(row.id),
            text(row.name),
        ]).filter(([id]) => id)
    );

    const subcategoryMap = new Map(
        subcategories.map(row => [
            text(row.id),
            text(row.name),
        ]).filter(([id]) => id)
    );

    console.log('Vendors loaded:', vendorMap.size);
    console.log('Categories loaded:', categoryMap.size);
    console.log('Subcategories loaded:', subcategoryMap.size);

    const requiredHeaders = [
        'id',
        'serial_number',
        'date',
        'vendor_name',
        'vendor_id',
        'category_id',
        'subcategory_id',
        'advance_details',
        'payment_amount',
        'status',
        'urgency_level',
    ];

    const headers = Object.keys(rows[0]);

    const missingHeaders = requiredHeaders.filter(
        (header) => !headers.includes(header)
    );

    if (missingHeaders.length > 0) {
        throw new Error(
            `Missing CSV columns: ${missingHeaders.join(', ')}`
        );
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    let imported = 0;
    let updated = 0;
    let failed = 0;

    const errors = [];

    try {
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const id = text(row.id);

            try {
                if (!id) {
                    throw new Error('Missing Supabase payment ID');
                }

                const document = buildPaymentDocument(row, id, {
                    vendorMap,
                    categoryMap,
                    subcategoryMap,
                });
                // Update by Supabase ID; insert if the payment does not exist.
                // Keep createdAt unchanged for existing MongoDB documents.
                const result = await PayflowPaymentRequest.updateOne(
                    { legacySupabaseId: id },
                    {
                        $set: {
                            srNo: document.srNo,
                            requestDate: document.requestDate,

                            company: document.company,
                            branch: document.branch,
                            vendor: document.vendor,
                            vendorAccountNumber: document.vendorAccountNumber,
                            vendorIfsc: document.vendorIfsc,
                            payAgainst: document.payAgainst,

                            category: document.category,
                            subcategory: document.subcategory,

                            itemType: document.itemType,
                            description: document.description,

                            totalOutstanding: document.totalOutstanding,
                            balanceAmount: document.balanceAmount,
                            amount: document.amount,

                            bankName: document.bankName,
                            paymentMode: document.paymentMode,

                            department: document.department,
                            endUse: document.endUse,

                            lpr: document.lpr,
                            ioa: document.ioa,
                            cpp: document.cpp,

                            priority: document.priority,
                            status: document.status,
                            requestedBy: document.requestedBy,

                            legacyData: document.legacyData,
                            updatedAt: date(row.updated_at),
                        },
                        $setOnInsert: {
                            legacySupabaseId: id,
                            createdAt: date(row.created_at),
                        },
                    },
                    {
                        upsert: true,
                        runValidators: true,
                    }
                );

                if (result.upsertedCount > 0) {
                    imported++;
                } else if (result.matchedCount > 0) {
                    updated++;
                } else {
                    throw new Error(
                        'MongoDB did not confirm an insert or update'
                    );
                }
            } catch (error) {
                failed++;

                const failure = {
                    rowNumber: index + 2,
                    supabaseId: id || null,
                    serialNumber: text(row.serial_number),
                    error: error.message,
                };

                errors.push(failure);

                console.error(
                    `Failed payment ${failure.supabaseId || '(no ID)'} ` +
                    `(CSV row ${failure.rowNumber}): ${error.message}`
                );
            }

            const processed = imported + updated + failed;

            if (processed % 100 === 0 || processed === rows.length) {
                console.log(
                    `Progress: ${processed}/${rows.length} processed | ` +
                    `Inserted: ${imported} | Updated: ${updated} | ` +
                    `Failed: ${failed}`
                );
            }
        }

        const reportPath = path.resolve(
            __dirname,
            '../../payment-migration-report.json'
        );

        fs.writeFileSync(
            reportPath,
            JSON.stringify(
                {
                    csvRecords: rows.length,
                    imported,
                    updated,
                    failed,
                    errors,
                },
                null,
                2
            ),
            'utf8'
        );

        console.log('\nMigration summary');
        console.log('CSV records:', rows.length);
        console.log('Inserted:', imported);
        console.log('Updated:', updated);
        console.log('Failed:', failed);

        console.log(
            'Payments with legacy IDs:',
            await PayflowPaymentRequest.countDocuments({
                legacySupabaseId: { $type: 'string' },
            })
        );

        console.log('Report:', reportPath);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error('Migration stopped:', error.message);
    process.exitCode = 1;
});
