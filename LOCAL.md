# Run Casa Serra locally

This is a local copy of [Casa Serra by Sam1983Aing](https://github.com/Sam1983Aing/casa-serra), based on upstream commit `b47b775`. The published site is [sam1983aing.github.io/casa-serra](https://sam1983aing.github.io/casa-serra/). Credit for the original design, loading sequence, architecture, camera choreography, and demo belongs to its upstream author.

The original scene and presentation sources are preserved except for the font-loading lookup, which recognizes the local `data-fonts` stylesheet. Local additions provide a small development server and tests; browser dependencies and fonts are vendored for local loading. See the original [README.md](README.md) for the author's description and texture credits.

The local copy also synchronises the smooth scroller and camera to the start before the loader exits, so reloading after the finale opens on the floor plan instead of carrying over the previous position. Explicit `?at=` stage links keep their upstream behavior.

The opening headline uses the locally included Instrument Serif with an italic terracotta accent and responsive spacing. Share metadata points to this fork's Vercel deployment; the original author credit remains visible.

## Static hosting

`npm run build` copies the complete browser experience and its assets into `dist/`. The Vercel configuration serves that directory without running the local Node server or installing dependencies. Original author and material credits remain in the experience and upstream README.

Use Node.js 20 or newer. No dependency installation or build step is needed.

```powershell
cd 'D:\Orbix Sofrwares\projects\casa-serra'
npm run dev
```

Open <http://127.0.0.1:5178/>. `npm start` runs the same server. It listens only on the local computer.

To choose another port:

```powershell
npm run dev -- --port 5180
```

The `PORT` environment variable is also supported. Stop the server with Ctrl+C.

Run the local server checks with `npm test`. They cover asset delivery, MIME types, video byte ranges, and traversal protection. The original demo has no compilation step; visual behavior is checked in the browser.
