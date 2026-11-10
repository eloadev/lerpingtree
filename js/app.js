// Arranque y router de LERPING TREE
import * as api from './api.js';
import { state, savePendingInvite, takePendingInvite } from './state.js';
import {
  brand, icon, avatar, esc, openModal, toast, toastError, closeAllModals, prepareImage, PALETTE, $,
} from './ui.js';
import { renderLogin, renderResetPassword, renderNotConfigured } from './auth.js';
import { renderCalendar, leaveCalendar } from './calendar.js';
import { renderJoin } from './join.js';
import { initTheme, themeButton } from './theme.js';
import { LERPO_URL } from './config.js';

const root = document.getElementById('app');
let recovering = new URLSearchParams(location.search).get('mode') === 'reset';

function cleanUrl() {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'join' && parts[1]) return { name: 'join', token: parts[1] };
  if (parts[0] === 'agenda') return { name: 'calendar', view: 'agenda' };
  if (parts[0] === 'm' && /^\d{4}-\d{2}$/.test(parts[1] || '')) return { name: 'calendar', view: 'month', month: parts[1] };
  return { name: 'calendar', view: 'month' };
}

// La barra de arriba se arma una vez por sesión; solo cambia el contenido
let shellUser = null;
function shell() {
  if (shellUser === state.user.id && $('#main')) return $('#main');
  leaveCalendar();
  shellUser = state.user.id;
  root.innerHTML = `
    <header class="topbar">
      ${brand()}
      <nav class="topnav">
        <a href="#/" class="navlink" data-nav="calendar">${icon('cal', 16)} Calendario</a>
        <a href="${esc(LERPO_URL)}" class="navlink">LERPO ${icon('external', 14)}</a>
      </nav>
      ${themeButton()}
      <button class="user-btn" id="user-btn" aria-label="Mi cuenta">
        <span id="user-avatar">${avatar(state.profile, 'md')}</span>
        <span class="hide-sm" id="user-name">${esc(state.profile?.full_name || state.user.email)}</span>
      </button>
    </header>
    <main id="main"></main>`;
  $('#user-btn').addEventListener('click', openAccount);
  return $('#main');
}
function refreshUserButton() {
  const a = $('#user-avatar'); const n = $('#user-name');
  if (a) a.innerHTML = avatar(state.profile, 'md');
  if (n) n.textContent = state.profile?.full_name || state.user.email;
}

