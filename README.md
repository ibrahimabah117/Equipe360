# Équipe360

Logiciel de gestion des équipes pour les entreprises de Guinée (Conakry) : planning, pointage par QR code avec GPS, absences et remplacements, calcul de la paie en GNF.

Premier secteur visé : les sociétés de gardiennage.

## Stack prévue

- Base de données et authentification : Supabase
- Appli web installable (PWA), fonctionnement hors ligne
- Mise en ligne : Cloudflare (Workers, fichiers statiques)

## Démarrer en local

```bash
cd web
npm install
npm run dev
```

## Mise en ligne (Cloudflare)

Tableau de bord Cloudflare → Workers & Pages → Créer → Importer un dépôt Git → `equipe360` :

- Répertoire racine : `web`
- Commande de build : `npm run build`
- Commande de déploiement : `npx wrangler deploy`

Ou depuis un ordinateur : `cd web && npx wrangler login && npm run deploy`.
La configuration est dans `web/wrangler.jsonc`.

## Organisation

- `web/` — appli web (React + Tailwind, installable sur téléphone)
- `supabase/migrations/` — base de données (tables, sécurité RLS, fonctions)
- `supabase/functions/manage-access/` — création des comptes agents par téléphone + mot de passe (sans SMS)

## Connexion

- **Admins Équipe360** : onglet « Administrateur », par e-mail (liste dans `private.platform_admins`).
- **Clients et agents** : onglet « Téléphone ». Les accès sont créés depuis « Comptes d’accès » et envoyés par WhatsApp.

## Étapes

1. ✅ Base de données, connexion par téléphone, employés et sites, import Excel, QR codes
2. ✅ Planning, absences, remplaçants
3. Pointage QR + GPS, mode hors ligne
4. Calcul de la paie, fiches PDF
5. Mise en ligne (Cloudflare) et test avec un premier client
