/**
 * One-off backfill: adds BOM components that are missing from existing productions
 * (components added to a BOM after a production was created) as pending lines.
 *
 * Usage (from Backend/): node src/scripts/syncBomProductions.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const Bom = require('../models/Bom.model');
require('../models/User.model');
require('../models/StockItem.model');
const bomService = require('../services/bom.service');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const boms = await Bom.find({}).select('_id name version');
  let total = 0;
  for (const { _id, name, version } of boms) {
    const bom = await bomService.getBomById(_id);
    const extended = await bomService.addComponentsToProductions(bom);
    if (extended) console.log(`"${name}" v${version}: updated ${extended} production(s)`);
    total += extended;
  }
  console.log(`Done. ${total} production(s) updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
