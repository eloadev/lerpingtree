// Toda la comunicación con Supabase vive aquí (mismo proyecto que LERPO).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configured =
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_KEY.startsWith('TU_');

const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// ---------- errores en español ----------
const MESSAGES = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Primero confirma tu correo (revisa tu bandeja y spam).'],
  [/user already registered/i, 'Ya existe una cuenta con ese correo. Inicia sesión.'],
  [/password should be at least (\d+)/i, (m) => `La contraseña debe tener al menos ${m[1]} caracteres.`],
  [/password.*(weak|pwned|leaked)/i, 'Esa contraseña es muy débil o aparece en filtraciones. Usa otra.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera un momento y vuelve a intentar.'],
  [/row-level security|permission denied/i, 'No tienes permiso para hacer eso.'],
  [/could not find the function public\.(my_calendars|calendar_feed|calendar_done)|relation .*cal(endar)?_.* does not exist/i,
    'Falta correr supabase/lerping-tree.sql en Supabase (SQL Editor).'],
  [/duplicate key.*cal_completions/i, 'Esa tarea ya estaba palomeada.'],
  [/payload too large|exceeded the maximum/i, 'La imagen pesa demasiado (máx 2 MB).'],
  [/failed to fetch|network/i, 'Sin conexión con el servidor. Revisa tu internet.'],
  [/jwt expired/i, 'Tu sesión expiró. Vuelve a iniciar sesión.'],
];

function friendly(error) {
  const raw = error?.message || String(error);
  for (const [re, msg] of MESSAGES) {
    const m = raw.match(re);
    if (m) return new Error(typeof msg === 'function' ? msg(m) : msg);
  }
  return new Error(raw);
}

function ok({ data, error }) {
  if (error) throw friendly(error);
  return data;
}

const siteUrl = () => location.origin + location.pathname;
const PROFILE = 'id, full_name, email, avatar_color, avatar_url';

// ---------- auth (igual que LERPO) ----------
export async function getSession() {
  return ok(await sb.auth.getSession()).session;
}
export function onAuthChange(cb) {
  return sb.auth.onAuthStateChange((event, session) => cb(event, session));
}
export async function signIn(email, password) {
  return ok(await sb.auth.signInWithPassword({ email, password }));
}
export async function signUp(email, password, fullName) {
  return ok(await sb.auth.signUp({
    email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: siteUrl() },
  }));
}
export async function signOut() {
  await sb.auth.signOut();
}
export async function sendReset(email) {
  return ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() + '?mode=reset' }));
}
export async function updatePassword(password) {
  return ok(await sb.auth.updateUser({ password }));
}

// ---------- perfil y áreas ----------
export async function getMyProfile(userId) {
  return ok(await sb.from('profiles').select('*').eq('id', userId).single());
}
export async function updateMyProfile(userId, patch) {
  return ok(await sb.from('profiles').update(patch).eq('id', userId).select().single());
}
export async function uploadAvatar(userId, blob) {
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
  const path = `${userId}/${Date.now()}.${ext}`;
  const bucket = sb.storage.from('avatars');
  ok(await bucket.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false }));
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const profile = await updateMyProfile(userId, { avatar_url: url });
  await cleanOldAvatars(userId, path);
  return profile;
}
export async function removeAvatar(userId) {
  const profile = await updateMyProfile(userId, { avatar_url: null });
  await cleanOldAvatars(userId, null);
  return profile;
}
async function cleanOldAvatars(userId, keepPath) {
  try {
    const bucket = sb.storage.from('avatars');
    const { data } = await bucket.list(userId, { limit: 100 });
    const old = (data || []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keepPath);
    if (old.length) await bucket.remove(old);
  } catch { /* no es grave */ }
}
export async function listAreas() {
  return ok(await sb.from('areas').select('*').order('position'));
}

// ---------- calendarios ----------
export async function myCalendars() {
  return ok(await sb.rpc('my_calendars'));
}
export async function createCalendar(c) {
  const id = ok(await sb.rpc('create_calendar', {
    p_name: c.name, p_color: c.color, p_emoji: c.emoji || '', p_description: c.description || '',
  }));
  return { id, ...c };
}
export async function updateCalendar(id, patch) {
  return ok(await sb.from('calendars').update(patch).eq('id', id).select().single());
}
export async function deleteCalendar(id) {
  return ok(await sb.from('calendars').delete().eq('id', id));
}

// Toda la gente de mis calendarios (extra + boards), con su perfil
export async function allMemberships() {
  const [cal, proj] = await Promise.all([
    sb.from('calendar_members').select(`calendar_id, user_id, role, profiles(${PROFILE})`),
    sb.from('project_members').select(`project_id, user_id, role, profiles(${PROFILE})`),
  ]);
  return { calendars: ok(cal), projects: ok(proj) };
}
export async function setCalMemberRole(calId, userId, role) {
  return ok(await sb.from('calendar_members').update({ role }).eq('calendar_id', calId).eq('user_id', userId));
}
export async function removeCalMember(calId, userId) {
  return ok(await sb.from('calendar_members').delete().eq('calendar_id', calId).eq('user_id', userId));
}

