require('dotenv').config();
const mongoose = require('mongoose');

require('../models/User.model.js');
const User = mongoose.model('User');

const {
    PayflowPaymentRequest
} = require('../models/PayflowPaymentRequest.model.js');

const USER_FIELDS = [
    { legacyKey: 'requested_by', mongoPath: 'requestedBy' },
    { legacyKey: 'quantity_checked_by', mongoPath: 'quantityCheckedBy.user' },
    { legacyKey: 'quality_checked_by', mongoPath: 'qualityCheckedBy.user' },
    { legacyKey: 'purchase_owner', mongoPath: 'purchaseOwner.user' },
    { legacyKey: 'price_check_guaranteed_by', mongoPath: 'priceCheckBy.user' }
];

(async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const payments = await PayflowPaymentRequest.find({
            legacyData: { $exists: true, $ne: null }
        }).select('_id srNo legacyData');

        console.log(`Found ${payments.length} payment requests.`);

        const legacyUserIds = [
            ...new Set(
                payments.flatMap(payment =>
                    USER_FIELDS
                        .map(field => payment.legacyData?.[field.legacyKey])
                        .filter(id => id && id !== 'null' && id !== 'undefined')
                )
            )
        ];

        console.log(`Looking up ${legacyUserIds.length} distinct legacy user IDs...`);

        const users = await User.find({
            legacySupabaseId: { $in: legacyUserIds }
        }).select('_id legacySupabaseId');

        const userMap = new Map(
            users.map(user => [user.legacySupabaseId, user._id])
        );

        const bulkOps = [];
        const counts = Object.fromEntries(
            USER_FIELDS.map(field => [field.legacyKey, 0])
        );
        let unmatched = 0;

        for (const payment of payments) {
            const update = {};

            for (const field of USER_FIELDS) {
                const legacyId = payment.legacyData?.[field.legacyKey];
                if (!legacyId || legacyId === 'null' || legacyId === 'undefined') {
                    continue;
                }

                const userId = userMap.get(legacyId);

                if (userId) {
                    update[field.mongoPath] = userId;
                    counts[field.legacyKey]++;
                } else {
                    unmatched++;
                    console.log(
                        `No user match: payment ${payment.srNo}, field ${field.legacyKey}`
                    );
                }
            }

            if (Object.keys(update).length > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: payment._id },
                        update: { $set: update }
                    }
                });
            }
        }

        console.log(`Updating ${bulkOps.length} payment requests...`);

        if (bulkOps.length > 0) {
            await PayflowPaymentRequest.bulkWrite(bulkOps, { ordered: false });
        }

        console.log('Linking complete. Linked references by field:');
        console.table(counts);
        console.log(`Unmatched references: ${unmatched}`);
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
})();