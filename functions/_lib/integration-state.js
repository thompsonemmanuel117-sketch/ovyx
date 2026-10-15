import { getFirestoreData } from './firebase-admin.js';

/**
 * Global emergency switch for production integrations.
 * Missing configuration keeps existing installations live for backward
 * compatibility. Only the owner's explicit OFF value pauses operations.
 */
export async function getProductionIntegrationState(env) {
  const config = await getFirestoreData(env, 'system', 'config') || {};
  const configured = typeof config.liveDeploy === 'boolean'
    ? config.liveDeploy
    : typeof config.productionLive === 'boolean'
      ? config.productionLive
      : true;
  return {
    live: configured,
    updatedAt: config.updatedAt || null,
    updatedBy: config.updatedBy || null
  };
}
