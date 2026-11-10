// Estado global mínimo + preferencias que se recuerdan en este navegador
export const state = {
  session: null,
  user: null,
  profile: null,
  areas: [],
  areaById: new Map(),
  calendars: [],            // de my_calendars()
  calById: new Map(),
  calByProject: new Map(),  // project_id → calendario del board
  people: new Map(),        // user_id → perfil (gente de todos mis calendarios)
  calMembers: new Map(),    // calendar_id → [{ user_id, role, profile }]
};

// ---------- preferencias ----------
const PKEY = 'tree_prefs';
const DEFAULT_PREFS = {
  hidden: [],          // calendarios ocultos
  colorBy: 'person',   // 'person' | 'calendar'
  showSprints: true,
  showDone: false,     // ver las hechas (tachadas) en el calendario
  weekStart: 0,        // 0 domingo, 1 lunes
  people: [],          // filtrar por personas (vacío = todas)
  doneOpen: true,      // panel de Hechas abierto
};
let prefs = null;
export function getPrefs() {
  if (!prefs) {
    try { prefs = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PKEY) || '{}') }; }
    catch { prefs = { ...DEFAULT_PREFS }; }
  }
  return prefs;
}
export function setPrefs(patch) {
  Object.assign(getPrefs(), patch);
  try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch {}
  return prefs;
}

// ---------- invitación pendiente (si te invitan sin sesión) ----------
// Otra llave que LERPO: las dos páginas comparten localStorage en eloadev.github.io
const PENDING_KEY = 'tree_pending_invite';
export function savePendingInvite(token) {
  try { localStorage.setItem(PENDING_KEY, token); } catch {}
}
export function takePendingInvite() {
  try {
    const t = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return t;
  } catch { return null; }
}
export function peekPendingInvite() {
  try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
}
