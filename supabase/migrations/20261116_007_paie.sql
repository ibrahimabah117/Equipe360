-- Étape 4 — Paie en GNF
-- Règles par entreprise (modifiables), paie mensuelle (brouillon → validée) et bulletins.
-- Une paie validée est verrouillée : il faut la rouvrir pour la modifier.

alter table public.employees add column if not exists hire_date date;

-- Règles de paie de chaque entreprise
create table if not exists public.payroll_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  absence_divisor integer not null default 30 check (absence_divisor between 1 and 31),
  unpunched_as_absence boolean not null default false,
  late_deduction boolean not null default true,
  late_tolerance_min integer not null default 60 check (late_tolerance_min between 0 and 10000),
  reference_shift_hours numeric(4,1) not null default 12 check (reference_shift_hours > 0 and reference_shift_hours <= 24),
  night_bonus numeric(14,0) not null default 0 check (night_bonus >= 0),
  seniority_pct_per_year numeric(5,2) not null default 0 check (seniority_pct_per_year between 0 and 100),
  seniority_cap_pct numeric(5,2) not null default 25 check (seniority_cap_pct between 0 and 100),
  updated_at timestamptz not null default now()
);

-- Paie d'un mois
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  status text not null default 'draft' check (status in ('draft', 'validated')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references auth.users(id) on delete set null,
  unique (company_id, period)
);

-- Bulletin d'un employé pour un mois
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  base_salary numeric(14,0) not null default 0,
  shifts_planned integer not null default 0,
  shifts_worked integer not null default 0,
  shifts_unpunched integer not null default 0,
  unjustified_absences integer not null default 0,
  absence_deduction numeric(14,0) not null default 0,
  late_minutes integer not null default 0,
  late_deduction numeric(14,0) not null default 0,
  night_shifts integer not null default 0,
  night_bonus numeric(14,0) not null default 0,
  seniority_years integer not null default 0,
  seniority_bonus numeric(14,0) not null default 0,
  bonus numeric(14,0) not null default 0 check (bonus >= 0),
  bonus_note text,
  advance numeric(14,0) not null default 0 check (advance >= 0),
  other_deduction numeric(14,0) not null default 0 check (other_deduction >= 0),
  other_note text,
  gross numeric(14,0) not null default 0,
  net numeric(14,0) not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index if not exists payslips_employee_idx on public.payslips (employee_id);
create index if not exists payslips_company_idx on public.payslips (company_id);

-- ---------------------------------------------------------------- Sécurité

alter table public.payroll_settings enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payslips enable row level security;

create policy payroll_settings_select on public.payroll_settings for select to authenticated
  using (private.is_manager(company_id));
create policy payroll_settings_write on public.payroll_settings for all to authenticated
  using (private.is_manager(company_id)) with check (private.is_manager(company_id));

-- Les agents voient seulement les paies validées (pour retrouver leur bulletin)
create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (private.is_manager(company_id) or (private.is_member(company_id) and status = 'validated'));
create policy payroll_runs_write on public.payroll_runs for all to authenticated
  using (private.is_manager(company_id)) with check (private.is_manager(company_id));

create policy payslips_select on public.payslips for select to authenticated
  using (
    private.is_manager(company_id)
    or (
      employee_id = private.my_employee_id(company_id)
      and exists (select 1 from public.payroll_runs r where r.id = run_id and r.status = 'validated')
    )
  );
create policy payslips_write on public.payslips for all to authenticated
  using (private.is_manager(company_id)) with check (private.is_manager(company_id));

-- ---------------------------------------------------------------- Cohérence et verrouillage

create or replace function private.check_payroll_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'validated' then
      raise exception 'Paie validée : rouvrez-la avant de la supprimer';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id or new.period <> old.period then
      raise exception 'Le mois d''une paie ne peut pas être changé';
    end if;
    if new.status = 'validated' and old.status = 'draft' then
      new.validated_at := now();
      new.validated_by := (select auth.uid());
    elsif new.status = 'draft' then
      new.validated_at := null;
      new.validated_by := null;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.check_payroll_run() from public, anon, authenticated;

create trigger payroll_runs_check before insert or update or delete on public.payroll_runs
  for each row execute function private.check_payroll_run();

create or replace function private.check_payslip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_company uuid;
begin
  if tg_op = 'DELETE' then
    select r.status into v_status from public.payroll_runs r where r.id = old.run_id;
    if v_status = 'validated' then
      raise exception 'Paie validée : rouvrez-la pour la modifier';
    end if;
    return old;
  end if;
  select r.status, r.company_id into v_status, v_company from public.payroll_runs r where r.id = new.run_id;
  if v_status = 'validated' then
    raise exception 'Paie validée : rouvrez-la pour la modifier';
  end if;
  if v_company is distinct from new.company_id
     or not exists (select 1 from public.employees e where e.id = new.employee_id and e.company_id = new.company_id) then
    raise exception 'Données d''une autre entreprise';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.check_payslip() from public, anon, authenticated;

create trigger payslips_check before insert or update or delete on public.payslips
  for each row execute function private.check_payslip();
