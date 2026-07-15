const connectDB = require('../src/config/db');
const app = require('../src/app');

/**
 * Vercel serverless entry — connect to Mongo before handling the request.
 */
module.exports = async (req, res) => {
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
