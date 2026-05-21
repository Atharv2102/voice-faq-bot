import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '../../data');

// Per-file write queues (Promise chain acting as mutex)
const queues = new Map();

function fp(name) { return join(DATA, `${name}.json`); }
function exfp(name) { return join(DATA, `${name}.example.json`); }

/** On startup copy .example files into real files if missing */
function bootstrap() {
  for (const name of ['faqs', 'admins', 'suggestions', 'conversation-refs', 'users']) {
    if (!existsSync(fp(name)) && existsSync(exfp(name))) {
      copyFileSync(exfp(name), fp(name));
    }
  }
}
bootstrap();

function rawRead(name) {
  return JSON.parse(readFileSync(fp(name), 'utf-8'));
}

/** Read a JSON data file synchronously. */
export function read(name) {
  return rawRead(name);
}

/** Enqueue an async write operation for a file. Returns a Promise. */
export function write(name, data) {
  const prev = queues.get(name) ?? Promise.resolve();
  const next = prev.then(() => {
    writeFileSync(fp(name), JSON.stringify(data, null, 2), 'utf-8');
  }).catch((err) => {
    console.error(`fileStore write error [${name}]:`, err);
  });
  queues.set(name, next.catch(() => {})); // never break the queue
  return next;
}

/** Convenience: read → mutate → write atomically within the queue. */
export async function update(name, mutator) {
  const prev = queues.get(name) ?? Promise.resolve();
  let result;
  const next = prev.then(() => {
    const data = rawRead(name);
    result = mutator(data);
    writeFileSync(fp(name), JSON.stringify(data, null, 2), 'utf-8');
    return result;
  }).catch((err) => {
    console.error(`fileStore update error [${name}]:`, err);
    throw err;
  });
  queues.set(name, next.catch(() => {}));
  return next.then(() => result);
}
