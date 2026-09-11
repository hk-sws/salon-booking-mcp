// Quick connectivity check for whatever Firestore the env points at.
//   npm run test:firestore
// Writes a doc to _connftest, reads it back, deletes it, and reports the mode.

import 'dotenv/config'; // load .env before firestore.ts reads process.env
import { db, firestoreMode } from '../src/config/firestore';

async function main() {
  console.log(`[test] target: ${firestoreMode()}`);
  const ref = db.collection('_conntest').doc('ping');
  const stamp = new Date().toISOString();

  await ref.set({ stamp });
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.stamp !== stamp) {
    throw new Error('read-back mismatch');
  }
  await ref.delete();

  console.log('[test] write + read + delete OK ✅');
  process.exit(0);
}

main().catch((err) => {
  console.error('[test] FAILED ❌');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
