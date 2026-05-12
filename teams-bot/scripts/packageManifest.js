import { createWriteStream, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestDir = join(__dirname, '..', 'manifest');
const outputPath = join(__dirname, '..', 'faq-bot-manifest.zip');

const output = createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => console.log(`Manifest packaged: ${outputPath} (${archive.pointer()} bytes)\nSideload this zip in Teams via Apps > Upload a custom app.`));
archive.on('error', err => { throw err; });
archive.pipe(output);

for (const file of readdirSync(manifestDir)) {
  const p = join(manifestDir, file);
  if (statSync(p).isFile()) archive.file(p, { name: file });
}
archive.finalize();
