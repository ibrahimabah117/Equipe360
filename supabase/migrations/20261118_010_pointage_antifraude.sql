-- Pointage anti-fraude : selfie, précision GPS, appareil utilisé et alertes automatiques
--
-- Alertes possibles dans punches.flags :
--   hors_zone          position GPS en dehors du rayon du site
--   sans_gps           aucune position transmise (le site en a une)
--   gps_imprecis       précision annoncée par le téléphone > 100 m
--   position_figee     coordonnées identiques au mètre près à un ancien pointage (fausse position probable)
--   appareil_partage   le même téléphone a servi à un autre agent dans les 12 h
--   sans_photo         selfie obligatoire pour cette entreprise, mais absent
--   envoi_tardif       reçu plus de 30 min après l'heure affichée (hors ligne, ou horloge modifiée)
--   saisie_responsable pointage fait par un responsable pour un agent

-- =========================================================
-- Réglage par entreprise
-- =========================================================

alter table public.companies
  add column if not exists punch_photo_required boolean not null default false;

-- Un responsable peut l'activer lui-même (en plus du nom et du téléphone)
grant update (punch_photo_required) on public.companies to authenticated;

-- =========================================================
-- Nouvelles colonnes des pointages
-- =========================================================

alter table public.punches
  add column if not exists accuracy_m integer,
  add column if not exists device_id text check (device_id is null or length(device_id) <= 64),
  add column if not exists photo_path text,
  add column if not exists flags text[] not null default '{}';

create index if not exists punches_device_idx on public.punches (company_id, device_id, punched_at)
  where device_id is not null;

-- =========================================================
-- Photos des pointages (privées) : <company_id>/<client_id>.jpg
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('punch-photos', 'punch-photos', false, 300000, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Lit l'entreprise dans le chemin sans planter si le chemin est mal formé
create or replace function private.photo_company(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function private.photo_company(text) to authenticated;

-- Envoi : tout membre de l'entreprise, dans le dossier de son entreprise
create policy punch_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'punch-photos'
    and private.is_member(private.photo_company(name))
  );

-- Lecture : les responsables de l'entreprise, et l'agent pour ses propres photos
create policy punch_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'punch-photos'
    and (
      private.is_manager(private.photo_company(name))
      or owner_id = (select auth.uid())::text
    )
  );
-- Pas de modification ni de suppression depuis l'appli : une photo envoyée reste une preuve.

-- =========================================================
-- Fonction de pointage
-- =========================================================

drop function if exists public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid);

