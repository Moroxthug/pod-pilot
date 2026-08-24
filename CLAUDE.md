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
- **Storage**: Vercel Blob (public store `pod-pilot-public`, NOT the original private store — see Gotchas). All persistence (designs library, custom templates, pricing presets, stats) is JSON blobs read/written via `lib/blobStore.js`, no database. **Known limitation**: overwriting one shared JSON "file" (`readJson`/`writeJson`, `allowOverwrite:true`) can serve a stale cached body indefinitely after a write — confirmed by extensive testing, survives cache-busting query params, `downloadUrl`, and even the SDK's documented `get(..., {useCache:false})` bypass on a path that's already been hit once. Worse: any read-modify-write built on top of it (read list → mutate → write list) can silently lose concurrent changes if that internal read is stale. Fixed for the **mockup library** (`lib/mockupsLibrary.js`) by switching to one write-once blob per entry (`blobStore.putJsonEntry`/`getJsonEntry`/`listPrefixed` — add = new file, delete = `del()` that file, list = `list()` the prefix) — a blob written exactly once has nothing to go stale from. The other four JSON-blob features (custom templates, pricing presets, designs library, stats) still use the old shared-file pattern and carry the same latent risk; not yet migrated.
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
2. **Mockups** — core flow. Upload or AI-generate a design (Generate/Edit/Remix modes), auto-analysis (style/niche/colors/strength/weakness/keywords), pick garment templates, adjust placement, generate composited mockups, zip download. "Adjust Placement" card (Fabric.js canvas, `public/app.js`) shows an actual garment outline (`public/garment-outlines/{tshirt,sweatshirt}.svg`, switches per selected garment) with a dashed box matching Printify's real max front print area (Gildan 5000/18000: 12"x16", 3:4 aspect) — lets the seller drag/scale/rotate the design against the real print area instead of the old fixed auto-fit-center. One shared transform (`{offsetXPct, offsetYPct, scalePct, rotationDeg}`, relative to that print-area box) is applied identically across every selected template (`lib/mockupEngine.js` `fitDesignToArea`). Every generated mockup also persists to a browsable **Mockup Library** below the results grid — checkboxes + "Delete Selected" to clean up old ones (`lib/mockupsLibrary.js`, `GET/POST /api/mockups/library*`).
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

Every generate/edit/remix call carries a house style brief (`STYLE_BRIEF` in `lib/aiDesign.js`): 2-3 muted colors, one bold typeface with clear hierarchy, at most one simple illustration, generous negative space, explicit ban on AI-tell effects (gradients on text, glow/sparkle, metallic/holographic, floating particles, drop shadows everywhere, rigid symmetry). Every generated design is also finalized onto an exact 4500x5400px 300dpi transparent canvas (Gildan 5000 print-file spec, contain-fit so nothing gets stretched) regardless of what aspect ratio Gemini rendered.

All AI-generated images: Gemini doesn't emit real alpha transparency (it draws a checkerboard/flat color instead) and doesn't reliably hit an exact requested hex color. Fix (`lib/chromaKey.js`): sample the actual corner pixel color of the output (don't assume a fixed key color), then chroma-key that out with a soft threshold. Reused for Remove Background too (`lib/aiDesign.js` `removeBackgroundFromImage`).

Photo-realistic mockups (`lib/mockupEngine.js` `composePhotoMockup`): garment photos generated once via Gemini and committed as static JPEGs (`public/templates-photo/`, regenerate via `npm run generate:photo-templates`). Compositing extracts the fabric's own lighting/shadow from the print area as a grayscale map, multiply-blends it into the design's RGB channels only, then reattaches the design's original alpha (sharp's multiply blend otherwise forces full opacity and erases transparency — this bit the first attempt).

On-model mockups (`public/templates-model/`, `templates/generateModelTemplates.js`, `npm run generate:model-templates`): 6 starter templates of a person wearing a blank garment (male/female × tee/hoodie/sweatshirt), generated via Gemini with deliberately standardized framing (straight-on, mid-thigh-up, centered, arms at sides) so one `printArea` per garment works across the set without per-photo tuning — verified by compositing a crosshair test design and visually checking alignment before committing. Reuses the same `composePhotoMockup` engine (`style: 'photo'`) as the flat-lay photo templates; more can be added the same way, or the user can upload their own model photos via the existing Custom Templates uploader (Templates tab).

**Model Wardrobe** (`public/templates-model-v2/`, `templates/generateModelVariants.js`, `npm run generate:model-variants [modelIndex]`): a bigger, reusable roster — 6 model identities (3 male, 3 female, `MODEL_ROSTER` in `templates/definitions.js`) × 4 garments (tee/hoodie/sweatshirt/jumper) × 4 colors (black/white/heather-gray/navy) = 96 templates. Each model is generated once as a base photo, then every other combo is produced by *editing* that same base image (Gemini edit mode: image + instruction), not regenerating from scratch — this is what keeps the same person/pose/background across every garment instead of a different-looking model per combo. Gotcha hit during generation: an instruction containing the apostrophe in "person's" reliably triggered `IMAGE_OTHER` (a silent failure, no image returned) on some combos even though the wording was otherwise fine — rephrased to avoid possessives entirely (`generateModelVariants.js`'s `generateVariant`) rather than chase which specific apostrophe was safe. The generator is resumable (skips any combo whose output file already exists), so a failed run can just be re-invoked.

Because 96 wardrobe templates would bury the ~20 "regular" templates in one flat grid, they get their own two-step picker on the Mockups tab ("Model Wardrobe" card, `public/app.js` `renderWardrobeModelPicker`/`renderWardrobeComboPicker`): pick a model face, then a garment/color combo for that model; selections feed into the same `state.selectedTemplateIds` the regular picker uses. Wardrobe templates are excluded from the regular template picker, the Templates-tab browse grid, and the Batch tab's picker (`id.startsWith('wardrobe-')`) — not yet wired into Batch.

TODO noted by the user, not built yet: expanding the model roster beyond 6, and reusing these same identities for background swaps (same base-photo + edit-mode approach would apply).

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
