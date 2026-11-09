// Crear calendarios extra, ajustes, miembros e invitaciones (como en LERPO)
import * as api from './api.js';
import { state } from './state.js';
import {
  esc, icon, avatar, openModal, confirmDialog, toast, toastError, longDate, ROLE_LABEL,
  colorPicker, wireColorPicker, $, $$,
} from './ui.js';
import { canManageCal, membersOf } from './model.js';
import { LERPO_URL } from './config.js';

const EMOJIS = ['', '💻', '🎨', '🎮', '📖', '🎬', '🎵', '📣', '🗓️', '🍕', '🌳', '⭐', '🔥', '🧪'];

function emojiPick(value) {
  return `<div class="emoji-pick" role="radiogroup" aria-label="Ícono">
    ${EMOJIS.map((e) => `<label title="${e || 'Sin ícono'}"><input type="radio" name="emoji" value="${e}" ${e === (value || '') ? 'checked' : ''}><span>${e || '∅'}</span></label>`).join('')}
  </div>`;
}

// ---------- crear / editar calendario extra ----------
export function openCalendarForm(cal, onSaved) {
  const editing = !!cal;
  const c = cal || { name: '', description: '', color: '#3b82f6', emoji: '' };
  const m = openModal(`
    <h2>${editing ? 'Editar calendario' : 'Nuevo calendario'}</h2>
    <p class="muted small">${editing ? '' : 'Solo lo ve quien invites. Ideal para un área (Web, Arte), juntas o entregas.'}</p>
    <form class="stack" id="cform">
      <label>Nombre<input name="name" required maxlength="80" value="${esc(c.name)}" placeholder="p. ej. Web, Arte, Juntas" autofocus></label>
      <fieldset><legend>Ícono</legend>${emojiPick(c.emoji)}</fieldset>
      <fieldset><legend>Color</legend>${colorPicker('ccolor', c.color)}</fieldset>
      <label>Descripción <span class="muted">(opcional)</span><textarea name="description" rows="2" maxlength="500">${esc(c.description || '')}</textarea></label>
      <p class="form-error" role="alert"></p>
      <div class="row end gap">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button class="btn">${editing ? 'Guardar' : 'Crear calendario'}</button>
      </div>
    </form>`);
  const form = $('#cform', m.el);
  const getColor = wireColorPicker(m.el, 'ccolor');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) { $('.form-error', m.el).textContent = 'Ponle nombre.'; return; }
    const data = {
      name, description: form.description.value.trim(),
      color: getColor() || c.color, emoji: form.querySelector('[name=emoji]:checked')?.value || '',
    };
    try {
      const saved = editing ? await api.updateCalendar(cal.id, data) : await api.createCalendar(data, state.user.id);
      m.close();
      toast(editing ? 'Calendario guardado' : 'Calendario creado 🌱 Ahora invita a tu equipo.', 'success');
      await onSaved?.(saved);
      if (!editing) {
        const fresh = state.calById.get(saved.id);
        if (fresh) openCalendarSettings(fresh, onSaved);
      }
    } catch (ex) { $('.form-error', m.el).textContent = ex.message; }
  });
}

