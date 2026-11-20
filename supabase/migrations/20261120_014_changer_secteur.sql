-- Changer le secteur d'un client existant (réservé aux admins Équipe360).
-- Les modèles de secteur passent dans une fonction privée partagée avec create_company.
-- Changer de secteur ne supprime rien : les horaires existants et les réglages de paie
-- personnalisés sont conservés ; on peut seulement AJOUTER les horaires types manquants.

create or replace function private.sector_ok(p_sector text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_sector in ('gardiennage', 'btp', 'usine', 'mines', 'ecole', 'nettoyage',
                      'commerce', 'sante', 'hotellerie', 'autre');
$$;

-- Ajoute les horaires types du secteur (sans toucher aux codes déjà présents)
-- et, si demandé, les réglages de paie de départ. Renvoie le nombre d'horaires ajoutés.
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
                                         overtime_weekly_threshold, late_tolerance_min, monthly_hours)
    select p_company, p.ref_h, p.ot, p.ot_threshold, p.late_tol, p.month_h
    from (values
      ('gardiennage', 12, false, 40, 30, 173.33),
      ('usine',        8, true,  40, 10, 173.33),
      ('mines',       12, false, 40, 15, 173.33),
      ('btp',          8, true,  40, 15, 173.33),
      ('ecole',        5, false, 40,  5, 173.33),
      ('nettoyage',    4, false, 40, 10, 173.33),
      ('commerce',    10, true,  40, 15, 173.33),
      ('sante',       12, false, 40, 15, 173.33),
      ('hotellerie',   8, true,  40, 10, 173.33),
      ('autre',        8, false, 40, 15, 173.33)
    ) as p(sector, ref_h, ot, ot_threshold, late_tol, month_h)
    where p.sector = p_sector
    on conflict (company_id) do nothing;
  end if;
  return v_added;
end;
$$;
revoke execute on function private.apply_sector_template(uuid, text, boolean) from public, anon, authenticated;

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
  if not private.sector_ok(v_sector) then
    raise exception 'Secteur inconnu : %', v_sector;
  end if;
  insert into public.companies (name, sector, punch_photo_required)
  values (p_name, v_sector, v_sector in ('gardiennage', 'nettoyage', 'btp', 'mines'))
  returning id into v_id;
  perform private.apply_sector_template(v_id, v_sector, true);
  return v_id;
end;
$$;
revoke execute on function public.create_company(text, text) from public, anon;
grant execute on function public.create_company(text, text) to authenticated;

create or replace function public.admin_set_sector(p_company_id uuid, p_sector text, p_add_shifts boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Réservé aux administrateurs Équipe360';
  end if;
  if not private.sector_ok(p_sector) then
    raise exception 'Secteur inconnu : %', p_sector;
  end if;
  update public.companies set sector = p_sector where id = p_company_id;
  if not found then
    raise exception 'Entreprise introuvable';
  end if;
  if p_add_shifts then
    return private.apply_sector_template(p_company_id, p_sector, false);
  end if;
  return 0;
end;
$$;
revoke execute on function public.admin_set_sector(uuid, text, boolean) from public, anon;
grant execute on function public.admin_set_sector(uuid, text, boolean) to authenticated;
