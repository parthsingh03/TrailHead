/* TrailHead — find the reading path through any public GitHub repo.
   The trail is built deterministically from the real file/import graph:
   no AI summaries, no guessing. README first, entry point next, then the
   modules the entry actually pulls in, foundations before dependents,
   config skimmed after the code, tests last — plus an honest skip list. */
'use strict';

/* ---------------- classification ---------------- */

const CODE_EXT = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript',
  py: 'Python', kt: 'Kotlin', kts: 'Kotlin', java: 'Java',
  go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cs: 'C#', swift: 'Swift',
  sh: 'Shell', bash: 'Shell', vue: 'Vue', svelte: 'Svelte'
};
const CONFIG_NAMES = new Set([
  'package.json', 'tsconfig.json', 'vite.config.js', 'vite.config.ts',
  'webpack.config.js', 'next.config.js', 'next.config.mjs',
  'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  'gradle.properties', 'pom.xml', 'requirements.txt', 'pyproject.toml',
  'setup.py', 'cargo.toml', 'go.mod', 'gemfile', 'composer.json',
  'dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'makefile',
  '.gitignore', 'settings.gradle.kts', 'androidmanifest.xml'
]);
const LOCK_NAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'podfile.lock',
  'cargo.lock', 'go.sum', 'gemfile.lock', 'composer.lock', 'poetry.lock'
]);
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'bmp', 'pdf', 'zip', 'gz',
  'jar', 'apk', 'aab', 'so', 'dll', 'exe', 'class', 'ttf', 'otf', 'woff',
  'woff2', 'mp3', 'mp4', 'mov', 'wav', 'keystore', 'jks', 'bin', 'dat'
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'generated', '.gradle',
  'vendor', '__pycache__', '.next', 'out', 'target', '.idea', 'Pods'
]);

function extOf(path) {
  const base = path.split('/').pop().toLowerCase();
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i + 1);
}
function baseOf(path) { return path.split('/').pop(); }
function chapterOf(path) {
  const parts = path.split('/');
  return parts.length > 1 ? parts[0] : '(root)';
}
function isTestFile(path) {
  const p = path.toLowerCase();
  const segs = p.split('/');
  if (segs.some(s => s === 'test' || s === 'tests' || s === '__tests__' ||
    s === 'androidtest' || s === 'spec')) return true;
  const b = baseOf(p);
  return /(^test_|_test\.|\.test\.|\.spec\.|test\.kt$|tests\.py$)/.test(b) ||
    b.startsWith('test_');
}

/* returns {kind: 'readme'|'code'|'config'|'doc'|'skip', reason?} */
function classify(path, size) {
  const lower = path.toLowerCase();
  const base = baseOf(lower);
  const segs = lower.split('/');
  if (segs.some(s => SKIP_DIRS.has(s)))
    return { kind: 'skip', reason: 'generated / vendored folder — machines read this, not you' };
  if (base === 'readme.md' || base === 'readme')
    return { kind: 'readme' };
  if (LOCK_NAMES.has(base))
    return { kind: 'skip', reason: 'lockfile — exact dependency versions, generated automatically' };
  if (base === 'license' || base === 'license.md' || base === 'changelog.md')
    return { kind: 'skip', reason: 'legal / history text — not part of how the code runs' };
  const ext = extOf(lower);
  if (BINARY_EXT.has(ext))
    return { kind: 'skip', reason: 'binary / media file — nothing to read' };
  if (ext === 'svg')
    return { kind: 'skip', reason: 'image asset' };
  if (/\.min\.(js|css)$/.test(base))
    return { kind: 'skip', reason: 'minified build output' };
  if (base === '.gitignore')
    return { kind: 'skip', reason: 'repo housekeeping — not part of how the code runs' };
  if (segs[0] === '.github')
    return { kind: 'skip', reason: 'CI / automation config — runs the build, not the app' };
  if (lower.includes('gradle/wrapper/'))
    return { kind: 'skip', reason: 'generated Gradle wrapper file' };
  if (segs.includes('res') && ext === 'xml' && base !== 'androidmanifest.xml')
    return { kind: 'skip', reason: 'Android resource XML — layouts/values the code references; open on demand, not on the reading trail' };
  if (size > 400000)
    return { kind: 'skip', reason: 'very large file — likely generated or data, skim on demand only' };
  if (CONFIG_NAMES.has(base))
    return { kind: 'config' };
  if (ext === 'md')
    return { kind: 'doc' };
  if (CODE_EXT[ext])
    return { kind: 'code' };
  if (['json', 'toml', 'yaml', 'yml', 'xml', 'gradle', 'properties', 'html', 'css', 'scss'].includes(ext))
    return { kind: 'config' };
  return { kind: 'skip', reason: 'not source code — does not change how the project runs' };
}

