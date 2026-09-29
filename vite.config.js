// 3rd World: game (/play), admin (/admin) and crawler-readable website pages.
// Site values come from env: VITE_SITE_URL, VITE_CONTACT_EMAIL, VITE_ADSENSE_CLIENT (ca-pub-…).
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

const CONTENT = ['index', 'how-to-play', 'worlds', 'about', 'contact', 'privacy', 'terms'];
const PAGES = [...CONTENT, '404', 'play', 'admin'];

function site(env) {
  const url = (env.VITE_SITE_URL || 'https://3rdworld.vercel.app').replace(/\/$/, '');
  const email = env.VITE_CONTACT_EMAIL || 'hello@3rdworld.example';
  const client = (env.VITE_ADSENSE_CLIENT || '').trim();
  const pub = client.replace(/^ca-/, '');
  return {
    name: '3rdworld-site',
    transformIndexHtml(html, ctx) {
      const name = ctx.path.replace(/^\//, '').replace(/\.html$/, '') || 'index';
      html = html.replaceAll('%SITE_URL%', url).replaceAll('%CONTACT_EMAIL%', email).replaceAll('%YEAR%', String(new Date().getFullYear()));
      // Ads only on content pages, never inside the game or the admin console.
      if (client && CONTENT.includes(name)) {
        html = html.replace('</head>',
          `  <meta name="google-adsense-account" content="${client}" />\n` +
          `    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>\n  </head>`);
      }
      return html;
    },
    generateBundle() {
      const day = new Date().toISOString().slice(0, 10);
      const pri = { index: '1.0', 'how-to-play': '0.8', worlds: '0.8', play: '0.9' };
      const urls = ['index', 'play', 'how-to-play', 'worlds', 'about', 'contact', 'privacy', 'terms'].map((p) =>
        `  <url><loc>${url}${p === 'index' ? '/' : '/' + p}</loc><lastmod>${day}</lastmod><priority>${pri[p] || '0.5'}</priority></url>`);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /admin\n\nUser-agent: Mediapartners-Google\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n` });
      this.emitFile({ type: 'asset', fileName: 'ads.txt', source: pub
        ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
        : '# Set VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX and rebuild to publish your AdSense line.\n' });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [site(loadEnv(mode, process.cwd(), 'VITE_'))],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p, resolve(__dirname, `${p}.html`)])) },
  },
}));
