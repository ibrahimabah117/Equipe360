-- Sécurité : RLS activée sur la liste des admins Équipe360.
-- Aucune règle d'accès : seule la fonction private.is_platform_admin() (propriétaire postgres) la lit.
alter table private.platform_admins enable row level security;