// ---------- invitaciones a calendarios extra ----------
export async function createCalInvite(calId, role, days, maxUses, note) {
  return ok(await sb.rpc('create_calendar_invite', {
    p_calendar: calId, p_role: role, p_days: days, p_max_uses: maxUses || null, p_note: note || '',
  }));
}
export async function listCalInvites(calId) {
  return ok(await sb.from('calendar_invitations')
    .select('id, role, note, created_at, expires_at, max_uses, uses, revoked')
    .eq('calendar_id', calId).order('created_at', { ascending: false }));
}
export async function revokeCalInvite(id) {
  return ok(await sb.from('calendar_invitations').update({ revoked: true }).eq('id', id));
}
export async function calInvitePreview(token) {
  const rows = ok(await sb.rpc('calendar_invite_preview', { p_token: token }));
  return rows?.[0] || null;
}
export async function acceptCalInvite(token) {
  return ok(await sb.rpc('accept_calendar_invite', { p_token: token }));
}

// ---------- lo que se pinta ----------
export async function feed(from, to) {
  return ok(await sb.rpc('calendar_feed', { p_from: from, p_to: to }));
}
export async function done(sinceIso) {
  return ok(await sb.rpc('calendar_done', { p_since: sinceIso }));
}

// ---------- tareas / eventos propios ----------
const EVENT_FIELDS = ['calendar_id', 'kind', 'title', 'notes', 'start_date', 'end_date', 'start_time',
  'end_time', 'color', 'repeat', 'repeat_until'];
const pick = (o) => Object.fromEntries(EVENT_FIELDS.filter((k) => k in o).map((k) => [k, o[k]]));

export async function createEvent(e, userId) {
  return ok(await sb.from('cal_events').insert({ ...pick(e), created_by: userId }).select().single());
}
export async function updateEvent(id, patch) {
  return ok(await sb.from('cal_events').update(pick(patch)).eq('id', id).select().single());
}
export async function deleteEvent(id) {
  return ok(await sb.from('cal_events').delete().eq('id', id));
}
export async function setEventAssignees(eventId, userIds, previous) {
  const add = userIds.filter((u) => !previous.includes(u));
  const remove = previous.filter((u) => !userIds.includes(u));
  if (remove.length) ok(await sb.from('cal_event_assignees').delete().eq('event_id', eventId).in('user_id', remove));
  if (add.length) ok(await sb.from('cal_event_assignees').insert(add.map((user_id) => ({ event_id: eventId, user_id }))));
}
export async function completeEvent(eventId, onDate, userId) {
  return ok(await sb.from('cal_completions').insert({ event_id: eventId, on_date: onDate, done_by: userId }));
}
export async function uncompleteEvent(eventId, onDate) {
  return ok(await sb.from('cal_completions').delete().eq('event_id', eventId).eq('on_date', onDate));
}
export async function listEventComments(eventId) {
  return ok(await sb.from('cal_comments').select(`*, profiles(${PROFILE})`)
    .eq('event_id', eventId).order('created_at'));
}
export async function addEventComment(eventId, body) {
  return ok(await sb.from('cal_comments').insert({ event_id: eventId, body })
    .select(`*, profiles(${PROFILE})`).single());
}
export async function deleteEventComment(id) {
  return ok(await sb.from('cal_comments').delete().eq('id', id));
}

// ---------- tareas que vienen de LERPO ----------
export async function setLerpoTaskDone(taskId, isDone) {
  return ok(await sb.from('tasks')
    .update({ status: isDone ? 'done' : 'in_progress', position: Date.now() / 1e6 })
    .eq('id', taskId).select('id, status, completed_at, completed_by').single());
}
export async function setLerpoTaskDue(taskId, dueDate) {
  return ok(await sb.from('tasks').update({ due_date: dueDate }).eq('id', taskId).select('id, due_date').single());
}
export async function setTaskColor(taskId, color) {
  if (!color) return ok(await sb.from('cal_task_colors').delete().eq('task_id', taskId));
  return ok(await sb.from('cal_task_colors').upsert({ task_id: taskId, color }));
}
export async function listTaskComments(taskId) {
  return ok(await sb.from('comments').select(`*, profiles(${PROFILE})`)
    .eq('task_id', taskId).order('created_at'));
}
export async function addTaskComment(taskId, body) {
  return ok(await sb.from('comments').insert({ task_id: taskId, body })
    .select(`*, profiles(${PROFILE})`).single());
}
export async function deleteTaskComment(id) {
  return ok(await sb.from('comments').delete().eq('id', id));
}

// ---------- tiempo real ----------
export function subscribe(cb) {
  const ch = sb.channel('lerping-tree');
  for (const table of ['calendars', 'cal_events', 'cal_completions', 'cal_task_colors', 'tasks', 'sprints']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
  }
  ch.subscribe();
  return () => sb.removeChannel(ch);
}
