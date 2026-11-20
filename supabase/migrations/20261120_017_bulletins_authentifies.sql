-- Bulletins de paie authentifiables par QR code
-- À chaque validation de la paie, chaque bulletin reçoit un code secret unique et
-- impossible à deviner (128 bits). Le QR code imprimé renvoie vers une page publique
-- qui affiche les montants enregistrés : un bulletin retouché ne correspond plus.
-- Si la paie est rouverte, les anciens codes ne sont plus valables ; une nouvelle
-- validation donne de nouveaux codes.

alter table public.payslips add column if not exists verify_token text unique;

create or replace function private.rotate_payslip_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Avant la mise à jour : la paie est encore « brouillon », les bulletins sont modifiables
  if new.status = 'validated' and old.status = 'draft' then
    update public.payslips
       set verify_token = replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
     where run_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function private.rotate_payslip_tokens() from public, anon, authenticated;

drop trigger if exists payroll_runs_tokens on public.payroll_runs;
create trigger payroll_runs_tokens before update of status on public.payroll_runs
  for each row execute function private.rotate_payslip_tokens();

-- Vérification publique (sans compte) : seulement avec le code exact, et seulement
-- les informations déjà imprimées sur le bulletin.
create or replace function public.verify_payslip(p_token text)
returns table (
  state text,             -- 'valid' | 'reopened'
  company_name text,
  employee_name text,
  job_title text,
  period date,
  base_salary numeric,
  gross numeric,
  net numeric,
  shifts_worked integer,
  validated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.status = 'validated' then 'valid' else 'reopened' end,
         c.name, e.full_name, e.job_title, r.period,
         s.base_salary, s.gross, s.net, s.shifts_worked, r.validated_at
  from public.payslips s
  join public.payroll_runs r on r.id = s.run_id
  join public.companies c on c.id = s.company_id
  join public.employees e on e.id = s.employee_id
  where length(p_token) = 40 and s.verify_token = p_token;
$$;
revoke execute on function public.verify_payslip(text) from public;
grant execute on function public.verify_payslip(text) to anon, authenticated;

-- Paies déjà validées : leur donner un code (le verrou des bulletins validés est levé le temps de l'opération)
alter table public.payslips disable trigger payslips_check;
update public.payslips s
   set verify_token = replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  from public.payroll_runs r
 where r.id = s.run_id and r.status = 'validated' and s.verify_token is null;
alter table public.payslips enable trigger payslips_check;
