const nodemailer = require('nodemailer');
const env = require('./env');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.secure,
  auth: env.smtp.user
    ? {
        user: env.smtp.user,
        pass: env.smtp.pass,
      }
    : undefined,
});

module.exports = transporter;