/* ---------------- entry detection ---------------- */

function entryScore(path) {
  const base = baseOf(path).toLowerCase();
  if (base === 'androidmanifest.xml') return 98;
  if (/^mainactivity\.(kt|java)$/.test(base)) return 96;
  if (/^(main|__main__)\.(js|ts|tsx|jsx|py|go|rs|kt|java|c|cpp|cs|rb|php|swift)$/.test(base)) return 95;
  if (/^(index|app)\.(js|ts|tsx|jsx|py|vue|svelte)$/.test(base)) return 90;
  if (/^(server|run|wsgi|asgi)\.(js|ts|py)$/.test(base)) return 88;
  if (/^app\.(kt|java|swift)$/.test(base)) return 86;
  if (/^program\.cs$/.test(base)) return 85;
  if (/^lib\.rs$/.test(base)) return 70;
  if (base === 'index.html') return 82;
  return 0;
}

/* ---------------- symbols & imports ---------------- */

function definedSymbols(path, content) {
  const out = new Set();
  if (!content) return out;
  const ext = extOf(path);
  let m;
  if (['kt', 'kts', 'java', 'cs', 'swift'].includes(ext)) {
    const re = /(?:class|object|interface|enum\s+class|data\s+class|sealed\s+class|struct)\s+([A-Z]\w+)/g;
    while ((m = re.exec(content))) out.add(m[1]);
  } else if (['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte'].includes(ext)) {
    const re = /(?:class\s+|function\s+|const\s+|export\s+default\s+function\s+)([A-Z]\w+)/g;
    while ((m = re.exec(content))) out.add(m[1]);
  } else if (ext === 'py') {
    const re = /^class\s+([A-Za-z_]\w*)/gm;
    while ((m = re.exec(content))) out.add(m[1]);
  } else if (ext === 'go') {
    const re = /type\s+([A-Z]\w+)\s+(?:struct|interface)/g;
    while ((m = re.exec(content))) out.add(m[1]);
  }
  return out;
}

function packageOf(content) {
  if (!content) return '';
  const m = content.match(/^\s*package\s+([\w.]+)/m);
  return m ? m[1] : '';
}

function normalizePath(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}

/* explicit import specifiers found in a file */
function importSpecifiers(path, content) {
  const specs = [];
  if (!content) return specs;
  const ext = extOf(path);
  let m;
  if (['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'mjs', 'cjs'].includes(ext)) {
    const re = /(?:import[\s\S]*?from\s*|import\s*|require\(\s*|export[\s\S]*?from\s*)['"]([^'"]+)['"]/g;
    while ((m = re.exec(content))) specs.push(m[1]);
  } else if (ext === 'py') {
    const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    while ((m = re.exec(content))) specs.push(m[1] || m[2]);
  } else if (['kt', 'kts', 'java'].includes(ext)) {
    const re = /^\s*import\s+([\w.]+)/gm;
    while ((m = re.exec(content))) specs.push(m[1]);
  } else if (ext === 'go') {
    const re = /"([\w./-]+)"/g;
    const pkg = content.match(/import\s*\(([\s\S]*?)\)|import\s+"([^"]+)"/);
    if (pkg) { const rr = /"([^"]+)"/g; while ((m = rr.exec(pkg[0]))) specs.push(m[1]); }
  }
  return specs;
}

