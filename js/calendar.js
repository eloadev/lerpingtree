// Pantalla principal: barra de calendarios, mes / agenda y el panel de "Hechas"
import * as api from './api.js';
import { state, getPrefs, setPrefs } from './state.js';
import {
  esc, icon, avatar, toast, toastError, lerp, anyModalOpen, $, $$,
  todayISO, addDays, daysBetween, parseDate, toISO, inkOn, isoOfTimestamp,
} from './ui.js';
import {
  loadCalendars, buildItems, visible, sortItems, colorOf, doneList, calLabel, person, canEditCal,
} from './model.js';
import { openItem, openNewEvent, openDay } from './details.js';
import { openCalendarForm, openCalendarSettings } from './calendars.js';
import { LERPO_URL } from './config.js';

const fmtMonth = new Intl.DateTimeFormat('es-MX', { month: 'long' });
const fmtDayLong = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

let ctx = null;
export function leaveCalendar() {
  if (!ctx) return;
  ctx.unsub?.();
  window.removeEventListener('resize', ctx.onResize);
  document.removeEventListener('keydown', ctx.onKey);
  ctx = null;
}

// ---------- entrada ----------
export async function renderCalendar(main, route) {
  const sameLayout = ctx && ctx.main === main && main.contains(ctx.root);
  if (!sameLayout) {
    leaveCalendar();
    ctx = { main, feed: null, range: null, done: null, items: [] };
    buildLayout();
    try { await loadCalendars(); } catch (e) { toastError(e); }
    renderSide();
    setupRealtime();
    loadDone();
  }
  ctx.root.classList.remove('side-drawer', 'done-drawer');
  ctx.view = route.view;
  ctx.month = route.month || todayISO().slice(0, 7);
  renderHead();
  await loadFeed();
}

// Vuelve a pedir todo (tras guardar algo o por tiempo real)
export async function refresh({ calendars = false } = {}) {
  if (!ctx) return;
  if (calendars) { try { await loadCalendars(); } catch (e) { toastError(e); } renderSide(); }
  await Promise.all([loadFeed(true), loadDone()]);
}

function buildLayout() {
  const p = getPrefs();
  ctx.main.innerHTML = `
  <div class="tree ${p.doneOpen ? 'done-open' : ''}" id="tree">
    <aside class="side" id="side" aria-label="Calendarios y filtros"></aside>
    <div class="scrim" data-close-drawers></div>
    <section class="cal" aria-label="Calendario">
      <header class="cal-head">
        <button class="icon-btn narrow-only" id="open-side" aria-label="Calendarios y filtros">${icon('filter')}</button>
        <div class="month-nav">
          <button class="icon-btn" id="prev" aria-label="Anterior">${icon('chevronL')}</button>
          <h1 id="title"></h1>
          <button class="icon-btn" id="next" aria-label="Siguiente">${icon('chevronR')}</button>
        </div>
        <button class="btn ghost small" id="today">Hoy</button>
        <span class="live-dot" id="live" title="Cambios en vivo" hidden></span>
        <span class="grow"></span>
        <div class="seg" role="radiogroup" aria-label="Vista" id="view-seg">
          <button type="button" role="radio" data-view="month">${icon('cal', 15)} <span class="hide-sm">Mes</span></button>
          <button type="button" role="radio" data-view="agenda">${icon('list', 15)} <span class="hide-sm">Agenda</span></button>
        </div>
        <button class="btn ghost small" id="toggle-done" title="Lo que ya se hizo">${icon('done', 16)} <span class="hide-sm">Hechas</span> <span class="count" id="done-count">0</span></button>
        <button class="btn" id="new">${icon('plus')} <span class="hide-sm">Nueva</span></button>
      </header>
      <div class="cal-body" id="cal-body"></div>
    </section>
    <aside class="done-panel" id="done-panel" aria-label="Hechas"></aside>
  </div>`;
  ctx.root = $('#tree', ctx.main);
  const r = ctx.root;

  $('#prev', r).addEventListener('click', () => go(-1));
  $('#next', r).addEventListener('click', () => go(1));
  $('#today', r).addEventListener('click', () => {
    if (ctx.view === 'agenda') { $('#cal-body', r).scrollTo({ top: 0, behavior: 'smooth' }); return; }
    location.hash = '#/';
  });
  $('#view-seg', r).addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) location.hash = b.dataset.view === 'agenda' ? '#/agenda' : `#/m/${ctx.month}`;
  });
  $('#new', r).addEventListener('click', () => newEvent());
  $('#toggle-done', r).addEventListener('click', () => {
    if (window.matchMedia('(max-width: 1100px)').matches) { r.classList.toggle('done-drawer'); return; }
    const open = !r.classList.contains('done-open');
    r.classList.toggle('done-open', open);
    setPrefs({ doneOpen: open });
    if (ctx.view === 'month') renderView();
  });
  $('#open-side', r).addEventListener('click', () => r.classList.add('side-drawer'));
  r.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawers]')) r.classList.remove('side-drawer', 'done-drawer');
  });

  // clicks en el calendario
  $('#cal-body', r).addEventListener('click', onBodyClick);
  $('#cal-body', r).addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-key]:not(button)')) { e.preventDefault(); e.target.click(); }
  });
  setupDrag($('#cal-body', r));

  ctx.onResize = debounce(() => { if (ctx?.view === 'month') renderView(); }, 120);
  window.addEventListener('resize', ctx.onResize);
  ctx.onKey = (e) => {
    if (anyModalOpen() || e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft' && ctx.view === 'month') go(-1);
    else if (e.key === 'ArrowRight' && ctx.view === 'month') go(1);
    else if (e.key === 't' || e.key === 'T') location.hash = ctx.view === 'agenda' ? '#/agenda' : '#/';
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newEvent(); }
  };
  document.addEventListener('keydown', ctx.onKey);
}

