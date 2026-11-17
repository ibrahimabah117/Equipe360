-- Mode de paie par employé : au mois (défaut), à la garde ou à l'heure
alter table public.employees
  add column if not exists pay_mode text not null default 'monthly'
    check (pay_mode in ('monthly', 'per_shift', 'hourly')),
  add column if not exists pay_rate numeric(14,0) not null default 0 check (pay_rate >= 0);

-- Bulletin : mode et tarif utilisés, heures travaillées (paie à l'heure)
alter table public.payslips
  add column if not exists pay_mode text not null default 'monthly',
  add column if not exists pay_rate numeric(14,0) not null default 0,
  add column if not exists worked_hours numeric(7,2) not null default 0;
