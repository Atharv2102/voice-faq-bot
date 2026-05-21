/**
 * Three-tier role model.
 *
 *   admin → full control      lt → can suggest      user → query only
 *   null  → not on any list, rejected
 *
 * Matching is **email-first** with teams_user_id as a fallback. When a user
 * matches by email but their entry doesn't yet have a teams_user_id stored,
 * we persist it so subsequent lookups are constant-time and survive even if
 * Teams doesn't return the email on every message.
 *
 * Env:
 *   ACCESS_OPEN_MODE=true  →  anyone on Teams can query
 */

import * as fileStore from './fileStore.js';

function norm(s) { return (s || '').toLowerCase().trim(); }

/**
 * Resolve a user's role.
 * @param {string} teamsUserId
 * @param {string} userEmail   optional — passed by the bot when available
 */
export function getRole(teamsUserId, userEmail = '') {
  if (!teamsUserId && !userEmail) return null;

  const { admins = [] } = fileStore.read('admins');
  const { users = [] } = fileStore.read('users');

  // 1. Admin lookup — email first, then teams_user_id
  const admin = findActive(admins, teamsUserId, userEmail);
  if (admin) {
    // Persist teams_user_id if matched by email but not yet stored
    if (userEmail && !admin.teams_user_id && teamsUserId) {
      bindTeamsId('admins', admin.email, teamsUserId);
    }
    return (admin.role || 'admin').toLowerCase();
  }

  // 2. Allowlisted user
  const user = findActive(users, teamsUserId, userEmail);
  if (user) {
    if (userEmail && !user.teams_user_id && teamsUserId) {
      bindTeamsIdUser(user.email, teamsUserId);
    }
    return 'user';
  }

  if (String(process.env.ACCESS_OPEN_MODE).toLowerCase() === 'true') return 'user';
  return null;
}

function findActive(list, teamsUserId, userEmail) {
  const tid = norm(teamsUserId);
  const em  = norm(userEmail);
  return list.find(x => {
    if (!x.active) return false;
    if (em && norm(x.email) === em) return true;
    if (tid && norm(x.teams_user_id) === tid) return true;
    return false;
  }) || null;
}

// Fire-and-forget persistence — never blocks the request.
function bindTeamsId(file, email, teamsUserId) {
  fileStore.update(file, (data) => {
    const a = (data.admins ?? []).find(x => norm(x.email) === norm(email));
    if (a && !a.teams_user_id) a.teams_user_id = teamsUserId;
    return data;
  }).catch(err => console.error('[access] bind admin id failed:', err.message));
}
function bindTeamsIdUser(email, teamsUserId) {
  fileStore.update('users', (data) => {
    const u = (data.users ?? []).find(x => norm(x.email) === norm(email));
    if (u && !u.teams_user_id) u.teams_user_id = teamsUserId;
    return data;
  }).catch(err => console.error('[access] bind user id failed:', err.message));
}

export function isAdmin(role)   { return role === 'admin'; }
export function isLT(role)      { return role === 'lt'; }
export function canSuggest(role){ return role === 'admin' || role === 'lt'; }
export function canQuery(role)  { return role === 'admin' || role === 'lt' || role === 'user'; }

export function getAdminEntry(teamsUserId, userEmail = '') {
  const { admins = [] } = fileStore.read('admins');
  return findActive(admins, teamsUserId, userEmail);
}
