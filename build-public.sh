#!/bin/bash
# ============================================================
#  build-public.sh — Build automatisé de la version publique
#  Usage : ./build-public.sh
# ============================================================

set -e  # Arrêter si une commande échoue

echo ""
echo "🎾 MPL — Build version PUBLIQUE"
echo "================================"

# Vérifier que les clés Supabase sont définies
if [ ! -f ".env.local" ] && [ ! -f ".env.public" ]; then
  echo "⚠️  ATTENTION : Aucun fichier .env.local ou .env.public trouvé."
  echo "   Créez .env.public avec vos clés Supabase avant de continuer."
  echo ""
fi

# Utiliser .env.public s'il existe, sinon .env.local
if [ -f ".env.public" ]; then
  echo "✅ Utilisation de .env.public"
  cp .env.public .env.local.tmp
  export $(grep -v '^#' .env.public | xargs)
fi

echo ""
echo "▶  Installation des dépendances..."
npm install --silent

echo ""
echo "▶  Build public en cours (VITE_PUBLIC_MODE=true)..."
VITE_PUBLIC_MODE=true npm run build -- --outDir dist-public

echo ""
echo "✅ Build terminé ! Dossier généré : dist-public/"
echo ""
echo "📦 Contenu du dossier dist-public :"
ls -lh dist-public/

echo ""
echo "📋 PROCHAINE ÉTAPE — Déploiement cPanel :"
echo "   1. Compresser dist-public/ en .zip"
echo "   2. Uploader vers public_html via cPanel File Manager"
echo "   3. Décompresser sur place"
echo "   4. Vérifier que .htaccess est bien présent (voir ci-dessous)"
echo ""
echo "📄 Contenu .htaccess requis :"
echo "   Options -MultiViews"
echo "   RewriteEngine On"
echo "   RewriteCond %{REQUEST_FILENAME} !-f"
echo "   RewriteRule ^ index.html [QSA,L]"
echo ""
echo "🌐 Votre site public est prêt !"

# Nettoyage
if [ -f ".env.local.tmp" ]; then
  rm .env.local.tmp
fi
