'use strict';

/**
 * OVYX Game Engine Connector — developer session server
 *
 * Runtime: Node.js 20+
 *
 * Dependencies:
 *   npm i express firebase-admin
 *
 * Firebase:
 *   - Authentication verifies Firebase ID tokens.
 *   - Firestore stores active developer sessions in game_dev_sessions.
 *
 * Environment:
 *   PORT=8787
 *   SESSION_TTL_SECONDS=1800
 *   OVYX_GAME_ORIGINS=https://your-ovyx-domain.pages.dev,http://localhost:3000
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *
 * The browser/game engine must send:
 *   Authorization: Bearer <Firebase ID token>
 */

const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();

app.disable('x-powered-by');

app.use(express.json({
  limit: '1mb'
}));

const PORT = Number(
  process.env.PORT || 8787
);

const SESSION_TTL_SECONDS = Math.max(
  300,
  Math.min(
    Number(process.env.SESSION_TTL_SECONDS || 1800),
    86400
  )
);

const SESSION_COLLECTION = 'game_dev_sessions';

function clean(value, max = 500) {
  return String(
    value == null ? '' : value
  )
    .trim()
    .slice(0, max);
}

function initializeFirebase() {
  if (admin.apps.length) {
    return admin.app();
  }

  const raw = clean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    200000
  );

  if (raw) {
    let serviceAccount;

    try {
      serviceAccount = JSON.parse(raw);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.'
      );
    }

    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is incomplete.'
      );
    }

    return admin.initializeApp({
      credential: admin.credential.cert(
        serviceAccount
      ),
      projectId: serviceAccount.project_id
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

initializeFirebase();

const db = () =>
  admin.firestore();

const auth = () =>
  admin.auth();

function requestId(req) {
  return (
    req.get('X-Request-ID') ||
    crypto.randomUUID()
  );
}

function allowedOrigins() {
  return String(
    process.env.OVYX_GAME_ORIGINS || ''
  )
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.get('Origin');

  const origins = allowedOrigins();

  if (!origin) {
    return;
  }

  if (origins.includes('*')) {
    res.setHeader(
      'Access-Control-Allow-Origin',
      '*'
    );
  } else if (origins.includes(origin)) {
    res.setHeader(
      'Access-Control-Allow-Origin',
      origin
    );

    res.setHeader(
      'Vary',
      'Origin'
    );
  }

  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'Authorization',
      'Content-Type',
      'X-Request-ID',
      'X-Game-Engine',
      'X-Game-Engine-Version'
    ].join(', ')
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, DELETE, OPTIONS'
  );
}

app.use((req, res, next) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

function bearerToken(req) {
  const value = clean(
    req.get('Authorization'),
    5000
  );

  const match = value.match(
    /^Bearer\s+(.+)$/i
  );

  return match
    ? match[1].trim()
    : '';
}

async function authenticate(
  req,
  res,
  next
) {
  const token = bearerToken(req);

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message:
          'A Firebase ID token is required.'
      },
      requestId: requestId(req)
    });
  }

  try {
    const decoded =
      await auth().verifyIdToken(
        token,
        true
      );

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'INVALID_SESSION',
        message:
          'The Firebase authentication session is invalid or revoked.'
      },
      requestId: requestId(req)
    });
  }
}

function sessionExpiry(
  nowMs = Date.now()
) {
  const expiresAt =
    nowMs +
    SESSION_TTL_SECONDS * 1000;

  return admin.firestore.Timestamp.fromMillis(
    expiresAt
  );
}

function isActiveSession(data) {
  if (
    !data ||
    data.status !== 'active'
  ) {
    return false;
  }

  const expiry =
    data.expiresAt?.toMillis
      ? data.expiresAt.toMillis()
      : Number(
          data.expiresAt || 0
        );

  return expiry > Date.now();
}