// ---------- ajustes: miembros, invitaciones, color ----------
export function openCalendarSettings(cal, onChange) {
  if (!cal) return;
  const board = !!cal.project_id;
  const admin = canManageCal(cal);
  let dirty = false;

  const m = openModal(`
    <div class="cal-settings-head" style="--c:${esc(cal.color)}">
      <span class="cal-badge">${esc(cal.emoji || cal.name.slice(0, 1).toUpperCase())}</span>
      <div><p class="eyebrow">${board ? 'Calendario de board · LERPO' : 'Calendario'}</p><h2>${esc(cal.name)}</h2>
        ${cal.description ? `<p class="muted small">${esc(cal.description)}</p>` : ''}</div>
    </div>
    ${admin && !board ? `<div class="row gap"><button class="btn ghost small" id="cs-edit">${icon('edit', 15)} Editar nombre, ícono y color</button></div>` : ''}
    ${admin && board ? `<fieldset><legend>Color del calendario</legend>${colorPicker('bcolor', cal.color)}</fieldset>` : ''}
    <h3>${icon('users')} Personas <span class="count">${cal.member_count}</span></h3>
    <div id="cs-members" class="member-list"></div>
    ${board ? `<p class="notice small">A este calendario entra quien está en el board. Para invitar a alguien,
        hazlo desde <a href="${esc(`${LERPO_URL}#/p/${cal.project_id}`)}" target="_blank" rel="noopener">el board en LERPO ↗</a>.
        Aquí aparecen las tareas del board que tengan fecha límite.</p>` : ''}
    ${admin && !board ? `
      <hr>
      <h3>${icon('link')} Invitar con link</h3>
      <p class="muted small">Solo quien tenga el link (y una cuenta) puede ver este calendario.
      El link se muestra <b>una sola vez</b>; cópialo y mándalo por privado.</p>
      <form class="invite-form" id="iform">
        <label>Rol
          <select name="role">
            <option value="member">Miembro (agrega y palomea)</option>
            <option value="viewer">Solo ver (y comentar)</option>
            <option value="admin">Admin (invita y administra)</option>
          </select>
        </label>
        <label>Expira en
          <select name="days">
            <option value="1">1 día</option><option value="7" selected>7 días</option>
            <option value="30">30 días</option><option value="90">90 días</option>
          </select>
        </label>
        <label>Usos
          <select name="uses">
            <option value="1">1 persona</option><option value="5">5 personas</option>
            <option value="">Sin límite</option>
          </select>
        </label>
        <label class="grow">Nota <input name="note" maxlength="80" placeholder="p. ej. para Luis"></label>
        <button class="btn">Generar link</button>
      </form>
      <div id="new-link"></div>
      <h3 class="mt">Links activos</h3>
      <div id="invites" class="invite-list"><p class="muted">Cargando…</p></div>
      <hr>
      <button class="btn ghost danger-text" id="cs-delete">${icon('trash')} Borrar calendario</button>` : ''}
  `, { wide: true, onClose: () => { if (dirty) onChange?.(); } });

  function renderMembers() {
    const host = $('#cs-members', m.el);
    const list = membersOf(cal.id);
    host.innerHTML = list.map((mb) => {
      const me = mb.user_id === state.user.id;
      const p = mb.profile;
      return `
      <div class="member" style="--c:${esc(p.avatar_color)}">
        ${avatar(p, 'md')}
        <div class="grow"><b>${esc(p.full_name || 'Sin nombre')}${me ? ' (tú)' : ''}</b>
          <span class="muted small">${esc(p.email || '')}</span></div>
        <i class="swatch" title="Su color"></i>
        ${admin && !board ? `
          <select data-role="${mb.user_id}" aria-label="Rol">
            ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${k === mb.role ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <button class="icon-btn" data-remove="${mb.user_id}" title="${me ? 'Salir' : 'Sacar del calendario'}">${icon(me ? 'logout' : 'trash', 16)}</button>
        ` : `<span class="role-pill">${ROLE_LABEL[mb.role] || mb.role}</span>
          ${me && !board ? `<button class="btn ghost small" data-remove="${mb.user_id}">Salir</button>` : ''}`}
      </div>`;
    }).join('') || '<p class="muted small">Solo tú por ahora.</p>';
  }
  renderMembers();

  $('#cs-members', m.el).addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-role]');
    if (!sel) return;
    try { await api.setCalMemberRole(cal.id, sel.dataset.role, sel.value); dirty = true; toast('Rol actualizado', 'success'); }
    catch (ex) { toastError(ex); }
  });
  $('#cs-members', m.el).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    const self = b.dataset.remove === state.user.id;
    if (!(await confirmDialog(self ? 'Saldrás de este calendario y necesitarás otra invitación para volver.'
      : 'Esta persona ya no podrá ver este calendario.', { okText: self ? 'Salir' : 'Sacar' }))) return;
    try {
      await api.removeCalMember(cal.id, b.dataset.remove);
      dirty = true;
      if (self) { m.close(); return; }
      const arr = state.calMembers.get(cal.id) || [];
      state.calMembers.set(cal.id, arr.filter((x) => x.user_id !== b.dataset.remove));
      renderMembers();
    } catch (ex) { toastError(ex); }
  });

  $('#cs-edit', m.el)?.addEventListener('click', () => { m.close(); openCalendarForm(cal, onChange); });
  if (admin && board) {
    wireColorPicker(m.el, 'bcolor', async (c) => {
      if (!c) return;
      try { await api.updateCalendar(cal.id, { color: c }); cal.color = c; dirty = true;
        $('.cal-settings-head', m.el).style.setProperty('--c', c); }
      catch (ex) { toastError(ex); }
    });
  }
  $('#cs-delete', m.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Se borra “${cal.name}” con TODAS sus tareas, eventos y comentarios. No se puede deshacer.`, { okText: 'Borrar calendario' }))) return;
    try { await api.deleteCalendar(cal.id); dirty = true; m.close(); toast('Calendario borrado', 'success'); }
    catch (ex) { toastError(ex); }
  });

  async function loadInvites() {
    const host = $('#invites', m.el);
    if (!host) return;
    try {
      const list = (await api.listCalInvites(cal.id)).filter((i) =>
        !i.revoked && new Date(i.expires_at) > new Date() && (i.max_uses == null || i.uses < i.max_uses));
      host.innerHTML = list.length ? list.map((i) => `
        <div class="invite">
          <span class="role-pill">${ROLE_LABEL[i.role]}</span>
          <span class="grow">${esc(i.note || 'Link sin nota')}
            <span class="muted small">· usado ${i.uses}${i.max_uses ? '/' + i.max_uses : ''} · vence ${longDate(i.expires_at)}</span></span>
          <button class="btn ghost small danger-text" data-revoke="${i.id}">Revocar</button>
        </div>`).join('') : '<p class="muted small">No hay links activos.</p>';
      $$('[data-revoke]', host).forEach((b) => b.addEventListener('click', async () => {
        try { await api.revokeCalInvite(b.dataset.revoke); toast('Link revocado', 'success'); loadInvites(); }
        catch (ex) { toastError(ex); }
      }));
    } catch (ex) { host.innerHTML = `<p class="form-error">${esc(ex.message)}</p>`; }
  }

  $('#iform', m.el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const token = await api.createCalInvite(cal.id, f.get('role'), Number(f.get('days')),
        f.get('uses') ? Number(f.get('uses')) : null, String(f.get('note') || '').trim());
      const url = `${location.origin}${location.pathname}#/join/${token}`;
      $('#new-link', m.el).innerHTML = `
        <div class="new-link">
          <input readonly value="${esc(url)}" aria-label="Link de invitación">
          <button class="btn" id="copy-link">${icon('copy')} Copiar</button>
        </div>`;
      const input = $('#new-link input', m.el);
      input.select();
      $('#copy-link', m.el).onclick = async () => {
        try { await navigator.clipboard.writeText(url); toast('Link copiado 📋', 'success'); }
        catch { input.select(); document.execCommand('copy'); toast('Link copiado', 'success'); }
      };
      e.target.reset();
      loadInvites();
    } catch (ex) { toastError(ex); }
  });
  loadInvites();
}
