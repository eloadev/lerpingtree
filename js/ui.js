// Utilidades de interfaz compartidas (base copiada de LERPO para que se vean iguales)
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- marca ELOA / LERPO ----------
const ASSETS = 'assets/';
export const LERP = {
  saludando: 'lerp-saludando', bombilla: 'lerp-bombilla', contento: 'lerp-contento',
  contentoLado: 'lerp-contento-lado', curioso: 'lerp-curioso', curioso2: 'lerp-curioso-2',
  determinado: 'lerp-determinado', parado: 'lerp-parado', mirandoArriba: 'lerp-mirando-arriba',
  triste: 'lerp-triste', bandana: 'lerp-bandana', bandana2: 'lerp-bandana-2',
};
// <img> de LERP. cls para tamaño/posición (ver .lerp-* en styles.css)
export function lerp(pose, cls = '', alt = '') {
  return `<img class="lerp ${cls}" src="${ASSETS}lerp/${LERP[pose] || pose}.svg" alt="${esc(alt)}" ${alt ? '' : 'aria-hidden="true"'} decoding="async">`;
}
// Logo ELOA que cambia a la versión blanca en tema oscuro (sigue el botón ☀️/🌙)
// kind: 'horizontal' | 'vertical' | 'texto' (solo letras, sin la cabeza de LERP)
export function eloaLogo(kind = 'horizontal', cls = '') {
  return `<span class="eloa-logo ${cls}" role="img" aria-label="ELOA dev team">
    <img class="only-light" src="${ASSETS}logos/eloa-${kind}.png" alt="">
    <img class="only-dark" src="${ASSETS}logos/eloa-${kind}-blanco.png" alt="">
  </span>`;
}
export const eloaIcon = (cls = '') => `<img class="eloa-icon ${cls}" src="${ASSETS}logos/eloa-icono.png" alt="" aria-hidden="true">`;

export function brand() {
  return `<a class="brand" href="#/" aria-label="Lerping Tree, inicio">${eloaIcon()}<span><b>LERPING<i> TREE</i></b><small>by ELOA dev team</small></span></a>`;
}

// ---------- toasts ----------
export function toast(msg, kind = 'info', action = null) {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  const life = action ? 6000 : 3600;
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.run(); el.remove(); });
    el.append(b);
  }
  host.append(el);
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 400);
}
export const toastError = (e) => toast(e?.message || String(e), 'error');

// ---------- modales ----------
let modalStack = [];
export function openModal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <button class="icon-btn modal-x" data-close aria-label="Cerrar">${icon('x')}</button>
      ${html}
    </div>`;
  const close = () => {
    wrap.remove();
    modalStack = modalStack.filter((m) => m !== entry);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack.at(-1) === entry) close();
  };
  const entry = { wrap, close };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  modalStack.push(entry);
  const first = wrap.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: wrap.querySelector('.modal'), close };
}
export const anyModalOpen = () => modalStack.length > 0;
export function closeAllModals() { [...modalStack].forEach((m) => m.close()); }

export function confirmDialog(message, { okText = 'Sí, continuar', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(`
      <h3>¿Segura/o?</h3>
      <p class="muted">${esc(message)}</p>
      <div class="row end gap">
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okText)}</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; m.close(); resolve(true); });
  });
}

// ---------- avatares ----------
export function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
export function avatar(p, size = 'sm') {
  if (!p) return '';
  const label = esc(p.full_name || p.email);
  const color = esc(p.avatar_color || '#6d5bd0');
  if (p.avatar_url && /^https:\/\//i.test(p.avatar_url)) {
    return `<span class="avatar avatar-${size} has-img" style="--c:${color}" title="${label}"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="avatar avatar-${size}" style="--c:${color}" title="${label}">${esc(initials(p.full_name, p.email))}</span>`;
}

// ---------- fechas ----------
const fmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
export function parseDate(d) {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}
export const shortDate = (d) => (d ? fmt.format(parseDate(d)) : '');
export const longDate = (d) => (d ? fmtLong.format(typeof d === 'string' && d.length === 10 ? parseDate(d) : new Date(d)) : '');
export function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'justo ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return longDate(iso);
}
export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayISO = () => toISO(new Date());
export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export const isoOfTimestamp = (ts) => toISO(new Date(ts));
export const hhmm = (t) => (t ? t.slice(0, 5) : '');

// Texto blanco o oscuro según qué se lee mejor sobre ese color
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.42 ? '#182D42' : '#ffffff';
}

