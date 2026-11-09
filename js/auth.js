// Pantallas de login, registro, recuperar y nueva contraseña
import * as api from './api.js';
import { esc, toast, toastError, lerp, eloaLogo, $ } from './ui.js';
import { themeButton } from './theme.js';
import { peekPendingInvite } from './state.js';

const MIN_PW = 8;

function pwProblems(pw) {
  const out = [];
  if (pw.length < MIN_PW) out.push(`al menos ${MIN_PW} caracteres`);
  if (!/[a-zA-Z]/.test(pw)) out.push('una letra');
  if (!/\d/.test(pw)) out.push('un número');
  return out;
}

function shell(inner, pose = 'saludando') {
  return `
  <main class="auth">
    ${themeButton('theme-float')}
    <div class="auth-side">
      <p class="eyebrow">Eat <span class="hl-orange">Logic</span> Output <span class="hl-pink">Art</span></p>
      <h2>El calendario de ${eloaLogo('texto', 'inline-logo')}que crece contigo.</h2>
      <p class="muted">Tareas, eventos y entregas del equipo. Palomea lo que ya hiciste y mira cómo crece el árbol. 🌳</p>
      <p class="muted small">¿Ya tienes cuenta en LERPO? Es la misma: entra con tu correo y contraseña de siempre.</p>
    </div>
    <div class="auth-wrap">
    ${lerp(pose, `lerp-peek-top pose-${pose}`)}
    <section class="auth-card">
      <div class="auth-brand">
        <p class="eyebrow">Calendario del equipo</p>
        <h1>LERPING<br>TREE</h1>
      </div>
      ${inner}
    </section>
    </div>
  </main>`;
}

export function renderLogin(root, mode = 'login') {
  const pending = peekPendingInvite();
  root.innerHTML = shell(`
    ${pending ? `<p class="notice">${'Te invitaron a un calendario. Inicia sesión o crea tu cuenta para entrar.'}</p>` : ''}
    <div class="tabs" role="tablist">
      <button role="tab" data-mode="login" class="${mode === 'login' ? 'on' : ''}">Iniciar sesión</button>
      <button role="tab" data-mode="signup" class="${mode === 'signup' ? 'on' : ''}">Crear cuenta</button>
    </div>
    <form class="stack" id="auth-form" novalidate>
      ${mode === 'signup' ? `
        <label>Nombre
          <input name="name" autocomplete="name" required maxlength="80" placeholder="Cómo te ve el equipo">
        </label>` : ''}
      <label>Correo
        <input name="email" type="email" autocomplete="email" required placeholder="tu@correo.com" autofocus>
      </label>
      ${mode !== 'forgot' ? `
      <label>Contraseña
        <div class="pw-wrap">
          <input name="password" type="password" required minlength="${MIN_PW}"
            autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}">
          <button type="button" class="pw-toggle" aria-label="Mostrar contraseña">ver</button>
        </div>
      </label>` : ''}
      ${mode === 'signup' ? `<p class="hint" id="pw-hint">Mínimo ${MIN_PW} caracteres, con letras y números.</p>` : ''}
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="btn block" type="submit">
        ${mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviarme el link'}
      </button>
    </form>
    <p class="auth-foot">
      ${mode === 'forgot'
        ? `<a href="#" data-mode="login">← Volver a iniciar sesión</a>`
        : `<a href="#" data-mode="forgot">¿Olvidaste tu contraseña?</a>`}
    </p>
  `);

  root.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', (e) => { e.preventDefault(); renderLogin(root, b.dataset.mode); }));

  const pwToggle = $('.pw-toggle', root);
  pwToggle?.addEventListener('click', () => {
    const input = pwToggle.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    pwToggle.textContent = show ? 'ocultar' : 'ver';
  });

  const form = $('#auth-form', root);
  const err = $('#auth-error', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Escribe un correo válido.'; return; }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (mode === 'login') {
        await api.signIn(email, password);
        // onAuthChange en app.js se encarga de navegar
      } else if (mode === 'signup') {
        const name = String(f.get('name') || '').trim();
        if (!name) { err.textContent = 'Escribe tu nombre.'; return; }
        const probs = pwProblems(password);
        if (probs.length) { err.textContent = 'La contraseña necesita ' + probs.join(', ') + '.'; return; }
        const res = await api.signUp(email, password, name);
        if (!res.session) {
          root.innerHTML = shell(`
            <div class="stack center">
              <h2>Revisa tu correo ✉️</h2>
              <p class="muted">Te mandamos un link a <b>${esc(email)}</b> para confirmar tu cuenta.
              Ábrelo <b>en este mismo navegador</b>.</p>
              <button class="btn ghost" id="back">Volver</button>
            </div>`, 'mirandoArriba');
          $('#back', root).onclick = () => renderLogin(root, 'login');
        }
      } else {
        await api.sendReset(email);
        toast('Si el correo existe, te llegará un link para cambiar tu contraseña.', 'success');
        renderLogin(root, 'login');
      }
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
}

export function renderResetPassword(root, onDone) {
  root.innerHTML = shell(`
    <h2>Nueva contraseña</h2>
    <form class="stack" id="reset-form">
      <label>Nueva contraseña
        <input name="pw" type="password" autocomplete="new-password" required minlength="${MIN_PW}" autofocus>
      </label>
      <label>Repítela
        <input name="pw2" type="password" autocomplete="new-password" required>
      </label>
      <p class="form-error" id="reset-error" role="alert"></p>
      <button class="btn block">Guardar contraseña</button>
    </form>`, 'determinado');
  const form = $('#reset-form', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reset-error', root);
    const pw = form.pw.value, pw2 = form.pw2.value;
    const probs = pwProblems(pw);
    if (probs.length) { err.textContent = 'La contraseña necesita ' + probs.join(', ') + '.'; return; }
    if (pw !== pw2) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    try {
      await api.updatePassword(pw);
      toast('Contraseña actualizada 🎉', 'success');
      onDone();
    } catch (ex) { toastError(ex); err.textContent = ex.message; }
  });
}

export function renderNotConfigured(root) {
  root.innerHTML = shell(`
    <div class="stack">
      <h2>Falta conectar Supabase</h2>
      <p class="muted">Abre <code>js/config.js</code> y pega tu <b>Project URL</b> y tu
      <b>Publishable key</b> de Supabase. Los pasos están en el <code>README.md</code>.</p>
    </div>`, 'triste');
}
