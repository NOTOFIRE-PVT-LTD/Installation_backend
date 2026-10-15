require('dotenv').config();
const mongoose = require('mongoose');
const DeliveryChallan = require('./src/models/DeliveryChallan.model');
const QuotationMaster = require('./src/models/QuotationMaster.model');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const companies = await QuotationMaster.find({ kind: 'company' })
    .select('name code cin gstin address isDeleted deletedAt')
    .lean();
  console.log('companies', JSON.stringify(companies, null, 1));
  const dc = await DeliveryChallan.findOne({ dcNumber: 'VC/DC/26-27/99' }).select('company').lean();
  console.log('dc', JSON.stringify(dc, null, 1));
  const groups = await DeliveryChallan.aggregate([
    { $group: { _id: { ref: '$company.ref', name: '$company.name', hasAddress: { $gt: [{ $strLenCP: { $ifNull: ['$company.address', ''] } }, 0] } }, count: { $sum: 1 } } },
  ]);
  console.log('dc company groups', JSON.stringify(groups, null, 1));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
