-- Équipe360 — schéma initial
-- Multi-entreprises : chaque ligne appartient à une entreprise (company_id)
-- et la sécurité (RLS) empêche une entreprise de voir les données d'une autre.

-- =========================================================
-- Tables
-- =========================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sector text not null default 'gardiennage',
  phone text,
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  zone text,
  address text,
  latitude double precision,
  longitude double precision,
  radius_m integer not null default 150 check (radius_m between 20 and 2000),
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  phone text,
  job_title text,
  default_site_id uuid references public.sites(id) on delete set null,
  base_salary numeric(14,0) not null default 0 check (base_salary >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, phone)
);

-- Qui peut se connecter à quelle entreprise, et avec quel rôle
create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'agent')),
  employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- Types de garde : Jour, Nuit, Matin, Soir…
create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  label text not null,
  start_time time not null,
  end_time time not null,
  unique (company_id, code)
);

-- Planning : une ligne = un employé, un jour, une garde
create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  work_date date not null,
  shift_type_id uuid not null references public.shift_types(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned', 'absent', 'replacement')),
  replaces_employee_id uuid references public.employees(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date, shift_type_id)
);

-- Pointages (arrivée / départ) par QR code + GPS
create table public.punches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  punched_at timestamptz not null,
  received_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  distance_m integer,
  gps_ok boolean not null default false,
  client_id uuid not null unique, -- évite les doublons quand le téléphone renvoie un pointage fait hors ligne
  recorded_by uuid references auth.users(id) on delete set null
);

create index on public.sites (company_id);
create index on public.employees (company_id);
create index on public.company_members (user_id);
create index on public.schedule_entries (company_id, work_date);
create index on public.punches (company_id, punched_at);
create index on public.punches (employee_id, punched_at);

-- =========================================================
-- Cohérence : un planning ou un compte ne peut pas pointer
-- vers l'employé, le site ou la garde d'une autre entreprise
-- =========================================================

create or replace function public.check_same_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'schedule_entries' then
    if not exists (select 1 from public.employees where id = new.employee_id and company_id = new.company_id)
       or not exists (select 1 from public.sites where id = new.site_id and company_id = new.company_id)
       or not exists (select 1 from public.shift_types where id = new.shift_type_id and company_id = new.company_id)
       or (new.replaces_employee_id is not null and not exists (
             select 1 from public.employees where id = new.replaces_employee_id and company_id = new.company_id)) then
      raise exception 'Données d''une autre entreprise';
    end if;
  elsif tg_table_name = 'company_members' then
    if new.employee_id is not null and not exists (
         select 1 from public.employees where id = new.employee_id and company_id = new.company_id) then
      raise exception 'Données d''une autre entreprise';
    end if;
  elsif tg_table_name = 'employees' then
    if new.default_site_id is not null and not exists (
         select 1 from public.sites where id = new.default_site_id and company_id = new.company_id) then
      raise exception 'Données d''une autre entreprise';
    end if;
  end if;
  return new;
end;
$$;

create trigger schedule_same_company before insert or update on public.schedule_entries
  for each row execute function public.check_same_company();
create trigger members_same_company before insert or update on public.company_members
  for each row execute function public.check_same_company();
create trigger employees_same_company before insert or update on public.employees
  for each row execute function public.check_same_company();

revoke execute on function public.check_same_company() from public, anon, authenticated;

-- =========================================================
-- Fonctions d'aide pour la sécurité
-- =========================================================

create or replace function public.is_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = cid and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_manager(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = cid and m.user_id = (select auth.uid())
      and m.role in ('owner', 'manager')
  );
$$;

create or replace function public.my_employee_id(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.employee_id from public.company_members m
  where m.company_id = cid and m.user_id = (select auth.uid());
$$;

-- =========================================================
-- Sécurité (RLS)
-- =========================================================

alter table public.companies enable row level security;
alter table public.sites enable row level security;
alter table public.employees enable row level security;
alter table public.company_members enable row level security;
alter table public.shift_types enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.punches enable row level security;

-- Entreprises : visibles par leurs membres, modifiables par les responsables
create policy companies_select on public.companies for select to authenticated
  using (public.is_member(id));
create policy companies_update on public.companies for update to authenticated
  using (public.is_manager(id)) with check (public.is_manager(id));

-- Sites et types de garde : lecture par les membres, écriture par les responsables
create policy sites_select on public.sites for select to authenticated
  using (public.is_member(company_id));
create policy sites_write on public.sites for all to authenticated
  using (public.is_manager(company_id)) with check (public.is_manager(company_id));

create policy shift_types_select on public.shift_types for select to authenticated
  using (public.is_member(company_id));
create policy shift_types_write on public.shift_types for all to authenticated
  using (public.is_manager(company_id)) with check (public.is_manager(company_id));

-- Employés : les responsables voient tout ; un agent ne voit que sa propre fiche
create policy employees_select on public.employees for select to authenticated
  using (public.is_manager(company_id) or id = public.my_employee_id(company_id));
create policy employees_write on public.employees for all to authenticated
  using (public.is_manager(company_id)) with check (public.is_manager(company_id));

-- Membres : chacun voit sa ligne, les responsables voient celles de leur entreprise
create policy members_select on public.company_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager(company_id));
create policy members_write on public.company_members for all to authenticated
  using (public.is_manager(company_id)) with check (public.is_manager(company_id));

