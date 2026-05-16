/**
 * useSeo — hook SEO léger pour SPA Vite/React (sans librairie externe)
 * Met à jour document.title et les balises <meta> dynamiquement à chaque changement de page.
 * Compatible HashRouter (#/route).
 */
import { useEffect } from 'react';

export interface SeoProps {
  title: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

const SITE_NAME = 'Mauritius Padel League';
const BASE_URL  = 'https://padelleague.mu';
const OG_IMAGE  = 'https://padelleague.mu/images/mpl-logo.png';

function setMeta(name: string, content: string, prop = false) {
  const attr = prop ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

export function useSeo({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage,
  canonical,
  noindex = false,
}: SeoProps) {
  useEffect(() => {
    // ── Title ──────────────────────────────────────────────────────────────────
    document.title = title.includes(SITE_NAME)
      ? title
      : `${title} — ${SITE_NAME}`;

    // ── Description ───────────────────────────────────────────────────────────
    if (description) {
      setMeta('description', description);
      setMeta('og:description', ogDescription ?? description, true);
    }

    // ── Keywords ──────────────────────────────────────────────────────────────
    if (keywords) setMeta('keywords', keywords);

    // ── Open Graph ────────────────────────────────────────────────────────────
    setMeta('og:title',     ogTitle ?? title,                true);
    setMeta('og:image',     ogImage ?? OG_IMAGE,             true);
    setMeta('og:url',       canonical ?? `${BASE_URL}/`,    true);
    setMeta('og:site_name', SITE_NAME,                       true);
    setMeta('og:type',      'website',                       true);

    // ── Twitter Card ──────────────────────────────────────────────────────────
    setMeta('twitter:title',       ogTitle ?? title);
    setMeta('twitter:description', ogDescription ?? description ?? '');
    setMeta('twitter:image',       ogImage ?? OG_IMAGE);
    setMeta('twitter:card',        'summary_large_image');

    // ── Robots ────────────────────────────────────────────────────────────────
    setMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow');

    // ── Canonical ─────────────────────────────────────────────────────────────
    if (canonical) setCanonical(canonical);

  }, [title, description, keywords, ogTitle, ogDescription, ogImage, canonical, noindex]);
}
