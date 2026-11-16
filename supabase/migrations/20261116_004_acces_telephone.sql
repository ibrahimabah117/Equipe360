-- Comptes d'accès par numéro de téléphone
-- Un responsable crée l'accès d'un agent (téléphone + mot de passe) via la
-- fonction Edge "manage-access". Le numéro est transformé en identifiant interne
-- 224XXXXXXXXX@tel.equipe360.app : pas besoin d'envoyer de SMS.

alter table public.company_members
  add column if not exists phone text,
  add column if not exists display_name text;

-- Utilisée uniquement par la fonction Edge (clé serveur) pour savoir si un numéro a déjà un compte
create or replace function public.service_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) limit 1;
$$;

revoke execute on function public.service_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.service_user_id_by_email(text) to service_role;