function go(delta) {
  const [y, m] = ctx.month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  location.hash = `#/m/${toISO(d).slice(0, 7)}`;
}

function newEvent(date) {
  const editable = state.calendars.filter((c) => canEditCal(c) && c.project_status !== 'archived');
  if (!editable.length) {
    toast('Primero crea un calendario (o pide que te inviten a uno).', 'info');
    openCalendarForm(null, () => refresh({ calendars: true }));
    return;
  }
  const inMonth = ctx.month === todayISO().slice(0, 7) ? todayISO() : `${ctx.month}-01`;
  openNewEvent({ date: date || (ctx.view === 'month' ? inMonth : todayISO()) }, () => refresh());
}

// ---------- datos ----------
function rangeFor() {
  if (ctx.view === 'agenda') {
    const t = todayISO();
    return { from: addDays(t, -60), to: addDays(t, 75) };
  }
  const first = `${ctx.month}-01`;
  const ws = getPrefs().weekStart;
  const back = (parseDate(first).getDay() - ws + 7) % 7;
  const from = addDays(first, -back);
  const d = parseDate(first);
  const last = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const fwd = (ws + 6 - parseDate(last).getDay() + 7) % 7;
  return { from, to: addDays(last, fwd) };
}

let feedSeq = 0;
async function loadFeed(silent = false) {
  const range = rangeFor();
  const sameRange = ctx.range && ctx.range.from === range.from && ctx.range.to === range.to;
  if (!sameRange) ctx.feed = null;
  ctx.range = range;
  if (!silent || !sameRange) renderView();
  const seq = ++feedSeq;
  try {
    const f = await api.feed(range.from, range.to);
    if (!ctx || seq !== feedSeq) return;
    ctx.feed = f;
  } catch (e) {
    if (!ctx || seq !== feedSeq) return;
    toastError(e);
    ctx.feed = ctx.feed || { events: [], tasks: [], sprints: [] };
  }
  renderView();
}

async function loadDone() {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  since.setHours(0, 0, 0, 0);
  try {
    ctx.done = await api.done(since.toISOString());
  } catch (e) { toastError(e); ctx.done = { events: [], tasks: [] }; }
  if (ctx) renderDone();
}

function rebuildItems() {
  ctx.items = ctx.feed ? buildItems(ctx.feed, ctx.range.from, ctx.range.to) : [];
}

