import * as fileStore from './fileStore.js';

const FILE = 'conversation-refs';
let cache = {}; // teamsUserId → conversationReference

// Load from disk on startup
try { cache = fileStore.read(FILE); } catch { cache = {}; }

export function store(teamsUserId, conversationReference) {
  cache[teamsUserId] = conversationReference;
  fileStore.write(FILE, cache); // async, non-blocking
}

export function get(teamsUserId) {
  return cache[teamsUserId] ?? null;
}

export function getAll() {
  return { ...cache };
}
