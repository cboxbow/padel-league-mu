# Deploiement GitHub + Vercel

Ce projet est une app Vite/React avec deux builds separes :

- Site public : `npm run build:public` -> `dist-public`
- Admin : `npm run build:admin` -> `dist-admin`

## Option recommandee

Creer deux projets Vercel depuis le meme repository GitHub.

### Projet Vercel public

- Framework preset : Vite
- Build command : `npm run build:public`
- Output directory : `dist-public`
- Install command : `npm install`

Domaines conseilles :

- `padelleague.mu`
- `www.padelleague.mu`

### Projet Vercel admin

- Framework preset : Vite
- Build command : `npm run build:admin`
- Output directory : `dist-admin`
- Install command : `npm install`

Domaine conseille :

- `admin.padelleague.mu`

## Variables d'environnement Vercel

Ajouter les memes variables dans les deux projets Vercel :

```txt
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Ne pas pousser les fichiers `.env.*` reels sur GitHub.

## DNS Vercel

Pour un domaine apex comme `padelleague.mu`, Vercel demandera normalement :

```txt
A    @      76.76.21.21
```

Pour un sous-domaine comme `admin.padelleague.mu` ou `www.padelleague.mu`, Vercel demandera normalement un `CNAME`, par exemple :

```txt
CNAME admin  cname.vercel-dns-0.com
CNAME www    cname.vercel-dns-0.com
```

Toujours verifier la valeur exacte affichee par Vercel dans le projet.

## Points a verifier pour un domaine .mu

- Supprimer les anciens records `A` qui pointent vers cPanel pour le domaine utilise par Vercel.
- Ne pas mettre de record `AAAA` si Vercel signale un souci IPv6.
- Verifier les records `CAA` si le certificat SSL Vercel ne se cree pas.
- Garder les records mail (`MX`, `SPF`, `DKIM`, `DMARC`) chez le fournisseur DNS actuel si les emails utilisent deja ce domaine.

## Workflow apres migration

1. Modifier le code.
2. Commit + push sur GitHub.
3. Vercel redeploie automatiquement public/admin selon le projet.

