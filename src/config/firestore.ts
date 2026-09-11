// Single Firestore client for the whole app.
//
// Selection (see firestoreMode()):
//   1. FIRESTORE_EMULATOR_HOST set  -> local emulator, NO credentials.
//   2. FIREBASE_SERVICE_ACCOUNT_BASE64 set -> real Firestore, creds decoded from
//      a base64 string (no JSON file on disk — ideal for Azure/CI env vars).
//   3. otherwise -> Application Default Credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS
//      file path, or workload identity).

import { Firestore, Settings } from '@google-cloud/firestore';

const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;

interface DecodedKey {
  projectId?: string;
  client_email: string;
  private_key: string;
}

/** Decode a base64-encoded service-account JSON into Firestore credentials. */
function credentialsFromBase64(): DecodedKey | undefined {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!b64) return undefined;
  let json: any;
  try {
    json = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
  } catch (e) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded JSON: ' +
        (e instanceof Error ? e.message : String(e))
    );
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('Decoded service account is missing client_email / private_key');
  }
  return {
    projectId: json.project_id,
    client_email: json.client_email,
    // Handle keys stored with literal "\n" sequences.
    private_key: String(json.private_key).replace(/\\n/g, '\n'),
  };
}

const decoded = usingEmulator ? undefined : credentialsFromBase64();

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT || decoded?.projectId || 'salon-mcp-local';

const settings: Settings = { projectId };
if (usingEmulator) {
  settings.ssl = false;
} else if (decoded) {
  settings.credentials = {
    client_email: decoded.client_email,
    private_key: decoded.private_key,
  };
}

export const db = new Firestore(settings);

export function firestoreMode(): string {
  if (usingEmulator) {
    return `emulator @ ${process.env.FIRESTORE_EMULATOR_HOST} (project ${projectId})`;
  }
  const auth = decoded ? 'base64 service account' : 'application default credentials';
  return `cloud project ${projectId} (${auth})`;
}
