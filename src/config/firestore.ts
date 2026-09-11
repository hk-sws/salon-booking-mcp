// Single Firestore client for the whole app.
//
// LOCAL DEV:  FIRESTORE_EMULATOR_HOST is set (see docker-compose) -> the client
//             auto-connects to the emulator and needs NO credentials.
// PRODUCTION: leave FIRESTORE_EMULATOR_HOST unset, set GOOGLE_CLOUD_PROJECT and
//             GOOGLE_APPLICATION_CREDENTIALS (service-account JSON) instead.

import { Firestore } from '@google-cloud/firestore';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'salon-mcp-local';
const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

export const db = new Firestore({
  projectId,
  // The emulator ignores auth; in prod the SDK picks up GOOGLE_APPLICATION_CREDENTIALS.
  ...(usingEmulator ? { ssl: false } : {}),
});

export function firestoreMode(): string {
  return usingEmulator
    ? `emulator @ ${process.env.FIRESTORE_EMULATOR_HOST} (project ${projectId})`
    : `cloud project ${projectId}`;
}
