const { recordLog } = require('../services/auditLog.service');

const MODULE_MAP = [
  { prefix: '/api/auth/login', module: 'Auth', action: 'LOGIN', app: 'users' },
  { prefix: '/api/auth/logout', module: 'Auth', action: 'LOGOUT', app: 'users' },
  { prefix: '/api/auth/change-password', module: 'Auth', action: 'UPDATE', app: 'users' },
  { prefix: '/api/auth/reset-password', module: 'Auth', action: 'UPDATE', app: 'users' },
  { prefix: '/api/users', module: 'Users', app: 'users' },
  { prefix: '/api/complaints', module: 'Complaints', app: 'complaints' },
  { prefix: '/api/attendance', module: 'Attendance', app: 'attendance' },
  { prefix: '/api/visits', module: 'Visits', app: 'attendance' },
  { prefix: '/api/visit-expenses', module: 'Visit Expenses', app: 'attendance' },
  { prefix: '/api/leaves', module: 'Leaves', app: 'attendance' },
  { prefix: '/api/people', module: 'People', app: 'attendance' },
  { prefix: '/api/customers', module: 'Customers', app: 'attendance' },
  { prefix: '/api/projects', module: 'Projects', app: 'projects' },
  { prefix: '/api/reports', module: 'Reports', app: 'projects' },
  { prefix: '/api/cad/tenders', module: 'CAD Tenders', app: 'tenders' },
  { prefix: '/api/cad/divisions', module: 'CAD Divisions', app: 'tenders' },
  { prefix: '/api/tenders', module: 'Tenders', app: 'tenders' },
  { prefix: '/api/nit-tenders', module: 'NIT Tenders', app: 'tenders' },
  { prefix: '/api/payments', module: 'Payments', app: 'projects' },
  { prefix: '/api/atlanta-payments', module: 'Atlanta Payments', app: 'atlantaPayments' },
  { prefix: '/api/quotations', module: 'Quotations', app: 'billing' },
  { prefix: '/api/proforma-invoices', module: 'Proforma Invoices', app: 'billing' },
  { prefix: '/api/delivery-challans', module: 'Delivery Challans', app: 'billing' },
  { prefix: '/api/billing', module: 'Billing', app: 'billing' },
  { prefix: '/api/stock', module: 'Stock Items', app: 'projects' },
  { prefix: '/api/bom', module: 'BOM', app: 'projects' },
  { prefix: '/api/item-master', module: 'Items Master', app: 'projects' },
  { prefix: '/api/inspections', module: 'Inspections', app: 'inspections' },
  { prefix: '/api/financial-documents', module: 'Financial Documents', app: 'financialDocuments' },
  { prefix: '/api/contract-agreements', module: 'Contract Agreements', app: 'financialDocuments' },
  { prefix: '/api/call-letters', module: 'Call Letters', app: 'financialDocuments' },
  { prefix: '/api/bg-applications', module: 'BG Applications', app: 'accounts' },
  { prefix: '/api/numbers', module: 'Numbers', app: 'users' },
  { prefix: '/api/whatsapp', module: 'WhatsApp Alerts', app: 'tenders' },
  { prefix: '/api/uploads', module: 'Uploads', app: 'projects' },
];

const SKIP_PREFIXES = [
  '/api/audit-logs',
  '/api/health',
  '/api/auth/refresh',
  '/api/auth/me',
  '/api/complaints/public',
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
  const nestedUser = data.user || {};
  const assigned = data.assignedTo || data.assignedEngineer || {};
  const entityId = data._id || data.id || nestedUser._id || body?.id || null;
  const entityName =
    data.name ||
    data.ticketNo ||
    data.ticketNumber ||
    nestedUser.name ||
    assigned.name ||
    data.title ||
    data.fileName ||
    data.quotationNumber ||
    data.piNumber ||
    data.dcNumber ||
    data.invoiceNo ||
    data.tenderNo ||
    data.stationName ||
    data.email ||
    nestedUser.email ||
    body?.name ||
    body?.title ||
    body?.fileName ||
    body?.email ||
    '';

  return { entityId: entityId ? String(entityId) : null, entityName: String(entityName || '').trim() };
}

function resolveAction(req, match) {
  const url = req.originalUrl || '';
  if (match?.action) return match.action;
  if (url.includes('/assign')) return 'UPDATE';
  if (url.includes('/status')) return 'STATUS_CHANGE';
  if (url.includes('/restore')) return 'RESTORE';
  if (url.includes('/impersonate')) return 'LOGIN';
  if (url.includes('/set-password') || url.includes('/reset-password')) return 'UPDATE';
  if (req.method === 'POST') return 'CREATE';
  if (req.method === 'PUT' || req.method === 'PATCH') return 'UPDATE';
  if (req.method === 'DELETE') return 'DELETE';
  return 'OTHER';
}

function buildDescription({ action, moduleName, entityName, req }) {
  const url = req.originalUrl || '';
  const label = entityName ? `: "${entityName}"` : '';
  if (url.includes('/assign')) return `Assigned ${moduleName.replace(/s$/, '')}${label}`;
  if (url.includes('/impersonate')) return `Logged in as ${entityName || 'user'}`;
  if (action === 'LOGIN') return `User ${entityName || req.body?.email || ''} logged into the system`;
  if (action === 'LOGOUT') return `User logged out`;
  if (action === 'CREATE') return `Created ${moduleName.replace(/s$/, '')}${label}`;
  if (action === 'UPDATE') return `Updated ${moduleName.replace(/s$/, '')}${label}`;
  if (action === 'STATUS_CHANGE') return `Changed status in ${moduleName}${label}`;
  if (action === 'DELETE') return `Deleted ${moduleName.replace(/s$/, '')}${label}`;
  if (action === 'RESTORE') return `Restored ${moduleName.replace(/s$/, '')}${label}`;
  return `${action} on ${moduleName}${label}`;
}

function auditLoggerMiddleware(req, res, next) {
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isMutating) return next();

  if (SKIP_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))) {
    return next();
  }

  const originalJson = res.json;
  let responseData = null;

  res.json = function (body) {
    responseData = body;
    return originalJson.apply(this, arguments);
  };

  res.on('finish', () => {
    if (res.statusCode >= 400) return;

    try {
      const match = MODULE_MAP.find((m) => req.originalUrl.startsWith(m.prefix));
      const moduleName = match ? match.module : 'Other';
      const app = match?.app || 'other';
      const action = resolveAction(req, match);

      let actorUser = req.user;
      if (!actorUser && responseData?.data?.user) {
        actorUser = responseData.data.user;
      }

      const { entityId, entityName } = resolveEntityDetails(req.body, responseData);
      const description = buildDescription({ action, moduleName, entityName, req });

      const ipAddress =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        '';

      setImmediate(() => {
        recordLog({
          action,
          module: moduleName,
          app,
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
          userAgent: req.headers['user-agent'] || '',
          details: {
            params: req.params,
            query: req.query,
            body: sanitizePayload(req.body),
            responseMessage: responseData?.message || '',
          },
        });
      });
    } catch (err) {
      console.error('[AuditLogger] Middleware error:', err.message);
    }
  });

  next();
}

module.exports = auditLoggerMiddleware;
