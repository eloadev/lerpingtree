// Convierte lo que llega de Supabase en "cosas que se pintan en un día":
// repite eventos, decide colores, quién puede editar y qué se ve con los filtros.
import * as api from './api.js';
import { state, getPrefs } from './state.js';
import { addDays, daysBetween, parseDate, todayISO, toISO } from './ui.js';

export const REPEAT_LABEL = {
  none: 'No se repite', daily: 'Todos los días', weekdays: 'Entre semana (L–V)',
  weekly: 'Cada semana', biweekly: 'Cada 2 semanas', monthly: 'Cada mes',
};

// ---------- calendarios y personas ----------
export async function loadCalendars() {
  const [cals, mem] = await Promise.all([api.myCalendars(), api.allMemberships()]);
  state.calendars = cals || [];
  state.calById = new Map(state.calendars.map((c) => [c.id, c]));
  state.calByProject = new Map(state.calendars.filter((c) => c.project_id).map((c) => [c.project_id, c]));
  state.people = new Map();
  state.calMembers = new Map();
  if (state.profile) state.people.set(state.profile.id, state.profile);
  const add = (calId, row) => {
    if (!calId || !row.profiles) return;
    state.people.set(row.user_id, row.profiles);
    if (!state.calMembers.has(calId)) state.calMembers.set(calId, []);
    state.calMembers.get(calId).push({ user_id: row.user_id, role: row.role, profile: row.profiles });
  };
  for (const r of mem.calendars || []) add(r.calendar_id, r);
  for (const r of mem.projects || []) add(state.calByProject.get(r.project_id)?.id, r);
}

export const canEditCal = (cal) => cal && (cal.my_role === 'admin' || cal.my_role === 'member');
export const canManageCal = (cal) => cal && cal.my_role === 'admin';
export const calLabel = (cal) => `${cal?.emoji ? cal.emoji + ' ' : ''}${cal?.name || 'Calendario'}`;
export const person = (id) => state.people.get(id);
export const membersOf = (calId) => (state.calMembers.get(calId) || [])
  .slice().sort((a, b) => (a.profile.full_name || '').localeCompare(b.profile.full_name || '', 'es'));

// ---------- repeticiones ----------
// Fechas de inicio de cada repetición de e que tocan [from, to]
export function occurrenceDates(e, from, to) {
  const dur = e.end_date ? daysBetween(e.start_date, e.end_date) : 0;
  const touches = (d) => d <= to && addDays(d, dur) >= from;
  if (!e.repeat || e.repeat === 'none') return touches(e.start_date) ? [e.start_date] : [];

  const until = e.repeat_until && e.repeat_until < to ? e.repeat_until : to;
  const out = [];
  const lower = addDays(from, -dur);
  if (e.repeat === 'monthly') {
    const s = parseDate(e.start_date);
    const day = s.getDate();
    for (let k = 0; k < 400; k++) {
      const d = new Date(s.getFullYear(), s.getMonth() + k, day);
      if (d.getDate() !== day) continue;          // ej. 31 en un mes de 30: se salta
      const iso = toISO(d);
      if (iso > until) break;
      if (touches(iso)) out.push(iso);
    }
    return out;
  }
  const step = e.repeat === 'weekly' ? 7 : e.repeat === 'biweekly' ? 14 : 1;
  let k = Math.max(0, Math.floor(daysBetween(e.start_date, lower) / step));
  for (let d = addDays(e.start_date, k * step); d <= until; d = addDays(d, step)) {
    if (e.repeat === 'weekdays') {
      const wd = parseDate(d).getDay();
      if (wd === 0 || wd === 6) continue;
    }
    if (touches(d)) out.push(d);
    if (++k > 1000) break;
  }
  return out;
}

// ---------- colores ----------
function personColor(ids) {
  for (const id of ids || []) {
    const p = person(id);
    if (p?.avatar_color) return p.avatar_color;
  }
  return null;
}
export function colorOf(item) {
  if (item.customColor) return item.customColor;
  if (getPrefs().colorBy === 'person') {
    const c = personColor(item.assignees);
    if (c) return c;
  }
  if (item.areaColor && getPrefs().colorBy === 'person') return item.areaColor;
  return item.cal?.color || '#7DABC5';
}

