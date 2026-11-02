require('dotenv').config();
const mongoose = require('mongoose');
require('./src/models/User.model');
const { PayflowPaymentRequest } = require('./src/models/PayflowPaymentRequest.model');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const payment = await PayflowPaymentRequest.findOne({
      legacySupabaseId: { $type: 'string' }
    })
      .populate('requestedBy', 'name email')
      .select('srNo company vendor requestedBy legacySupabaseId');

    console.log(JSON.stringify(payment, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
})();
