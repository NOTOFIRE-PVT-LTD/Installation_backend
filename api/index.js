const connectDB = require('../src/config/db');
const app = require('../src/app');

/**
 * Vercel serverless entry — connect to Mongo before handling the request.
 */
module.exports = async (req, res) => {
  // Ensure CORS headers even when DB connect fails (avoids false "CORS error" in browser).
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return res.status(204).end();
  }

  try {
    await connectDB();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[vercel] Database connection failed:', err.message);
    if (!res.headersSent) {
      return res.status(503).json({
        success: false,
        message: `Database connection failed: ${err.message}`,
      });
    }
    return undefined;
  }

  return app(req, res);
};
