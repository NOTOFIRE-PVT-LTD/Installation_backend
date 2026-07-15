const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const mongoose = require('mongoose');

const env = require('./config/env');
const connectDB = require('./config/db');
const routes = require('./routes');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin) and configured frontend URLs
      if (!origin || env.clientUrls.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(env.cookie.secret));

// Ensure DB for every request (backup if serverless wrapper is skipped)
app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  try {
    await connectDB();
    return next();
  } catch (err) {
    return next(err);
  }
});

if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.get('/api/health', (req, res) => {
  const dbState =
    ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ||
    'unknown';

  res.json({
    success: true,
    message: 'OK',
    data: {
      uptime: process.uptime(),
      db: dbState,
      mongodbConfigured: env.mongodbUriConfigured,
      database: mongoose.connection.name || null,
    },
  });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
