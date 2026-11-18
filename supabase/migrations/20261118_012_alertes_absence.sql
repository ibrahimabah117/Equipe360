-- Vérification automatique des absences
-- Toutes les 5 minutes, le serveur compare le planning et les pointages, même si personne
-- n'a l'appli ouverte. Un agent prévu qui n'a pas pointé son arrivée 30 minutes après le
-- début de sa garde déclenche une alerte « absent » pour le patron et les chefs de poste.
-- L'alerte se clôt toute seule si l'agent pointe ensuite, ou si l'absence est saisie au planning.
-- Mêmes règles que l'écran Pointages : arrivée acceptée de 3 h avant le début jusqu'à la fin
-- de la garde, heures de Conakry (GMT).

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  schedule_entry_id uuid not null references public.schedule_entries(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  kind text not null default 'missing' check (kind in ('missing')),
  shift_start timestamptz not null,
  created_at timestamptz not null default now(),
  -- Agent arrivé ou absence saisie : l'alerte n'est plus d'actualité
  resolved_at timestamptz,
  resolved_reason text check (resolved_reason in ('arrived', 'absence_recorded', 'removed')),
  -- Le responsable a pris l'alerte en charge
  seen_at timestamptz,
  seen_by uuid references auth.users(id) on delete set null,
  unique (schedule_entry_id, kind)
);
create index if not exists attendance_alerts_open_idx on public.attendance_alerts (company_id, created_at desc) where resolved_at is null;
create index if not exists punches_employee_in_idx on public.punches (employee_id, punched_at) where kind = 'in';

alter table public.attendance_alerts enable row level security;

-- Lecture : patron et chefs de poste. Les écritures passent uniquement par les fonctions ci-dessous.
create policy attendance_alerts_select on public.attendance_alerts for select to authenticated
  using (private.is_manager(company_id));
revoke insert, update, delete on public.attendance_alerts from anon, authenticated;

-- Le cœur : appelée toutes les 5 minutes par pg_cron
create or replace function private.check_attendance(p_missing_after_min integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_new integer := 0;
  v_rows integer;
  r record;
  v_start timestamptz;
  v_end timestamptz;
  v_arrived boolean;
begin
  for r in
    select se.id, se.company_id, se.employee_id, se.site_id, se.work_date, se.status,
           st.start_time, st.end_time
    from public.schedule_entries se
    join public.shift_types st on st.id = se.shift_type_id
    join public.companies c on c.id = se.company_id
    where se.work_date between v_today - 1 and v_today
      and private.company_open(c.status, c.paid_until)
  loop
    v_start := (r.work_date + r.start_time) at time zone 'Africa/Conakry';
    v_end := (r.work_date + r.end_time) at time zone 'Africa/Conakry';
    if v_end <= v_start then
      v_end := v_end + interval '1 day'; -- garde de nuit
    end if;

    -- Absence déjà saisie au planning : rien à signaler
    if r.status = 'absent' then
      update public.attendance_alerts
         set resolved_at = v_now, resolved_reason = 'absence_recorded'
       where schedule_entry_id = r.id and resolved_at is null;
      continue;
    end if;

    -- Pas encore l'heure de lever l'alerte, ou garde terminée depuis longtemps
    continue when v_now < v_start + make_interval(mins => p_missing_after_min);

    select exists (
      select 1 from public.punches p
       where p.employee_id = r.employee_id
         and p.company_id = r.company_id
         and p.kind = 'in'
         and p.punched_at >= v_start - interval '3 hours'
         and p.punched_at <= v_end
    ) into v_arrived;

    if v_arrived then
      update public.attendance_alerts
         set resolved_at = v_now, resolved_reason = 'arrived'
       where schedule_entry_id = r.id and resolved_at is null;
    elsif v_now <= v_end then
      insert into public.attendance_alerts (company_id, schedule_entry_id, employee_id, site_id, kind, shift_start)
      values (r.company_id, r.id, r.employee_id, r.site_id, 'missing', v_start)
      on conflict (schedule_entry_id, kind) do nothing;
      get diagnostics v_rows = row_count;
      v_new := v_new + v_rows;
    end if;
  end loop;

  -- Garde supprimée ou déplacée hors du créneau : l'alerte ouverte n'a plus lieu d'être
  update public.attendance_alerts a
     set resolved_at = v_now, resolved_reason = 'removed'
   where a.resolved_at is null
     and not exists (
       select 1 from public.schedule_entries se
        where se.id = a.schedule_entry_id and se.employee_id = a.employee_id
     );

  return v_new;
end;
$$;
revoke execute on function private.check_attendance(integer) from public, anon, authenticated;

-- Bouton « Actualiser » : un responsable peut lancer la vérification sans attendre les 5 minutes
create or replace function public.refresh_attendance_alerts(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_manager(p_company_id) then
    raise exception 'Accès refusé';
  end if;
  return private.check_attendance();
end;
$$;
revoke execute on function public.refresh_attendance_alerts(uuid) from public, anon;
grant execute on function public.refresh_attendance_alerts(uuid) to authenticated;

-- « J'ai vu, je m'en occupe »
create or replace function public.mark_attendance_alert_seen(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.attendance_alerts where id = p_alert_id;
  if v_company is null or not private.is_manager(v_company) then
    raise exception 'Accès refusé';
  end if;
  update public.attendance_alerts
     set seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, (select auth.uid()))
   where id = p_alert_id;
end;
$$;
revoke execute on function public.mark_attendance_alert_seen(uuid) from public, anon;
grant execute on function public.mark_attendance_alert_seen(uuid) to authenticated;

-- Programmation toutes les 5 minutes
do $$
begin
  if exists (select 1 from cron.job where jobname = 'equipe360-verif-absences') then
    perform cron.unschedule('equipe360-verif-absences');
  end if;
  perform cron.schedule('equipe360-verif-absences', '*/5 * * * *', 'select private.check_attendance();');
end;
$$;
