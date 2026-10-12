# Design Lens

Design Lens is a design-critique studio for screens. Upload a UI screenshot or paste a public URL, and it returns notes on hierarchy, contrast, spacing, and typography: a score for each axis, what is off, what to change, and where on the screen the evidence sits.

The interface is in English and German. The Gemini API key never leaves the server.

## Features

- **Screenshot review.** Drop, browse, or paste a PNG, JPG, or WebP up to 10 MB, including exports from Figma, Adobe XD, and Sketch.
- **Live URL review.** A public address is opened in a headless browser and the first viewport is photographed. Private and local addresses are refused before navigation.
- **Structured critique.** Each review includes an overall score, four axis scores, and two to six notes with severity, a recommendation, and visible evidence.
- **URL progress.** A live capture shows connecting, screenshot, and hierarchy steps, and the form notes that a URL usually takes 5–10 seconds.
- **Language.** English and German, stored in the `design-lens-locale` cookie. The critique is written in the language on screen.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript |
| UI | [Tailwind CSS](https://tailwindcss.com) 4 |
| Vision model | [Gemini](https://ai.google.dev/gemini-api/docs) through `@google/genai` |
| Local browser | [Puppeteer](https://pptr.dev) |
| Vercel browser | `puppeteer-core` and [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) |
| Images | `sharp` (resize and JPEG) |
| Validation | Zod |

The default model is `gemini-3.5-flash-lite`. Set `GEMINI_MODEL` to override it. If that model has used its free daily allowance, the route tries `gemini-3.1-flash-lite`.

## Local setup

Requirements: Node.js 20 or newer, and npm.

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell, copy the example file with:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` and set `GEMINI_API_KEY`. Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Do not prefix the variable with `NEXT_PUBLIC_`. The key is read only inside the API route.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

Local URL capture uses the Chrome build installed by Puppeteer. The serverless Chromium pack is downloaded only when `VERCEL=1`, so a laptop install skips that step.

## Architecture

```
Browser
  page.tsx
    source panel  →  screenshot or URL
    useAIAnalysis →  POST /api/analyze
    notes panel   →  scores and critiques
         │
         ▼
app/api/analyze/route.ts
  validate body (Zod)
  refuse private URLs
  prepare a JPEG no wider than 1280px
  Gemini structured JSON
         │
         ├─ screenshot: client canvas shrink, then sharp on the server
         └─ URL: public-address check, headless screenshot, then sharp
```

**Request path.** `hooks/useAIAnalysis.ts` turns the chosen source into JSON and posts it to `/api/analyze`. Screenshot files are scaled in the browser first. The notes panel maps API error codes to English or German copy.

**URL capture.** `lib/analysis/capture-page.ts` checks the host, opens the page with `domcontentloaded`, and screenshots a 1280×800 viewport. Navigation and encoding share a six-second deadline after the browser is open. One browser process is reused between reviews. On Vercel, the same module launches `@sparticuz/chromium` instead of the local Chrome binary. `scripts/prepare-chromium.mjs` fetches that pack during a Vercel install and Next traces it into the analyze function.

**Model call.** `lib/analysis/prompt.ts` asks for a critique of what is visible. `lib/analysis/schema.ts` defines the JSON object Gemini must return and checks it before the UI renders it. Images are sent as inline JPEG at medium media resolution.

**Safety.** `lib/analysis/fetch-page.ts` blocks non-http addresses, credentials, localhost, and private, link-local, and metadata IP ranges. Document navigations are checked again with DNS so a redirect cannot land on a private host.

## Deploying

The app is a Node.js route (`maxDuration` 120). On Vercel, the platform may cap that duration by plan. Set `GEMINI_API_KEY` in the project environment. The first URL review on a cold server spends extra time opening Chromium. Screenshot reviews do not start a browser.
