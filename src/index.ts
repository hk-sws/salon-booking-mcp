import 'dotenv/config'; // load .env before anything reads process.env
import { createApp } from './app';
import { firestoreMode } from './config/firestore';
import { seedSalon, isSeeded } from './db/seed';

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  console.log(`[boot] Firestore: ${firestoreMode()}`);

  // Seed on first run so the API is useful immediately after clone.
  if (process.env.SEED_ON_START !== 'false') {
    if (await isSeeded()) {
      console.log('[seed] tenant already present, skipping');
    } else {
      console.log('[seed] empty database — seeding Bloom Salon...');
      await seedSalon({ reset: false });
      console.log('[seed] done');
    }
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[boot] API listening on http://localhost:${PORT}`);
    console.log(`[boot] Swagger UI at   http://localhost:${PORT}/docs`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
