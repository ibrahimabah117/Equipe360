-- Comptes administrateurs d'Équipe360 (au-dessus de toutes les entreprises clientes)
-- Un admin est reconnu par son adresse e-mail, une fois cette adresse confirmée.

create table private.platform_admins (
  email text primary key check (email = lower(email)),
  label text,
  created_at timestamptz not null default now()
);

insert into private.platform_admins (email, label) values
  ('ibrahimabah117@gmail.com', 'Bah — propriétaire');

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join private.platform_admins a on a.email = lower(u.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;
grant execute on function private.is_platform_admin() to authenticated;

-- Abonnement et statut de chaque entreprise cliente
alter table public.companies
  add column status text not null default 'active' check (status in ('active', 'suspended')),
  add column monthly_price numeric(14,0) not null default 0 check (monthly_price >= 0),
  add column paid_until date,
  add column admin_note text;

-- Un client ne peut modifier que son nom et son téléphone (pas son statut ni son abonnement)
revoke update on public.companies from authenticated;
grant update (name, phone) on public.companies to authenticated;

-- Les admins ont l'accès d'un responsable dans toutes les entreprises (installation, support).
-- Une entreprise suspendue est bloquée pour ses propres utilisateurs.
create or replace function private.is_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1 from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = cid and m.user_id = (select auth.uid()) and c.status = 'active'
  );
$$;

create or replace function private.is_manager(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1 from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = cid and m.user_id = (select auth.uid())
      and m.role in ('owner', 'manager') and c.status = 'active'
  );
$$;

-- Seuls les admins créent des entreprises clientes
create or replace function public.create_company(p_name text, p_sector text default 'gardiennage')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Réservé aux administrateurs Équipe360';
  end if;
  insert into public.companies (name, sector) values (p_name, p_sector) returning id into v_id;
  insert into public.shift_types (company_id, code, label, start_time, end_time) values
    (v_id, 'J', 'Jour', '07:00', '19:00'),
    (v_id, 'N', 'Nuit', '19:00', '07:00');
  return v_id;
end;
$$;

-- Les admins gèrent l'abonnement : prix, payé jusqu'au, suspension
create or replace function public.admin_update_subscription(
  p_company_id uuid,
  p_status text default null,
  p_monthly_price numeric default null,
  p_paid_until date default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Réservé aux administrateurs Équipe360';
  end if;
  update public.companies set
    status = coalesce(p_status, status),
    monthly_price = coalesce(p_monthly_price, monthly_price),
    paid_until = coalesce(p_paid_until, paid_until),
    admin_note = coalesce(p_admin_note, admin_note)
  where id = p_company_id;
  if not found then
    raise exception 'Entreprise introuvable';
  end if;
end;
$$;

-- L'appli demande « suis-je admin ? » pour afficher l'écran d'administration
create or replace function public.am_i_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

revoke execute on function public.admin_update_subscription(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.admin_update_subscription(uuid, text, numeric, date, text) to authenticated;
revoke execute on function public.am_i_platform_admin() from public, anon;
grant execute on function public.am_i_platform_admin() to authenticated;
revoke execute on function public.create_company(text, text) from public, anon;
grant execute on function public.create_company(text, text) to authenticated;
