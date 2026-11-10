-- =====================================================================
--  LERPING TREE · calendario compartido del ELOA dev team
--
--  Va en el MISMO proyecto de Supabase que LERPO: mismas cuentas,
--  mismos perfiles/colores y las tareas de cada board aparecen solas
--  en su propio calendario.
--
--  Antes: ya debes haber corrido los SQL de LERPO (schema.sql + 02…05).
--  Pega TODO este archivo en Supabase → SQL Editor → Run (una sola vez).
--
--  Qué agrega:
--   • calendars ............ calendarios (uno por board + los que crees)
--   • calendar_members ..... quién está en cada calendario extra y su rol
--   • calendar_invitations . links de invitación (igual que en LERPO)
--   • cal_events ........... tareas y eventos del calendario (con repetición)
--   • cal_event_assignees .. personas asignadas
--   • cal_completions ...... tareas palomeadas (quién y cuándo)
--   • cal_comments ......... comentarios en tareas/eventos
--   • cal_task_colors ...... color personalizado para tareas de LERPO
--   • tasks.completed_at/by  cuándo y quién terminó cada tarea de LERPO
--
--  Seguridad: Row Level Security en todo. Un calendario extra solo lo ve
--  quien fue invitado. El calendario de un board lo ve quien está en el
--  board (las mismas reglas que LERPO).
-- =====================================================================


-- ---------- 1) LERPO: guardar quién y cuándo terminó cada tarea -------
alter table public.tasks
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles (id) on delete set null;

-- Las tareas que ya estaban en Done toman su última actualización como fecha
alter table public.tasks disable trigger tasks_touch;
update public.tasks set completed_at = updated_at
 where status = 'done' and completed_at is null;
alter table public.tasks enable trigger tasks_touch;

create or replace function public.track_task_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else                                  -- sigue en Done: no se puede falsear
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;

drop trigger if exists tasks_track_completion on public.tasks;
create trigger tasks_track_completion before insert or update on public.tasks
  for each row execute function public.track_task_completion();


-- ---------- 2) Tablas ---------------------------------------------------

