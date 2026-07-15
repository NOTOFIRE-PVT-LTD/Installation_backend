const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.connection.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log('[db] MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[db] MongoDB disconnected');
  });

  await mongoose.connect(env.mongodbUri);
}

module.exports = connectDB;
