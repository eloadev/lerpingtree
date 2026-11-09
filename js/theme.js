// Tema claro / oscuro con botón ☀️ / 🌙 (se recuerda en este navegador)
const KEY = 'lerpo_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return media.matches ? 'dark' : 'light';
}

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch {}
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute('content', theme === 'dark' ? '#0F1B28' : '#F9F9F9'));
  syncButtons();
}

const SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z"/></svg>';

export function themeButton(extraClass = '') {
  return `<button type="button" class="theme-toggle ${extraClass}" data-theme-toggle>
    <span class="tt-sun">${SUN}</span><span class="tt-moon">${MOON}</span>
  </button>`;
}

function syncButtons() {
  const dark = currentTheme() === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    b.title = dark ? 'Tema claro' : 'Tema oscuro';
    b.classList.toggle('is-dark', dark);
  });
}

export function initTheme() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-theme-toggle]')) apply(currentTheme() === 'dark' ? 'light' : 'dark');
  });
  // Si nunca eligió tema, seguir al sistema cuando cambie
  media.addEventListener?.('change', syncButtons);
  new MutationObserver(syncButtons).observe(document.body, { childList: true, subtree: true });
  syncButtons();
}
