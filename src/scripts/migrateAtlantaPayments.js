
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { parse } = require("csv-parse/sync");
const AtlantaPayment = require("../models/AtlantaPayment.model");

function text(value) {
    return value == null ? "" : String(value).trim();
}

function num(value) {
    if (value == null || value === "") return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function dateOrNull(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function jsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || !value.trim()) return [];

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}


function firstValue(item, ...keys) {
    for (const key of keys) {
        const value = item?.[key];

        if (value !== undefined && value !== null && value !== "") {
            return value;
        }
    }

    return 0;
}

function mapInvoice(item = {}) {
    const res = {
        invoiceNoDate: String(
            firstValue(item, "invoiceNoDate", "invoiceNo", "invoice_no", "invoice_no_date") || ""
        ).trim(),

        basicAmount: num(
            firstValue(item, "basicAmount", "basic_amount", "basic")
        ),

        quantity: num(
            firstValue(item, "quantity", "qty")
        ),

        totalAmount: num(
            firstValue(item, "totalAmount", "total_amount", "invoiceTotal", "invoice_total")
        ),

        sseAmount: num(
            firstValue(item, "sseAmount", "sse_amount", "sse", "SSE")
        ),

        sseBabu: num(
            firstValue(item, "sseBabu", "sse_babu", "sseBabuAmount", "sse_babu_amount")
        ),

        meggeringCharge: num(
            firstValue(
                item,
                "meggeringCharge",
                "meggering_charge",
                "maigningCharge",
                "maigning_charge",
                "meggering",
                "meggeringAmount"
            )
        ),

        adste: num(
            firstValue(item, "adste", "adsteAmount", "adste_amount", "ADSTE")
        ),

        budgetAccounts: num(
            firstValue(
                item,
                "budgetAccounts",
                "budget_accounts",
                "budgetAcc",
                "budget_acc",
                "budgetAndAccounts"
            )
        ),

        dyCsteOs: num(
            firstValue(
                item,
                "dyCsteOs",
                "dy_cste_os",
                "dyCsteOsAmount",
                "dy_cste_os_amount"
            )
        ),

        dyCste: num(
            firstValue(item, "dyCste", "dy_cste", "dyCsteAmount", "dy_cste_amount")
        ),

        miscellaneous: num(
            firstValue(
                item,
                "miscellaneous",
                "misc",
                "miscAmount",
                "misc_amount"
            )
        ),

        miscRecipientName: String(
            firstValue(item, "miscRecipientName", "misc_recipient_name") || ""
        ).trim(),
    };

    const explicitTotal = num(
        firstValue(
            item,
            "totalExpense",
            "total_expense",
            "expenseTotal",
            "expense_total"
        )
    );
    const sumExpense =
        res.sseAmount +
        res.sseBabu +
        res.meggeringCharge +
        res.adste +
        res.budgetAccounts +
        res.dyCsteOs +
        res.dyCste +
        res.miscellaneous;

    res.totalExpense = explicitTotal || Math.round(sumExpense * 100) / 100;
    return res;
}

function mapTravelExpense(item = {}) {
    const proofUrl = text(item.proofUrl || item.proof?.url);

    return {
        date: dateOrNull(item.date),
        detail: text(item.detail),
        amount: num(item.amount),
        proof: proofUrl
            ? {
                url: proofUrl,
                name: text(item.proofName || item.proof?.name),
                type: text(item.proofType || item.proof?.type),
                size: num(item.proofSize || item.proof?.size),
                publicId: text(item.publicId || item.proof?.publicId),
                resourceType: text(
                    item.resourceType || item.proof?.resourceType
                ),
            }
            : null,
        transactionDone:
            item.transactionDone === true ||
            String(item.transactionDone).toLowerCase() === "true",
    };
}