function renderHead() {
  const r = ctx.root;
  const [y, m] = ctx.month.split('-').map(Number);
  const name = fmtMonth.format(new Date(y, m - 1, 1));
  $('#title', r).innerHTML = ctx.view === 'agenda'
    ? 'Agenda <span>próximos días</span>'
    : `${esc(name)} <span>${y}</span>`;
  $$('#view-seg [data-view]', r).forEach((b) => {
    const on = b.dataset.view === ctx.view;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
  });
  $('#prev', r).hidden = $('#next', r).hidden = ctx.view === 'agenda';
}

function renderView() {
  if (!ctx) return;
  rebuildItems();
  if (ctx.view === 'agenda') renderAgenda(); else renderMonth();
}

// ---------- vista de mes ----------
function itemChip(seg, it, lane) {
  const color = colorOf(it);
  const cls = [
    'it', `it-${it.type}`, `k-${it.kind}`,
    it.start < seg.ws ? 'cl' : '', it.end > seg.we ? 'cr' : '',
    it.type !== 'sprint' && (seg.span > 1 || (it.kind === 'event' && !it.time)) ? 'is-bar' : '',
    it.done ? 'is-done' : '', it.overdue ? 'is-late' : '', it.canMove ? 'movable' : '',
  ].filter(Boolean).join(' ');
  const showCheck = it.kind === 'task' && it.type !== 'sprint' && it.start >= seg.ws;
  const label = it.type === 'sprint'
    ? `🏃 ${esc(it.title)} <small>${esc(it.cal.name)}</small>`
    : `${it.time && it.kind === 'event' ? `<b class="t">${esc(it.time)}</b>` : ''}${esc(it.title)}`;
  return `<div class="${cls}" data-key="${esc(it.key)}" tabindex="0" ${it.canMove ? 'draggable="true"' : ''}
      style="grid-column:${seg.c0 + 1} / span ${seg.span};grid-row:${lane + 2};--c:${esc(color)};--on:${inkOn(color)}"
      title="${esc(it.title)}${it.type !== 'sprint' ? ' · ' + esc(calLabel(it.cal)) : ''}">
      ${showCheck ? `<button class="chk ${it.done ? 'on' : ''}" data-check="${esc(it.key)}" aria-label="${it.done ? 'Desmarcar' : 'Palomear'}: ${esc(it.title)}" ${it.canEdit ? '' : 'disabled'}>${icon('check', 11)}</button>` : ''}
      <span class="it-label">${label}</span>
    </div>`;
}