// Paleta compartida (la misma de los avatares de LERPO)
export const PALETTE = [
  '#e5487b', '#f472b6', '#e58ea2', '#c026d3', '#8e5cd9', '#6d5bd0',
  '#4f46e5', '#3b82f6', '#0ea5e9', '#0ea5a4', '#14b8a6', '#22a06b',
  '#65a30d', '#84cc16', '#e2b203', '#f59e0b', '#f07a32', '#ef4444',
  '#b45309', '#78716c', '#64748b', '#1d2742', '#0f172a', '#9d174d',
];
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');

// Selector de color: paleta + color libre. allowAuto agrega "Automático" (= null)
export function colorPicker(name, value, { allowAuto = false, autoLabel = 'Auto' } = {}) {
  const custom = isHex(value) && !PALETTE.includes(value.toLowerCase()) && !PALETTE.includes(value);
  return `<div class="color-pick" data-color-pick="${name}">
    ${allowAuto ? `<label class="auto-color" title="Automático: color de la persona o del calendario">
      <input type="radio" name="${name}" value="" ${!value ? 'checked' : ''}><span>${esc(autoLabel)}</span></label>` : ''}
    ${PALETTE.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="${name}" value="${c}" ${value && c.toLowerCase() === value.toLowerCase() ? 'checked' : ''}><span></span></label>`).join('')}
    <label class="custom-color" title="Elige cualquier color" style="--c:${custom ? esc(value) : '#ffffff'}">
      <input type="radio" name="${name}" value="${custom ? esc(value) : '#7dabc5'}" data-custom ${custom ? 'checked' : ''}>
      <span>${icon('plus', 14)}</span>
      <input type="color" value="${isHex(value) ? esc(value) : '#7dabc5'}" aria-label="Color personalizado">
    </label>
  </div>`;
}
// Conecta el color libre del selector; onChange(colorOrNull)
export function wireColorPicker(root, name, onChange = () => {}) {
  const box = root.querySelector(`[data-color-pick="${name}"]`);
  if (!box) return () => null;
  const any = box.querySelector('input[type=color]');
  const customRadio = box.querySelector('input[data-custom]');
  const customLabel = any.closest('.custom-color');
  const get = () => box.querySelector(`input[name="${name}"]:checked`)?.value || null;
  box.addEventListener('change', (e) => { if (e.target.name === name) onChange(get()); });
  any.addEventListener('input', () => {
    customRadio.value = any.value;
    customRadio.checked = true;
    customLabel.style.setProperty('--c', any.value);
    onChange(get());
  });
  customLabel.querySelector('span').addEventListener('click', (e) => { e.preventDefault(); any.click(); });
  return get;
}

export const ROLE_LABEL = { admin: 'Admin', member: 'Miembro', viewer: 'Solo ver' };
export const STATUS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export function isSafeUrl(u) {
  try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; }
}

// ---------- íconos (trazos simples) ----------
const PATHS = {
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
  users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  check: 'M5 12l5 5L20 7',
  checklist: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  cal: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  logout: 'M15 17l5-5-5-5M20 12H9M12 20H5V4h7',
  chat: 'M4 5h16v11H8l-4 4z',
  chevron: 'M6 9l6 6 6-6',
  arrowL: 'M15 18l-6-6 6-6',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 100-.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  chevronR: 'M9 6l6 6-6 6',
  chevronL: 'M15 6l-6 6 6 6',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  flame: 'M12 22c4 0 7-2.7 7-7 0-3-2-5.5-3.5-7-.4 2-1.5 3-2.5 3 .5-3-1-6.5-4-9 0 3.5-5 6.5-5 13 0 4.3 3.4 7 8 7z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  tree: 'M12 22v-6M12 16l-4-3M12 14l4-3M7 13a4 4 0 01-1-7.7A5 5 0 0115.5 4 4.5 4.5 0 0117 13z',
  done: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-5',
  palette: 'M12 21a9 9 0 110-18c5 0 9 3.6 9 8 0 2.8-2.2 4-4.5 4H15a2 2 0 00-1.5 3.3A1.6 1.6 0 0112 21zM7.5 11h.01M10 7h.01M15 7h.01',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2',
};
export function icon(name, size = 18) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
}

// Recorta al centro con la proporción w:h, reduce y comprime (webp, o jpg si no hay webp)
export async function prepareImage(file, w, h) {
  if (!file.type.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La imagen es muy grande (máx 20 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo leer esa imagen.'));
      i.src = url;
    });
    const ratio = w / h;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
    const scale = Math.min(1, w / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2,
      sw, sh, 0, 0, canvas.width, canvas.height);
    const toBlob = (type) => new Promise((res) => canvas.toBlob(res, type, 0.86));
    let blob = await toBlob('image/webp');
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
