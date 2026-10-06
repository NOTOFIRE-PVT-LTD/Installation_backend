const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

// Some routers/ISP resolvers refuse SRV lookups needed by mongodb+srv:// URIs.
const DNS_FAILURE_CODES = new Set(['EREFUSED', 'ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED']);
const FALLBACK_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

function isSrvLookupFailure(err) {
  return DNS_FAILURE_CODES.has(err?.code) && /query(Srv|Txt)/.test(`${err?.syscall || ''} ${err?.message || ''}`);
}

async function connectWithDnsFallback() {
  try {
    return await mongoose.connect(env.mongodbUri, connectOptions);
  } catch (err) {
    if (!isSrvLookupFailure(err)) throw err;
    // eslint-disable-next-line no-console
    console.warn(`[db] DNS lookup failed (${err.code}); retrying with public DNS ${FALLBACK_DNS_SERVERS.join(', ')}`);
    dns.setServers(FALLBACK_DNS_SERVERS);
    dns.promises.setServers(FALLBACK_DNS_SERVERS);
    return mongoose.connect(env.mongodbUri, connectOptions);
  }
}

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

    cache.promise = connectWithDnsFallback()
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
