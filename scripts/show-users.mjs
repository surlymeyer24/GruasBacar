import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const keyPath = join(__dirname, '../functions/src/auth/ServiceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error('No se encontró ServiceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const auth = admin.auth();

async function main() {
  const result = await auth.listUsers(1000);
  for (const u of result.users) {
    console.log(`- ${u.email} (UID: ${u.uid}, Name: ${u.displayName})`);
  }
}

main().catch(console.error);
