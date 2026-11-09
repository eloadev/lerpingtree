// Modales de detalle: crear/editar tarea o evento, tarea de LERPO, sprint y "todo el día"
import * as api from './api.js';
import { state } from './state.js';
import {
  esc, icon, avatar, openModal, confirmDialog, toast, toastError, relTime, longDate, parseDate,
  colorPicker, wireColorPicker, inkOn, isSafeUrl, lerp, STATUS, daysBetween, todayISO, $, $$,
} from './ui.js';
import {
  REPEAT_LABEL, colorOf, calLabel, canEditCal, canManageCal, membersOf, person, sortItems,
} from './model.js';
import { LERPO_URL } from './config.js';

const fmtDay = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

export function openItem(it, ictx) {
  if (it.type === 'sprint') return openSprint(it);
  if (it.type === 'task') return openLerpoTask(it, ictx);
  return openEventForm({ item: it }, ictx);
}

export function openNewEvent({ date, calendarId, kind = 'task' }, onSaved) {
  return openEventForm({ date, calendarId, kind }, { onChange: onSaved });
}

// ---------- comentarios (sirve para eventos y para tareas de LERPO) ----------
async function commentsBlock(host, { load, add, remove, canManage }) {
  host.innerHTML = `<h4>${icon('chat')} Comentarios</h4>
    <div class="comments" data-list><p class="muted small">Cargando…</p></div>
    <form class="comment-form" data-form>
      ${avatar(state.profile, 'sm')}
      <textarea name="body" rows="2" maxlength="4000" placeholder="Escribe un comentario…" class="grow"></textarea>
      <button class="btn small">Enviar</button>
    </form>`;
  const listEl = $('[data-list]', host);
  let list = [];
  const render = () => {
    listEl.innerHTML = list.map((c) => `
      <div class="comment">
        ${avatar(c.profiles, 'sm')}
        <div class="grow">
          <p><b>${esc(c.profiles?.full_name || 'Alguien')}</b> <span class="muted small">${relTime(c.created_at)}</span></p>
          <p class="comment-body">${esc(c.body)}</p>
        </div>
        ${c.user_id === state.user.id || canManage ? `<button class="icon-btn tiny" data-c-del="${c.id}" aria-label="Borrar comentario">${icon('trash', 14)}</button>` : ''}
      </div>`).join('') || '<p class="muted small">Aún no hay comentarios.</p>';
  };
  try { list = await load(); } catch (e) { toastError(e); }
  render();
  const form = $('[data-form]', host);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = form.body.value.trim();
    if (!body) return;
    try { list.push(await add(body)); form.reset(); render(); } catch (ex) { toastError(ex); }
  });
  form.body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit();
  });
  listEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c-del]');
    if (!b) return;
    try { await remove(b.dataset.cDel); list = list.filter((c) => c.id !== b.dataset.cDel); render(); }
    catch (ex) { toastError(ex); }
  });
}

function peopleList(ids) {
  const people = (ids || []).map(person).filter(Boolean);
  if (!people.length) return '';
  return `<span class="people-inline">${people.map((p) => `<span class="pchip" style="--c:${esc(p.avatar_color)}">${avatar(p, 'xs')}${esc((p.full_name || p.email || '').split(' ')[0])}</span>`).join('')}</span>`;
}

