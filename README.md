# Équipe360

Logiciel de gestion des équipes pour les entreprises de Guinée (Conakry) : planning, pointage par QR code avec GPS, absences et remplacements, calcul de la paie en GNF.

Premier secteur visé : les sociétés de gardiennage.

## Stack prévue

- Base de données et authentification : Supabase
- Appli web installable (PWA), fonctionnement hors ligne
- Mise en ligne : Netlify

## Démarrer en local

```bash
cd web
npm install
npm run dev
```

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
5. Mise en ligne et test avec un premier client
