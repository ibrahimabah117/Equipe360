-- SÉCURITÉ : les comptes d'accès ne se modifient plus directement par l'API.
-- Avant : un chef de poste (role 'manager') pouvait, en appelant l'API REST lui-même,
-- se donner le rôle 'owner', rattacher n'importe quel compte à l'entreprise ou retirer le patron.
-- Désormais seule la fonction serveur manage-access (clé service) écrit dans company_members,
-- et elle applique les règles : un responsable ne gère que les agents.
drop policy if exists members_write on public.company_members;
revoke insert, update, delete on public.company_members from anon, authenticated;