// ---------- crear / editar tarea o evento ----------
function openEventForm({ item, date, calendarId, kind }, ictx = {}) {
  const editing = !!item;
  const e = editing ? item.raw : {
    kind: kind || 'task', title: '', notes: '', start_date: date, end_date: null, start_time: null,
    end_time: null, color: null, repeat: 'none', repeat_until: null, assignees: [],
    calendar_id: calendarId || lastCalendar(),
  };
  const cal = state.calById.get(e.calendar_id);
  if (editing && !canEditCal(cal)) return openEventReadOnly(item, ictx);

  const editable = state.calendars.filter((c) => canEditCal(c) && (c.project_status !== 'archived' || c.id === e.calendar_id));
  if (!editable.some((c) => c.id === e.calendar_id)) e.calendar_id = editable[0]?.id;
  const opt = (c) => `<option value="${c.id}" ${c.id === e.calendar_id ? 'selected' : ''}>${esc(calLabel(c))}</option>`;
  const own = editable.filter((c) => !c.project_id);
  const boards = editable.filter((c) => c.project_id);
  const timed = !!e.start_time;
  const occ = editing && item.repeat !== 'none' ? item.start : null;

  const m = openModal(`
    <form class="event-form stack" id="ef" novalidate>
      <div class="row between">
        <div class="seg" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" data-kind="task" class="${e.kind === 'task' ? 'on' : ''}">${icon('done', 15)} Tarea</button>
          <button type="button" role="radio" data-kind="event" class="${e.kind === 'event' ? 'on' : ''}">${icon('cal', 15)} Evento</button>
        </div>
        <span class="preview-chip" id="ef-preview"></span>
      </div>
      <input class="task-title" name="title" maxlength="200" required value="${esc(e.title)}"
        placeholder="${e.kind === 'task' ? '¿Qué hay que hacer?' : '¿Qué va a pasar?'}" aria-label="Título" autofocus>
      ${editing ? `<p class="muted small">Creada ${relTime(e.created_at)}${occ ? ` · estás viendo la repetición del <b>${esc(longDate(occ))}</b>` : ''}</p>` : ''}
      <div class="grid2">
        <label>Calendario
          <select name="calendar_id">
            ${own.length ? `<optgroup label="Mis calendarios">${own.map(opt).join('')}</optgroup>` : ''}
            ${boards.length ? `<optgroup label="Boards de LERPO">${boards.map(opt).join('')}</optgroup>` : ''}
          </select>
        </label>
        <label>Repetir
          <select name="repeat">${Object.entries(REPEAT_LABEL).map(([v, t]) => `<option value="${v}" ${v === e.repeat ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid2">
        <label>${e.kind === 'task' ? 'Para el' : 'Día'}<input type="date" name="start_date" required value="${esc(e.start_date || '')}"></label>
        <label>Hasta <span class="muted">(si dura varios días)</span><input type="date" name="end_date" value="${esc(e.end_date || '')}"></label>
      </div>
      <label class="switch"><input type="checkbox" name="timed" ${timed ? 'checked' : ''}> Con hora</label>
      <div class="grid2" data-times ${timed ? '' : 'hidden'}>
        <label>De<input type="time" name="start_time" value="${esc((e.start_time || '').slice(0, 5))}"></label>
        <label>A<input type="time" name="end_time" value="${esc((e.end_time || '').slice(0, 5))}"></label>
      </div>
      <label data-until ${e.repeat === 'none' ? 'hidden' : ''}>Repetir hasta <span class="muted">(vacío = siempre)</span>
        <input type="date" name="repeat_until" value="${esc(e.repeat_until || '')}"></label>
      <fieldset><legend>Asignar a</legend><div class="assignee-grid" id="ef-people"></div></fieldset>
      <fieldset><legend>Color <span class="muted">(Auto = color de la persona asignada o del calendario)</span></legend>
        ${colorPicker('color', e.color, { allowAuto: true })}</fieldset>
      <label>Notas<textarea name="notes" rows="3" maxlength="4000" placeholder="Links, detalles, lo que se necesite…">${esc(e.notes || '')}</textarea></label>
      <p class="form-error" role="alert"></p>
      <div class="row between">
        ${editing ? `<button type="button" class="btn ghost danger-text" id="ef-del">${icon('trash')} Borrar</button>` : '<span></span>'}
        <div class="row gap">
          ${editing && e.kind === 'task' ? `<button type="button" class="btn ghost" id="ef-done">${item.done ? `${icon('undo', 16)} Pendiente` : `${icon('check', 16)} Palomear`}</button>` : ''}
          <button class="btn">${editing ? 'Guardar' : 'Crear'}</button>
        </div>
      </div>
    </form>
    ${editing ? '<section class="stack" id="ef-comments"></section>' : ''}`);

  const f = $('#ef', m.el);
  let kindNow = e.kind;
  let chosen = [...(e.assignees || [])];
  if (!editing && !chosen.length) chosen = [];
  const getColor = wireColorPicker(m.el, 'color', () => preview());

  function renderPeople() {
    const calId = f.calendar_id.value;
    const mem = membersOf(calId);
    chosen = chosen.filter((id) => mem.some((x) => x.user_id === id));
    $('#ef-people', m.el).innerHTML = mem.map((x) => `
      <label class="assignee" style="--c:${esc(x.profile.avatar_color)}">
        <input type="checkbox" value="${x.user_id}" ${chosen.includes(x.user_id) ? 'checked' : ''}>
        ${avatar(x.profile, 'sm')}<span>${esc(x.user_id === state.user.id ? 'Yo' : (x.profile.full_name || x.profile.email))}</span><i class="swatch"></i>
      </label>`).join('') || '<p class="muted small">Nadie más en este calendario todavía.</p>';
  }
  function preview() {
    const c = state.calById.get(f.calendar_id.value);
    const color = colorOf({ customColor: getColor(), assignees: chosen, cal: c });
    const chip = $('#ef-preview', m.el);
    chip.style.setProperty('--c', color);
    chip.style.setProperty('--on', inkOn(color));
    chip.className = `preview-chip k-${kindNow}`;
    chip.innerHTML = `${kindNow === 'task' ? `<span class="chk">${icon('check', 10)}</span>` : ''}${esc(f.title.value || 'Así se verá')}`;
  }
  renderPeople(); preview();

  $$('[data-kind]', m.el).forEach((b) => b.addEventListener('click', () => {
    kindNow = b.dataset.kind;
    $$('[data-kind]', m.el).forEach((x) => x.classList.toggle('on', x === b));
    f.title.placeholder = kindNow === 'task' ? '¿Qué hay que hacer?' : '¿Qué va a pasar?';
    preview();
  }));
  f.title.addEventListener('input', preview);
  f.calendar_id.addEventListener('change', () => { renderPeople(); preview(); });
  $('#ef-people', m.el).addEventListener('change', () => {
    chosen = $$('#ef-people input:checked', m.el).map((i) => i.value);
    preview();
  });
  f.timed.addEventListener('change', () => { $('[data-times]', m.el).hidden = !f.timed.checked; });
  f.repeat.addEventListener('change', () => { $('[data-until]', m.el).hidden = f.repeat.value === 'none'; });
  f.start_date.addEventListener('change', () => {
    if (f.end_date.value && f.end_date.value < f.start_date.value) f.end_date.value = f.start_date.value;
  });

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('.form-error', m.el);
    err.textContent = '';
    const title = f.title.value.trim();
    if (!title) { err.textContent = 'Ponle un título.'; f.title.focus(); return; }
    if (!f.start_date.value) { err.textContent = 'Elige la fecha.'; return; }
    const end = f.end_date.value && f.end_date.value > f.start_date.value ? f.end_date.value : null;
    if (end && daysBetween(f.start_date.value, end) > 62) { err.textContent = 'Un evento puede durar máximo 2 meses.'; return; }
    const data = {
      kind: kindNow, title, notes: f.notes.value.trim(), calendar_id: f.calendar_id.value,
      start_date: f.start_date.value, end_date: end,
      start_time: f.timed.checked && f.start_time.value ? f.start_time.value : null,
      end_time: f.timed.checked && f.end_time.value ? f.end_time.value : null,
      color: getColor() || null, repeat: f.repeat.value,
      repeat_until: f.repeat.value !== 'none' && f.repeat_until.value >= f.start_date.value ? f.repeat_until.value : null,
    };
    const btn = f.querySelector('button.btn:not(.ghost)');
    btn.disabled = true;
    try {
      let saved;
      if (editing) saved = await api.updateEvent(e.id, data);
      else saved = await api.createEvent(data, state.user.id);
      await api.setEventAssignees(saved.id, chosen, editing ? (e.assignees || []) : []);
      rememberCalendar(data.calendar_id);
      m.close();
      toast(editing ? 'Guardado ✓' : (kindNow === 'task' ? 'Tarea creada 🌱' : 'Evento creado 📅'), 'success');
      ictx.onChange?.();
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });

  $('#ef-del', m.el)?.addEventListener('click', async () => {
    const extra = e.repeat !== 'none' ? ' Se borran TODAS sus repeticiones.' : '';
    if (!(await confirmDialog(`Se borra “${e.title}” con sus comentarios.${extra}`, { okText: 'Borrar' }))) return;
    try { await api.deleteEvent(e.id); m.close(); toast('Borrado', 'success'); ictx.onChange?.(); }
    catch (ex) { toastError(ex); }
  });
  $('#ef-done', m.el)?.addEventListener('click', () => { m.close(); ictx.setDone?.(item, !item.done); });

  if (editing) {
    commentsBlock($('#ef-comments', m.el), {
      load: () => api.listEventComments(e.id),
      add: (body) => api.addEventComment(e.id, body),
      remove: (id) => api.deleteEventComment(id),
      canManage: canManageCal(cal),
    });
  }
}

// Vista de solo lectura (rol "Solo ver")
function openEventReadOnly(item, ictx) {
  const e = item.raw;
  const m = openModal(`
    <div class="stack">
      <p class="eyebrow">${e.kind === 'task' ? 'Tarea' : 'Evento'} · ${esc(calLabel(item.cal))}</p>
      <h2 class="detail-title" style="--c:${esc(colorOf(item))}">${esc(e.title)}</h2>
      <div class="task-facts">
        <span>${icon('cal', 14)} ${esc(longDate(item.start))}${item.end !== item.start ? ' – ' + esc(longDate(item.end)) : ''}</span>
        ${item.time ? `<span>${icon('clock', 14)} ${esc(item.time)}${item.endTime ? '–' + esc(item.endTime) : ''}</span>` : ''}
        ${e.repeat !== 'none' ? `<span>${icon('repeat', 14)} ${esc(REPEAT_LABEL[e.repeat])}</span>` : ''}
        ${item.done ? '<span class="role-pill ok-pill">Hecha ✓</span>' : ''}
        ${peopleList(item.assignees)}
      </div>
      ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ''}
      <p class="muted small">${icon('eye', 14)} En este calendario solo puedes ver y comentar.</p>
      <section class="stack" id="ro-comments"></section>
    </div>`, { wide: false });
  commentsBlock($('#ro-comments', m.el), {
    load: () => api.listEventComments(e.id),
    add: (body) => api.addEventComment(e.id, body),
    remove: (id) => api.deleteEventComment(id),
    canManage: false,
  });
}

// ---------- tarea que viene de LERPO ----------
function openLerpoTask(it, ictx) {
  const t = it.raw;
  const cal = it.cal;
  const status = STATUS.find((s) => s.id === t.status);
  const lerpoLink = `${LERPO_URL}#/p/${t.project_id}${t.sprint_id ? `/s/${t.sprint_id}` : ''}`;
  const m = openModal(`
    <div class="stack">
      <p class="eyebrow">Tarea de LERPO · ${esc(cal.name)}</p>
      <h2 class="detail-title" style="--c:${esc(colorOf(it))}">${esc(t.title)}</h2>
      <div class="task-facts">
        <span class="role-pill">${esc(status?.label || t.status)}</span>
        ${it.area ? `<span class="chip" style="--c:${esc(it.area.color)}">${esc(it.area.name)}</span>` : ''}
        <span class="${it.overdue ? 'late' : ''}">${icon('cal', 14)} ${esc(longDate(t.due_date))}</span>
        ${it.checklist ? `<span>${icon('checklist', 14)} ${esc(it.checklist)}</span>` : ''}
        ${peopleList(it.assignees)}
      </div>
      ${t.description ? `<p class="notes">${esc(t.description)}</p>` : ''}
      ${t.deliverable ? `<p class="small">${icon('link', 14)} <b>Entregable:</b> ${isSafeUrl(t.deliverable)
        ? `<a href="${esc(t.deliverable)}" target="_blank" rel="noopener noreferrer">${esc(t.deliverable)}</a>` : esc(t.deliverable)}</p>` : ''}
      <div class="row gap wrap">
        ${it.canEdit ? `<button class="btn" id="lt-done">${it.done ? `${icon('undo', 16)} Regresar a pendiente` : `${icon('check', 16)} Palomear`}</button>` : ''}
        <a class="btn ghost" href="${esc(lerpoLink)}" target="_blank" rel="noopener">${icon('external', 16)} Abrir en LERPO</a>
      </div>
      ${it.canMove ? `<label class="inline-field">Fecha límite <input type="date" id="lt-due" value="${esc(t.due_date)}"></label>` : ''}
      ${it.canEdit ? `<fieldset><legend>Color en el calendario <span class="muted">(Auto = persona asignada o área)</span></legend>
        ${colorPicker('tcolor', t.color, { allowAuto: true })}</fieldset>` : ''}
      <section class="stack" id="lt-comments"></section>
      <p class="muted small">Los comentarios son los mismos que en LERPO.</p>
    </div>`);

  $('#lt-done', m.el)?.addEventListener('click', () => { m.close(); ictx.setDone?.(it, !it.done); });
  $('#lt-due', m.el)?.addEventListener('change', async (e) => {
    if (!e.target.value) return;
    try { await api.setLerpoTaskDue(t.id, e.target.value); toast('Fecha cambiada (también en LERPO)', 'success'); ictx.onChange?.(); }
    catch (ex) { toastError(ex); }
  });
  wireColorPicker(m.el, 'tcolor', async (c) => {
    try {
      await api.setTaskColor(t.id, c);
      t.color = c;
      $('.detail-title', m.el).style.setProperty('--c', colorOf({ ...it, customColor: c }));
      ictx.onChange?.();
    } catch (ex) { toastError(ex); }
  });
  commentsBlock($('#lt-comments', m.el), {
    load: () => api.listTaskComments(t.id),
    add: (body) => api.addTaskComment(t.id, body),
    remove: (id) => api.deleteTaskComment(id),
    canManage: canManageCal(cal),
  });
}

function openSprint(it) {
  const s = it.raw;
  openModal(`
    <div class="stack">
      <p class="eyebrow">Sprint · ${esc(it.cal.name)}</p>
      <h2>🏃 ${esc(s.name)}</h2>
      <div class="task-facts"><span>${icon('cal', 14)} ${esc(longDate(s.start_date))} – ${esc(longDate(s.end_date))}</span>
        <span>${daysBetween(s.start_date, s.end_date) + 1} días</span></div>
      ${s.goal ? `<p class="notes"><b>Meta:</b> ${esc(s.goal)}</p>` : ''}
      <a class="btn ghost" href="${esc(`${LERPO_URL}#/p/${s.project_id}/s/${s.id}`)}" target="_blank" rel="noopener">${icon('external', 16)} Ver el sprint en LERPO</a>
    </div>`);
}

// ---------- todo lo de un día ----------
export function openDay(date, listFn, ictx) {
  const editable = state.calendars.filter((c) => canEditCal(c) && c.project_status !== 'archived');
  const m = openModal(`
    <div class="stack">
      <div><p class="eyebrow">${date === todayISO() ? 'Hoy' : 'Día'}</p>
        <h2 class="cap">${esc(fmtDay.format(parseDate(date)))}</h2></div>
      <div class="day-list" id="day-list"></div>
      ${editable.length ? `<form class="quick-day" id="qd">
        <input name="title" maxlength="200" placeholder="+ Agregar tarea para este día" aria-label="Nueva tarea" class="grow">
        <select name="calendar_id" aria-label="Calendario">${editable.map((c) => `<option value="${c.id}" ${c.id === lastCalendar() ? 'selected' : ''}>${esc(calLabel(c))}</option>`).join('')}</select>
        <button class="btn small">Agregar</button>
        <button type="button" class="btn ghost small" id="qd-more" title="Más opciones">Más…</button>
      </form>` : ''}
    </div>`);

  const listEl = $('#day-list', m.el);
  function render() {
    const items = listFn().sort(sortItems);
    const pending = items.filter((x) => !x.done);
    const done = items.filter((x) => x.done);
    const row = (it) => `
      <div class="arow ${it.done ? 'is-done' : ''} ${it.overdue ? 'is-late' : ''}" data-key="${esc(it.key)}" tabindex="0" style="--c:${esc(colorOf(it))}">
        ${it.kind === 'task' ? `<button class="chk ${it.done ? 'on' : ''}" data-check="${esc(it.key)}" aria-label="${it.done ? 'Desmarcar' : 'Palomear'}" ${it.canEdit ? '' : 'disabled'}>${icon('check', 12)}</button>`
          : it.type === 'sprint' ? '<span class="dot sprint-dot"></span>' : '<span class="dot"></span>'}
        <span class="when">${it.type === 'sprint' ? 'Sprint' : it.time ? esc(it.time) : 'Todo el día'}</span>
        <span class="grow"><b>${esc(it.title)}</b><small class="muted">${esc(calLabel(it.cal))}${it.type === 'task' ? ' · LERPO' : ''}</small></span>
        <span class="avatars">${it.assignees.map(person).filter(Boolean).slice(0, 3).map((p) => avatar(p, 'xs')).join('')}</span>
      </div>`;
    listEl.innerHTML = (pending.length ? pending.map(row).join('') : `<p class="muted small empty-day">${lerp('contento', 'lerp-mini')} Nada pendiente este día.</p>`)
      + (done.length ? `<p class="done-sep">${icon('done', 14)} Hechas (${done.length})</p>${done.map(row).join('')}` : '');
  }
  render();
  listEl.addEventListener('click', async (e) => {
    const chk = e.target.closest('[data-check]');
    const items = listFn();
    if (chk) {
      const it = items.find((x) => x.key === chk.dataset.check);
      if (it) { await ictx.setDone(it, !it.done); setTimeout(render, 320); }
      return;
    }
    const r = e.target.closest('[data-key]');
    if (r) {
      const it = items.find((x) => x.key === r.dataset.key);
      if (it) { m.close(); openItem(it, ictx); }
    }
  });
  listEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-key]')) e.target.click();
  });
  const qd = $('#qd', m.el);
  qd?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = qd.title.value.trim();
    if (!title) return;
    try {
      await api.createEvent({ kind: 'task', title, calendar_id: qd.calendar_id.value, start_date: date, repeat: 'none' }, state.user.id);
      rememberCalendar(qd.calendar_id.value);
      qd.title.value = '';
      await ictx.onAdd?.();
      render();
      toast('Tarea creada 🌱', 'success');
    } catch (ex) { toastError(ex); }
  });
  $('#qd-more', m.el)?.addEventListener('click', () => {
    const title = qd.title.value.trim();
    m.close();
    openEventForm({ date, calendarId: qd.calendar_id.value, kind: 'task' }, ictx);
    if (title) setTimeout(() => { const i = document.querySelector('#ef [name=title]'); if (i) { i.value = title; i.dispatchEvent(new Event('input')); } }, 40);
  });
  setTimeout(() => qd?.title.focus(), 40);
}

// recordar el último calendario usado para crear
function lastCalendar() {
  try {
    const id = localStorage.getItem('tree_last_cal');
    if (id && canEditCal(state.calById.get(id))) return id;
  } catch {}
  return state.calendars.find((c) => !c.project_id && canEditCal(c))?.id
    || state.calendars.find((c) => canEditCal(c))?.id;
}
function rememberCalendar(id) { try { localStorage.setItem('tree_last_cal', id); } catch {} }


