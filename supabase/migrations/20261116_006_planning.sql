-- Étape 2 — Planning : type d'absence et besoins en agents par site

-- Type d'absence (utile pour la paie : une absence injustifiée est retenue, un congé non)
alter table public.schedule_entries
  add column if not exists absence_kind text
    check (absence_kind in ('maladie', 'conge', 'injustifiee', 'permission', 'autre'));

-- Combien d'agents il faut sur chaque site pour chaque garde (ex. 2 le jour, 3 la nuit)
create table if not exists public.site_shift_needs (
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  shift_type_id uuid not null references public.shift_types(id) on delete cascade,
  headcount integer not null default 1 check (headcount between 0 and 50),
  primary key (site_id, shift_type_id)
);
create index if not exists site_shift_needs_company_idx on public.site_shift_needs (company_id);
create index if not exists schedule_entries_site_date_idx on public.schedule_entries (site_id, work_date);

alter table public.site_shift_needs enable row level security;

create policy needs_select on public.site_shift_needs for select to authenticated
  using (private.is_member(company_id));
create policy needs_write on public.site_shift_needs for all to authenticated
  using (private.is_manager(company_id)) with check (private.is_manager(company_id));

-- Cohérence : le site et la garde doivent appartenir à la même entreprise
create or replace function private.check_need_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.sites where id = new.site_id and company_id = new.company_id)
     or not exists (select 1 from public.shift_types where id = new.shift_type_id and company_id = new.company_id) then
    raise exception 'Données d''une autre entreprise';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_need_company() from public, anon, authenticated;

create trigger needs_same_company before insert or update on public.site_shift_needs
  for each row execute function private.check_need_company();
