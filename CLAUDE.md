# POD Pilot

A personal print-on-demand tooling app for Etsy sellers — built as a free, self-hosted
alternative to **MyDesigns.io** (a paid SaaS the user was using). Scope is deliberately
**design + mockup + listing prep**, not fulfillment — the user still ships via their existing
Printify/Printful/Etsy-POD-partner setup. This file exists so a fresh conversation has full
context; the user has said before "you must not have integrated something crucial" — always
re-verify against MyDesigns rather than assuming this doc is complete.

## Live

- **App**: https://www.booklet.today (custom domain on the same Vercel project `pod-pilot`; the original `https://pod-pilot-sandy.vercel.app` URL still works too, team `youssefbouchtaoui-4103s-projects`)
- **Repo**: https://github.com/Moroxthug/pod-pilot (owner: Moroxthug)
- Deploys: `git push origin master` (GitHub) is the source of truth. Also run `vercel deploy --prod --yes` after pushing — this project deploys via direct CLI calls in this session, not via a GitHub–Vercel auto-deploy hook, so **pushing to GitHub alone does not update the live site**. Always do both.

## Tech stack

- Node/Express (`server.js`), deployed as a single Vercel serverless function (`api/index.js` re-exports the Express app; `vercel.json` rewrites `/api/*` to it). Static assets in `public/` are served by Vercel's zero-config static hosting, not through the function.
- **Storage**: Vercel Blob (public store `pod-pilot-public`, NOT the original private store — see Gotchas). All persistence (designs library, custom templates, pricing presets, stats) is JSON blobs read/written via `lib/blobStore.js`, no database.
- **AI**: Google Gemini via `@google/genai` (current SDK; the older `@google/generative-ai` is deprecated). Image model: `gemini-2.5-flash-image`. Text/analysis model: `gemini-3.6-flash` (NOT `gemini-2.5-flash` — deprecated for new API keys, will 404).
- **Image processing**: `sharp` for all deterministic compositing/resizing.
- **Canvas editor**: Fabric.js v7, vendored as a single UMD file at `public/vendor/fabric.min.js` (copied from `node_modules/fabric/dist/index.min.js` — the `.mjs` builds are code-split across dozens of files and can't be served as one static file).
- No build step. No framework. Plain HTML/CSS/vanilla JS per page-feature (`app.js`, `canvas.js`, `pricing.js`, `dashboard.js`, `tools.js`, `theme.js`).

## Environment variables (Vercel project settings, all three environments)

- `GEMINI_API_KEY` — Google AI Studio key (user's own; treat as sensitive, never log/print it)
- `BLOB_READ_WRITE_TOKEN` — from the **public** Blob store connection (see Gotchas — do not use OIDC/`BLOB_STORE_ID` auth, it's flaky across environments)
- `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET` (unused by the OAuth flow itself — Etsy's v3 API is PKCE-based, no client secret needed — kept for reference/potential future use), `ETSY_REDIRECT_URI` (`https://booklet.today/api/etsy/callback`)
- For local dev: `.env.local` (gitignored) via `dotenv`, loaded conditionally in `server.js` (`if (!process.env.VERCEL) require('dotenv').config(...)`). Pull with `vercel env pull .env.local` after `vercel link`.

## Feature map (sidebar tabs, in order)

1. **Dashboard** — landing tab. Live stats (design count, mockups generated, templates, pricing presets), quick-action shortcuts, recent-designs grid (click to load into Mockups). Backend: `GET /api/dashboard/stats`.
2. **Mockups** — core flow. Upload or AI-generate a design (Generate/Edit/Remix modes), auto-analysis (style/niche/colors/strength/weakness/keywords), pick garment templates, adjust placement, generate composited mockups, zip download. "Adjust Placement" card (Fabric.js canvas, `public/app.js`) lets the seller drag/scale/rotate the design instead of the old fixed auto-fit-center — one shared transform (`{offsetXPct, offsetYPct, scalePct, rotationDeg}`) is applied identically across every selected template's own print area (`lib/mockupEngine.js` `fitDesignToArea`).
3. **Canvas** — Fabric.js design editor: text, shapes, image upload, browse design library, inline AI generation. "Save as Design" exports transparent PNG and feeds back into Mockups.
4. **Templates** — browse default templates (flat SVG + photorealistic), upload custom blank garment photos with a % based print-area picker.
5. **Listing** — heuristic (non-AI) title/tags/description generator.
6. **Batch** — multiple prompts (one per line) → each generated, analyzed, mockup'd; combined zip.
7. **Trends** — Gemini + live Google Search grounding for current POD niche trends; "Generate This Design" feeds a trend's angle into the Mockups prompt.
8. **Pricing** — per-size (S–3XL) cost/price/profit/margin table, bulk margin%/markup$ tools, saved presets.
9. **Tools** — Remove Background (works on ANY photo, not just AI generations) and Upscale (deterministic Lanczos3, never AI-reinterprets).

Design generation modes (`lib/aiDesign.js`, `POST /api/designs/generate` with `mode: generate|edit|remix`):
- **Generate**: text-only.
- **Edit**: one reference image + instruction, preserves composition (verified: fur-color change kept everything else pixel-identical).
- **Remix**: 1+ reference images blended per a text direction (verified: two unrelated designs → one cohesive new composition, not a collage).

All AI-generated images: Gemini doesn't emit real alpha transparency (it draws a checkerboard/flat color instead) and doesn't reliably hit an exact requested hex color. Fix (`lib/chromaKey.js`): sample the actual corner pixel color of the output (don't assume a fixed key color), then chroma-key that out with a soft threshold. Reused for Remove Background too (`lib/aiDesign.js` `removeBackgroundFromImage`).

Photo-realistic mockups (`lib/mockupEngine.js` `composePhotoMockup`): garment photos generated once via Gemini and committed as static JPEGs (`public/templates-photo/`, regenerate via `npm run generate:photo-templates`). Compositing extracts the fabric's own lighting/shadow from the print area as a grayscale map, multiply-blends it into the design's RGB channels only, then reattaches the design's original alpha (sharp's multiply blend otherwise forces full opacity and erases transparency — this bit the first attempt).

On-model mockups (`public/templates-model/`, `templates/generateModelTemplates.js`, `npm run generate:model-templates`): 6 starter templates of a person wearing a blank garment (male/female × tee/hoodie/sweatshirt), generated via Gemini with deliberately standardized framing (straight-on, mid-thigh-up, centered, arms at sides) so one `printArea` per garment works across the set without per-photo tuning — verified by compositing a crosshair test design and visually checking alignment before committing. Reuses the same `composePhotoMockup` engine (`style: 'photo'`) as the flat-lay photo templates; more can be added the same way, or the user can upload their own model photos via the existing Custom Templates uploader (Templates tab).

## Design system

Light theme is default (`:root` in `public/style.css`); dark via `:root[data-theme="dark"]`, toggled by `public/theme.js` and persisted to `localStorage` (`pp-theme`). Theme is applied by an inline script in `<head>` before first paint to avoid a flash. Every color is a CSS custom property — never hardcode a color when adding UI. `.btn.ghost` is neutral (not red); `.btn.danger` is for actually-destructive actions only (this was a real bug found and fixed — ghost buttons were red by default, making "Apply"/"Download" look destructive).

## Known gaps (intentional, blocked on user action)

- **Etsy API integration**: OAuth 2.0 + PKCE connect flow is built (`lib/etsyClient.js`, `POST /api/etsy/connect`, `GET /api/etsy/callback`, `GET /api/etsy/status`, `POST /api/etsy/disconnect`; "Connect Etsy Shop" button on the Listing tab). Callback URL registered with Etsy is `https://booklet.today/api/etsy/callback` (apex domain, not `www` — Etsy requires an exact match). **Blocked**: the user's Etsy key is "Pending Personal Approval" — Etsy's own consent screen rejects the request outright ("application ... not recognized") until they approve it, so the flow can't be tested end-to-end yet. Nothing to fix in the code; just re-test once Etsy approves the key. Publish-to-Etsy (actually creating a listing) isn't built yet — only the connection/auth.
- **Printify**: straightforward (Personal Access Token, no OAuth) — not started, waiting on user to provide a token.
- Considered routing Etsy/Printify through the **MyDesigns.io API** instead (user has a Personal Access Token for it, from Settings → Personal Access Tokens; base URL `https://api.mydesigns.io`, auth via `Authorization: Bearer <token>`) — decided against it: MyDesigns' `/providers/provider-users` endpoint returns the user's Etsy connection including a live OAuth refresh token issued to *MyDesigns' own* registered Etsy app, and reusing that from POD Pilot would mean misusing another app's OAuth credential. MyDesigns' API stays useful as a one-time **data import** source (designs/categories) if the user wants to migrate off it, just not as the publish/fulfillment backend.
- **Amazon Merch on Demand**: not self-serve — needs an Amazon-approved MoD seller account first (invite/waitlist), then separate SP-API developer registration. Told user this is much harder than Printify; not something to build until they have account access.
- Fulfillment-adjacent MyDesigns features (store payment method, return-address override, order management) are **deliberately out of scope** — this app doesn't broker manufacturing, that stays with Printify/Etsy's own POD partners.

## Process notes for continuing this project

- The build pattern has been: user says "proceed" → build one feature → test via real browser interaction (not just `curl`) → commit → push → `vercel deploy --prod --yes` → verify on live production → report and stop for confirmation before the next one. Keep following this rhythm unless told otherwise.
- User explicitly asked (twice) to go back through **mydesigns.io** via the `claude-in-chrome` MCP tools and re-check for missed functionality — do this again if asked "did you miss something," don't just assume prior research covered everything. Their MyDesigns login is in their real Chrome profile; navigate to `mydesigns.io/app/dashboard` (already logged in). The Canvas editor's object-selection there is unreliable to automate (clicks/hovers time out or don't register) — don't burn too much time on it; prefer list-based pages (Designs, Products, Stores, Orders, Home) which are far more reliable to inspect.
- When testing locally, the dev server needs restarting after editing any required `lib/*.js` file (Node module cache) — `preview_stop` then `preview_start` again, don't just re-navigate.
- Always verify a feature through actual UI interaction (`javascript_tool` clicks, not just constructing the right `curl` call) before calling it done — earlier in this project "it works" was claimed from API tests alone and turned out to still have a live bug.
