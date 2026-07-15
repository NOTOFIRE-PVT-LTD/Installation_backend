const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

async function start() {
  try {
    await connectDB();
    app.listen(env.port, () => {
      logger.info(`Server listening on port ${env.port} [${env.nodeEnv}]`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
