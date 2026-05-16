import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { componentTagger } from 'lovable-tagger';
import path from 'path';

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

const traverse: typeof _traverse.default = ((_traverse as any).default ?? _traverse) as any;
const generate: typeof _generate.default = ((_generate as any).default ?? _generate) as any;

function joinBaseAndPath(base: string, assetPath: string) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

function publicAssetPathPlugin(isAdmin: boolean): Plugin {
  const DEBUG = process.env.CDN_IMG_DEBUG === '1';
  let publicDir = '';
  let basePath = '/';
  const publicAssetSet = new Set<string>();

  const isAbsolute = (value: string) =>
    /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:');

  const normalizeRef = (value: string) => {
    let normalized = value.trim();
    if (isAbsolute(normalized)) return normalized;
    normalized = normalized.replace(/^(\.\/)+/, '');
    while (normalized.startsWith('../')) normalized = normalized.slice(3);
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  };

  const toRuntimeUrl = (value: string, cdnPrefix?: string) => {
    const normalized = normalizeRef(value);
    if (isAbsolute(normalized)) return normalized;
    if (!publicAssetSet.has(normalized)) return value;

    if (cdnPrefix && normalized.startsWith('/images/')) {
      const normalizedCdn = cdnPrefix.endsWith('/') ? cdnPrefix : `${cdnPrefix}/`;
      return normalizedCdn + normalized.slice(1);
    }

    if (!isAdmin) return normalized;
    return joinBaseAndPath(basePath, normalized);
  };

  const rewriteSrcsetList = (value: string, cdnPrefix?: string) =>
    value
      .split(',')
      .map((part) => {
        const [url, descriptor] = part.trim().split(/\s+/, 2);
        const rewrittenUrl = toRuntimeUrl(url, cdnPrefix);
        return descriptor ? `${rewrittenUrl} ${descriptor}` : rewrittenUrl;
      })
      .join(', ');

  const rewriteHtml = (html: string, cdnPrefix?: string) => {
    let rewrittenHtml = html.replace(
      /(src|href)\s*=\s*(['"])([^'"]+)\2/g,
      (_match, attribute, quote, value) => `${attribute}=${quote}${toRuntimeUrl(value, cdnPrefix)}${quote}`
    );

    rewrittenHtml = rewrittenHtml.replace(
      /(srcset)\s*=\s*(['"])([^'"]+)\2/g,
      (_match, attribute, quote, value) => `${attribute}=${quote}${rewriteSrcsetList(value, cdnPrefix)}${quote}`
    );

    if (isAdmin) {
      rewrittenHtml = rewrittenHtml.replace(
        /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
        '<meta name="robots" content="noindex, nofollow" />'
      );
    }

    return rewrittenHtml;
  };

  const rewriteCssUrls = (code: string, cdnPrefix?: string) =>
    code.replace(/url\((['"]?)([^'")]+)\1\)/g, (_match, quote, value) => {
      return `url(${quote}${toRuntimeUrl(value, cdnPrefix)}${quote})`;
    });

  const rewriteJsxAst = (code: string, id: string, cdnPrefix?: string) => {
    const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    let rewrites = 0;

    traverse(ast, {
      JSXAttribute(attributePath) {
        const attributeName = (attributePath.node.name as t.JSXIdentifier).name;
        const isSrc = attributeName === 'src' || attributeName === 'href';
        const isSrcSet = attributeName === 'srcSet' || attributeName === 'srcset';
        if (!isSrc && !isSrcSet) return;

        const value = attributePath.node.value;
        if (!value) return;

        if (t.isStringLiteral(value)) {
          const before = value.value;
          value.value = isSrc ? toRuntimeUrl(value.value, cdnPrefix) : rewriteSrcsetList(value.value, cdnPrefix);
          if (value.value !== before) rewrites++;
          return;
        }

        if (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression)) {
          const before = value.expression.value;
          value.expression.value = isSrc
            ? toRuntimeUrl(value.expression.value, cdnPrefix)
            : rewriteSrcsetList(value.expression.value, cdnPrefix);
          if (value.expression.value !== before) rewrites++;
        }
      },

      StringLiteral(stringPath) {
        if (t.isObjectProperty(stringPath.parent) && stringPath.parentKey === 'key' && !stringPath.parent.computed) return;
        if (t.isImportDeclaration(stringPath.parent) || t.isExportAllDeclaration(stringPath.parent) || t.isExportNamedDeclaration(stringPath.parent)) return;
        if (stringPath.findParent((parentPath) => parentPath.isJSXAttribute())) return;

        const before = stringPath.node.value;
        const after = toRuntimeUrl(before, cdnPrefix);
        if (after !== before) {
          stringPath.node.value = after;
          rewrites++;
        }
      },

      TemplateLiteral(templatePath) {
        if (templatePath.node.expressions.length) return;
        const raw = templatePath.node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
        const after = toRuntimeUrl(raw, cdnPrefix);
        if (after !== raw) {
          templatePath.replaceWith(t.stringLiteral(after));
          rewrites++;
        }
      },
    });

    if (!rewrites) return null;

    const output = generate(ast, { retainLines: true, sourceMaps: false }, code).code;
    if (DEBUG) console.log(`[public-assets] ${id} -> ${rewrites} rewrites`);
    return output;
  };

  async function collectPublicAssetsFrom(dir: string) {
    const stack = [dir];

    while (stack.length) {
      const currentDir = stack.pop()!;
      let entries: Awaited<ReturnType<typeof fs.readdir>> = [];

      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = nodePath.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (entry.isFile()) {
          const relativePath = nodePath.relative(dir, fullPath).split(nodePath.sep).join('/');
          publicAssetSet.add(`/${relativePath}`);
        }
      }
    }
  }

  return {
    name: 'public-asset-path-plugin',
    apply: 'build',
    enforce: 'pre',

    configResolved(config) {
      publicDir = config.publicDir;
      basePath = config.base;
      if (DEBUG) console.log('[public-assets] publicDir =', publicDir, 'base =', basePath);
    },

    async buildStart() {
      await collectPublicAssetsFrom(publicDir);
      if (DEBUG) console.log('[public-assets] collected =', publicAssetSet.size);
    },

    transformIndexHtml(html) {
      return rewriteHtml(html, process.env.CDN_IMG_PREFIX);
    },

    transform(code, id) {
      const cdnPrefix = process.env.CDN_IMG_PREFIX;

      if (/\.(jsx|tsx)$/.test(id)) {
        const rewritten = rewriteJsxAst(code, id, cdnPrefix);
        return rewritten ? { code: rewritten, map: null } : null;
      }

      if (/\.(css|scss|sass|less|styl)$/i.test(id)) {
        const rewritten = rewriteCssUrls(code, cdnPrefix);
        return rewritten === code ? null : { code: rewritten, map: null };
      }

      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const isAdmin = mode === 'admin';
  const isPublic = mode === 'public';
  const base = isAdmin ? '/admin-panel/' : '/';

  return {
    base,
    server: {
      host: '::',
      port: 8080,
    },
    build: {
      outDir: isAdmin ? 'dist-admin' : 'dist-public',
      emptyOutDir: true,
    },
    plugins: [
      tailwindcss(),
      react(),
      mode === 'development' && componentTagger(),
      publicAssetPathPlugin(isAdmin),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'react-router-dom': path.resolve(__dirname, './src/lib/react-router-dom-proxy.tsx'),
        'react-router-dom-original': 'react-router-dom',
      },
    },
    define: {
      __ROUTE_MESSAGING_ENABLED__: JSON.stringify(
        mode === 'production'
          ? process.env.VITE_ENABLE_ROUTE_MESSAGING === 'true'
          : process.env.VITE_ENABLE_ROUTE_MESSAGING !== 'false'
      ),
      __APP_BASE_PATH__: JSON.stringify(base),
      __IS_ADMIN_BUILD__: JSON.stringify(isAdmin),
      __IS_PUBLIC_BUILD__: JSON.stringify(isPublic),
    },
  };
});
