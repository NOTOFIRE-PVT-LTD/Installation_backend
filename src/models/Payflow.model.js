const mongoose = require('mongoose');

const { Schema } = mongoose;

const auditFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
};

const PayflowVendor = mongoose.model(
  'PayflowVendor',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true, uppercase: true },
      accountNumber: { type: String, required: true, trim: true },
      ifscCode: { type: String, required: true, trim: true, uppercase: true },
      ...auditFields,
    },
    { timestamps: true }
  )
);

const PayflowCategory = mongoose.model(
  'PayflowCategory',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      description: { type: String, default: '', trim: true },
      ...auditFields,
    },
    { timestamps: true }
  )
);

const PayflowSubcategory = mongoose.model(
  'PayflowSubcategory',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      description: { type: String, default: '', trim: true },
      ...auditFields,
    },
    { timestamps: true }
  )
);

const PayflowCompany = mongoose.model(
  'PayflowCompany',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      code: { type: String, required: true, unique: true, trim: true, uppercase: true },
      ...auditFields,
    },
    { timestamps: true }
  )
);

const PayflowBranch = mongoose.model(
  'PayflowBranch',
  new Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      code: { type: String, required: true, unique: true, trim: true, uppercase: true },
      ...auditFields,
    },
    { timestamps: true }
  )
);

module.exports = { PayflowVendor, PayflowCategory, PayflowSubcategory, PayflowCompany, PayflowBranch };