-- Planning : les responsables gèrent ; un agent voit son propre planning
create policy schedule_select on public.schedule_entries for select to authenticated
  using (public.is_manager(company_id) or employee_id = public.my_employee_id(company_id));
create policy schedule_write on public.schedule_entries for all to authenticated
  using (public.is_manager(company_id)) with check (public.is_manager(company_id));

-- Pointages : lecture comme le planning ; création uniquement par la fonction punch()
create policy punches_select on public.punches for select to authenticated
  using (public.is_manager(company_id) or employee_id = public.my_employee_id(company_id));

-- =========================================================
-- Fonctions appelées par l'appli
-- =========================================================

-- Créer une entreprise : le créateur en devient le propriétaire,
-- avec les gardes Jour et Nuit par défaut
create or replace function public.create_company(p_name text, p_sector text default 'gardiennage')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise';
  end if;

  insert into public.companies (name, sector) values (p_name, p_sector)
  returning id into v_id;

  insert into public.company_members (company_id, user_id, role)
  values (v_id, (select auth.uid()), 'owner');

  insert into public.shift_types (company_id, code, label, start_time, end_time) values
    (v_id, 'J', 'Jour', '07:00', '19:00'),
    (v_id, 'N', 'Nuit', '19:00', '07:00');

  return v_id;
end;
$$;

-- Pointer : l'agent scanne le QR du site. La fonction retrouve le site,
-- vérifie que l'agent appartient à la même entreprise et calcule la distance GPS.
create or replace function public.punch(
  p_qr_token text,
  p_kind text,
  p_client_id uuid,
  p_punched_at timestamptz default now(),
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_employee_id uuid default null -- rempli seulement quand un chef pointe pour un agent sans smartphone
)
returns table (punch_id uuid, site_name text, distance_m integer, gps_ok boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_site public.sites%rowtype;
  v_employee uuid;
  v_distance integer;
  v_ok boolean := false;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'Type de pointage inconnu';
  end if;

  select * into v_site from public.sites s where s.qr_token = p_qr_token and s.active;
  if not found then
    raise exception 'QR code inconnu';
  end if;
  if not public.is_member(v_site.company_id) then
    raise exception 'Ce QR code n''appartient pas à votre entreprise';
  end if;

  if p_employee_id is not null then
    if not public.is_manager(v_site.company_id) then
      raise exception 'Seul un responsable peut pointer pour un autre agent';
    end if;
    v_employee := p_employee_id;
  else
    v_employee := public.my_employee_id(v_site.company_id);
  end if;
  if v_employee is null
     or not exists (select 1 from public.employees e
                    where e.id = v_employee and e.company_id = v_site.company_id and e.active) then
    raise exception 'Aucun employé actif lié à ce compte';
  end if;

  -- refuser les heures inventées : pas plus de 3 jours dans le passé ni dans le futur
  if p_punched_at > now() + interval '10 minutes' or p_punched_at < now() - interval '3 days' then
    raise exception 'Heure de pointage invalide';
  end if;

  if p_latitude is not null and p_longitude is not null
     and v_site.latitude is not null and v_site.longitude is not null then
    v_distance := round(
      6371000 * 2 * asin(sqrt(
        power(sin(radians(p_latitude - v_site.latitude) / 2), 2) +
        cos(radians(v_site.latitude)) * cos(radians(p_latitude)) *
        power(sin(radians(p_longitude - v_site.longitude) / 2), 2)
      ))
    )::integer;
    v_ok := v_distance <= v_site.radius_m;
  end if;

  insert into public.punches (company_id, employee_id, site_id, kind, punched_at,
                              latitude, longitude, distance_m, gps_ok, client_id, recorded_by)
  values (v_site.company_id, v_employee, v_site.id, p_kind, p_punched_at,
          p_latitude, p_longitude, v_distance, v_ok, p_client_id, (select auth.uid()))
  on conflict (client_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- déjà reçu (renvoi après une coupure de réseau)
    select p.id, p.distance_m, p.gps_ok into v_id, v_distance, v_ok
    from public.punches p where p.client_id = p_client_id and p.employee_id = v_employee;
    if v_id is null then
      raise exception 'Pointage en double refusé';
    end if;
  end if;

  return query select v_id, v_site.name, v_distance, v_ok;
end;
$$;

-- Les fonctions d'aide ne sont pas appelables directement depuis l'appli
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.is_manager(uuid) from public, anon;
revoke execute on function public.my_employee_id(uuid) from public, anon;
revoke execute on function public.create_company(text, text) from public, anon;
revoke execute on function public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid) from public, anon;
grant execute on function public.create_company(text, text) to authenticated;
grant execute on function public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.my_employee_id(uuid) to authenticated;