/* resolve one specifier from importer to a known file path (or null) */
function resolveSpecifier(importer, spec, byPath, byPackageClass, byModule) {
  const ext = extOf(importer);
  if (spec.startsWith('.')) {
    const dir = importer.split('/').slice(0, -1).join('/');
    const base = normalizePath(dir + '/' + spec);
    const tries = [base];
    for (const e of ['js', 'jsx', 'ts', 'tsx', 'py', 'kt', 'java', 'go', 'json'])
      tries.push(base + '.' + e);
    for (const e of ['js', 'ts', 'tsx', 'py']) tries.push(base + '/index.' + e);
    tries.push(base + '/__init__.py');
    for (const t of tries) if (byPath.has(t)) return t;
    return null;
  }
  if (ext === 'py') {
    const mod = spec.replace(/\./g, '/');
    for (const t of [mod + '.py', mod + '/__init__.py'])
      if (byPath.has(t)) return t;
    return byModule.get(spec) || null;
  }
  if (['kt', 'kts', 'java'].includes(ext)) {
    return byPackageClass.get(spec) || null;
  }
  return null;
}

/* ---------------- the trail builder ---------------- */

/* files: [{path, size, content?}] — returns the full analysis */
function analyzeRepo(files) {
  const byPath = new Map();
  const items = [];
  const skips = [];
  for (const f of files) {
    const c = classify(f.path, f.size || 0);
    const item = {
      path: f.path, size: f.size || 0, content: f.content || '',
      kind: c.kind, lines: f.content ? f.content.split('\n').length : 0,
      chapter: chapterOf(f.path), test: isTestFile(f.path),
      entry: entryScore(f.path), deps: new Set(), importers: new Set()
    };
    if (c.kind === 'skip') { item.reason = c.reason; skips.push(item); continue; }
    byPath.set(f.path, item);
    items.push(item);
  }

  /* symbol + package maps */
  const bySymbol = new Map();       /* symbol -> path */
  const byPackageClass = new Map(); /* fqcn -> path */
  const byModule = new Map();       /* python module -> path */
  for (const it of items) {
    if (it.kind !== 'code') continue;
    for (const s of definedSymbols(it.path, it.content))
      if (!bySymbol.has(s)) bySymbol.set(s, it.path);
    const pkg = packageOf(it.content);
    const cls = baseOf(it.path).replace(/\.[^.]+$/, '');
    if (pkg) byPackageClass.set(pkg + '.' + cls, it.path);
    if (extOf(it.path) === 'py')
      byModule.set(it.path.replace(/\//g, '.').replace(/\.py$/, '').replace(/\.__init__$/, ''), it.path);
  }

  /* edges: A depends on B */
  for (const it of items) {
    if (!it.content) continue;
    if (it.kind !== 'code' && extOf(it.path) !== 'html') continue;
    if (it.kind === 'code') for (const spec of importSpecifiers(it.path, it.content)) {
      const target = resolveSpecifier(it.path, spec, byPath, byPackageClass, byModule);
      if (target && target !== it.path) it.deps.add(target);
    }
    /* symbol usage catches same-package Kotlin/Java and unimported refs */
    for (const [sym, target] of bySymbol) {
      if (target === it.path) continue;
      if (new RegExp('\\b' + sym + '\\b').test(it.content)) it.deps.add(target);
    }
    /* HTML files pull in scripts/styles directly */
    if (extOf(it.path) === 'html') {
      const re = /(?:src|href)\s*=\s*"([^"#]+)"/g; let m;
      while ((m = re.exec(it.content))) {
        const t = resolveSpecifier(it.path, m[1].startsWith('.') ? m[1] : './' + m[1], byPath, byPackageClass, byModule);
        if (t && t !== it.path) it.deps.add(t);
      }
    }
  }
  for (const it of items)
    for (const d of it.deps) { const t = byPath.get(d); if (t) t.importers.add(it.path); }

  /* BFS depth from the strongest entry point */
  const entries = items.filter(i => i.entry > 0).sort((a, b) => b.entry - a.entry);
  const depth = new Map();
  if (entries.length) {
    const q = [];
    for (const e of entries) { depth.set(e.path, 0); q.push(e.path); }
    while (q.length) {
      const cur = byPath.get(q.shift());
      if (!cur) continue;
      for (const d of cur.deps)
        if (!depth.has(d)) { depth.set(d, depth.get(cur.path) + 1); q.push(d); }
    }
  }
  const depthOf = p => depth.has(p) ? depth.get(p) : 99;

  const readMins = it => Math.max(1, Math.round((it.lines || Math.round(it.size / 45)) / 60));

  function whyFor(it) {
    const base = baseOf(it.path);
    if (it.kind === 'readme')
      return 'Start here — the project in its own words: what it does, how it is set up, where things live.';
    if (base.toLowerCase() === 'androidmanifest.xml')
      return 'The Android entry declaration — it names the first screen the system launches.';
    if (it.entry >= 80)
      return 'The entry point — execution starts here. Everything else on the trail is something this file reaches.';
    if (it.kind === 'config')
      return 'Build / config — skim once so you know how the project is assembled and what it depends on.';
    if (it.kind === 'doc')
      return 'Project documentation — read after the entry so the explanations have code to attach to.';
    if (it.test)
      return 'Test file — read last. Tests show the expected behaviour, which only makes sense once you know the code.';
    const imps = [...it.importers];
    let w = '';
    if (depthOf(it.path) < 99 && imps.length) {
      const first = imps.sort((a, b) => depthOf(a) - depthOf(b))[0];
      w = 'You meet this on the trail from ' + baseOf(first) + ', which uses it directly.';
    } else if (imps.length) {
      w = 'Used by ' + imps.length + ' other file' + (imps.length > 1 ? 's' : '') +
        ' (' + imps.slice(0, 2).map(baseOf).join(', ') + (imps.length > 2 ? ', …' : '') + ').';
    } else {
      w = 'Standalone module in ' + it.chapter + ' — nothing imports it from the entry chain, so it sits later on the trail.';
    }
    if (it.importers.size >= 2)
      w += ' Hub file — ' + it.importers.size + ' files depend on it, so understanding it pays off everywhere.';
    return w;
  }

  /* ordering */
  const readmes = items.filter(i => i.kind === 'readme');
  const manifest = items.filter(i => baseOf(i.path).toLowerCase() === 'androidmanifest.xml');
  const mainEntries = entries.filter(i => baseOf(i.path).toLowerCase() !== 'androidmanifest.xml');
  const code = items.filter(i => i.kind === 'code' && !i.test && !entries.includes(i))
    .sort((a, b) => depthOf(a.path) - depthOf(b.path) ||
      b.importers.size - a.importers.size || b.lines - a.lines);
  const configs = items.filter(i => i.kind === 'config' && !entries.includes(i))
    .sort((a, b) => b.size - a.size);
  const docs = items.filter(i => i.kind === 'doc');
  const tests = items.filter(i => i.kind === 'code' && i.test)
    .sort((a, b) => b.importers.size - a.importers.size || b.lines - a.lines);

  const trail = [];
  const push = it => { it.why = whyFor(it); it.mins = readMins(it); trail.push(it); };
  readmes.forEach(push);
  manifest.forEach(push);
  mainEntries.forEach(push);
  code.forEach(push);
  configs.forEach(push);
  docs.forEach(push);
  tests.forEach(push);
  trail.forEach((it, i) => { it.step = i + 1; });

  /* chapters in trail order */
  const chapters = [];
  for (const it of trail) {
    let ch = chapters.find(c => c.name === it.chapter);
    if (!ch) { ch = { name: it.chapter, items: [] }; chapters.push(ch); }
    ch.items.push(it);
  }

  /* languages + stack */
  const langCount = {};
  for (const it of items) {
    if (it.kind !== 'code') continue;
    const lang = CODE_EXT[extOf(it.path)];
    if (lang) langCount[lang] = (langCount[lang] || 0) + 1;
  }
  const stack = detectStack(items);

  const edges = [];
  for (const it of items) for (const d of it.deps) edges.push([it.path, d]);

  return {
    trail, skips, chapters, edges, stack,
    languages: Object.entries(langCount).sort((a, b) => b[1] - a[1]),
    totalFiles: files.length,
    codeFiles: items.filter(i => i.kind === 'code').length,
    totalLines: items.reduce((s, i) => s + i.lines, 0),
    totalMins: trail.reduce((s, i) => s + i.mins, 0),
    entryPath: mainEntries.length ? mainEntries[0].path :
      (manifest.length ? manifest[0].path : null)
  };
}

function detectStack(items) {
  const names = new Set(items.map(i => baseOf(i.path).toLowerCase()));
  const stack = [];
  if (items.some(i => baseOf(i.path) === 'AndroidManifest.xml')) stack.push('Android');
  if (names.has('build.gradle.kts') || names.has('build.gradle')) stack.push('Gradle');
  if (names.has('pom.xml')) stack.push('Maven');
  if (names.has('go.mod')) stack.push('Go modules');
  if (names.has('cargo.toml')) stack.push('Cargo');
  if (names.has('requirements.txt') || names.has('pyproject.toml')) stack.push('Python deps');
  const pkg = items.find(i => baseOf(i.path) === 'package.json');
  if (pkg) {
    stack.push('Node');
    try {
      const j = JSON.parse(pkg.content || '{}');
      const deps = Object.assign({}, j.dependencies, j.devDependencies);
      if (deps.react) stack.push('React');
      if (deps.next) stack.push('Next.js');
      if (deps.vue) stack.push('Vue');
      if (deps.svelte) stack.push('Svelte');
      if (deps.express) stack.push('Express');
      if (deps.vite) stack.push('Vite');
      if (deps.typescript) stack.push('TypeScript');
    } catch (e) { /* package.json unread — name-only detection still fine */ }
  }
  if (names.has('dockerfile')) stack.push('Docker');
  return stack;
}

/* ---------------- exports ---------------- */

function trailToMarkdown(owner, repo, a) {
  const lines = [];
  lines.push('# TrailHead — reading trail for ' + owner + '/' + repo);
  lines.push('');
  lines.push('Read in this order. Tick each file off as you finish it.');
  lines.push('');
  for (const it of a.trail)
    lines.push('- [ ] **' + it.step + '. ' + it.path + '** (~' + it.mins + ' min) — ' + it.why);
  if (a.skips.length) {
    lines.push('');
    lines.push('## Skip list');
    lines.push('');
    for (const s of a.skips) lines.push('- `' + s.path + '` — ' + s.reason);
  }
  lines.push('');
  lines.push('Generated by TrailHead from the repo\u2019s real import graph.');
  return lines.join('\n');
}

function trailToCodeTour(owner, repo, a) {
  return JSON.stringify({
    title: 'TrailHead: ' + owner + '/' + repo,
    description: 'The reading path through this repo, in order. Generated by TrailHead.',
    ref: 'HEAD',
    steps: a.trail.map(it => ({
      file: it.path,
      title: 'Step ' + it.step + ' — ' + baseOf(it.path),
      description: it.why
    }))
  }, null, 2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeRepo, classify, entryScore, trailToMarkdown, trailToCodeTour };
}

/* ---------------- browser app ---------------- */

if (typeof document !== 'undefined') {
  const $ = s => document.querySelector(s);
  const state = { owner: '', repo: '', branch: 'main', analysis: null, mode: 'sprint' };

  function parseTarget() {
    const q = new URLSearchParams(location.search);
    const fromQ = q.get('repo') || q.get('p') || '';
    const raw = fromQ || (location.hash ? location.hash.slice(1) : '') ||
      location.pathname.replace(/^\//, '');
    const parts = raw.split('/').filter(Boolean).map(decodeURIComponent);
    /* on GitHub Pages project sites the first segment is the project name */
    if (parts.length >= 3 && parts[0].toLowerCase() === 'trailhead') parts.shift();
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    return null;
  }

  function parseInput(v) {
    v = v.trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
    v = v.replace(/^github\.com\//, '');
    const parts = v.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    return null;
  }

  async function ghJson(url) {
    const r = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (r.status === 404) throw new Error('Repo not found — check the name, and note TrailHead v1 reads public repos only.');
    if (r.status === 403) throw new Error('GitHub API rate limit hit (60/hour for un-signed-in use). Wait a bit and try again.');
    if (!r.ok) throw new Error('GitHub API error ' + r.status);
    return r.json();
  }

  async function loadRepo(owner, repo) {
    state.owner = owner; state.repo = repo;
    $('#landing').hidden = true;
    $('#result').hidden = true;
    $('#loading').hidden = false;
    $('#load-msg').textContent = 'Fetching ' + owner + '/' + repo + ' file tree from GitHub…';
    try {
      const meta = await ghJson('https://api.github.com/repos/' + owner + '/' + repo);
      state.branch = meta.default_branch || 'main';
      const treeData = await ghJson('https://api.github.com/repos/' + owner + '/' + repo +
        '/git/trees/' + encodeURIComponent(state.branch) + '?recursive=1');
      const blobs = (treeData.tree || []).filter(t => t.type === 'blob');
      if (!blobs.length) throw new Error('That repo has no files on its default branch.');

      /* choose which files to actually read: trail candidates only, sanely capped */
      const cand = [], skipEarly = [];
      for (const b of blobs) {
        const c = classify(b.path, b.size || 0);
        if (c.kind === 'skip') skipEarly.push(b); else cand.push(b);
      }
      const prio = b => {
        let s = entryScore(b.path);
        if (/readme/i.test(b.path)) s += 200;
        if (/(^|\/)src\//.test(b.path)) s += 20;
        if (isTestFile(b.path)) s -= 30;
        return s;
      };
      cand.sort((a, b) => prio(b) - prio(a));
      const CAP = 160;
      const toRead = cand.slice(0, CAP);
      const capped = cand.slice(CAP);
      state.cappedNote = capped.length ?
        'Large repo — the trail is built from the ' + CAP + ' most central files of ' +
        cand.length + ' readable ones.' : '';

      $('#load-msg').textContent = 'Reading ' + toRead.length + ' files and mapping the import graph…';
      const files = [];
      let idx = 0;
      async function worker() {
        while (idx < toRead.length) {
          const b = toRead[idx++];
          let content = '';
          try {
            const raw = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' +
              encodeURIComponent(state.branch) + '/' + b.path.split('/').map(encodeURIComponent).join('/');
            const r = await fetch(raw);
            if (r.ok) content = await r.text();
          } catch (e) { /* unread file still appears, ordered by path heuristics */ }
          files.push({ path: b.path, size: b.size || 0, content });
        }
      }
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
      for (const b of skipEarly.concat(capped))
        files.push({ path: b.path, size: b.size || 0, content: '' });

      state.meta = meta;
      state.analysis = analyzeRepo(files);
      state.mode = state.analysis.trail.length > 10 ? 'sprint' : 'full';
      render();
    } catch (e) {
      $('#loading').hidden = true;
      $('#landing').hidden = false;
      showError(e.message);
    }
  }

  function showError(msg) {
    const el = $('#error');
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 9000);
  }

  function progressKey() { return 'trailhead:' + state.owner + '/' + state.repo; }
  function getDone() {
    try { return new Set(JSON.parse(localStorage.getItem(progressKey()) || '[]')); }
    catch (e) { return new Set(); }
  }
  function setDone(s) { localStorage.setItem(progressKey(), JSON.stringify([...s])); }

  function badge(it) {
    const b = [];
    const base = baseOf(it.path).toLowerCase();
    if (it.kind === 'readme') b.push('<span class="badge start">START</span>');
    else if (base === 'androidmanifest.xml') b.push('<span class="badge entry">ENTRY DECLARATION</span>');
    else if (it.entry >= 80) b.push('<span class="badge entry">ENTRY POINT</span>');
    if (it.importers.size >= 2) b.push('<span class="badge hub">HUB · ' + it.importers.size + ' depend on it</span>');
    if (it.test) b.push('<span class="badge test">TEST</span>');
    if (it.kind === 'config') b.push('<span class="badge cfg">CONFIG</span>');
    return b.join(' ');
  }

  function visibleTrail() {
    const a = state.analysis;
    if (state.mode === 'full') return a.trail;
    /* sprint: first steps are already the most central — entry chain + hubs */
    const head = a.trail.slice(0, 3);
    const rest = a.trail.slice(3).filter(i => i.kind === 'code')
      .sort((x, y) => y.importers.size - x.importers.size || x.step - y.step)
      .slice(0, 7);
    return head.concat(rest).sort((x, y) => x.step - y.step);
  }

  function render() {
    const a = state.analysis, meta = state.meta;
    $('#loading').hidden = true;
    $('#result').hidden = false;
    document.title = 'TrailHead — ' + state.owner + '/' + state.repo;
    $('#repo-title').textContent = state.owner + '/' + state.repo;
    $('#repo-desc').textContent = meta.description || '';
    $('#repo-meta').innerHTML =
      '★ ' + (meta.stargazers_count || 0) + ' · default branch <b>' + state.branch + '</b> · ' +
      a.totalFiles + ' files · ' + a.codeFiles + ' source files · ~' + a.totalLines.toLocaleString() + ' lines read';
    $('#stack-badges').innerHTML =
      a.stack.map(s => '<span class="stack">' + s + '</span>').join('') +
      a.languages.map(l => '<span class="stack lang">' + l[0] + ' ×' + l[1] + '</span>').join('');
    $('#capped-note').textContent = state.cappedNote || '';
    $('#mode-sprint').classList.toggle('on', state.mode === 'sprint');
    $('#mode-full').classList.toggle('on', state.mode === 'full');
    renderTrail();
    renderGraph();
    renderSkips();
  }

  function renderTrail() {
    const a = state.analysis;
    const vis = visibleTrail();
    const done = getDone();
    const doneCount = a.trail.filter(i => done.has(i.path)).length;
    $('#progress-label').textContent = doneCount + ' of ' + a.trail.length + ' files read';
    $('#progress-fill').style.width = (a.trail.length ? (doneCount / a.trail.length) * 100 : 0) + '%';
    $('#time-label').textContent = 'Full trail ≈ ' + a.totalMins + ' min of reading';

    const wrap = $('#trail');
    wrap.innerHTML = '';
    let lastChapter = null;
    for (const it of vis) {
      if (it.chapter !== lastChapter) {
        lastChapter = it.chapter;
        const h = document.createElement('div');
        h.className = 'chapter';
        h.textContent = 'Chapter — ' + lastChapter;
        wrap.appendChild(h);
      }
      const li = document.createElement('li');
      li.className = 'step' + (done.has(it.path) ? ' done' : '');
      li.id = 'step-' + it.step;
      const ghUrl = 'https://github.com/' + state.owner + '/' + state.repo + '/blob/' +
        encodeURIComponent(state.branch) + '/' + it.path.split('/').map(encodeURIComponent).join('/');
      li.innerHTML =
        '<label class="tick"><input type="checkbox" ' + (done.has(it.path) ? 'checked' : '') +
        ' data-path="' + it.path.replace(/"/g, '&quot;') + '"><span class="box"></span></label>' +
        '<div class="step-body">' +
        '<div class="step-top"><span class="num">' + it.step + '</span>' +
        '<a class="path" target="_blank" rel="noopener" href="' + ghUrl + '">' + it.path + '</a> ' + badge(it) + '</div>' +
        '<p class="why">' + it.why + '</p>' +
        '<p class="meta">' + (it.lines ? it.lines.toLocaleString() + ' lines' : '~' + Math.round(it.size / 1024 * 10) / 10 + ' KB') +
        ' · ~' + it.mins + ' min read</p>' +
        '</div>';
      wrap.appendChild(li);
    }
    wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d = getDone();
        if (cb.checked) d.add(cb.dataset.path); else d.delete(cb.dataset.path);
        setDone(d);
        renderTrail();
      });
    });
  }

  function renderGraph() {
    const a = state.analysis;
    const svg = $('#graph');
    const nodeSet = new Set();
    for (const it of a.trail) if (it.kind === 'code') nodeSet.add(it.path);
    const edges = a.edges.filter(e => nodeSet.has(e[0]) && nodeSet.has(e[1]));
    const byP = new Map(a.trail.map(i => [i.path, i]));
    const depth = new Map();
    const layers = new Map();
    for (const p of nodeSet) {
      const it = byP.get(p);
      const d = it.entry >= 80 || baseOf(p).toLowerCase() === 'androidmanifest.xml' ? 0 :
        Math.min(3, Math.max(1, [...it.importers].length ? 1 : 2));
      depth.set(p, d);
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d).push(p);
    }
    const colW = 250, rowH = 54;
    const maxRows = Math.max(...[...layers.values()].map(v => v.length), 1);
    const W = Math.max(520, layers.size * colW + 40), H = maxRows * rowH + 30;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const pos = new Map();
    let s = '';
    for (const [d, ps] of [...layers.entries()].sort((x, y) => x[0] - y[0]))
      ps.forEach((p, i) => pos.set(p, { x: 20 + d * colW, y: 20 + i * rowH }));
    for (const [f, t] of edges) {
      if (!pos.has(f) || !pos.has(t)) continue;
      const A = pos.get(f), B = pos.get(t);
      s += '<line x1="' + (A.x + 180) + '" y1="' + (A.y + 13) + '" x2="' + B.x + '" y2="' + (B.y + 13) + '" class="edge"/>';
    }
    for (const [p, xy] of pos) {
      const it = byP.get(p);
      s += '<g class="node" data-step="' + it.step + '"><rect x="' + xy.x + '" y="' + xy.y +
        '" width="180" height="26" rx="4"/><text x="' + (xy.x + 8) + '" y="' + (xy.y + 17) + '">' +
        baseOf(p).slice(0, 24) + '</text></g>';
    }
    svg.innerHTML = s || '<text x="20" y="30" class="empty">No import links mapped between source files.</text>';
    svg.querySelectorAll('.node').forEach(n => {
      n.addEventListener('click', () => {
        const el = document.getElementById('step-' + n.dataset.step);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function renderSkips() {
    const a = state.analysis;
    $('#skip-count').textContent = a.skips.length;
    $('#skip-list').innerHTML = a.skips
      .sort((x, y) => x.path.localeCompare(y.path))
      .map(s2 => '<li><code>' + s2.path + '</code> — ' + s2.reason + '</li>').join('');
  }

  function download(name, text, type) {
    const aEl = document.createElement('a');
    aEl.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    aEl.download = name;
    aEl.click();
    setTimeout(() => URL.revokeObjectURL(aEl.href), 4000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#go').addEventListener('click', () => {
      const t = parseInput($('#repo-input').value);
      if (!t) { showError('Paste a GitHub repo — e.g. parthsingh03/AirGap or the full github.com URL.'); return; }
      history.pushState(null, '', '/' + t.owner + '/' + t.repo);
      loadRepo(t.owner, t.repo);
    });
    $('#repo-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#go').click(); });
    document.querySelectorAll('.example').forEach(chip => {
      chip.addEventListener('click', () => {
        const t = parseInput(chip.dataset.repo);
        history.pushState(null, '', '/' + t.owner + '/' + t.repo);
        loadRepo(t.owner, t.repo);
      });
    });
    $('#mode-sprint').addEventListener('click', () => { state.mode = 'sprint'; render(); });
    $('#mode-full').addEventListener('click', () => { state.mode = 'full'; render(); });
    $('#export-md').addEventListener('click', () =>
      download('trailhead-' + state.repo + '.md', trailToMarkdown(state.owner, state.repo, state.analysis), 'text/markdown'));
    $('#export-tour').addEventListener('click', () =>
      download('trailhead-' + state.repo + '.tour', trailToCodeTour(state.owner, state.repo, state.analysis), 'application/json'));
    $('#reset-progress').addEventListener('click', () => { setDone(new Set()); renderTrail(); });

    const t = parseTarget();
    if (t) loadRepo(t.owner, t.repo);
  });
}