function sanitizeMetadata(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  const output = {};

  for (
    const [key, raw]
    of Object.entries(value).slice(0, 30)
  ) {
    const safeKey = clean(
      key,
      80
    ).replace(
      /[^a-zA-Z0-9_.-]/g,
      '_'
    );

    if (!safeKey) {
      continue;
    }

    if (
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      output[safeKey] =
        typeof raw === 'string'
          ? clean(raw, 500)
          : raw;
    }
  }

  return output;
}

async function loadOwnedSession(
  uid,
  sessionId
) {
  const ref = db()
    .collection(SESSION_COLLECTION)
    .doc(
      clean(
        sessionId,
        120
      )
    );

  const snap =
    await ref.get();

  if (!snap.exists) {
    const error =
      new Error(
        'Developer session was not found.'
      );

    error.code =
      'SESSION_NOT_FOUND';

    throw error;
  }

  const data =
    snap.data();

  if (
    data.uid !== uid
  ) {
    const error =
      new Error(
        'Developer session does not belong to this account.'
      );

    error.code =
      'SESSION_NOT_FOUND';

    throw error;
  }

  return {
    ref,
    data
  };
}

app.get(
  '/healthz',
  (_req, res) => {
    res.json({
      ok: true,
      service:
        'ovyx-game-engine-connector',
      timestamp:
        new Date().toISOString()
    });
  }
);

app.post(
  '/api/game/developer/sessions',
  authenticate,
  async (req, res) => {
    const rid =
      requestId(req);

    try {
      const now =
        Date.now();

      const sessionId =
        `gs_${crypto.randomUUID().replace(/-/g, '')}`;

      const projectId =
        clean(
          req.body?.projectId,
          120
        );

      const engineVersion =
        clean(
          req.body?.engineVersion ||
            req.get(
              'X-Game-Engine-Version'
            ),
          80
        );

      const engine =
        clean(
          req.body?.engine ||
            req.get(
              'X-Game-Engine'
            ),
          80
        );

      const platform =
        clean(
          req.body?.platform,
          80
        );

      const metadata =
        sanitizeMetadata(
          req.body?.metadata
        );

      const session = {
        sessionId,
        uid: req.user.uid,
        email: clean(
          req.user.email,
          320
        ),
        projectId:
          projectId || null,
        engine,
        engineVersion,
        platform,
        metadata,
        status: 'active',
        startedAt:
          admin.firestore.Timestamp.fromMillis(
            now
          ),
        lastHeartbeatAt:
          admin.firestore.Timestamp.fromMillis(
            now
          ),
        expiresAt:
          sessionExpiry(now)
      };

      await db()
        .collection(
          SESSION_COLLECTION
        )
        .doc(sessionId)
        .set(session);

      return res
        .status(201)
        .json({
          ok: true,
          session: {
            sessionId,
            projectId:
              session.projectId,
            engine:
              session.engine,
            engineVersion:
              session.engineVersion,
            platform:
              session.platform,
            status:
              session.status,
            startedAt:
              session.startedAt
                .toDate()
                .toISOString(),
            expiresAt:
              session.expiresAt
                .toDate()
                .toISOString()
          },
          requestId: rid
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,
          error: {
            code:
              'SESSION_START_FAILED',
            message:
              error.message ||
              'Unable to start the developer session.'
          },
          requestId: rid
        });
    }
  }
);

app.post(
  '/api/game/developer/sessions/:sessionId/heartbeat',
  authenticate,
  async (req, res) => {
    const rid =
      requestId(req);

    try {
      const {
        ref,
        data
      } =
        await loadOwnedSession(
          req.user.uid,
          req.params.sessionId
        );

      if (
        !isActiveSession(
          data
        )
      ) {
        return res
          .status(409)
          .json({
            ok: false,
            error: {
              code:
                'SESSION_EXPIRED',
              message:
                'The developer session has expired.'
            },
            requestId: rid
          });
      }

      const now =
        Date.now();

      await ref.update({
        lastHeartbeatAt:
          admin.firestore.Timestamp.fromMillis(
            now
          ),
        expiresAt:
          sessionExpiry(now)
      });

      return res.json({
        ok: true,
        sessionId:
          data.sessionId,
        status:
          'active',
        expiresAt:
          new Date(
            now +
              SESSION_TTL_SECONDS *
                1000
          ).toISOString(),
        requestId: rid
      });
    } catch (error) {
      const status =
        error.code ===
        'SESSION_NOT_FOUND'
          ? 404
          : 500;

      return res
        .status(status)
        .json({
          ok: false,
          error: {
            code:
              error.code ||
              'SESSION_HEARTBEAT_FAILED',
            message:
              error.message ||
              'Unable to refresh the developer session.'
          },
          requestId: rid
        });
    }
  }
);