function mapPayment(item = {}) {
    return {
        paymentDate: dateOrNull(item.date || item.paymentDate),
        amount: num(item.amount),
        deductAmount: num(item.deductAmount),
        details: text(item.details),
    };
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is missing from Backend/.env");
    }

    const csvPath = path.resolve(
        __dirname,
        "../../payment_records.csv"
    );

    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }

    const csvContent = fs.readFileSync(csvPath, "utf8");

    // Lovable's exported CSV uses semicolons as delimiters.
    const rows = parse(csvContent, {
        columns: (headers) => headers.map((h) => h.trim()),
        delimiter: ";",
        skip_empty_lines: true,
        bom: true,
        relax_quotes: true,
        trim: true,
    });

    console.log(`CSV records found: ${rows.length}`);

    if (rows.length === 0) {
        throw new Error("CSV has no data records.");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    let inserted = 0;
    let updated = 0;
    let failed = 0;

    try {
        for (const row of rows) {
            try {
                if (!row.id) {
                    throw new Error("Missing source record ID");
                }

                const legacyId = String(row.id);
                const existing = await AtlantaPayment.findOne({
                    legacySupabaseId: legacyId,
                })
                    .select("_id")
                    .lean();

                const invoices = jsonArray(row.invoices);
                if (invoices.length > 0) {
                    console.log(
                        "RAW INVOICE BREAKDOWN:",
                        JSON.stringify(invoices[0], null, 2)
                    );
                }
                const workItems = jsonArray(row.work_material_items);
                const workItemsById = new Map(
                    workItems.map((item) => [String(item.id || ""), item])
                );
                const expenses = jsonArray(row.travel_expenses);
                const payments = jsonArray(row.payment_received_items);

                const document = {
                    legacySupabaseId: legacyId,

                    fileName: text(row.file_name) || `legacy-${legacyId}`,
                    consigneeName: text(row.consignee_name),
                    crnDate: dateOrNull(row.crn_date),
                    paymentDate: dateOrNull(row.payment_date),

                    employeeName: text(row.employee_name) || "Unknown",
                    employeeId: text(row.employee_id),
                    department: text(row.department),
                    designation: text(row.designation),

                    travelStartAt: dateOrNull(row.travelling_start_date),
                    reachedAt: dateOrNull(row.reached_destination_date),
                    exitAt: dateOrNull(row.exit_destination_date),
                    travelDays: num(row.travel_days),
                    ratePerDay: num(row.travel_days)
                        ? num(row.tada_amount) / num(row.travel_days)
                        : 0,
                    totalTada: num(row.tada_amount),


                    invoiceEntries: invoices.map((invoice) => {
                        const workItem = workItemsById.get(String(invoice.id || "")) || {};

                        return mapInvoice({
                            ...invoice,
                            ...workItem,
                        });
                    }),
                    totalBasicAmount: num(row.total_basic_amount),
                    totalInvoiceAmount: num(row.total_invoice_amount),

                    travelExpenses: expenses.map(mapTravelExpense),
                    totalTravelExpenses: num(row.travel_expenses_total),

                    paymentsReceived: payments.map(mapPayment),
                    totalReceivedAmount: num(row.received_amount),

                    // Preserve the source value; confirm its business meaning
                    // before changing the application's balance calculation.
                    amountToGive: num(row.grand_total),

                    paymentDetails: text(row.payment_details),
                    paymentReceivedDate: text(row.payment_received_date),
                    workMaterialItems: workItems,

                    // Requires sourceData to exist in the Mongoose schema
                    // if you want to retain every original CSV column.
                    sourceData: row,

                    createdAt: dateOrNull(row.created_at) || new Date(),
                    updatedAt: dateOrNull(row.updated_at) || new Date(),
                };

                await AtlantaPayment.updateOne(
                    { legacySupabaseId: legacyId },
                    { $set: document },
                    { upsert: true, runValidators: true }
                );

                if (existing) updated++;
                else inserted++;

                console.log(
                    `${existing ? "Updated" : "Imported"}: ${document.fileName}`
                );
            } catch (err) {
                failed++;
                console.error(
                    `Failed record ${row.id || "(missing ID)"}: ${err.message}`
                );
            }
        }

        console.log("\nMigration summary");
        console.log("Source records:", rows.length);
        console.log("Inserted:", inserted);
        console.log("Updated:", updated);
        console.log("Failed:", failed);

        const migratedCount = await AtlantaPayment.countDocuments({
            legacySupabaseId: { $exists: true, $ne: null },
        });

        console.log("Migrated AtlantaPayment documents:", migratedCount);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error("Migration stopped:", err.message);
    process.exitCode = 1;
});
