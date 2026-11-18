const transporter = require('../config/mailer');
const env = require('../config/env');

async function main() {
  const host = env.smtp.host;
  const port = env.smtp.port;
  const secure = env.smtp.secure;
  const userSet = Boolean(env.smtp.user);
  const passSet = Boolean(env.smtp.pass);
  const to = env.smtp.fromEmail || env.smtp.user;

  console.log(`[smtp] host=${host} port=${port} secure=${secure} userSet=${userSet} passSet=${passSet}`);

  if (!userSet || !passSet) {
    console.log('SMTP_FAIL missing credentials');
    process.exit(1);
  }

  await transporter.verify();
  console.log('SMTP_VERIFY_OK');

  const info = await transporter.sendMail({
    from: `"${env.smtp.fromName}" <${env.smtp.fromEmail}>`,
    to,
    subject: 'VALUECON SMTP test',
    html: '<p>SMTP is working. Registration and resolution emails can be delivered.</p>',
  });
  console.log(`SMTP_SEND_OK messageId=${info.messageId || 'n/a'} accepted=${(info.accepted || []).length}`);
}

main().catch((err) => {
  console.log(`SMTP_FAIL ${err.message}`);
  process.exit(1);
});
