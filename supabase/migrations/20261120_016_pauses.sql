-- Pointage des pauses
-- Deux nouveaux types de pointage : début et fin de pause. Le temps de pause est
-- retiré des heures travaillées (au-delà de la pause payée), une pause oubliée peut
-- être retirée au forfait, et une pause trop longue est signalée.

alter table public.punches drop constraint if exists punches_kind_check;
alter table public.punches add constraint punches_kind_check
  check (kind in ('in', 'out', 'break_start', 'break_end'));

-- Option visible par tous les membres (l'écran de pointage en a besoin), comme le selfie
alter table public.companies add column if not exists breaks_enabled boolean not null default false;
grant update (breaks_enabled) on public.companies to authenticated;

alter table public.payroll_settings
  -- minutes de pause payées par poste (non retirées)
  add column if not exists break_paid_min integer not null default 0 check (break_paid_min between 0 and 240),
  -- pause non pointée : minutes retirées au forfait (0 = rien), sur les postes d'au moins 6 h
  add column if not exists break_auto_min integer not null default 0 check (break_auto_min between 0 and 240),
  -- au-delà, la pause est signalée comme trop longue
  add column if not exists break_max_min integer not null default 60 check (break_max_min between 5 and 480);

-- punch() accepte les deux nouveaux types (seul ce contrôle change)
do $mig$
declare
  d text;
begin
  d := pg_get_functiondef('public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid, integer, text, text)'::regprocedure);
  if position($q$p_kind not in ('in', 'out')$q$ in d) = 0 then
    raise exception 'punch() : contrôle du type introuvable';
  end if;
  d := replace(d, $q$p_kind not in ('in', 'out')$q$, $q$p_kind not in ('in', 'out', 'break_start', 'break_end')$q$);
  execute d;
end
$mig$;
