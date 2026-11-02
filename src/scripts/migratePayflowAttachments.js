
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;

const {
    PayflowPaymentRequest,
} = require('../models/PayflowPaymentRequest.model');

const env = require('../config/env');

const BUCKET = 'attachments';
const CSV_PATH = path.resolve(__dirname, '../../attachments.csv');
const MANIFEST_PATH = path.resolve(
    __dirname,
    '../../attachment-migration-manifest.json'
);
const REPORT_PATH = path.resolve(
    __dirname,
    '../../attachment-migration-report.json'
);

function clean(value) {
    if (value == null) return '';

    const result = String(value).trim();

    return result.toLowerCase() === 'null' ? '' : result;
}

function loadCsv() {
    if (!fs.existsSync(CSV_PATH)) {
        throw new Error(`CSV not found: ${CSV_PATH}`);
    }

    return parse(fs.readFileSync(CSV_PATH, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
    });
}

function readManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return {};

    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveJson(filePath, data) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

function resourceType(fileType, fileName) {
    const mime = clean(fileType).toLowerCase();
    const ext = path.extname(clean(fileName)).toLowerCase();

    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';

    // Handle missing or generic MIME types using common extensions.
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
        return 'image';
    }

    if (['.mp4', '.mov', '.webm'].includes(ext)) {
        return 'video';
    }

    return 'raw';
}

function uploadToCloudinary(buffer, options) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        stream.end(buffer);
    });
}

async function main() {
    const required = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'MONGODB_URI',
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
    ];

    const missing = required.filter(
        key => !process.env[key]
    );

    if (missing.length) {
        throw new Error(
            `Missing environment variables: ${missing.join(', ')}`
        );
    }

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );

    const rows = loadCsv();

    if (rows.length && ![
        'id',
        'payment_id',
        'file_url',
        'file_name',
    ].every(column => column in rows[0])) {
        throw new Error(
            'CSV must contain id, payment_id, file_url and file_name columns.'
        );
    }

    console.log(`Loaded ${rows.length} attachment rows.`);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const manifest = readManifest();

    const report = {
        csvRecords: rows.length,
        uploaded: 0,
        alreadyUploaded: 0,
        linked: 0,
        alreadyLinked: 0,
        unmatchedPayments: 0,
        failed: 0,
        errors: [],
    };

    try {
        const documentFolder =
            env.cloudinary.documentFolder || 'nf-site-reports/documents';

        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];

            const sourceId = clean(row.id) || `row-${index + 2}`;
            const paymentId = clean(row.payment_id);
            const storagePath = clean(row.file_url);
            const fileName = clean(row.file_name);
            const mimeType = clean(row.file_type);

            try {
                if (!paymentId || !storagePath || !fileName) {
                    throw new Error(
                        'Missing payment_id, file_url or file_name.'
                    );
                }

                const payment = await PayflowPaymentRequest.findOne({
                    legacySupabaseId: paymentId,
                }).select('_id legacySupabaseId attachments');

                if (!payment) {
                    report.unmatchedPayments++;

                    throw new Error(
                        `No MongoDB payment matches Supabase ID ${paymentId}`
                    );
                }


                let uploaded = manifest[sourceId];
                const previousUpload = uploaded;

                // Check that an existing manifest entry belongs to this file.
                if (
                    uploaded &&
                    (
                        uploaded.paymentId !== paymentId ||
                        uploaded.storagePath !== storagePath
                    )
                ) {
                    throw new Error(
                        'Manifest source details do not match this CSV row.'
                    );
                }

                const type = resourceType(mimeType, fileName);
                const extension = path.extname(fileName).toLowerCase();

                // Re-upload if this file is new or its old raw upload lacks an extension.
                const needsReupload =
                    !uploaded ||
                    uploaded.resourceType !== type ||
                    (
                        type === 'raw' &&
                        extension &&
                        !(uploaded.publicId || '').toLowerCase().endsWith(extension)
                    );

                if (needsReupload) {
                    const { data, error } = await supabase.storage
                        .from(BUCKET)
                        .download(storagePath);

                    if (error) {
                        throw new Error(
                            `Supabase download failed: ${error.message}`
                        );
                    }

                    if (!data) {
                        throw new Error('Supabase returned no file data.');
                    }

                    const buffer = Buffer.from(await data.arrayBuffer());

                    const safeId = sourceId.replace(
                        /[^a-zA-Z0-9_-]/g,
                        '_'
                    );

                    const publicId =
                        type === 'raw'
                            ? `payment-attachment-${safeId}${extension}`
                            : `payment-attachment-${safeId}`;

                    const result = await uploadToCloudinary(buffer, {
                        folder: documentFolder,
                        public_id: publicId,
                        resource_type: type,
                        overwrite: true,
                        tags: ['supabase-attachment-migration'],
                    });

                    uploaded = {
                        sourceId,
                        paymentId,
                        storagePath,
                        fileName,
                        url: result.secure_url,
                        publicId: result.public_id,
                        resourceType: type,
                        bytes: result.bytes,
                    };

                    manifest[sourceId] = uploaded;
                    saveJson(MANIFEST_PATH, manifest);

                    report.uploaded++;
                } else {
                    report.alreadyUploaded++;
                }

                // Find an existing MongoDB attachment so we can update it.
                const existingIndex = (payment.attachments || []).findIndex(
                    attachment =>
                        (
                            previousUpload?.publicId &&
                            attachment.publicId === previousUpload.publicId
                        ) ||
                        (
                            previousUpload?.url &&
                            attachment.url === previousUpload.url
                        ) ||
                        (
                            uploaded.publicId &&
                            attachment.publicId === uploaded.publicId
                        ) ||
                        attachment.url === uploaded.url
                );

                if (existingIndex !== -1) {
                    // Update the existing attachment instead of creating a duplicate.
                    payment.attachments[existingIndex].url = uploaded.url;
                    payment.attachments[existingIndex].publicId = uploaded.publicId;
                    payment.attachments[existingIndex].name = fileName;

                    await payment.save();

                    report.alreadyLinked++;
                } else {
                    // Add the attachment only if it does not already exist.
                    payment.attachments.push({
                        url: uploaded.url,
                        publicId: uploaded.publicId,
                        name: fileName,
                    });

                    await payment.save();

                    report.linked++;
                }

            } catch (error) {
                report.failed++;

                report.errors.push({
                    row: index + 2,
                    sourceId,
                    paymentId,
                    fileName,
                    error: error.message,
                });

                console.error(
                    `[${index + 1}/${rows.length}] Failed ${fileName}: ${error.message}`
                );
            }

            const processed = index + 1;

            if (processed % 25 === 0 || processed === rows.length) {
                saveJson(REPORT_PATH, report);

                console.log(
                    `${processed}/${rows.length} | ` +
                    `Uploaded: ${report.uploaded} | ` +
                    `Linked: ${report.linked} | ` +
                    `Failed: ${report.failed}`
                );
            }
        }

        saveJson(REPORT_PATH, report);

        console.log('\nAttachment migration finished.');
        console.log(JSON.stringify(report, null, 2));
        console.log(`Manifest: ${MANIFEST_PATH}`);
        console.log(`Report: ${REPORT_PATH}`);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(error => {
    console.error('Attachment migration stopped:', error.message);
    process.exitCode = 1;
});
