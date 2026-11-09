// Racha: el árbol del equipo (cada hoja = una tarea palomeada), rachas y la semana
import * as api from './api.js';
import { state, getPrefs } from './state.js';
import {
  esc, icon, avatar, toastError, lerp, $, $$, todayISO, addDays, parseDate, isoOfTimestamp, daysBetween,
} from './ui.js';
import { loadCalendars, doneList, buildItems, visible, person, colorOf } from './model.js';

const fmtShort = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

// PRNG con semilla: el árbol siempre tiene la misma forma
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dibuja el árbol con una hoja por tarea hecha (máx 140), del color de quien la hizo
export function treeSVG(leaves, { size = 360 } = {}) {
  const rand = rng(20261108);
  const W = 360, H = 330;
  const branches = [];
  const tips = [];
  const grow = (x, y, len, ang, depth) => {
    const x2 = x + len * Math.sin(ang);
    const y2 = y - len * Math.cos(ang);
    branches.push({ x, y, x2, y2, w: Math.max(1.2, depth * 2.3) });
    if (depth === 0) { tips.push([x2, y2]); return; }
    if (depth <= 2) tips.push([x2, y2]);
    const spread = 0.32 + rand() * 0.22;
    grow(x2, y2, len * (0.7 + rand() * 0.08), ang - spread, depth - 1);
    grow(x2, y2, len * (0.7 + rand() * 0.08), ang + spread * (0.8 + rand() * 0.4), depth - 1);
    if (depth >= 3 && rand() > 0.5) grow(x2, y2, len * 0.55, ang + (rand() - 0.5) * 0.3, depth - 2);
  };
  grow(W / 2, H - 28, 78, 0, 5);
  // candidatos de hoja repartidos entre todas las puntas
  const spots = [];
  const lr = rng(7);
  for (let i = 0; i < 140; i++) {
    const [tx, ty] = tips[(i * 7) % tips.length];
    const a = lr() * Math.PI * 2;
    const r = 4 + lr() * 15;
    spots.push({ x: tx + Math.cos(a) * r, y: ty + Math.sin(a) * r * 0.8, rot: Math.round(lr() * 360) });
  }
  const shown = leaves.slice(0, spots.length);
  return `<svg class="tree-svg" viewBox="0 0 ${W} ${H}" width="${size}" role="img"
      aria-label="Árbol con ${leaves.length} hojas: ${leaves.length} tareas hechas este mes">
    <ellipse cx="${W / 2}" cy="${H - 22}" rx="120" ry="12" class="ground"/>
    <g class="trunk">${branches.map((b) => `<line x1="${b.x.toFixed(1)}" y1="${b.y.toFixed(1)}" x2="${b.x2.toFixed(1)}" y2="${b.y2.toFixed(1)}" stroke-width="${b.w.toFixed(1)}"/>`).join('')}</g>
    <g class="leaves">${shown.map((l, i) => {
      const s = spots[i];
      return `<path d="M0 -9 C6 -5 6 4 0 9 C-6 4 -6 -5 0 -9Z" fill="${esc(l.color)}"
        transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot})" style="animation-delay:${Math.min(i * 18, 1400)}ms"><title>${esc(l.title)}</title></path>`;
    }).join('')}</g>
    ${leaves.length > spots.length ? `<text x="${W - 10}" y="${H - 6}" text-anchor="end" class="tree-more">+${leaves.length - spots.length} hojas</text>` : ''}
  </svg>`;
}

function streaks(daySet) {
  const today = todayISO();
  let start = daySet.has(today) ? today : addDays(today, -1);
  let current = 0;
  for (let d = start; daySet.has(d); d = addDays(d, -1)) current++;
  const sorted = [...daySet].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best, today: daySet.has(today) };
}

export async function renderStats(main) {
  main.innerHTML = `<div class="page"><div class="skeleton" style="height:360px"></div></div>`;
  const today = todayISO();
  const ws = getPrefs().weekStart;
  const weekStart = addDays(today, -((parseDate(today).getDay() - ws + 7) % 7));
  const weekEnd = addDays(weekStart, 6);
  const since = new Date(parseDate(addDays(weekStart, -7 * 11)));
  let doneFeed, weekFeed;
  try {
    [, doneFeed, weekFeed] = await Promise.all([
      loadCalendars(), api.done(since.toISOString()), api.feed(weekStart, weekEnd),
    ]);
  } catch (e) {
    toastError(e);
    main.innerHTML = `<div class="page"><div class="empty-state">${lerp('triste', 'lerp-empty')}<p class="muted">No se pudo cargar la racha.</p></div></div>`;
    return;
  }

  const hidden = getPrefs().hidden;
  const all = doneList(doneFeed).filter((d) => !hidden.includes(d.cal.id));
  const me = state.user.id;
  const dayOf = (d) => isoOfTimestamp(d.at);
  const monthStart = `${today.slice(0, 7)}-01`;

  const myDays = new Set(all.filter((d) => d.by === me).map(dayOf));
  const st = streaks(myDays);
  const thisWeek = all.filter((d) => dayOf(d) >= weekStart);
  const mineWeek = thisWeek.filter((d) => d.by === me).length;
  const monthLeaves = all.filter((d) => dayOf(d) >= monthStart).reverse()
    .map((d) => ({ title: d.title, color: person(d.by)?.avatar_color || colorOf(d) }));

  // progreso de la semana (tareas con fecha esta semana en calendarios visibles)
  const weekItems = buildItems(weekFeed, weekStart, weekEnd)
    .filter((it) => it.kind === 'task' && it.type !== 'sprint' && visible(it, { includeDone: true }));
  const wDone = weekItems.filter((it) => it.done).length;
  const pct = weekItems.length ? Math.round((wDone / weekItems.length) * 100) : 0;

  // tabla de la semana
  const counts = new Map();
  for (const d of thisWeek) counts.set(d.by, (counts.get(d.by) || 0) + 1);
  const board = [...state.people.values()].map((p) => ({ p, n: counts.get(p.id) || 0 }))
    .sort((a, b) => b.n - a.n || (a.p.full_name || '').localeCompare(b.p.full_name || '', 'es'));
  const max = Math.max(1, ...board.map((b) => b.n));

  const pose = st.current >= 7 ? 'bandana' : st.current >= 3 ? 'contento' : st.current >= 1 ? 'determinado' : 'curioso';
  const streakMsg = st.current === 0 ? 'Palomea una tarea hoy para empezar tu racha 🌱'
    : st.today ? '¡Ya regaste el árbol hoy! 💧' : 'Palomea algo hoy para no perder la racha 🔥';

  main.innerHTML = `
  <div class="page racha">
    <header class="hero tree-hero">
      <div class="hero-text">
        <p class="eyebrow">Lerping Tree · racha</p>
        <h1>El árbol <span class="hl-orange">del equipo</span></h1>
        <p class="hero-sub">Cada hoja es una tarea palomeada este mes, del color de quien la hizo. Entre más hacen, más frondoso. 🍃</p>
        <div class="head-stats">
          <div><b>${icon('flame', 22)} ${st.current}</b><span>${st.current === 1 ? 'día' : 'días'} de racha</span></div>
          <div><b>${mineWeek}</b><span>tuyas esta semana</span></div>
          <div><b>${thisWeek.length}</b><span>del equipo esta semana</span></div>
          <div><b>${st.best}</b><span>tu récord (3 meses)</span></div>
        </div>
        <p class="streak-msg">${esc(streakMsg)}</p>
      </div>
      <div class="tree-art">
        ${treeSVG(monthLeaves)}
        ${lerp(pose, 'lerp-tree')}
        <p class="muted small center">${monthLeaves.length} ${monthLeaves.length === 1 ? 'hoja' : 'hojas'} en ${esc(new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(new Date()))}</p>
      </div>
    </header>

    <div class="stat-grid">
      <section class="card">
        <h3>Progreso de la semana</h3>
        <div class="ring-row">
          <svg class="ring" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" class="ring-bg"/>
            <circle cx="60" cy="60" r="50" class="ring-fg" stroke-dasharray="${(pct / 100) * 314.16} 314.16" transform="rotate(-90 60 60)"/>
            <text x="60" y="67" text-anchor="middle">${pct}%</text>
          </svg>
          <div><p><b>${wDone} de ${weekItems.length}</b> tareas con fecha esta semana ya están hechas.</p>
            <p class="muted small">${esc(fmtShort.format(parseDate(weekStart)))} – ${esc(fmtShort.format(parseDate(weekEnd)))} · calendarios visibles</p>
            ${weekItems.length - wDone > 0 ? `<a class="btn ghost small mt-s" href="#/agenda">${icon('list', 14)} Ver pendientes</a>` : ''}</div>
        </div>
      </section>
      <section class="card">
        <h3>Esta semana</h3>
        <ol class="leader">${board.slice(0, 10).map((b, i) => `
          <li class="${b.n ? '' : 'zero'}" style="--c:${esc(b.p.avatar_color)}">
            <span class="pos">${i + 1}</span>${avatar(b.p, 'sm')}
            <span class="who">${esc(b.p.id === me ? 'Tú' : (b.p.full_name || b.p.email))}</span>
            <span class="lbar"><span style="width:${(b.n / max) * 100}%"></span></span>
            <b>${b.n}</b>
          </li>`).join('') || '<li class="muted small">Aún no hay nadie.</li>'}</ol>
      </section>
    </div>

    <section class="card">
      <div class="row between"><h3>Últimas 12 semanas</h3>
        <div class="seg small" id="heat-seg"><button type="button" data-who="me" class="on">Yo</button><button type="button" data-who="team">Equipo</button></div></div>
      <div id="heat"></div>
    </section>
  </div>`;

  function renderHeat(who) {
    const map = new Map();
    for (const d of all) if (who === 'team' || d.by === me) map.set(dayOf(d), (map.get(dayOf(d)) || 0) + 1);
    const start = addDays(weekStart, -7 * 11);
    const top = Math.max(1, ...map.values());
    let cols = '';
    for (let w = 0; w < 12; w++) {
      let cells = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, w * 7 + i);
        const n = map.get(d) || 0;
        const lvl = d > today ? -1 : n === 0 ? 0 : Math.min(4, Math.ceil((n / top) * 4));
        cells += `<span class="hc l${lvl}" title="${esc(fmtShort.format(parseDate(d)))}: ${n} ${n === 1 ? 'hecha' : 'hechas'}"></span>`;
      }
      cols += `<div class="hcol">${cells}</div>`;
    }
    $('#heat', main).innerHTML = `<div class="heat">${cols}</div>
      <div class="heat-legend muted small">menos <span class="hc l0"></span><span class="hc l1"></span><span class="hc l2"></span><span class="hc l3"></span><span class="hc l4"></span> más</div>`;
  }
  renderHeat('me');
  $('#heat-seg', main).addEventListener('click', (e) => {
    const b = e.target.closest('[data-who]');
    if (!b) return;
    $$('#heat-seg button', main).forEach((x) => x.classList.toggle('on', x === b));
    renderHeat(b.dataset.who);
  });
}
