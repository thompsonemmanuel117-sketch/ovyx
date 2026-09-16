import { jsonResponse, errorResponse } from './http.js';
import { db } from './firebase-admin.js';

// Clean security filter to drop sensitive data out of metadata entries
function sanitizeMetadata(data) {
  if (!data) return {};
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'cookie', 'credential', 'auth'];
  const sanitized = { ...data };
  
  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED_SECURITY_FILTER]';
    }
  });
  return sanitized;
}

// Master function to write logs to the Firebase database
async function writeLog(context, userEmail, action, resource, result, metadata = {}, providerId = null) {
  const { request, env } = context;
  
  const requestId = request.headers.get('cf-ray') || `req_${Math.random().toString(36).substring(2, 11)}`;
  const ipAddress = request.headers.get('cf-connecting-ip') || '127.0.0.1';
  
  const logDocument = {
    user: userEmail || 'ANONYMOUS_SYSTEM_CONTEXT',
    action: String(action).toUpperCase(),
    resource: resource || 'SYSTEM_NODE',
    timestamp: new Date().toISOString(),
    requestId: requestId,
    ipAddress: ipAddress,
    result: result || 'SUCCESS',
    providerEventId: providerId || 'N/A',
    metadata: sanitizeMetadata(metadata),
    schemaVersion: '1.0.0'
  };

  try {
    const projectId = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id;
    const url = `https://googleapis.com{projectId}/databases/(default)/documents/audit_logs`;
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: Object.keys(logDocument).reduce((acc, key) => {
          acc[key] = typeof logDocument[key] === 'object' 
            ? { stringValue: JSON.stringify(logDocument[key]) }
            : { stringValue: String(logDocument[key]) };
          return acc;
        }, {})
      })
    });
  } catch (e) {
    console.error('Audit log write critical failure:', e.message);
  }
}

// Exportable reusable handlers for all 11 core system events
export const audit = {
  roleChanged: (c, email, res, meta) => writeLog(c, email, 'ROLE_CHANGED', res, 'SUCCESS', meta),
  entitlementChanged: (c, email, res, meta) => writeLog(c, email, 'ENTITLEMENT_CHANGED', res, 'SUCCESS', meta),
  subscriptionCreated: (c, email, res, pid) => writeLog(c, email, 'SUBSCRIPTION_CREATED', res, 'SUCCESS', {}, pid),
  refundReceived: (c, email, res, pid) => writeLog(c, email, 'REFUND_RECEIVED', res, 'SUCCESS', {}, pid),
  chargebackReceived: (c, email, res, pid) => writeLog(c, email, 'CHARGEBACK_RECEIVED', res, 'ALERT', {}, pid),
  projectDeleted: (c, email, res) => writeLog(c, email, 'PROJECT_DELETED', res, 'SUCCESS'),
  githubRepositoryConnected: (c, email, res) => writeLog(c, email, 'GITHUB_CONNECTED', res, 'SUCCESS'),
  deploymentInitiated: (c, email, res) => writeLog(c, email, 'DEPLOYMENT_INITIATED', res, 'SUCCESS'),
  deploymentFailed: (c, email, res, err) => writeLog(c, email, 'DEPLOYMENT_FAILED', res, 'FAILURE', { error: err }),
  secretChanged: (c, email, res) => writeLog(c, email, 'SECRET_CHANGED', res, 'WARNING'),
  adminAction: (c, email, res, actionName) => writeLog(c, email, 'ADMIN_ACTION', res, 'SUCCESS', { action: actionName })
};
  
