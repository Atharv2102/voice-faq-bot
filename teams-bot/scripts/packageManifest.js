import 'dotenv/config';
import { createWriteStream, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestDir = join(__dirname, '..', 'manifest');
const buildDir = join(__dirname, '..', 'manifest-build');
const outputPath = join(__dirname, '..', 'faq-bot-manifest.zip');

const CLIENT_ID      = process.env.CLIENT_ID;
const BOT_DOMAIN     = process.env.BOT_DOMAIN;      // teams-bot domain
const BACKEND_DOMAIN = process.env.BACKEND_DOMAIN;  // backend domain (for voice tab)

if (!CLIENT_ID) {
  console.error('❌ CLIENT_ID env var is required (set it in .env or export it).');
  process.exit(1);
}
if (!BOT_DOMAIN) {
  console.error('❌ BOT_DOMAIN env var is required (e.g. BOT_DOMAIN=voice-faq-bot-teams.onrender.com).');
  process.exit(1);
}
if (!BACKEND_DOMAIN) {
  console.error('❌ BACKEND_DOMAIN env var is required (e.g. BACKEND_DOMAIN=voice-faq-bot-backend.onrender.com).');
  process.exit(1);
}

// Clean build dir
if (existsSync(buildDir)) rmSync(buildDir, { recursive: true });
mkdirSync(buildDir, { recursive: true });

// Copy each file from manifest/, substituting placeholders inside JSON files.
for (const file of readdirSync(manifestDir)) {
  const src = join(manifestDir, file);
  const dst = join(buildDir, file);
  if (!statSync(src).isFile()) continue;

  if (file.endsWith('.json')) {
    const raw = readFileSync(src, 'utf8');
    const obj = JSON.parse(raw);
    // Substitute all placeholders
    let json = JSON.stringify(obj);
    json = json.replace(/\{\{MICROSOFT_APP_ID\}\}/g, CLIENT_ID);
    json = json.replace(/\{\{BOT_DOMAIN\}\}/g,       BOT_DOMAIN);
    json = json.replace(/\{\{BACKEND_DOMAIN\}\}/g,   BACKEND_DOMAIN);
    const subbed = JSON.parse(json);
    writeFileSync(dst, JSON.stringify(subbed, null, 2));
  } else {
    // Copy binary (icons, etc.) as-is
    writeFileSync(dst, readFileSync(src));
  }
}

// Zip the build dir
const output = createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', () => {
  console.log(`✅ Manifest packaged: ${outputPath} (${archive.pointer()} bytes)`);
  console.log(`   CLIENT_ID:      ${CLIENT_ID}`);
  console.log(`   BOT_DOMAIN:     ${BOT_DOMAIN}`);
  console.log(`   BACKEND_DOMAIN: ${BACKEND_DOMAIN}`);
  console.log(`   Sideload via Teams → Apps → Upload a custom app.`);
});
archive.on('error', err => { throw err; });
archive.pipe(output);
for (const file of readdirSync(buildDir)) {
  archive.file(join(buildDir, file), { name: file });
}
archive.finalize();
