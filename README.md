# TrailHead

Read any public GitHub repo in the right order.

Open a big codebase and the first question is always the same: where do I even start? TrailHead answers it. Paste a repo and it builds a numbered reading path from the repo's real import graph — README first, then the entry point, then the modules that file actually pulls in, foundations before dependents, config after the code, tests last. No AI summaries, no guessing; the order is measured from imports, entry points and file links in the repo itself.

It also tells you what to skip, and why — lockfiles, generated folders, binaries and assets that eat reading time without teaching you anything.

## What you get

- The trail: a step-by-step reading order with a reason on every step
- Sprint mode (the essential 10 files) and the full trail
- Hub badges on the files everything else depends on
- A dependency view showing who uses whom — click a file to jump to its step
- Reading-time estimates and a progress checklist that saves in your browser
- Export the trail as a Markdown checklist or a VS Code CodeTour file
- The skip list, with a plain reason for every file on it

## The URL swap

Once it is live at its own address, take any GitHub repo URL and swap the domain:

```
github.com/parthsingh03/AirGap  →  trailhead.pages.dev/parthsingh03/AirGap
```

## How it works

Everything runs in the browser. The page asks the GitHub API for the repo's file tree (2 requests), reads the source files from the repo's raw file host, then parses imports and symbol usage to build the dependency graph. Entry points are detected from real signals: an Android manifest, `MainActivity`, `main.*`, `index.*`, `app.*` and friends. Files are ordered by walking out from the entry along that graph. Public repos only.

## Run it locally

Any static server works:

```
npx serve .
```

Then open `http://localhost:3000/parthsingh03/AirGap` — or just paste a repo on the home page.

## Deploy

It is a plain static site (`index.html`, `styles.css`, `app.js`) with two routing helpers included:

- `_redirects` — SPA fallback for Cloudflare Pages / Netlify, so `/owner/repo` URLs load the app
- `404.html` — the same trick for GitHub Pages, which has no rewrites
