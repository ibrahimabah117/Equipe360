-- Les fonctions d'aide à la sécurité passent dans un schéma "private",
-- qui n'est pas exposé à l'appli : on ne peut plus les appeler de l'extérieur.
-- Les règles RLS et les déclencheurs continuent de fonctionner.

create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_member(uuid) set schema private;
alter function public.is_manager(uuid) set schema private;
alter function public.my_employee_id(uuid) set schema private;
alter function public.check_same_company() set schema private;

-- punch() appelait les fonctions d'aide par leur ancien nom : on la recrée
create or replace function public.punch(
  p_qr_token text,
  p_kind text,
  p_client_id uuid,
  p_punched_at timestamptz default now(),
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_employee_id uuid default null -- rempli seulement quand un chef pointe pour un agent sans smartphone
)
returns table (punch_id uuid, site_name text, distance_m integer, gps_ok boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_site public.sites%rowtype;
  v_employee uuid;
  v_distance integer;
  v_ok boolean := false;
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

  if p_employee_id is not null then
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

  insert into public.punches (company_id, employee_id, site_id, kind, punched_at,
                              latitude, longitude, distance_m, gps_ok, client_id, recorded_by)
  values (v_site.company_id, v_employee, v_site.id, p_kind, p_punched_at,
          p_latitude, p_longitude, v_distance, v_ok, p_client_id, (select auth.uid()))
  on conflict (client_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- déjà reçu (renvoi après une coupure de réseau)
    select p.id, p.distance_m, p.gps_ok into v_id, v_distance, v_ok
    from public.punches p where p.client_id = p_client_id and p.employee_id = v_employee;
    if v_id is null then
      raise exception 'Pointage en double refusé';
    end if;
  end if;

  return query select v_id, v_site.name, v_distance, v_ok;
end;
$$;

revoke execute on function public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid) from public, anon;
grant execute on function public.punch(text, text, uuid, timestamptz, double precision, double precision, uuid) to authenticated;
