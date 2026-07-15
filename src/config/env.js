const dotenv = require('dotenv');

dotenv.config();

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.warn(`[env] Missing recommended environment variables: ${missing.join(', ')}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  mongodbUri: process.env.MONGODB_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cookie: {
    secret: process.env.COOKIE_SECRET,
    refreshTokenName: process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    imageFolder: process.env.CLOUDINARY_IMAGE_FOLDER || 'nf-site-reports/images',
    videoFolder: process.env.CLOUDINARY_VIDEO_FOLDER || 'nf-site-reports/videos',
    documentFolder: process.env.CLOUDINARY_DOCUMENT_FOLDER || 'nf-site-reports/documents',
    cadFolder: process.env.CLOUDINARY_CAD_FOLDER || 'nf-site-reports/cad-drawings',
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName: process.env.SMTP_FROM_NAME || 'NF Site Installation Report',
    fromEmail: process.env.SMTP_FROM_EMAIL || 'no-reply@nfsite.com',
  },

  upload: {
    maxImageSizeMb: Number(process.env.MAX_IMAGE_SIZE_MB) || 5,
    maxVideoSizeMb: Number(process.env.MAX_VIDEO_SIZE_MB) || 100,
  },

  resetPasswordTokenExpiresMin: Number(process.env.RESET_PASSWORD_TOKEN_EXPIRES_MIN) || 60,

  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Super Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@nfsite.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    mobileNumber: process.env.SEED_ADMIN_MOBILE || '9999999999',
  },
};

module.exports = env;
