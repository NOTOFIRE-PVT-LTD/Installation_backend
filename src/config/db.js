const mongoose = require('mongoose');
const env = require('./env');

/**
 * Cache on globalThis so Vercel warm invocations reuse one connection.
 * Official pattern for MongoDB + serverless.
 */
const globalCache = globalThis;

if (!globalCache.__mongooseCache) {
  globalCache.__mongooseCache = { conn: null, promise: null };
}

const cache = globalCache.__mongooseCache;

const connectOptions = {
  bufferCommands: false,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 20000,
  connectTimeoutMS: 20000,
  socketTimeoutMS: 45000,
  // Vercel often fails mongodb+srv over IPv6; force IPv4
  family: 4,
};

async function connectDB() {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is not set on this environment');
  }

  if (cache.conn && mongoose.connection.readyState === 1) {
    return cache.conn;
  }

  if (!cache.promise) {
    mongoose.set('bufferCommands', false);

    // eslint-disable-next-line no-console
    console.log('[db] Connecting to MongoDB...', {
      configured: env.mongodbUriConfigured,
      readyState: mongoose.connection.readyState,
    });

    cache.promise = mongoose
      .connect(env.mongodbUri, connectOptions)
      .then((m) => {
        // eslint-disable-next-line no-console
        console.log('[db] MongoDB connected:', m.connection.name);
        cache.conn = m.connection;
        return m.connection;
      })
      .catch((err) => {
        cache.promise = null;
        cache.conn = null;
        // eslint-disable-next-line no-console
        console.error('[db] MongoDB connection error:', err.message);
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

module.exports = connectDB;
