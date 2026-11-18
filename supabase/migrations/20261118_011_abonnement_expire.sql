-- Blocage automatique des abonnements impayés
-- paid_until = dernier jour payé. Après cette date, le client garde l'accès pendant
-- 7 jours de grâce ; ensuite toute l'entreprise (patron, chefs de poste, agents) est bloquée
-- jusqu'au paiement. Rien n'est supprimé. Les admins Équipe360 gardent l'accès.
-- paid_until vide = pas d'échéance (jamais bloqué automatiquement).

create or replace function private.company_open(p_status text, p_paid_until date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'active' and (p_paid_until is null or p_paid_until >= current_date - 7);
$$;
revoke execute on function private.company_open(text, date) from public, anon;
grant execute on function private.company_open(text, date) to authenticated;

create or replace function private.is_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1 from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = cid and m.user_id = (select auth.uid())
      and private.company_open(c.status, c.paid_until)
  );
$$;

create or replace function private.is_manager(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin() or exists (
    select 1 from public.company_members m
    join public.companies c on c.id = m.company_id
    where m.company_id = cid and m.user_id = (select auth.uid())
      and m.role in ('owner', 'manager')
      and private.company_open(c.status, c.paid_until)
  );
$$;

-- Pour l'écran de blocage : pourquoi mes entreprises ne sont plus accessibles
create or replace function public.my_access()
returns table (company_id uuid, company_name text, role text, paid_until date, blocked text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, m.role, c.paid_until,
    case
      when c.status <> 'active' then 'suspended'
      when c.paid_until is not null and c.paid_until < current_date - 7 then 'expired'
    end
  from public.company_members m
  join public.companies c on c.id = m.company_id
  where m.user_id = (select auth.uid());
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;