// ---------- items ----------
// Cada item es una cosa en el calendario: un evento (o una repetición), una tarea de LERPO o un sprint.
export function buildItems(feed, from, to) {
  const items = [];
  const today = todayISO();
  for (const e of feed?.events || []) {
    const cal = state.calById.get(e.calendar_id);
    if (!cal) continue;
    const dur = e.end_date ? daysBetween(e.start_date, e.end_date) : 0;
    for (const on of occurrenceDates(e, from, to)) {
      const doneRow = (e.done || []).find((d) => d.on === on);
      const isTask = e.kind === 'task';
      items.push({
        key: `e:${e.id}@${on}`, type: 'event', id: e.id, raw: e, cal,
        kind: e.kind, title: e.title, start: on, end: addDays(on, dur),
        time: e.start_time ? e.start_time.slice(0, 5) : '', endTime: e.end_time ? e.end_time.slice(0, 5) : '',
        assignees: e.assignees || [], customColor: e.color,
        done: isTask && !!doneRow, doneBy: doneRow?.by, doneAt: doneRow?.at,
        // las repeticiones pasadas no cuentan como atrasadas (son rutinas)
        overdue: isTask && !doneRow && e.repeat === 'none' && addDays(on, dur) < today,
        repeat: e.repeat, comments: e.comment_count || 0,
        canEdit: canEditCal(cal), canMove: canEditCal(cal) && e.repeat === 'none',
      });
    }
  }
  for (const t of feed?.tasks || []) {
    const cal = state.calByProject.get(t.project_id);
    if (!cal) continue;
    const area = state.areaById.get(t.area_id);
    const isDone = t.status === 'done';
    items.push({
      key: `t:${t.id}`, type: 'task', id: t.id, raw: t, cal,
      kind: 'task', title: t.title, start: t.due_date, end: t.due_date, time: '',
      assignees: t.assignees || [], customColor: t.color, areaColor: area?.color, area,
      done: isDone, doneBy: t.completed_by, doneAt: t.completed_at,
      overdue: !isDone && t.due_date < today, status: t.status,
      repeat: 'none', comments: t.comment_count || 0,
      checklist: t.checklist_total ? `${t.checklist_done}/${t.checklist_total}` : '',
      canEdit: canEditCal(cal), canMove: canManageCal(cal),
    });
  }
  for (const s of feed?.sprints || []) {
    const cal = state.calByProject.get(s.project_id);
    if (!cal) continue;
    items.push({
      key: `s:${s.id}`, type: 'sprint', id: s.id, raw: s, cal, kind: 'sprint',
      title: s.name, start: s.start_date, end: s.end_date, assignees: [], done: false,
      canEdit: false, canMove: false,
    });
  }
  return items;
}

// ¿Se ve con los filtros actuales?
export function visible(item, { includeDone } = {}) {
  const p = getPrefs();
  if (p.hidden.includes(item.cal.id)) return false;
  if (item.type === 'sprint') return p.showSprints;
  if (item.done && !(includeDone ?? p.showDone)) return false;
  if (p.people.length && !item.assignees.some((id) => p.people.includes(id))) return false;
  return true;
}

// Orden dentro de un día: atrasadas, varios días, todo el día, por hora, por título
export function sortItems(a, b) {
  const span = (x) => daysBetween(x.start, x.end);
  return (b.type === 'sprint') - (a.type === 'sprint')
    || span(b) - span(a)
    || (a.done - b.done)
    || (a.time ? 1 : 0) - (b.time ? 1 : 0)
    || (a.time || '').localeCompare(b.time || '')
    || a.title.localeCompare(b.title, 'es');
}

// Junta "Hechas" de eventos y de LERPO en una sola lista ordenada
export function doneList(doneFeed) {
  const out = [];
  for (const d of doneFeed?.events || []) {
    const cal = state.calById.get(d.calendar_id);
    if (!cal) continue;
    out.push({
      key: `e:${d.event_id}@${d.on_date}`, type: 'event', id: d.event_id, onDate: d.on_date, cal,
      title: d.title, by: d.done_by, at: d.done_at, assignees: d.assignees || [], customColor: d.color,
      repeat: d.repeat, canEdit: canEditCal(cal),
    });
  }
  for (const t of doneFeed?.tasks || []) {
    const cal = state.calByProject.get(t.project_id);
    if (!cal) continue;
    out.push({
      key: `t:${t.id}`, type: 'task', id: t.id, onDate: t.due_date, cal, title: t.title,
      by: t.completed_by, at: t.completed_at, assignees: t.assignees || [], customColor: t.color,
      areaColor: state.areaById.get(t.area_id)?.color, canEdit: canEditCal(cal),
    });
  }
  return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}
