-- Validation des heures supplémentaires (usines, BTP, mines…)
-- Quand l'option est active, une heure sup n'est payée que si un responsable l'a validée,
-- semaine par semaine et employé par employé. Le temps pointé après la fin du poste
-- (rester pour finir une commande) est alors compté, puisqu'il passe par la validation.

alter table public.payroll_settings
  add column if not exists overtime_requires_approval boolean not null default false;

create table public.overtime_approvals (
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null check (status in ('approved', 'rejected')),
  approved_hours numeric(6, 2) not null default 0 check (approved_hours >= 0 and approved_hours <= 100),
  note text check (note is null or length(note) <= 300),
  decided_by uuid default auth.uid() references auth.users(id),
  decided_at timestamptz not null default now(),
  primary key (employee_id, week_start)
);
create index on public.overtime_approvals (company_id, week_start);

alter table public.overtime_approvals enable row level security;

-- Responsables : lecture et décision ; un employé voit les décisions qui le concernent
create policy overtime_approvals_select on public.overtime_approvals for select to authenticated
  using (private.is_manager(company_id) or employee_id = private.my_employee_id(company_id));
create policy overtime_approvals_write on public.overtime_approvals for all to authenticated
  using (private.is_manager(company_id)) with check (private.is_manager(company_id));

-- Cohérence : l'employé appartient bien à l'entreprise ; on trace qui a décidé et quand
create or replace function private.check_overtime_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.employees where id = new.employee_id and company_id = new.company_id) then
    raise exception 'Données d''une autre entreprise';
  end if;
  new.decided_by := (select auth.uid());
  new.decided_at := now();
  if new.status = 'rejected' then
    new.approved_hours := 0;
  end if;
  return new;
end;
$$;
revoke execute on function private.check_overtime_approval() from public, anon, authenticated;

create trigger overtime_approvals_check before insert or update on public.overtime_approvals
  for each row execute function private.check_overtime_approval();

-- Usines, BTP et mines : validation activée d'office pour les nouveaux clients
create or replace function private.apply_sector_template(p_company uuid, p_sector text, p_payroll boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added integer;
begin
  insert into public.shift_types (company_id, code, label, start_time, end_time)
  select p_company, t.code, t.label, t.st::time, t.et::time
  from (values
    ('gardiennage','J','Jour','07:00','19:00'),
    ('gardiennage','N','Nuit','19:00','07:00'),
    ('usine','M','Matin','06:00','14:00'),
    ('usine','S','Soir','14:00','22:00'),
    ('usine','N','Nuit','22:00','06:00'),
    ('usine','J','Journée (bureaux)','08:00','17:00'),
    ('mines','J','Jour','06:00','18:00'),
    ('mines','N','Nuit','18:00','06:00'),
    ('btp','J','Journée chantier','07:00','16:00'),
    ('btp','D','Demi-journée','07:00','12:00'),
    ('btp','N','Gardien de nuit','18:00','06:00'),
    ('ecole','M','Cours du matin','08:00','13:00'),
    ('ecole','A','Cours de l''après-midi','14:00','17:00'),
    ('ecole','J','Administration','08:00','16:00'),
    ('ecole','N','Gardien de nuit','18:00','06:00'),
    ('nettoyage','M','Tôt le matin','06:00','10:00'),
    ('nettoyage','J','Journée','08:00','16:00'),
    ('nettoyage','S','Le soir','17:00','21:00'),
    ('commerce','J','Journée','08:00','18:00'),
    ('sante','J','Jour','07:00','19:00'),
    ('sante','N','Nuit','19:00','07:00'),
    ('hotellerie','M','Matin','06:00','14:00'),
    ('hotellerie','S','Soir','14:00','22:00'),
    ('hotellerie','N','Nuit','22:00','06:00'),
    ('autre','J','Journée','08:00','17:00')
  ) as t(sector, code, label, st, et)
  where t.sector = p_sector
  on conflict (company_id, code) do nothing;
  get diagnostics v_added = row_count;

  if p_payroll then
    insert into public.payroll_settings (company_id, reference_shift_hours, overtime_enabled,
                                         overtime_weekly_threshold, late_tolerance_min, monthly_hours,
                                         overtime_requires_approval)
    select p_company, p.ref_h, p.ot, p.ot_threshold, p.late_tol, p.month_h, p.ot_approval
    from (values
      ('gardiennage', 12, false, 40, 30, 173.33, false),
      ('usine',        8, true,  40, 10, 173.33, true),
      ('mines',       12, false, 40, 15, 173.33, true),
      ('btp',          8, true,  40, 15, 173.33, true),
      ('ecole',        5, false, 40,  5, 173.33, false),
      ('nettoyage',    4, false, 40, 10, 173.33, false),
      ('commerce',    10, true,  40, 15, 173.33, false),
      ('sante',       12, false, 40, 15, 173.33, false),
      ('hotellerie',   8, true,  40, 10, 173.33, false),
      ('autre',        8, false, 40, 15, 173.33, false)
    ) as p(sector, ref_h, ot, ot_threshold, late_tol, month_h, ot_approval)
    where p.sector = p_sector
    on conflict (company_id) do nothing;
  end if;
  return v_added;
end;
$$;
revoke execute on function private.apply_sector_template(uuid, text, boolean) from public, anon, authenticated;
