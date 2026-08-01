const whatsappNotificationService = require('../services/whatsappNotification.service');
const logger = require('../utils/logger');

const ONE_HOUR_MS = 60 * 60 * 1000;

let started = false;
let timer = null;

async function runOnce() {
  try {
    const result = await whatsappNotificationService.notifyBgDeadlineReminders();
    if (result?.processed > 0) {
      logger.info(
        `[job:bg-deadline] processed=${result.processed} sent=${result.sent}${result.skipped ? ' skipped' : ''}`
      );
    }
  } catch (err) {
    logger.error('[job:bg-deadline] Failed:', err.message);
  }
}

function startBgDeadlineReminderJob() {
  if (started) return;
  started = true;

  // Run shortly after boot, then every hour.
  setTimeout(() => {
    runOnce();
  }, 15 * 1000);

  timer = setInterval(runOnce, ONE_HOUR_MS);
  if (typeof timer.unref === 'function') timer.unref();

  logger.info('[job:bg-deadline] Scheduled (hourly) — LOA Date + 14 days → bg_deadline WhatsApp');
}

module.exports = { startBgDeadlineReminderJob, runOnce };