create or replace function public.punch(
  p_qr_token text,
  p_kind text,
  p_client_id uuid,
  p_punched_at timestamptz default now(),
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_employee_id uuid default null,  -- rempli seulement quand un chef pointe pour un agent sans smartphone
  p_accuracy integer default null,  -- précision GPS annoncée par le téléphone, en mètres
  p_device_id text default null,    -- identifiant aléatoire gardé sur le téléphone
  p_photo_path text default null    -- selfie déjà envoyé dans le stockage "punch-photos"
)
returns table (punch_id uuid, site_name text, distance_m integer, gps_ok boolean, flags text[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_site public.sites%rowtype;
  v_photo_required boolean;
  v_employee uuid;
  v_proxy boolean := p_employee_id is not null;
  v_distance integer;
  v_ok boolean := false;
  v_photo text;
  v_device text := nullif(left(trim(coalesce(p_device_id, '')), 64), '');
  v_flags text[] := '{}';
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'Type de pointage inconnu';
  end if;

  select * into v_site from public.sites s where s.qr_token = p_qr_token and s.active;
  if not found then
    raise exception 'QR code inconnu';
  end if;
  if not private.is_member(v_site.company_id) then
    raise exception 'Ce QR code n''appartient pas à votre entreprise';
  end if;
  select c.punch_photo_required into v_photo_required from public.companies c where c.id = v_site.company_id;

  if v_proxy then
    if not private.is_manager(v_site.company_id) then
      raise exception 'Seul un responsable peut pointer pour un autre agent';
    end if;
    v_employee := p_employee_id;
  else
    v_employee := private.my_employee_id(v_site.company_id);
  end if;
  if v_employee is null
     or not exists (select 1 from public.employees e
                    where e.id = v_employee and e.company_id = v_site.company_id and e.active) then
    raise exception 'Aucun employé actif lié à ce compte';
  end if;

  -- refuser les heures inventées : pas plus de 3 jours dans le passé ni dans le futur
  if p_punched_at > now() + interval '10 minutes' or p_punched_at < now() - interval '3 days' then
    raise exception 'Heure de pointage invalide';
  end if;

  -- Déjà reçu (renvoi après une coupure de réseau) : on renvoie le pointage existant
  select p.id, p.distance_m, p.gps_ok, p.flags into v_id, v_distance, v_ok, v_flags
  from public.punches p where p.client_id = p_client_id;
  if v_id is not null then
    if not exists (select 1 from public.punches p where p.id = v_id and p.employee_id = v_employee) then
      raise exception 'Pointage en double refusé';
    end if;
    return query select v_id, v_site.name, v_distance, v_ok, v_flags;
    return;
  end if;
  -- "select into" sans résultat a tout remis à null
  v_distance := null;
  v_ok := false;
  v_flags := '{}';

  -- Distance au site
  if p_latitude is not null and p_longitude is not null
     and v_site.latitude is not null and v_site.longitude is not null then
    v_distance := round(
      6371000 * 2 * asin(sqrt(
        power(sin(radians(p_latitude - v_site.latitude) / 2), 2) +
        cos(radians(v_site.latitude)) * cos(radians(p_latitude)) *
        power(sin(radians(p_longitude - v_site.longitude) / 2), 2)
      ))
    )::integer;
    v_ok := v_distance <= v_site.radius_m;
  end if;

  -- Photo : propre à ce pointage (<entreprise>/<client_id>.jpg), déjà envoyée, par ce même compte
  if p_photo_path is not null
     and p_photo_path = v_site.company_id::text || '/' || p_client_id::text || '.jpg'
     and exists (select 1 from storage.objects o
                 where o.bucket_id = 'punch-photos' and o.name = p_photo_path
                   and o.owner_id = (select auth.uid())::text) then
    v_photo := p_photo_path;
  end if;

  -- Alertes
  if v_proxy then
    v_flags := array_append(v_flags, 'saisie_responsable');
  else
    if v_distance is not null and not v_ok then
      v_flags := array_append(v_flags, 'hors_zone');
    elsif v_distance is null and v_site.latitude is not null then
      v_flags := array_append(v_flags, 'sans_gps');
    end if;

    if p_accuracy is not null and p_accuracy > 100 then
      v_flags := array_append(v_flags, 'gps_imprecis');
    end if;

    -- Un vrai GPS ne donne jamais deux fois exactement la même position à des heures différentes
    if p_latitude is not null and exists (
      select 1 from public.punches p
      where p.employee_id = v_employee
        and p.latitude = p_latitude and p.longitude = p_longitude
        and abs(extract(epoch from (p.punched_at - p_punched_at))) > 3600
        and p.punched_at > p_punched_at - interval '60 days'
    ) then
      v_flags := array_append(v_flags, 'position_figee');
    end if;

    if v_device is not null and exists (
      select 1 from public.punches p
      where p.company_id = v_site.company_id
        and p.device_id = v_device
        and p.employee_id <> v_employee
        and not ('saisie_responsable' = any (p.flags))
        and p.punched_at between p_punched_at - interval '12 hours' and p_punched_at + interval '12 hours'
    ) then
      v_flags := array_append(v_flags, 'appareil_partage');
      -- l'autre agent est signalé aussi
      update public.punches p set flags = array_append(p.flags, 'appareil_partage')
      where p.company_id = v_site.company_id
        and p.device_id = v_device
        and p.employee_id <> v_employee
        and not ('saisie_responsable' = any (p.flags))
        and not ('appareil_partage' = any (p.flags))
        and p.punched_at between p_punched_at - interval '12 hours' and p_punched_at + interval '12 hours';
    end if;

    if v_photo_required and v_photo is null then
      v_flags := array_append(v_flags, 'sans_photo');
    end if;
  end if;

  if now() - p_punched_at > interval '30 minutes' then
    v_flags := array_append(v_flags, 'envoi_tardif');
  end if;

  insert into public.punches (company_id, employee_id, site_id, kind, punched_at,
                              latitude, longitude, distance_m, gps_ok, client_id, recorded_by,
                              accuracy_m, device_id, photo_path, flags)
  values (v_site.company_id, v_employee, v_site.id, p_kind, p_punched_at,
          p_latitude, p_longitude, v_distance, v_ok, p_client_id, (select auth.uid()),
          p_accuracy, v_device, v_photo, v_flags)
  on conflict (client_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Pointage en double refusé';
  end if;

  return query select v_id, v_site.name, v_distance, v_ok, v_flags;
end;
$$;

revoke execute on function public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid, integer, text, text) from public, anon;
grant execute on function public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid, integer, text, text) to authenticated;