create table if not exists public.calendars (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  color       text not null default '#7DABC5' check (color ~* '^#[0-9a-f]{6}$'),
  emoji       text not null default '' check (char_length(emoji) <= 8),
  -- si tiene project_id es "el calendario de ese board"
  project_id  uuid unique references public.projects (id) on delete cascade,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.calendar_members (
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  joined_at   timestamptz not null default now(),
  primary key (calendar_id, user_id)
);
create index if not exists calendar_members_user_idx on public.calendar_members (user_id);

create table if not exists public.calendar_invitations (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  token_hash  text not null unique,
  role        text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  note        text not null default '' check (char_length(note) <= 80),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_uses    int check (max_uses is null or max_uses > 0),
  uses        int not null default 0,
  revoked     boolean not null default false
);
create index if not exists calendar_invitations_cal_idx on public.calendar_invitations (calendar_id);

create table if not exists public.cal_events (
  id           uuid primary key default gen_random_uuid(),
  calendar_id  uuid not null references public.calendars (id) on delete cascade,
  kind         text not null default 'task' check (kind in ('task', 'event')),
  title        text not null check (char_length(title) between 1 and 200),
  notes        text not null default '' check (char_length(notes) <= 4000),
  start_date   date not null,
  end_date     date,
  start_time   time,
  end_time     time,
  color        text check (color is null or color ~* '^#[0-9a-f]{6}$'),
  repeat       text not null default 'none'
               check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly')),
  repeat_until date,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (end_date is null or end_date - start_date <= 62),
  check (repeat_until is null or repeat_until >= start_date)
);
create index if not exists cal_events_cal_date_idx on public.cal_events (calendar_id, start_date);

create table if not exists public.cal_event_assignees (
  event_id uuid not null references public.cal_events (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (event_id, user_id)
);

-- Una fila por tarea palomeada. on_date = el día de esa repetición.
create table if not exists public.cal_completions (
  event_id uuid not null references public.cal_events (id) on delete cascade,
  on_date  date not null,
  done_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  done_at  timestamptz not null default now(),
  primary key (event_id, on_date)
);
create index if not exists cal_completions_done_at_idx on public.cal_completions (done_at);

create table if not exists public.cal_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.cal_events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists cal_comments_event_idx on public.cal_comments (event_id);

-- Color a elección para las tareas que vienen de LERPO
create table if not exists public.cal_task_colors (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  color   text not null check (color ~* '^#[0-9a-f]{6}$')
);


-- ---------- 3) Funciones de permisos -----------------------------------

-- Tu rol en un calendario: el del board (LERPO) o el del calendario extra
create or replace function public.cal_role(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
           when k.project_id is not null then
             coalesce(public.project_role(k.project_id),
                      case when public.is_admin() then 'admin' end)
           else (select m.role from public.calendar_members m
                  where m.calendar_id = k.id and m.user_id = auth.uid())
         end
  from public.calendars k where k.id = c;
$$;

create or replace function public.can_see_cal(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.cal_role(c) is not null;
$$;

create or replace function public.can_edit_cal(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.cal_role(c) in ('admin', 'member'), false);
$$;

create or replace function public.can_manage_cal(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.cal_role(c) = 'admin', false);
$$;

create or replace function public.event_cal(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select calendar_id from public.cal_events where id = e;
$$;

-- ¿La persona u pertenece al calendario c?
create or replace function public.user_in_cal(c uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
           when k.project_id is not null then public.user_in_project(k.project_id, u)
           else exists (select 1 from public.calendar_members m
                         where m.calendar_id = k.id and m.user_id = u)
         end
  from public.calendars k where k.id = c;
$$;

-- ¿Compartes algún calendario extra con u? (para poder ver su nombre/color)
create or replace function public.shares_calendar(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.calendar_members a
    join public.calendar_members b on a.calendar_id = b.calendar_id
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;


-- ---------- 4) Triggers -------------------------------------------------

-- Quien crea un calendario extra queda como admin
create or replace function public.add_calendar_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is null and new.created_by is not null then
    insert into public.calendar_members (calendar_id, user_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_calendar_created on public.calendars;
create trigger on_calendar_created after insert on public.calendars
  for each row execute function public.add_calendar_owner();

-- Cada board nuevo de LERPO trae su calendario
create or replace function public.add_board_calendar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.calendars (name, color, project_id, created_by)
  values (left(new.name, 80),
          coalesce((select a.color from public.areas a where a.id = new.area_ids[1]), '#7DABC5'),
          new.id, new.created_by)
  on conflict (project_id) do nothing;
  return new;
end $$;

drop trigger if exists on_project_calendar on public.projects;
create trigger on_project_calendar after insert on public.projects
  for each row execute function public.add_board_calendar();

-- ...y los boards que ya existen también
insert into public.calendars (name, color, project_id, created_by)
select left(p.name, 80),
       coalesce((select a.color from public.areas a where a.id = p.area_ids[1]), '#7DABC5'),
       p.id, p.created_by
from public.projects p
on conflict (project_id) do nothing;

-- No se puede quedar un calendario extra sin admin
create or replace function public.keep_one_cal_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.calendars where id = old.calendar_id)
     and not exists (select 1 from public.calendar_members
                     where calendar_id = old.calendar_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'El calendario necesita al menos un admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists cal_members_keep_admin on public.calendar_members;
create trigger cal_members_keep_admin before update or delete on public.calendar_members
  for each row execute function public.keep_one_cal_admin();

-- updated_at automático (y "tocar" el evento al cambiar asignados → tiempo real)
drop trigger if exists cal_events_touch on public.cal_events;
create trigger cal_events_touch before update on public.cal_events
  for each row execute function public.touch_updated_at();

create or replace function public.touch_parent_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.cal_events set updated_at = now()
  where id = coalesce(new.event_id, old.event_id);
  return null;
end $$;

drop trigger if exists cal_assignees_touch on public.cal_event_assignees;
create trigger cal_assignees_touch after insert or delete on public.cal_event_assignees
  for each row execute function public.touch_parent_event();


-- ---------- 5) Row Level Security --------------------------------------

alter table public.calendars            enable row level security;
alter table public.calendar_members     enable row level security;
alter table public.calendar_invitations enable row level security;
alter table public.cal_events           enable row level security;
alter table public.cal_event_assignees  enable row level security;
alter table public.cal_completions      enable row level security;
alter table public.cal_comments         enable row level security;
alter table public.cal_task_colors      enable row level security;

revoke all on public.calendars, public.calendar_members, public.calendar_invitations,
              public.cal_events, public.cal_event_assignees, public.cal_completions,
              public.cal_comments, public.cal_task_colors from anon;

-- Perfiles: ahora también ves a quien comparte un calendario contigo
drop policy if exists "ver perfiles" on public.profiles;
create policy "ver perfiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_project(id) or public.shares_calendar(id));

-- calendars
drop policy if exists "ver calendarios" on public.calendars;
drop policy if exists "crear calendarios" on public.calendars;
drop policy if exists "editar calendarios" on public.calendars;
drop policy if exists "borrar calendarios" on public.calendars;
create policy "ver calendarios" on public.calendars for select to authenticated
  using (public.can_see_cal(id));
-- (se crean con la función create_calendar para quedar como admin al instante)
create policy "editar calendarios" on public.calendars for update to authenticated
  using (public.can_manage_cal(id)) with check (public.can_manage_cal(id));
create policy "borrar calendarios" on public.calendars for delete to authenticated
  using (public.can_manage_cal(id) and project_id is null);
revoke insert, update on public.calendars from authenticated;
grant update (name, description, color, emoji) on public.calendars to authenticated;

-- calendar_members (se entra SOLO por invitación → no hay policy de insert)
drop policy if exists "ver miembros cal" on public.calendar_members;
drop policy if exists "cambiar rol cal" on public.calendar_members;
drop policy if exists "sacar miembro cal o salirme" on public.calendar_members;
create policy "ver miembros cal" on public.calendar_members for select to authenticated
  using (public.can_see_cal(calendar_id));
create policy "cambiar rol cal" on public.calendar_members for update to authenticated
  using (public.can_manage_cal(calendar_id)) with check (public.can_manage_cal(calendar_id));
create policy "sacar miembro cal o salirme" on public.calendar_members for delete to authenticated
  using (public.can_manage_cal(calendar_id) or user_id = auth.uid());
revoke insert on public.calendar_members from authenticated;
revoke update on public.calendar_members from authenticated;
grant update (role) on public.calendar_members to authenticated;

-- calendar_invitations: solo admins del calendario. Se crean por RPC.
drop policy if exists "ver invitaciones cal" on public.calendar_invitations;
drop policy if exists "revocar invitaciones cal" on public.calendar_invitations;
drop policy if exists "borrar invitaciones cal" on public.calendar_invitations;
create policy "ver invitaciones cal" on public.calendar_invitations for select to authenticated
  using (public.can_manage_cal(calendar_id));
create policy "revocar invitaciones cal" on public.calendar_invitations for update to authenticated
  using (public.can_manage_cal(calendar_id)) with check (public.can_manage_cal(calendar_id));
create policy "borrar invitaciones cal" on public.calendar_invitations for delete to authenticated
  using (public.can_manage_cal(calendar_id));
revoke insert, update on public.calendar_invitations from authenticated;
grant update (revoked) on public.calendar_invitations to authenticated;

-- cal_events: cualquiera con rol admin o miembro agrega/edita; viewer solo ve
drop policy if exists "ver eventos" on public.cal_events;
drop policy if exists "crear eventos" on public.cal_events;
drop policy if exists "editar eventos" on public.cal_events;
drop policy if exists "borrar eventos" on public.cal_events;
create policy "ver eventos" on public.cal_events for select to authenticated
  using (public.can_see_cal(calendar_id));
create policy "crear eventos" on public.cal_events for insert to authenticated
  with check (public.can_edit_cal(calendar_id) and created_by = auth.uid());
create policy "editar eventos" on public.cal_events for update to authenticated
  using (public.can_edit_cal(calendar_id)) with check (public.can_edit_cal(calendar_id));
create policy "borrar eventos" on public.cal_events for delete to authenticated
  using (public.can_edit_cal(calendar_id));
revoke update on public.cal_events from authenticated;
grant update (calendar_id, kind, title, notes, start_date, end_date, start_time, end_time,
              color, repeat, repeat_until) on public.cal_events to authenticated;

-- asignados: solo gente que está en ese calendario
drop policy if exists "ver asignados cal" on public.cal_event_assignees;
drop policy if exists "asignar cal" on public.cal_event_assignees;
drop policy if exists "desasignar cal" on public.cal_event_assignees;
create policy "ver asignados cal" on public.cal_event_assignees for select to authenticated
  using (public.can_see_cal(public.event_cal(event_id)));
create policy "asignar cal" on public.cal_event_assignees for insert to authenticated
  with check (public.can_edit_cal(public.event_cal(event_id))
              and public.user_in_cal(public.event_cal(event_id), user_id));
create policy "desasignar cal" on public.cal_event_assignees for delete to authenticated
  using (public.can_edit_cal(public.event_cal(event_id)));

-- palomitas: quedan a tu nombre
drop policy if exists "ver hechas" on public.cal_completions;
drop policy if exists "palomear" on public.cal_completions;
drop policy if exists "despalomear" on public.cal_completions;
create policy "ver hechas" on public.cal_completions for select to authenticated
  using (public.can_see_cal(public.event_cal(event_id)));
create policy "palomear" on public.cal_completions for insert to authenticated
  with check (done_by = auth.uid() and public.can_edit_cal(public.event_cal(event_id)));
create policy "despalomear" on public.cal_completions for delete to authenticated
  using (public.can_edit_cal(public.event_cal(event_id)));
revoke update on public.cal_completions from authenticated;

-- comentarios: cualquier persona del calendario (incluso viewer); borras los tuyos
drop policy if exists "ver comentarios cal" on public.cal_comments;
drop policy if exists "comentar cal" on public.cal_comments;
drop policy if exists "borrar comentario cal" on public.cal_comments;
create policy "ver comentarios cal" on public.cal_comments for select to authenticated
  using (public.can_see_cal(public.event_cal(event_id)));
create policy "comentar cal" on public.cal_comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_cal(public.event_cal(event_id)));
create policy "borrar comentario cal" on public.cal_comments for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_cal(public.event_cal(event_id)));
revoke update on public.cal_comments from authenticated;

-- color de tareas de LERPO: lo ve el board, lo cambia quien puede editar el board
drop policy if exists "ver color tarea" on public.cal_task_colors;
drop policy if exists "poner color tarea" on public.cal_task_colors;
drop policy if exists "cambiar color tarea" on public.cal_task_colors;
drop policy if exists "quitar color tarea" on public.cal_task_colors;
create policy "ver color tarea" on public.cal_task_colors for select to authenticated
  using (public.is_member(public.task_project(task_id)));
create policy "poner color tarea" on public.cal_task_colors for insert to authenticated
  with check (public.can_edit(public.task_project(task_id)));
create policy "cambiar color tarea" on public.cal_task_colors for update to authenticated
  using (public.can_edit(public.task_project(task_id))) with check (public.can_edit(public.task_project(task_id)));
create policy "quitar color tarea" on public.cal_task_colors for delete to authenticated
  using (public.can_edit(public.task_project(task_id)));


-- ---------- 6) Funciones que llama la página (RPC) ----------------------

-- Mis calendarios: los de mis boards + los extra donde me invitaron
create or replace function public.my_calendars()
returns table (
  id uuid, name text, description text, color text, emoji text, project_id uuid,
  project_status text, my_role text, member_count int, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(p.name, c.name), c.description, c.color, c.emoji, c.project_id,
         p.status, public.cal_role(c.id),
         case when c.project_id is null
              then (select count(*) from public.calendar_members m where m.calendar_id = c.id)
              else (select count(*) from public.project_members m where m.project_id = c.project_id)
         end::int,
         c.created_at
  from public.calendars c
  left join public.projects p on p.id = c.project_id
  where auth.uid() is not null and public.cal_role(c.id) is not null
  order by (c.project_id is not null), coalesce(p.name, c.name);
$$;

-- Crear un calendario extra: quien lo crea queda como admin
create or replace function public.create_calendar(
  p_name text, p_color text default '#7DABC5', p_emoji text default '', p_description text default ''
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión primero' using errcode = '42501';
  end if;
  insert into public.calendars (name, color, emoji, description, created_by)
  values (trim(p_name), coalesce(p_color, '#7DABC5'), coalesce(p_emoji, ''), coalesce(p_description, ''), auth.uid())
  returning id into v_id;      -- el trigger on_calendar_created te agrega como admin
  return v_id;
end $$;

-- Todo lo que se pinta en el calendario entre dos fechas.
-- security invoker: corre con los permisos de quien llama (RLS aplica).
create or replace function public.calendar_feed(p_from date, p_to date)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) || jsonb_build_object(
        'assignees', coalesce((select jsonb_agg(a.user_id) from public.cal_event_assignees a where a.event_id = e.id), '[]'::jsonb),
        'done', coalesce((select jsonb_agg(jsonb_build_object('on', d.on_date, 'by', d.done_by, 'at', d.done_at))
                            from public.cal_completions d
                           where d.event_id = e.id and d.on_date between p_from - 63 and p_to), '[]'::jsonb),
        'comment_count', (select count(*) from public.cal_comments k where k.event_id = e.id)))
      from public.cal_events e
      where e.start_date <= p_to
        and ((e.repeat = 'none' and coalesce(e.end_date, e.start_date) >= p_from)
          or (e.repeat <> 'none' and (e.repeat_until is null or e.repeat_until >= p_from - 63)))
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'project_id', t.project_id, 'sprint_id', t.sprint_id, 'title', t.title,
        'description', t.description, 'status', t.status, 'area_id', t.area_id, 'due_date', t.due_date,
        'deliverable', t.deliverable, 'completed_at', t.completed_at, 'completed_by', t.completed_by,
        'color', (select c.color from public.cal_task_colors c where c.task_id = t.id),
        'assignees', coalesce((select jsonb_agg(a.user_id) from public.task_assignees a where a.task_id = t.id), '[]'::jsonb),
        'checklist_total', (select count(*) from public.checklist_items i where i.task_id = t.id),
        'checklist_done', (select count(*) from public.checklist_items i where i.task_id = t.id and i.done),
        'comment_count', (select count(*) from public.comments k where k.task_id = t.id)))
      from public.tasks t
      where t.due_date between p_from and p_to
    ), '[]'::jsonb),
    'sprints', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'project_id', s.project_id, 'name', s.name,
                                          'goal', s.goal, 'start_date', s.start_date, 'end_date', s.end_date))
      from public.sprints s
      where s.start_date is not null and s.end_date is not null
        and s.start_date <= p_to and s.end_date >= p_from
    ), '[]'::jsonb)
  );