function renderMonth() {
  const body = $('#cal-body', ctx.root);
  const { from, to } = ctx.range;
  const weeks = (daysBetween(from, to) + 1) / 7;
  const today = todayISO();
  const ws = getPrefs().weekStart;
  const items = ctx.items.filter((it) => visible(it)).sort(sortItems);

  const narrow = window.matchMedia('(max-width: 700px)').matches;
  const laneH = narrow ? 17 : 22;
  const avail = (body.clientHeight || window.innerHeight - 140) - 30;
  let lanes = Math.floor((avail / weeks - 30 - 18) / laneH);
  lanes = Math.max(narrow ? 3 : 2, Math.min(8, lanes));

  let html = `<div class="month ${ctx.feed ? '' : 'loading'}" style="--weeks:${weeks};--lane-h:${laneH}px;--lanes:${lanes}">
    <div class="dow">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<span>${DOW[(i + ws) % 7]}</span>`).join('')}</div>`;
  for (let w = 0; w < weeks; w++) {
    const wStart = addDays(from, w * 7);
    const wEnd = addDays(wStart, 6);
    const segs = items.filter((it) => it.start <= wEnd && it.end >= wStart).map((it) => {
      const c0 = Math.max(0, daysBetween(wStart, it.start));
      const c1 = Math.min(6, daysBetween(wStart, it.end));
      return { it, c0, span: c1 - c0 + 1, ws: wStart, we: wEnd };
    });
    // carriles: cada cosa en el primer carril libre
    const used = [];
    const hidden = Array(7).fill(0);
    let cells = '';
    for (const s of segs) {
      let lane = 0;
      while ((used[lane] ||= Array(7).fill(false)).slice(s.c0, s.c0 + s.span).some(Boolean)) lane++;
      for (let c = s.c0; c < s.c0 + s.span; c++) used[lane][c] = true;
      if (lane >= lanes) { for (let c = s.c0; c < s.c0 + s.span; c++) hidden[c]++; continue; }
      cells += itemChip(s, s.it, lane);
    }
    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(wStart, i);
      const dow = parseDate(d).getDay();
      const cls = ['day', d.slice(0, 7) !== ctx.month ? 'other' : '', d === today ? 'today' : '',
        dow === 0 || dow === 6 ? 'weekend' : '', d < today ? 'past' : ''].filter(Boolean).join(' ');
      days += `<div class="${cls}" data-date="${d}" style="grid-column:${i + 1}">
        <span class="dnum">${parseDate(d).getDate()}${d.endsWith('-01') ? ` <small>${esc(fmtMonth.format(parseDate(d)).slice(0, 3))}</small>` : ''}</span>
        <button class="day-add" data-add="${d}" aria-label="Agregar el ${d}" tabindex="-1">${icon('plus', 13)}</button>
      </div>`;
    }
    const more = hidden.map((n, i) => (n ? `<button class="more" data-day="${addDays(wStart, i)}" style="grid-column:${i + 1}">+${n} más</button>` : '')).join('');
    html += `<div class="week" data-week-start="${wStart}">${days}${cells}${more}</div>`;
  }
  html += '</div>';
  if (ctx.feed && !items.some((it) => it.type !== 'sprint') && !state.calendars.length) {
    html += `<div class="first-run">${lerp('bombilla', 'lerp-notice')}
      <div><b>Tu árbol está vacío</b><p class="muted small">Crea un calendario (ej. “Web”) o pide que te inviten a un board de LERPO para ver sus tareas aquí.</p>
      <button class="btn small" data-new-cal>${icon('plus', 14)} Crear calendario</button></div></div>`;
  }
  body.innerHTML = html;
}

// ---------- vista de agenda ----------
function agendaRow(it) {
  const color = colorOf(it);
  const people = it.assignees.map(person).filter(Boolean);
  const span = daysBetween(it.start, it.end);
  return `<div class="arow ${it.done ? 'is-done' : ''} ${it.overdue ? 'is-late' : ''}" data-key="${esc(it.key)}" tabindex="0" style="--c:${esc(color)}">
    ${it.kind === 'task' ? `<button class="chk ${it.done ? 'on' : ''}" data-check="${esc(it.key)}" aria-label="${it.done ? 'Desmarcar' : 'Palomear'}: ${esc(it.title)}" ${it.canEdit ? '' : 'disabled'}>${icon('check', 12)}</button>` : '<span class="dot"></span>'}
    <span class="when">${it.time ? esc(it.time) + (it.endTime ? '–' + esc(it.endTime) : '') : span ? `${span + 1} días` : 'Todo el día'}</span>
    <span class="grow"><b>${esc(it.title)}</b>
      <small class="muted">${esc(calLabel(it.cal))}${it.type === 'task' ? ' · LERPO' : ''}${it.overdue ? ` · <span class="late">venció ${relDay(it.end)}</span>` : ''}</small></span>
    ${it.repeat && it.repeat !== 'none' ? `<span class="muted" title="Se repite">${icon('repeat', 14)}</span>` : ''}
    ${it.comments ? `<span class="muted small">${icon('chat', 14)} ${it.comments}</span>` : ''}
    ${it.checklist ? `<span class="muted small">${icon('checklist', 14)} ${esc(it.checklist)}</span>` : ''}
    <span class="avatars">${people.slice(0, 3).map((p) => avatar(p, 'xs')).join('')}</span>
  </div>`;
}
function relDay(iso) {
  const n = daysBetween(iso, todayISO());
  return n === 1 ? 'ayer' : `hace ${n} días`;
}

function renderAgenda() {
  const body = $('#cal-body', ctx.root);
  const today = todayISO();
  const items = ctx.items.filter((it) => visible(it) && it.type !== 'sprint');
  const late = items.filter((it) => it.overdue).sort((a, b) => a.end.localeCompare(b.end));
  let html = '<div class="agenda">';
  if (!ctx.feed) html += '<div class="skeleton" style="height:240px"></div>';
  if (late.length) {
    html += `<section class="aday late-box"><h3>${icon('flame', 16)} Atrasadas <span class="count">${late.length}</span></h3>${late.map(agendaRow).join('')}</section>`;
  }
  let shown = 0;
  for (let i = 0; i <= 75; i++) {
    const d = addDays(today, i);
    const list = items.filter((it) => it.start <= d && it.end >= d).sort(sortItems);
    if (!list.length && i !== 0) continue;
    shown++;
    const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : fmtDayLong.format(parseDate(d));
    html += `<section class="aday ${i === 0 ? 'is-today' : ''}">
      <h3><span>${esc(label)}</span>${i <= 1 ? `<small class="muted">${esc(fmtDayLong.format(parseDate(d)))}</small>` : ''}
        <button class="icon-btn tiny" data-add="${d}" aria-label="Agregar">${icon('plus', 14)}</button></h3>
      ${list.length ? list.map(agendaRow).join('') : `<p class="muted small empty-day">${lerp('contento', 'lerp-mini')} Nada pendiente hoy. ¡A regar el árbol! 🌱</p>`}
    </section>`;
    if (shown > 40) break;
  }
  html += '</div>';
  body.innerHTML = html;
}

// ---------- clicks ----------
function findItem(key) {
  return ctx.items.find((x) => x.key === key);
}
function onBodyClick(e) {
  const chk = e.target.closest('[data-check]');
  if (chk) {
    e.stopPropagation();
    const it = findItem(chk.dataset.check);
    if (it) setDone(it, !it.done, chk);
    return;
  }
  if (e.target.closest('[data-new-cal]')) { openCalendarForm(null, () => refresh({ calendars: true })); return; }
  const add = e.target.closest('[data-add]');
  if (add) { newEvent(add.dataset.add); return; }
  const more = e.target.closest('[data-day]');
  if (more) { dayModal(more.dataset.day); return; }
  const el = e.target.closest('[data-key]');
  if (el) {
    const it = findItem(el.dataset.key);
    if (it) openItem(it, itemCtx());
    return;
  }
  const day = e.target.closest('.day');
  if (day) dayModal(day.dataset.date);
}

function itemCtx() {
  return {
    onChange: () => refresh(),
    setDone: (it, v) => setDone(it, v),
  };
}

function dayModal(date) {
  const list = () => ctx.items.filter((it) => it.start <= date && it.end >= date && visible(it, { includeDone: true }))
    .sort(sortItems);
  openDay(date, list, { ...itemCtx(), onAdd: () => refresh() });
}

// ---------- palomear ----------
export async function setDone(it, value, fromEl) {
  if (!it.canEdit) { toast('Solo puedes ver este calendario.', 'info'); return; }
  const me = state.user.id;
  const now = new Date().toISOString();
  const onDate = it.onDate || it.start;
  // optimista: se quita del calendario al instante
  const ev = it.type === 'event' ? ctx?.feed?.events.find((x) => x.id === it.id) : null;
  const tk = it.type === 'task' ? ctx?.feed?.tasks.find((x) => x.id === it.id) : null;
  const backup = ev ? [...(ev.done || [])] : tk ? { ...tk } : null;
  if (ev) ev.done = value ? [...ev.done.filter((d) => d.on !== onDate), { on: onDate, by: me, at: now }] : ev.done.filter((d) => d.on !== onDate);
  if (tk) Object.assign(tk, value ? { status: 'done', completed_by: me, completed_at: now } : { status: 'in_progress', completed_by: null, completed_at: null });
  if (value && fromEl) burst(fromEl, colorOf(it));
  if (ctx) setTimeout(() => renderView(), value && fromEl ? 260 : 0);
  try {
    if (it.type === 'event') {
      if (value) await api.completeEvent(it.id, onDate, me); else await api.uncompleteEvent(it.id, onDate);
    } else {
      await api.setLerpoTaskDone(it.id, value);
    }
    if (value) toast(`“${it.title}” hecha 🌱`, 'success', { label: 'Deshacer', run: () => setDone({ ...it, onDate }, false) });
    if (ctx) loadDone();
  } catch (e) {
    toastError(e);
    if (ev) ev.done = backup;
    if (tk) Object.assign(tk, backup);
    if (ctx) renderView();
  }
}

// hojitas que salen volando al palomear
function burst(el, color) {
  const r = el.getBoundingClientRect();
  const host = document.createElement('div');
  host.className = 'burst';
  host.style.left = `${r.left + r.width / 2}px`;
  host.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < 8; i++) {
    const s = document.createElement('i');
    const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
    s.style.setProperty('--dx', `${Math.cos(a) * (22 + Math.random() * 16)}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * (22 + Math.random() * 16) - 8}px`);
    s.style.setProperty('--c', i % 2 ? color : '#22a06b');
    host.append(s);
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 700);
}

// ---------- arrastrar a otro día ----------
function setupDrag(body) {
  let dragKey = null;
  const dateAt = (e) => {
    const day = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('day'));
    if (day) return day.dataset.date;
    const week = e.target.closest?.('.week');
    if (!week) return null;
    const rect = week.getBoundingClientRect();
    const col = Math.min(6, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 7)));
    return addDays(week.dataset.weekStart, col);
  };
  body.addEventListener('dragstart', (e) => {
    const el = e.target.closest('[data-key][draggable=true]');
    if (!el) return;
    dragKey = el.dataset.key;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragKey);
    el.classList.add('dragging');
  });
  body.addEventListener('dragend', () => {
    dragKey = null;
    $$('.drop-on', body).forEach((n) => n.classList.remove('drop-on'));
    $$('.dragging', body).forEach((n) => n.classList.remove('dragging'));
  });
  body.addEventListener('dragover', (e) => {
    if (!dragKey) return;
    e.preventDefault();
    const d = dateAt(e);
    $$('.drop-on', body).forEach((n) => n.dataset.date !== d && n.classList.remove('drop-on'));
    if (d) $(`.day[data-date="${d}"]`, body)?.classList.add('drop-on');
  });
  body.addEventListener('drop', async (e) => {
    if (!dragKey) return;
    e.preventDefault();
    const it = findItem(dragKey);
    const d = dateAt(e);
    if (!it || !d || d === it.start) return;
    const delta = daysBetween(it.start, d);
    try {
      if (it.type === 'event') {
        const ev = ctx.feed.events.find((x) => x.id === it.id);
        const patch = { start_date: d, end_date: ev.end_date ? addDays(ev.end_date, delta) : null };
        Object.assign(ev, patch);
        renderView();
        await api.updateEvent(it.id, patch);
      } else if (it.type === 'task') {
        const tk = ctx.feed.tasks.find((x) => x.id === it.id);
        tk.due_date = d;
        renderView();
        await api.setLerpoTaskDue(it.id, d);
      }
      toast(`Movida al ${fmtDayLong.format(parseDate(d))}`, 'success');
    } catch (ex) { toastError(ex); }
    refresh();
  });
}

// ---------- tiempo real ----------
function setupRealtime() {
  try {
    const reload = debounce(() => refresh(), 500);
    const reloadAll = debounce(() => refresh({ calendars: true }), 500);
    ctx.unsub = api.subscribe((payload) => {
      if (payload?.table === 'calendars') reloadAll(); else reload();
    });
    $('#live', ctx.root).hidden = false;
  } catch { /* sin tiempo real no pasa nada */ }
}

// ---------- barra lateral ----------
function calRow(c) {
  const hidden = getPrefs().hidden.includes(c.id);
  return `<li class="cal-row ${hidden ? 'off' : ''}" style="--c:${esc(c.color)}">
    <label class="cal-toggle">
      <input type="checkbox" data-cal-vis="${c.id}" ${hidden ? '' : 'checked'}>
      <span class="box">${icon('check', 12)}</span>
      <span class="name">${c.emoji ? `<span class="emoji">${esc(c.emoji)}</span>` : ''}${esc(c.name)}</span>
    </label>
    ${c.my_role === 'viewer' ? `<span class="role-pill" title="Solo puedes ver">${icon('eye', 12)}</span>` : ''}
    <button class="icon-btn tiny" data-cal-gear="${c.id}" aria-label="Ajustes de ${esc(c.name)}">${icon('gear', 14)}</button>
  </li>`;
}

function renderSide() {
  const side = $('#side', ctx.root);
  const p = getPrefs();
  const own = state.calendars.filter((c) => !c.project_id);
  const boards = state.calendars.filter((c) => c.project_id && c.project_status !== 'archived');
  const archived = state.calendars.filter((c) => c.project_id && c.project_status === 'archived');
  const people = [...state.people.values()].sort((a, b) =>
    (a.id === state.user.id ? -1 : b.id === state.user.id ? 1 : 0) || (a.full_name || '').localeCompare(b.full_name || '', 'es'));

  side.innerHTML = `
    <div class="side-head narrow-only"><b>Calendarios</b><button class="icon-btn" data-close-drawers aria-label="Cerrar">${icon('x')}</button></div>
    <section>
      <div class="side-title"><h2>Mis calendarios</h2>
        <button class="icon-btn tiny" id="new-cal" title="Nuevo calendario" aria-label="Nuevo calendario">${icon('plus', 16)}</button></div>
      <ul class="cal-list">${own.map(calRow).join('') || '<li class="muted small pad">Crea uno para tu área: Web, Arte, Juntas…</li>'}</ul>
    </section>
    <section>
      <div class="side-title"><h2>Boards de LERPO</h2>
        <a class="icon-btn tiny" href="${esc(LERPO_URL)}" target="_blank" rel="noopener" title="Abrir LERPO" aria-label="Abrir LERPO">${icon('external', 14)}</a></div>
      <ul class="cal-list">${boards.map(calRow).join('') || '<li class="muted small pad">Cuando entres a un board de LERPO, sus tareas con fecha aparecen aquí solitas.</li>'}</ul>
      ${archived.length ? `<details class="archived-cals"><summary class="muted small">Archivados (${archived.length})</summary><ul class="cal-list">${archived.map(calRow).join('')}</ul></details>` : ''}
    </section>
    ${people.length > 1 ? `<section>
      <div class="side-title"><h2>Personas</h2>${p.people.length ? '<button class="link-btn" id="people-all">Ver todas</button>' : ''}</div>
      <ul class="people">${people.map((pp) => `
        <li><button class="person ${p.people.includes(pp.id) ? 'on' : ''}" data-person="${pp.id}" style="--c:${esc(pp.avatar_color)}" aria-pressed="${p.people.includes(pp.id)}">
          ${avatar(pp, 'xs')}<span class="pname">${esc(pp.id === state.user.id ? 'Yo' : (pp.full_name || pp.email))}</span><i class="swatch"></i></button></li>`).join('')}
      </ul>
    </section>` : ''}
    <section class="prefs">
      <h2>Vista</h2>
      <label class="switch"><input type="checkbox" id="pref-done" ${p.showDone ? 'checked' : ''}> Ver hechas (tachadas)</label>
      <label class="switch"><input type="checkbox" id="pref-sprints" ${p.showSprints ? 'checked' : ''}> Ver sprints de LERPO</label>
      <div class="pref-row"><span>Colores por</span>
        <div class="seg small" data-pref="colorBy">
          <button type="button" data-v="person" class="${p.colorBy === 'person' ? 'on' : ''}">Persona</button>
          <button type="button" data-v="calendar" class="${p.colorBy === 'calendar' ? 'on' : ''}">Calendario</button>
        </div></div>
      <div class="pref-row"><span>Semana inicia</span>
        <div class="seg small" data-pref="weekStart">
          <button type="button" data-v="0" class="${p.weekStart === 0 ? 'on' : ''}">Dom</button>
          <button type="button" data-v="1" class="${p.weekStart === 1 ? 'on' : ''}">Lun</button>
        </div></div>
    </section>
    <div class="side-foot">${lerp('curioso', 'lerp-side')}<p class="muted small">Atajos: <kbd>←</kbd><kbd>→</kbd> mes, <kbd>T</kbd> hoy, <kbd>N</kbd> nueva</p></div>`;

  side.onchange = (e) => {
    const vis = e.target.dataset.calVis;
    if (vis) {
      const hidden = new Set(getPrefs().hidden);
      if (e.target.checked) hidden.delete(vis); else hidden.add(vis);
      setPrefs({ hidden: [...hidden] });
      e.target.closest('.cal-row').classList.toggle('off', !e.target.checked);
      renderView(); renderDone();
    }
    if (e.target.id === 'pref-done') { setPrefs({ showDone: e.target.checked }); renderView(); }
    if (e.target.id === 'pref-sprints') { setPrefs({ showSprints: e.target.checked }); renderView(); }
  };
  side.onclick = (e) => {
    if (e.target.closest('#new-cal')) { openCalendarForm(null, () => refresh({ calendars: true })); return; }
    const gear = e.target.closest('[data-cal-gear]');
    if (gear) { openCalendarSettings(state.calById.get(gear.dataset.calGear), () => refresh({ calendars: true })); return; }
    const per = e.target.closest('[data-person]');
    if (per) {
      const set = new Set(getPrefs().people);
      if (set.has(per.dataset.person)) set.delete(per.dataset.person); else set.add(per.dataset.person);
      setPrefs({ people: [...set] });
      renderSide(); renderView(); return;
    }
    if (e.target.closest('#people-all')) { setPrefs({ people: [] }); renderSide(); renderView(); return; }
    const pref = e.target.closest('[data-pref] [data-v]');
    if (pref) {
      const key = pref.parentElement.dataset.pref;
      setPrefs({ [key]: key === 'weekStart' ? Number(pref.dataset.v) : pref.dataset.v });
      renderSide();
      if (key === 'weekStart') loadFeed(); else { renderView(); renderDone(); }
    }
  };
}

// ---------- panel de Hechas ----------
function dayLabelOf(ts) {
  const d = isoOfTimestamp(ts);
  const t = todayISO();
  if (d === t) return 'Hoy';
  if (d === addDays(t, -1)) return 'Ayer';
  return fmtDayLong.format(parseDate(d));
}
function weekStartIso() {
  const t = todayISO();
  return addDays(t, -((parseDate(t).getDay() - getPrefs().weekStart + 7) % 7));
}

function renderDone() {
  if (!ctx) return;
  const panel = $('#done-panel', ctx.root);
  const hidden = getPrefs().hidden;
  const list = doneList(ctx.done).filter((d) => !hidden.includes(d.cal.id));
  const wk = weekStartIso();
  const thisWeek = list.filter((d) => isoOfTimestamp(d.at) >= wk);
  const mine = thisWeek.filter((d) => d.by === state.user.id).length;
  $('#done-count', ctx.root).textContent = thisWeek.length;

  let html = `<header class="done-head">
      <div><p class="eyebrow">Ya quedó</p><h2>${icon('done', 20)} Hechas</h2></div>
      <button class="icon-btn narrow-only" data-close-drawers aria-label="Cerrar">${icon('x')}</button>
    </header>
    <div class="done-stats">
      <div><b>${thisWeek.length}</b><span>esta semana</span></div>
      <div><b>${mine}</b><span>tuyas</span></div>
      <a class="btn ghost small" href="#/racha">${icon('tree', 15)} Racha</a>
    </div>`;
  if (!list.length) {
    html += `<div class="done-empty">${lerp('mirandoArriba', 'lerp-empty-sm')}<p class="muted small">Aquí aparece lo que vayan palomeando. ¡La primera hoja es la más bonita! 🍃</p></div>`;
  } else {
    let last = '';
    html += '<ol class="done-list">';
    for (const d of list) {
      const lbl = dayLabelOf(d.at);
      if (lbl !== last) { html += `<li class="done-day">${esc(lbl)}</li>`; last = lbl; }
      const who = person(d.by);
      const color = colorOf({ ...d, assignees: d.assignees });
      html += `<li class="done-item" style="--c:${esc(color)}">
        <span class="done-check">${icon('check', 12)}</span>
        <div class="grow"><b>${esc(d.title)}</b>
          <small class="muted">${who ? esc(who.id === state.user.id ? 'Tú' : (who.full_name || '').split(' ')[0]) : 'Alguien'} · ${esc(fmtTime.format(new Date(d.at)))} · ${esc(calLabel(d.cal))}</small></div>
        ${d.canEdit ? `<button class="icon-btn tiny" data-undo="${esc(d.key)}" title="Regresar al calendario" aria-label="Deshacer">${icon('undo', 14)}</button>` : ''}
      </li>`;
    }
    html += '</ol>';
  }
  panel.innerHTML = html;
  panel.onclick = (e) => {
    const b = e.target.closest('[data-undo]');
    if (!b) return;
    const d = list.find((x) => x.key === b.dataset.undo);
    if (d) setDone({ ...d, start: d.onDate, onDate: d.onDate, canEdit: d.canEdit }, false);
  };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}


