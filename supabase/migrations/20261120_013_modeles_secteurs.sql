-- Équipe360 s'adapte au métier du client.
-- À la création d'une entreprise, on installe les horaires et les réglages de paie
-- qui correspondent à son secteur. Le client peut tout modifier ensuite.

create or replace function public.create_company(p_name text, p_sector text default 'gardiennage')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_sector text := coalesce(nullif(trim(p_sector), ''), 'autre');
begin
  if not private.is_platform_admin() then
    raise exception 'Réservé aux administrateurs Équipe360';
  end if;
  if v_sector not in ('gardiennage', 'btp', 'usine', 'mines', 'ecole', 'nettoyage',
                      'commerce', 'sante', 'hotellerie', 'autre') then
    raise exception 'Secteur inconnu : %', v_sector;
  end if;

  insert into public.companies (name, sector, punch_photo_required)
  values (p_name, v_sector, v_sector in ('gardiennage', 'nettoyage', 'btp', 'mines'))
  returning id into v_id;

  -- Horaires types du secteur (code, libellé, début, fin)
  insert into public.shift_types (company_id, code, label, start_time, end_time)
  select v_id, t.code, t.label, t.st::time, t.et::time
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
  where t.sector = v_sector;

  -- Réglages de paie de départ (durée de référence d'un poste, heures sup, retards)
  insert into public.payroll_settings (company_id, reference_shift_hours, overtime_enabled,
                                       overtime_weekly_threshold, late_tolerance_min, monthly_hours)
  select v_id, p.ref_h, p.ot, p.ot_threshold, p.late_tol, p.month_h
  from (values
    ('gardiennage', 12, false, 40, 30, 173.33),
    ('usine',        8, true,  40, 10, 173.33),
    ('btp',          8, true,  40, 15, 173.33),
    ('mines',       12, false, 40, 15, 173.33),
    ('ecole',        5, false, 40,  5, 173.33),
    ('nettoyage',    4, false, 40, 10, 173.33),
    ('commerce',    10, true,  40, 15, 173.33),
    ('sante',       12, false, 40, 15, 173.33),
    ('hotellerie',   8, true,  40, 10, 173.33),
    ('autre',        8, false, 40, 15, 173.33)
  ) as p(sector, ref_h, ot, ot_threshold, late_tol, month_h)
  where p.sector = v_sector;

  return v_id;
end;
$$;

revoke execute on function public.create_company(text, text) from public, anon;
grant execute on function public.create_company(text, text) to authenticated;
