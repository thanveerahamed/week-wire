/**
 * Cloud Functions 2nd gen entry point. All functions pinned to europe-west1.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 10,
});

export { dispatchDigests } from './dispatcher';
export { sendUserDigest } from './worker';
