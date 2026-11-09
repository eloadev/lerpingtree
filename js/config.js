// =====================================================================
//  Configuración de Supabase
//  Supabase → Project Settings → API (o "API Keys")
//  · SUPABASE_URL:  "Project URL"
//  · SUPABASE_KEY:  la "Publishable key" (sb_publishable_...) o la "anon public"
//
//  Es SEGURO que esta llave sea pública: solo identifica tu proyecto.
//  La seguridad real la hace Row Level Security en la base de datos.
//  ⚠️ NUNCA pongas aquí la "secret" / "service_role" key.
// =====================================================================

export const SUPABASE_URL = 'https://emuedouyogwfytaeflne.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_lKj2k2JcZ16ZCk6JlJXDZQ_fC2aLNY0';

// Es el MISMO proyecto de Supabase que LERPO: misma cuenta para las dos páginas.
// Como las dos viven en eloadev.github.io, si ya iniciaste sesión en LERPO
// aquí entras directo.

// Dónde vive LERPO (para los botones "Abrir en LERPO ↗")
export const LERPO_URL = 'https://eloadev.github.io/lerpo/';
