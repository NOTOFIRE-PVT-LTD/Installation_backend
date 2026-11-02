
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');

const {
    PayflowPaymentRequest,
} = require('../models/PayflowPaymentRequest.model');

function clean(value) {
    if (value == null) return '';

    const result = String(value).trim();

    if (result.toLowerCase() === 'null') return '';

    return result;
}

function loadBillsCsv() {
    const filePath = path.resolve(__dirname, '../../bills.csv');

    if (!fs.existsSync(filePath)) {
        throw new Error(`Bills CSV not found: ${filePath}`);
    }

    return parse(fs.readFileSync(filePath, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });
}

function parseBillDate(value) {
    const cleaned = clean(value);

    if (!cleaned) {
        throw new Error('Bill date is empty');
    }

    const result = new Date(cleaned);

    if (Number.isNaN(result.getTime())) {
        throw new Error(`Invalid bill date: ${cleaned}`);
    }

    return result;
}

function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return '';

    return date.toISOString().slice(0, 10);
}

function billKey(bill) {
    return `${clean(bill.billNumber).toLowerCase()}|${dateKey(bill.billDate)}`;
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing from Backend/.env');
    }

    const rows = loadBillsCsv();

    console.log(`Loaded ${rows.length} bill records from bills.csv`);

    const requiredColumns = [
        'id',
        'payment_id',
        'bill_number',
        'bill_date',
    ];

    if (
        rows.length > 0 &&
        requiredColumns.some(column => !(column in rows[0]))
    ) {
        throw new Error(
            `CSV must contain columns: ${requiredColumns.join(', ')}`
        );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log('Connected to MongoDB.');

    try {
        const payments = await PayflowPaymentRequest.find({
            legacySupabaseId: { $type: 'string' },
        })
            .select(
                '_id legacySupabaseId bills billNumber billDate'
            )
            .lean();

        const paymentMap = new Map(
            payments.map(payment => [
                clean(payment.legacySupabaseId),
                payment,
            ])
        );

        // Group source bills by their Supabase payment ID.
        const groupedBills = new Map();
        const errors = [];
        let invalid = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            try {
                const paymentId = clean(row.payment_id);
                const billNumber = clean(row.bill_number);

                if (!paymentId) {
                    throw new Error('Missing payment_id');
                }

                if (!billNumber) {
                    throw new Error('Missing bill_number');
                }

                const billDate = parseBillDate(row.bill_date);

                if (!groupedBills.has(paymentId)) {
                    groupedBills.set(paymentId, []);
                }

                groupedBills.get(paymentId).push({
                    billNumber,
                    billDate,
                    sourceBillId: clean(row.id),
                });
            } catch (error) {
                invalid++;

                errors.push({
                    row: i + 2,
                    billId: clean(row.id),
                    paymentId: clean(row.payment_id),
                    error: error.message,
                });
            }
        }

        let matchedPayments = 0;
        let unmatchedBills = 0;
        let addedBills = 0;
        let duplicateBills = 0;
        let failedPayments = 0;

        const operations = [];

        for (const [paymentId, sourceBills] of groupedBills) {
            const payment = paymentMap.get(paymentId);

            if (!payment) {
                unmatchedBills += sourceBills.length;

                errors.push({
                    paymentId,
                    billCount: sourceBills.length,
                    error: 'No MongoDB payment matched legacySupabaseId',
                });

                continue;
            }

            matchedPayments++;

            // Keep all existing bill entries.
            const existingBills = (payment.bills || []).map(bill => ({
                billNumber: clean(bill.billNumber),
                billDate: new Date(bill.billDate),
            }));

            const seen = new Set(existingBills.map(billKey));
            const originalCount = existingBills.length;

            for (const sourceBill of sourceBills) {
                const key = billKey(sourceBill);

                if (seen.has(key)) {
                    duplicateBills++;
                    continue;
                }

                existingBills.push({
                    billNumber: sourceBill.billNumber,
                    billDate: sourceBill.billDate,
                });

                seen.add(key);
                addedBills++;
            }

            // The schema requires the top-level fields to mirror
            // the first entry of the bills array.
            const firstBill = existingBills[0] || null;

            operations.push({
                updateOne: {
                    filter: { _id: payment._id },
                    update: {
                        $set: {
                            bills: existingBills,
                            billNumber: firstBill
                                ? firstBill.billNumber
                                : '',
                            billDate: firstBill
                                ? firstBill.billDate
                                : null,
                        },
                    },
                },
            });
        }

        // Update existing payment requests only; never insert payments.
        // Small batches reduce the size of each MongoDB write.
        for (let i = 0; i < operations.length; i += 200) {
            const batch = operations.slice(i, i + 200);

            try {
                await PayflowPaymentRequest.bulkWrite(batch, {
                    ordered: false,
                });

                console.log(
                    `Updated payment groups: ${Math.min(
                        i + batch.length,
                        operations.length
                    )}/${operations.length}`
                );
            } catch (error) {
                failedPayments += batch.length;

                errors.push({
                    batchStart: i,
                    error: error.message,
                });

                console.error(
                    `A batch failed starting at index ${i}:`,
                    error.message
                );
            }
        }

        const report = {
            csvRecords: rows.length,
            paymentGroupsMatched: matchedPayments,
            billsAdded: addedBills,
            duplicateBillsSkipped: duplicateBills,
            unmatchedBills,
            invalidBills: invalid,
            failedBatches: failedPayments,
            errors,
        };

        const reportPath = path.resolve(
            __dirname,
            '../../bill-migration-report.json'
        );

        fs.writeFileSync(
            reportPath,
            JSON.stringify(report, null, 2),
            'utf8'
        );

        console.log('\nBill migration summary');
        console.log(JSON.stringify(report, null, 2));
        console.log('Report saved to:', reportPath);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(error => {
    console.error('Bill migration stopped:', error);
    process.exitCode = 1;
});