function openAccount() {
  const p = state.profile;
  let color = p.avatar_color;
  const custom = !PALETTE.includes(color);
  const m = openModal(`
    <h2>Mi cuenta</h2>
    <form class="stack" id="acc">
      <div class="avatar-edit">
        <div id="avatar-preview"></div>
        <div class="stack tight">
          <label class="btn ghost small file-btn">${icon('camera', 16)} <span id="photo-label">${p.avatar_url ? 'Cambiar foto' : 'Subir foto'}</span>
            <input type="file" id="photo" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          </label>
          <button type="button" class="btn ghost small danger-text" id="photo-remove" ${p.avatar_url ? '' : 'hidden'}>Quitar foto</button>
          <p class="muted small">JPG, PNG o WebP. Se recorta en cuadrado.</p>
        </div>
      </div>
      <label>Nombre <input name="full_name" maxlength="80" required value="${esc(p.full_name)}"></label>
      <fieldset><legend>Color <span class="muted">(se usa si no tienes foto)</span></legend>
        <div class="color-pick">
          ${PALETTE.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span></span></label>`).join('')}
          <label class="custom-color" title="Elige cualquier color" style="--c:${custom ? esc(color) : '#ffffff'}">
            <input type="radio" name="color" value="custom" ${custom ? 'checked' : ''}>
            <span>${icon('plus', 14)}</span>
            <input type="color" id="color-any" value="${esc(color)}" aria-label="Color personalizado">
          </label>
        </div>
      </fieldset>
      <p class="muted small">Correo: ${esc(state.user.email)}${p.is_admin ? ' · <b>Admin ELOA</b>' : ''}<br>Tu color es el que se usa para tus tareas en el calendario (y en LERPO).</p>
      <div class="row between">
        <button type="button" class="btn ghost" id="logout">${icon('logout')} Cerrar sesión</button>
        <button class="btn">Guardar</button>
      </div>
    </form>`, { onClose: () => { if (photoChanged) { refreshUserButton(); state.people.set(state.profile.id, state.profile); route(); } } });

  let photoChanged = false;
  const form = $('#acc', m.el);
  const preview = () => {
    $('#avatar-preview', m.el).innerHTML = avatar({ ...state.profile, full_name: form.full_name.value || p.full_name, avatar_color: color }, 'xl');
  };
  preview();
  form.full_name.addEventListener('input', preview);

  const any = $('#color-any', m.el);
  const customLabel = any.closest('.custom-color');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'color') {
      color = e.target.value === 'custom' ? any.value : e.target.value;
      preview();
    }
  });
  any.addEventListener('input', () => {
    color = any.value;
    customLabel.style.setProperty('--c', color);
    customLabel.querySelector('input[type=radio]').checked = true;
    preview();
  });
  customLabel.querySelector('span').addEventListener('click', () => any.click());

  $('#photo', m.el).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const label = $('#photo-label', m.el);
    label.textContent = 'Subiendo…';
    try {
      const blob = await prepareImage(file, 320, 320);
      state.profile = await api.uploadAvatar(state.user.id, blob);
      photoChanged = true;
      preview();
      $('#photo-remove', m.el).hidden = false;
      toast('Foto actualizada 📸', 'success');
    } catch (ex) { toastError(ex); }
    label.textContent = state.profile.avatar_url ? 'Cambiar foto' : 'Subir foto';
  });
  $('#photo-remove', m.el).addEventListener('click', async (e) => {
    try {
      state.profile = await api.removeAvatar(state.user.id);
      photoChanged = true;
      e.target.hidden = true;
      $('#photo-label', m.el).textContent = 'Subir foto';
      preview();
    } catch (ex) { toastError(ex); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.profile = await api.updateMyProfile(state.user.id, {
        full_name: form.full_name.value.trim(), avatar_color: /^#[0-9a-f]{6}$/i.test(color) ? color : p.avatar_color,
      });
      photoChanged = true;
      m.close(); toast('Perfil actualizado', 'success');
    } catch (ex) { toastError(ex); }
  });
  $('#logout', m.el).addEventListener('click', async () => { photoChanged = false; m.close(); await api.signOut(); });
}

async function loadUser(session) {
  state.session = session;
  state.user = session?.user || null;
  if (!state.user) { state.profile = null; return; }
  const [profile, areas] = await Promise.all([api.getMyProfile(state.user.id), api.listAreas()]);
  state.profile = profile;
  state.areas = areas;
  state.areaById = new Map(areas.map((a) => [a.id, a]));
}

let routing = Promise.resolve();
function route() { routing = routing.then(doRoute, doRoute); return routing; }

async function doRoute() {
  const r = parseRoute();
  closeAllModals();

  if (recovering && state.user) {
    shellUser = null; leaveCalendar();
    return renderResetPassword(root, () => { recovering = false; cleanUrl(); route(); });
  }
  if (!state.user) {
    shellUser = null; leaveCalendar();
    if (r.name === 'join') {
      savePendingInvite(r.token);
      history.replaceState(null, '', location.pathname + '#/');
    }
    return renderLogin(root);
  }
  if (r.name !== 'join') {
    const pending = takePendingInvite();
    if (pending) {
      history.replaceState(null, '', location.pathname + '#/join/' + pending);
      return doRoute();
    }
  }

  const main = shell();
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === r.name));
  if (r.name === 'join') {
    leaveCalendar();
    history.replaceState(null, '', location.pathname + '#/'); // no dejar el token en la URL
    return renderJoin(main, r.token);
  }
  return renderCalendar(main, r);
}

async function boot() {
  initTheme();
  if (!api.configured) return renderNotConfigured(root);

  let initial = true;
  api.onAuthChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovering = true;
    if (event === 'INITIAL_SESSION') return;
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { state.session = session; return; }
    if (initial) return;
    if (event === 'SIGNED_IN' && session?.user?.id === state.user?.id) { state.session = session; return; }
    setTimeout(async () => {
      try { await loadUser(session); } catch (e) { toastError(e); }
      route();
    }, 0);
  });

  try {
    const session = await api.getSession();
    await loadUser(session);
  } catch (e) {
    toastError(e);
    state.user = null;
  }
  initial = false;
  if (!recovering) cleanUrl();
  window.addEventListener('hashchange', route);
  route();
}

boot();
