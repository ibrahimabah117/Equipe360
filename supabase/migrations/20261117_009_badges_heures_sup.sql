-- Badges QR des employés (pointage à la borne) et heures supplémentaires

-- Chaque employé a un badge unique, imprimable ; le régénérer désactive l'ancien
alter table public.employees
  add column if not exists badge_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists employees_badge_token_idx on public.employees (badge_token);

-- Heures supplémentaires (désactivées par défaut : en gardiennage les gardes de 12 h sont la norme)
alter table public.payroll_settings
  add column if not exists overtime_enabled boolean not null default false,
  add column if not exists overtime_weekly_threshold numeric(5,1) not null default 40 check (overtime_weekly_threshold between 0 and 168),
  add column if not exists overtime_tier1_hours numeric(5,1) not null default 8 check (overtime_tier1_hours >= 0),
  add column if not exists overtime_tier1_pct numeric(5,1) not null default 25 check (overtime_tier1_pct between 0 and 300),
  add column if not exists overtime_tier2_pct numeric(5,1) not null default 50 check (overtime_tier2_pct between 0 and 300),
  add column if not exists monthly_hours numeric(6,2) not null default 173.33 check (monthly_hours > 0);

alter table public.payslips
  add column if not exists overtime_hours numeric(7,2) not null default 0,
  add column if not exists overtime_pay numeric(14,0) not null default 0;
