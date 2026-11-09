// Página para aceptar una invitación a un calendario (#/join/<token>)
import * as api from './api.js';
import { esc, toast, toastError, ROLE_LABEL, lerp, $ } from './ui.js';

// El token ya se quitó de la URL (queda "#/"), así que forzamos el cambio de página
function goHome() {
  if (location.hash === '#/' || location.hash === '') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/';
}

export async function renderJoin(main, token) {
  main.innerHTML = `<div class="page"><div class="empty-state">${lerp('curioso2', 'lerp-empty')}<p class="muted">Revisando invitación…</p></div></div>`;
  let info = null;
  try { info = await api.calInvitePreview(token); } catch (e) { toastError(e); }

  if (!info) {
    main.innerHTML = `
      <div class="page"><div class="empty-state">
        ${lerp('triste', 'lerp-empty')}
        <h2>Invitación no válida</h2>
        <p class="muted">El link expiró, ya se usó o fue revocado. Pide uno nuevo.</p>
        <button class="btn ghost" data-home>Ir al calendario</button>
      </div></div>`;
    $('[data-home]', main).addEventListener('click', goHome);
    return;
  }
  if (info.already_member) {
    toast('Ya estás en este calendario 👌', 'success');
    goHome();
    return;
  }
  main.innerHTML = `
    <div class="page"><div class="empty-state invite-card" style="--c:${esc(info.color)}">
      ${lerp('contento', 'lerp-empty')}
      <p class="eyebrow">Te invitaron al calendario</p>
      <h2><span class="cal-badge">${esc(info.emoji || info.calendar_name.slice(0, 1).toUpperCase())}</span> ${esc(info.calendar_name)}</h2>
      <p class="muted">Entrarás con el rol <b>${ROLE_LABEL[info.role]}</b>.</p>
      <div class="row gap center">
        <button class="btn ghost" data-home>Ahora no</button>
        <button class="btn" id="accept">Unirme</button>
      </div>
    </div></div>`;
  $('[data-home]', main).addEventListener('click', goHome);
  $('#accept', main).addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await api.acceptCalInvite(token);
      toast('¡Bienvenida/o al calendario! 🌳', 'success');
      goHome();
    } catch (ex) { toastError(ex); e.target.disabled = false; }
  });
}
