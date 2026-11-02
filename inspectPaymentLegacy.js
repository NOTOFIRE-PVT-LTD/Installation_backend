require('dotenv').config();
const mongoose = require('mongoose');
require('./src/models/User.model');
const { PayflowPaymentRequest } = require('./src/models/PayflowPaymentRequest.model');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const payment = await PayflowPaymentRequest.findOne({
      legacySupabaseId: '00271de5-5e01-4364-9443-3ff1c542c4ab'
    }).lean();

    console.log('Legacy data keys:', Object.keys(payment.legacyData || {}));
    console.log('Legacy data:', JSON.stringify(payment.legacyData, null, 2));
    console.log('Current user fields:', {
      requestedBy: payment.requestedBy,
      createdBy: payment.createdBy
    });
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
})();
