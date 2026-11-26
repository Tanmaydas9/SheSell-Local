#!/usr/bin/env node
/* ------------------------------------------------------------------
   Build: turns the sources in src/ into the files the server ships.

     public/index.html    buyer storefront (src/app)                  one self-contained page
     public/admin.html    console for sellers and the admin (src/console)
                          + the seller workspace (src/workspace): Seller Studio, AI Catalogue,
                          voice lessons and the admin's pilot dashboard, drawn in a shadow root
                          with the shop's own stylesheet so the two design systems never clash
     server/lib/shared.js catalogue + data generator, shared by browser and server

   Run with `npm run build` after editing anything in src/.
------------------------------------------------------------------- */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

const icons = JSON.parse(read('src/app/icons.json'));
const avatars = JSON.parse(read('src/app/assets/avatars.json'));
const svg = (name) => {
  if (!icons[name]) throw new Error('Unknown icon "' + name + '"');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
};
const fillIcons = (html) => html
  .replace(/\{\{ml-how\}\}/g, () => read('src/app/ml-how.html'))   // "How ML works here", shared by the shop and Seller Studio
  .replace(/\{\{i:([a-z0-9]+)\}\}/g, (_, n) => svg(n));

function syntaxCheck(code, label) {
  const tmp = path.join(os.tmpdir(), `shesell-${label}-${process.pid}.js`);
  fs.writeFileSync(tmp, code);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { process.stderr.write(String(e.stderr || e.message)); throw new Error('Syntax error in ' + label); }
  finally { fs.rmSync(tmp, { force: true }); }
}
// one IIFE per bundle; placeholders are filled with functions so "$" in the data is never special
const bundle = (dir, files, fill = {}) => {
  let js = files.map(f => read(dir, f)).join('\n');
  const data = Object.assign({ __ICONS__: JSON.stringify(icons), __AVATARS__: JSON.stringify(avatars) }, fill);
  for (const [k, v] of Object.entries(data)) js = js.split(k).join(v);
  return "(() => {\n'use strict';\n" + js + '\n})();\n';
};

/* The shop stylesheet, re-targeted for a shadow root: :root/html/body rules apply to the host,
   and the Marathi rules key off the host's data-lang attribute. */
function shadowCss(css) {
  const out = css
    .replace(/:root\s*\{/g, ':host {')
    .replace(/html\[lang="mr"\] body\s*\{/g, ':host([data-lang="mr"]) {')
    .replace(/html\[lang="mr"\] /g, ':host([data-lang="mr"]) ')
    .replace(/^html body\s*\{/gm, ':host {')
    .replace(/^html\s*\{/gm, ':host {')
    .replace(/^body\.phone-open[^{]*\{[^}]*\}\n?/gm, '');
  if (/(^|[\s,}])(html|body)[\s.{[:]/m.test(out.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('shadowCss: an html/body selector was not re-targeted');
  return out;
}

/* ---------- storefront (buyers only) ---------- */
const APP_JS = ['00-i18n.js', '01-core.js', '01b-api.js', '02-qr.js', '02b-datagen.js', '03-catalog.js', '03b-art.js', '04-reco.js',
  '05-phone.js', '06-shop.js', '07-checkout.js', '14-sync.js', '99-init.js'];
const appJs = bundle('src/app/js', APP_JS);
syntaxCheck(appJs, 'storefront');
const appHtml = read('src/app/head.html').replace('{{STYLES}}', () => read('src/app/styles.css')) +
  fillIcons(read('src/app/body.html')).replace('</body>', () => '<script>\n' + appJs + '</script>\n</body>');
write('public/index.html', appHtml);

/* ---------- seller workspace (opened inside the console, after sign-in) ---------- */
const WS_JS = ['../../app/js/00-i18n.js', 'w01-core.js', 'w02-api.js', '../../app/js/02b-datagen.js',
  '09-studio.js', '10-photos.js', '11-catalogue.js', '12-saheli.js', '13-dashboard.js', 'w99-mount.js'];
const wsCss = shadowCss(read('src/app/styles.css')) + '\n' + read('src/workspace/ws.css');
const wsJs = bundle('src/workspace/js', WS_JS, {
  __WS_CSS__: JSON.stringify(wsCss),
  __WS_HTML__: JSON.stringify(fillIcons(read('src/workspace/ws.html')))
});
syntaxCheck(wsJs, 'workspace');

/* ---------- console (sellers + admin) ---------- */
const CONSOLE_JS = ['c00-i18n.js', 'c01-core.js', '../app/js/03b-art.js', 'c02-views.js', 'c99-init.js'];   // ART: the shop's product illustrations
const conJs = bundle('src/console', CONSOLE_JS);
syntaxCheck(conJs, 'console');
const conHtml = fillIcons(read('src/console/console.html'))
  .replace('{{STYLES}}', () => read('src/console/console.css'))
  .replace('{{SCRIPT}}', () => wsJs + '\n' + conJs);
write('public/admin.html', conHtml);

/* ---------- shared server module ---------- */
const shared = `/* GENERATED by tools/build.js from src/app/js/02b-datagen.js and src/app/js/03-catalog.js. Do not edit. */
'use strict';
${read('src/app/js/02b-datagen.js')}
${read('src/app/js/03-catalog.js')}
module.exports = { DATAGEN, CATALOG };
`;
syntaxCheck(shared, 'shared');
write('server/lib/shared.js', shared);

const kb = (s) => Math.round(Buffer.byteLength(s) / 1024) + ' KB';
console.log(`Built public/index.html (${kb(appHtml)}), public/admin.html (${kb(conHtml)}), server/lib/shared.js (${kb(shared)})`);