end $$;

-- Lo que ya se hizo desde p_since: para "Hechas" y las rachas
create or replace function public.calendar_done(p_since timestamptz)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(x order by x.done_at desc) from (
        select d.event_id, d.on_date, d.done_by, d.done_at,
               e.calendar_id, e.title, e.kind, e.color, e.repeat,
               coalesce((select jsonb_agg(a.user_id) from public.cal_event_assignees a where a.event_id = e.id), '[]'::jsonb) as assignees
        from public.cal_completions d
        join public.cal_events e on e.id = d.event_id
        where d.done_at >= p_since
        order by d.done_at desc limit 500) x
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(x order by x.completed_at desc) from (
        select t.id, t.project_id, t.title, t.area_id, t.due_date, t.completed_at, t.completed_by,
               (select c.color from public.cal_task_colors c where c.task_id = t.id) as color,
               coalesce((select jsonb_agg(a.user_id) from public.task_assignees a where a.task_id = t.id), '[]'::jsonb) as assignees
        from public.tasks t
        where t.status = 'done' and t.completed_at >= p_since
        order by t.completed_at desc limit 500) x
    ), '[]'::jsonb)
  );
$$;

-- Crea un link de invitación a un calendario extra. Devuelve el token UNA vez.
create or replace function public.create_calendar_invite(
  p_calendar uuid, p_role text default 'member', p_days int default 7,
  p_max_uses int default null, p_note text default ''
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.can_manage_cal(p_calendar) then
    raise exception 'No tienes permiso para invitar a este calendario' using errcode = '42501';
  end if;
  if exists (select 1 from public.calendars where id = p_calendar and project_id is not null) then
    raise exception 'A los calendarios de board se entra con la invitación del board en LERPO' using errcode = '22023';
  end if;
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Rol inválido' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'La expiración debe ser de 1 a 90 días' using errcode = '22023';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 100) then
    raise exception 'Usos máximos: de 1 a 100' using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.calendar_invitations (calendar_id, token_hash, role, expires_at, max_uses, note)
  values (p_calendar, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p_role,
          now() + make_interval(days => p_days), p_max_uses, left(coalesce(p_note, ''), 80));

  return v_token;
end $$;

-- Vista previa: a qué calendario te invitan
create or replace function public.calendar_invite_preview(p_token text)
returns table (calendar_id uuid, calendar_name text, color text, emoji text, role text, already_member boolean)
language sql stable security definer set search_path = public as $$
  select i.calendar_id, c.name, c.color, c.emoji, i.role, public.user_in_cal(i.calendar_id, auth.uid())
  from public.calendar_invitations i
  join public.calendars c on c.id = i.calendar_id
  where auth.uid() is not null
    and i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and not i.revoked
    and i.expires_at > now()
    and (i.max_uses is null or i.uses < i.max_uses);
$$;

-- Aceptar → te vuelve miembro del calendario
create or replace function public.accept_calendar_invite(p_token text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv public.calendar_invitations%rowtype;
  v_inserted int;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión primero' using errcode = '42501';
  end if;

  select * into v_inv from public.calendar_invitations
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if not found or v_inv.revoked or v_inv.expires_at <= now()
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    raise exception 'Esta invitación no es válida o ya expiró' using errcode = 'P0002';
  end if;

  insert into public.calendar_members (calendar_id, user_id, role)
  values (v_inv.calendar_id, auth.uid(), v_inv.role)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.calendar_invitations set uses = uses + 1 where id = v_inv.id;
  end if;

  return v_inv.calendar_id;
end $$;

-- Permisos de ejecución: solo usuarios con sesión
revoke execute on function
  public.track_task_completion(), public.cal_role(uuid), public.can_see_cal(uuid),
  public.can_edit_cal(uuid), public.can_manage_cal(uuid), public.event_cal(uuid),
  public.user_in_cal(uuid, uuid), public.shares_calendar(uuid), public.add_calendar_owner(),
  public.add_board_calendar(), public.keep_one_cal_admin(), public.touch_parent_event(),
  public.my_calendars(), public.calendar_feed(date, date), public.calendar_done(timestamptz),
  public.create_calendar(text, text, text, text),
  public.create_calendar_invite(uuid, text, int, int, text), public.calendar_invite_preview(text),
  public.accept_calendar_invite(text)
from public, anon;
grant execute on function
  public.cal_role(uuid), public.can_see_cal(uuid), public.can_edit_cal(uuid),
  public.can_manage_cal(uuid), public.event_cal(uuid), public.user_in_cal(uuid, uuid),
  public.shares_calendar(uuid), public.my_calendars(), public.calendar_feed(date, date),
  public.create_calendar(text, text, text, text),
  public.calendar_done(timestamptz), public.create_calendar_invite(uuid, text, int, int, text),
  public.calendar_invite_preview(text), public.accept_calendar_invite(text)
to authenticated;


-- ---------- 7) Tiempo real ---------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['calendars', 'cal_events', 'cal_completions', 'cal_task_colors', 'tasks', 'sprints'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- =====================================================================
--  Listo 🌳  Último paso en Supabase → Authentication → URL Configuration:
--  agrega a "Redirect URLs":  https://eloadev.github.io/lerping-tree/**
-- =====================================================================
