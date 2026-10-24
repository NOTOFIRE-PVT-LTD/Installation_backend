const { recordLog } = require('../services/auditLog.service');

const MODULE_MAP = [
  { prefix: '/api/auth/login', module: 'Auth', action: 'LOGIN' },
  { prefix: '/api/auth/logout', module: 'Auth', action: 'LOGOUT' },
  { prefix: '/api/auth/change-password', module: 'Auth', action: 'UPDATE' },
  { prefix: '/api/auth/reset-password', module: 'Auth', action: 'UPDATE' },
  { prefix: '/api/users', module: 'Users' },
  { prefix: '/api/projects', module: 'Projects' },
  { prefix: '/api/reports', module: 'Reports' },
  { prefix: '/api/payments', module: 'Payments' },
  { prefix: '/api/atlanta-payments', module: 'Atlanta Payments' },
  { prefix: '/api/quotations', module: 'Quotations' },
  { prefix: '/api/proforma-invoices', module: 'Proforma Invoices' },
  { prefix: '/api/delivery-challans', module: 'Delivery Challans' },
  { prefix: '/api/billing', module: 'Billing' },
  { prefix: '/api/stock', module: 'Stock Items' },
  { prefix: '/api/bom', module: 'BOM' },
  { prefix: '/api/item-master', module: 'Items Master' },
  { prefix: '/api/tenders', module: 'Tenders' },
  { prefix: '/api/cad/tenders', module: 'CAD Tenders' },
  { prefix: '/api/cad/divisions', module: 'CAD Divisions' },
  { prefix: '/api/nit-tenders', module: 'NIT Tenders' },
  { prefix: '/api/inspections', module: 'Inspections' },
  { prefix: '/api/financial-documents', module: 'Financial Documents' },
  { prefix: '/api/contract-agreements', module: 'Contract Agreements' },
  { prefix: '/api/call-letters', module: 'Call Letters' },
  { prefix: '/api/bg-applications', module: 'BG Applications' },
  { prefix: '/api/numbers', module: 'Numbers' },
  { prefix: '/api/whatsapp', module: 'WhatsApp Alerts' },
  { prefix: '/api/uploads', module: 'Uploads' },
];

function sanitizePayload(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 20).map((item) => sanitizePayload(item, depth + 1));

  const clean = {};
  const sensitiveKeys = ['password', 'currentpassword', 'newpassword', 'token', 'refreshtoken', 'accesstoken', 'secret'];

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      clean[key] = '[HIDDEN]';
    } else if (value && typeof value === 'object' && value.buffer) {
      clean[key] = '[BINARY DATA]';
    } else if (typeof value === 'string' && value.length > 500) {
      clean[key] = `${value.slice(0, 500)}… [TRUNCATED]`;
    } else {
      clean[key] = sanitizePayload(value, depth + 1);
    }
  }
  return clean;
}

function resolveEntityDetails(body, resData) {
  const data = resData?.data || resData || {};
  const entityId = data._id || data.id || body?.id || null;
  const entityName =
    data.name ||
    data.title ||
    data.fileName ||
    data.quotationNumber ||
    data.piNumber ||
    data.dcNumber ||
    data.invoiceNo ||
    data.tenderNo ||
    data.stationName ||
    data.email ||
    body?.name ||
    body?.title ||
    body?.fileName ||
    body?.email ||
    '';

  return { entityId: entityId ? String(entityId) : null, entityName: String(entityName || '').trim() };
}

function auditLoggerMiddleware(req, res, next) {
  // Only monitor mutating methods or auth endpoints
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isAuth = req.originalUrl.startsWith('/api/auth');

  if (!isMutating && !isAuth) {
    return next();
  }

  // Never audit log requests to audit-logs itself
  if (req.originalUrl.startsWith('/api/audit-logs') || req.originalUrl.startsWith('/api/health')) {
    return next();
  }

  // Intercept res.json to capture response payload
  const originalJson = res.json;
  let responseData = null;

  res.json = function (body) {
    responseData = body;
    return originalJson.apply(this, arguments);
  };

  res.on('finish', () => {
    // Only log successful operations or intentional client requests (status < 400)
    if (res.statusCode >= 400 && res.statusCode !== 401 && res.statusCode !== 403) {
      return;
    }

    try {
      const match = MODULE_MAP.find((m) => req.originalUrl.startsWith(m.prefix));
      const moduleName = match ? match.module : 'Other';

      let action = match?.action || 'OTHER';
      if (!match?.action) {
        if (req.originalUrl.includes('/status')) action = 'STATUS_CHANGE';
        else if (req.originalUrl.includes('/restore')) action = 'RESTORE';
        else if (req.originalUrl.includes('/impersonate')) action = 'LOGIN';
        else if (req.method === 'POST') action = 'CREATE';
        else if (req.method === 'PUT') action = 'UPDATE';
        else if (req.method === 'PATCH') action = 'STATUS_CHANGE';
        else if (req.method === 'DELETE') action = 'DELETE';
      }

      // If auth login succeeded, user is in responseData.data.user
      let actorUser = req.user;
      if (!actorUser && responseData?.data?.user) {
        actorUser = responseData.data.user;
      }

      const { entityId, entityName } = resolveEntityDetails(req.body, responseData);

      // Formulate a clean description
      let description = '';
      if (action === 'LOGIN') {
        description = `User ${actorUser?.name || req.body?.email || ''} logged into the system`;
      } else if (action === 'LOGOUT') {
        description = `User ${actorUser?.name || 'User'} logged out`;
      } else if (action === 'CREATE') {
        description = `Created ${moduleName.replace(/s$/, '')}${entityName ? `: "${entityName}"` : ''}`;
      } else if (action === 'UPDATE') {
        description = `Updated ${moduleName.replace(/s$/, '')}${entityName ? `: "${entityName}"` : ''}`;
      } else if (action === 'STATUS_CHANGE') {
        description = `Changed status in ${moduleName}${entityName ? `: "${entityName}"` : ''}`;
      } else if (action === 'DELETE') {
        description = `Deleted from ${moduleName}${entityName ? `: "${entityName}"` : ''}`;
      } else if (action === 'RESTORE') {
        description = `Restored ${moduleName.replace(/s$/, '')}${entityName ? `: "${entityName}"` : ''}`;
      } else {
        description = `${action} on ${moduleName}${entityName ? `: "${entityName}"` : ''}`;
      }

      const ipAddress =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        '';

      const userAgent = req.headers['user-agent'] || '';

      const details = {
        params: req.params,
        query: req.query,
        body: sanitizePayload(req.body),
        responseMessage: responseData?.message || '',
      };

      // Record asynchronously
      setImmediate(() => {
        recordLog({
          action,
          module: moduleName,
          description,
          user: actorUser?._id || null,
          userName: actorUser?.name || (action === 'LOGIN' ? req.body?.email : 'System'),
          userEmail: actorUser?.email || req.body?.email || '',
          userRole: actorUser?.role || '',
          entityId,
          entityName,
          method: req.method,
          endpoint: req.originalUrl,
          statusCode: res.statusCode,
          ipAddress,
          userAgent,
          details,
        });
      });
    } catch (err) {
      console.error('[AuditLogger] Middleware error:', err.message);
    }
  });

  next();
}

module.exports = auditLoggerMiddleware;