app.delete(
  '/api/game/developer/sessions/:sessionId',
  authenticate,
  async (req, res) => {
    const rid =
      requestId(req);

    try {
      const {
        ref,
        data
      } =
        await loadOwnedSession(
          req.user.uid,
          req.params.sessionId
        );

      await ref.update({
        status: 'ended',
        endedAt:
          admin.firestore.FieldValue
            .serverTimestamp()
      });

      return res.json({
        ok: true,
        sessionId:
          data.sessionId,
        status:
          'ended',
        requestId: rid
      });
    } catch (error) {
      const status =
        error.code ===
        'SESSION_NOT_FOUND'
          ? 404
          : 500;

      return res
        .status(status)
        .json({
          ok: false,
          error: {
            code:
              error.code ||
              'SESSION_END_FAILED',
            message:
              error.message ||
              'Unable to end the developer session.'
          },
          requestId: rid
        });
    }
  }
);

app.get(
  '/api/game/developer/sessions',
  authenticate,
  async (req, res) => {
    const rid =
      requestId(req);

    try {
      const snapshot =
        await db()
          .collection(
            SESSION_COLLECTION
          )
          .where(
            'uid',
            '==',
            req.user.uid
          )
          .limit(100)
          .get();

      const sessions = [];

      snapshot.forEach(
        doc => {
          const data =
            doc.data();

          if (
            isActiveSession(
              data
            )
          ) {
            sessions.push({
              sessionId:
                data.sessionId ||
                doc.id,
              projectId:
                data.projectId ||
                null,
              engine:
                data.engine ||
                '',
              engineVersion:
                data.engineVersion ||
                '',
              platform:
                data.platform ||
                '',
              status:
                'active',
              startedAt:
                data.startedAt?.toDate
                  ? data.startedAt
                      .toDate()
                      .toISOString()
                  : null,
              lastHeartbeatAt:
                data.lastHeartbeatAt?.toDate
                  ? data.lastHeartbeatAt
                      .toDate()
                      .toISOString()
                  : null,
              expiresAt:
                data.expiresAt?.toDate
                  ? data.expiresAt
                      .toDate()
                      .toISOString()
                  : null
            });
          }
        }
      );

      return res.json({
        ok: true,
        activeSessions:
          sessions,
        requestId: rid
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,
          error: {
            code:
              'SESSION_LIST_FAILED',
            message:
              error.message ||
              'Unable to list active developer sessions.'
          },
          requestId: rid
        });
    }
  }
);

app.get(
  '/api/game/developer/me',
  authenticate,
  async (req, res) => {
    return res.json({
      ok: true,
      developer: {
        uid:
          req.user.uid,
        email:
          req.user.email ||
          '',
        emailVerified:
          req.user.email_verified === true,
        name:
          req.user.name ||
          '',
        picture:
          req.user.picture ||
          ''
      },
      requestId:
        requestId(req)
    });
  }
);

app.use(
  (
    err,
    _req,
    res,
    _next
  ) => {
    console.error(
      '[OVYX game connector]',
      err
    );

    return res
      .status(500)
      .json({
        ok: false,
        error: {
          code:
            'INTERNAL_ERROR',
          message:
            'The game connector encountered an internal error.'
        }
      });
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `[OVYX] Game Engine Connector listening on port ${PORT}`
    );
  }
);
