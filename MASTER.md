# MASTER — JitsuinFi landing design system

Single source of truth for the landing page (HNK-18.T4). Every colour, size, duration and easing in `src/landing/` comes from this file. A value not listed here is a bug. Brief: vault `00-Project/Landing Page - Brief.md`.

## 1. Theses (validated 2026-10-19)

**Visual thesis.** A day sheet of rose washi where everything human is plum ink (the invoice, the signatures, a Dark Raspberry jitsuin seal) and everything Zcash is a deep Cetacean-to-Catalina pool that opens through the paper, lit only from inside by Button Blue ripples. Display set in Shippori Mincho B1, the mincho of Japanese seal registers and official documents, heavy and large; Geist for the captions so the 35% stays easy to read; Geist Mono only for real data (N, txids). Airy, cinematic spacing on an 8px base. No cards and no boxes: information is typeset on the paper like a document or floats as marks in the water, and every edge is a deckled paper edge or an ink bleed, never a rounded rectangle.

**Interaction thesis.** Ink time. Text and paper settle on softLand (400ms), the seal presses on snapSettle (367ms) with a 67ms squash, ink bleeds linearly over 1.2s, glyphs sink into the pool and ripple out over 1.6s; anything leaving speeds up on accelExit (433ms). Hover: ink wicks toward the pointer on paper, the pointer touches the pool and raises a ripple. Scroll is the story clock (Lenis): pinned scenes seal the invoice, sink its fingerprint N into the pool, lock the seal chain, run money under the surface, then press the seal a second time so it cracks and two ripples interfere into the proof. Forbidden: lone fades, one uniform fade-up stagger, bounce or elastic (one popOver allowed, when the proof flares), cards, glass, gradient text, marquees, 3D tilt, glow shadows. Reduced motion shows every scene at its end state.

**Amendment 1 (user, 2026-10-19): firm and professional, never feminine.** The maroon is the official red of a registered seal on receivable documents and RWA deeds, not a soft colour; the blue palette completes it. So: the ground is cool document paper (`#F6F5FC`), headings are Cetacean navy, body copy is Brown Coffee ink, Dark Raspberry stays the only red (the seal, actions, signatures), Classic Rose and Pearly Purple shrink to ink-bleed fringes and faint fibers. Shapes are firmer: sheets are straight-edged with a fine torn edge on one side only, the pool is revealed where the paper is torn open, and no blob shapes appear anywhere.

**Amendment 2 (user, 2026-10-19): the hero must be iconic.** The first hero read as a static split (paper left, pool right) that stops moving after the intro. The user's references (Reeve's looping camera stage; MotionSites prompts 1–4 in `vault/MotionSites-References/`) set the level: a full-bleed moving scene behind everything, never still, with copy laid over it. So the hero becomes **the pool seen from above in daylight**, full-bleed (WebGL in place of the prompts' CDN videos, which the CSP and the no-third-party-asset rule exclude): caustic light nets on a deep floor ruled like a ledger (the public board), sun sparkles, film grain, ripples everywhere. On it, a looping ~10s story: an invoice floats in, a giant jitsuin slams down and the shockwave crosses the whole screen, N resolves, the invoice sinks and only N stays floating as light; then a copy of the same invoice drifts in, the seal is pressed twice, the impression cracks, the N ring turns seal red ("already registered, refused"), the copy is pushed away, and the loop restarts. A beat rail with a pause control (WCAG 2.2.2) sits at the bottom. Adopted from the prompts, adapted: the bottom blur mask over the scene (prompt 1, tinted with the pool for contrast), word-by-word blur-in headline (prompt 4, with the jittered word delays), liquid-glass pills for the nav, badge, rail and secondary call (prompts 1 and 4), an inline seal mark inside the headline (prompt 3), and a magnetic primary call (Reeve). Not adopted: cards and stat boxes (still forbidden), Inter/Barlow/Fustat (the type stays Shippori Mincho B1 + Geist), pure black, white CTA on black. Rule changes: glass is allowed **only** on pills over the pool (nav, badge, rail, secondary call); pills are the only rounded elements (`999px`), everything else keeps radius 0; blur is allowed in entries (words blur 10px to 0 and the descending seal uses depth blur). Later chapters stay on the day paper; the hero is the one place the pool fills the screen.

**Amendment 3 (user, 2026-10-19): an illustrated 3D town, not water.** The full-bleed pool (Amendment 2) "did not connect" and was not aesthetic; a Motion.so render was rejected too. The hero is now "Kota Piutang", a cel-shaded 3D diorama (three.js 0.186.1, bundled; MeshToon with a 3-step ramp and ink outlines) of a receivables town floating over a sea of clouds in an anime afternoon. Six episodes (第一話 to 第六話) play one invoice's economy: the supplier ships and the invoice flies to the buyer as a paper plane; the buyer's jitsuin slams down; only N rises to the Registry tower in the square (one lantern per fingerprint) while the sheet sinks into the shielded vault; financier A looks N up and advances cash; a copy flies to financier B, the beam finds N lit, the lantern runs seal red and the gate shuts; on the due date the buyer pays and the lantern settles. The island turns like a turntable so each subject faces a fixed 3/4 camera, and the town always stays whole in the right 60% so the copy never shares space with it. Water, ripples and caustics are gone. Glass pills stay (daylight variant: `--glass-day`, `--glass-day-edge`); `--veil-day` lights the paper behind the copy.

**Allowed patterns.** WebGL ink diffusion on paper and a WebGL water field with ripples (both paused offscreen) · deckled paper edges as masks · one round Dark Raspberry seal mark · Geist Mono hashes that resolve digit by digit (real values) · hairline line figures for documents · pinned scroll scenes. Known reflexes this allows, by name: a paper ground (jitsuin is a seal on paper documents), perpetual motion limited to the two WebGL fields (paused offscreen), monospace limited to real data.

**Dials** (sent to `ui-ux-pro-max`): variance 8 ("the pool opens through the paper, deckled edges, no boxes"), motion 8 ("pinned scenes, WebGL ink and water, scroll is the story clock"), density 3 ("airy, cinematic spacing").

From the `ui-ux-pro-max` proposal: kept the scroll-triggered storytelling pattern (chapters, a mini call at the end of a chapter, one closing call). Dropped Bento Grids (cards), the cyan palette and light blue ground, hover scale with soft shadows, GSAP Flip, Noto Serif JP (the thesis names Shippori Mincho B1).

**Single world.** The page commits to day washi on purpose; it does not follow the viewer's dark mode. The dark is inside the page, as the pool.

## 2. Colour

Palette from `vault/ColorPalette-JitsuinFi/`. Ratios are WCAG.

| Token | Hex | Source | Role | Ratio |
|---|---|---|---|---|
| `--paper` | `#F6F5FC` | Vodka 14% + Classic Rose 6% on white (Amendment 1) | Page ground: cool document paper | — |
| `--sheet` | `#FCFCFE` | Vodka 5% on white | Invoice and letter sheets | — |
| `--fiber` | `#ECD0EC` | Classic Rose | Faint fibers, ink-bleed fringe | decorative |
| `--fold` | `#BA71A2` | Pearly Purple | Ink-bleed fringe only | decorative |
| `--head` | `#020D2F` | Cetacean Blue | Headings: navy authority | 17.6 on paper |
| `--ink` | `#461D3A` | Brown Coffee | Body copy, captions | 12.95 on paper |
| `--ink-2` | `#502A50` | Japanese Violet | Secondary captions, data on paper | 10.84 on paper |
| `--seal` | `#7E2A53` | Dark Raspberry | The jitsuin seal, primary action, signatures, links | 8.27 on paper |
| `--seal-hi` | `#6B2347` | Dark Raspberry darkened 15% | Seal button hover | 8.9 on paper |
| `--pool` | `#020D2F` | Cetacean Blue | The shielded pool | — |
| `--pool-2` | `#032C7D` | Catalina Blue | Pool depth | — |
| `--wave` | `#0841C9` | Absolute Zero | Ripple body | — |
| `--glint` | `#1D97F1` | Button Blue | Light inside the water only | 6.13 on pool, 2.58 on paper (never on paper) |
| `--glass` | `rgba(252, 252, 254, .07)` | `--sheet` at 7% | Liquid-glass pill fill (Amendment 2) | — |
| `--glass-edge` | `rgba(252, 252, 254, .5)` | `--sheet` at 50% | Liquid-glass gradient stroke | — |
| `--glass-soft` | `rgba(252, 252, 254, .14)` | `--sheet` at 14% | Glass inner highlight, tracks | — |
| `--veil` | `rgba(2, 13, 47, .78)` | `--pool` at 78% | Bottom veil under the hero copy (with the blur mask) | — |
| `--mist` | `#C4C7F2` | Vodka (RGB 196,199,242; chart label `29B4D1` is wrong) | Text on the pool | 11.62 on pool |

Pairs: `--sheet` on `--seal` 8.68 (seal button text). `--mist` on `--pool-2` 7.71.

**Never:** a colour not in this table; Button Blue on paper; pure `#000` or `#FFF`.

## 3. Type

Faces, bundled locally (no CDN): **Shippori Mincho B1** 700/800 (display), **Geist** 400/500 (captions, navigation, buttons), **Geist Mono** 400/500 (real data only: N, txids, hex). `font-display: swap`.

Fallbacks: `"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", Georgia, serif` · `"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` · `"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace`.

| Token | Face | Weight | Size | Leading | Tracking |
|---|---|---|---|---|---|
| `--t-hero` | Shippori Mincho B1 | 800 | `clamp(36px, 4.6vw, 88px)` (was 44/7.2vw/128, then 36/5.6vw/104 before the full-bleed hero shared the width with the stage: "double-financing." overflowed the paper column on desktop and a 375px phone; capped at `9.6vw` below 375px) | .98 | −.02em |
| `--t-h2` | Shippori Mincho B1 | 800 | `clamp(30px, 4.2vw, 72px)` | 1.04 | −.015em |
| `--t-h3` | Shippori Mincho B1 | 700 | `clamp(20px, 2vw, 32px)` | 1.15 | 0 |
| `--t-lede` | Geist | 400 | `clamp(18px, 1.5vw, 24px)` | 1.5 | −.005em |
| `--t-body` | Geist | 400 | `clamp(16px, 1.1vw, 18px)` | 1.6 | 0 |
| `--t-ui` | Geist | 500 | `clamp(14px, 1vw, 16px)` | 1.2 | .01em |
| `--t-data` | Geist Mono | 400 | `clamp(12px, .9vw, 14px)` | 1.5 | 0, `tabular-nums` |

Rules: headings in `--head` (navy), body in `--ink`; hierarchy by scale and the mincho's weight. Caption measure ≤ 52ch. Headings `text-wrap: balance`. Mono only on hashes, txids and hex values shown as data. No uppercase labels.

## 4. Space, edges, depth

- Base 8px: `--s-1 8px`, `--s-2 16px`, `--s-3 24px`, `--s-4 32px`, `--s-6 48px`, `--s-8 64px`, `--s-12 96px`, `--s-section clamp(96px, 14vw, 220px)`.
- Gutter `max(16px, env(safe-area-inset-*))`, then `clamp(16px, 5vw, 96px)`.
- **Radius: 0** on every interface element. Organic shape only where paper is torn (one fine edge per sheet, the edge where the pool shows through) and in the ink bleed. No rounded rectangles, no blobs.
- **Depth:** one shadow, for physical paper sheets lifted off the washi: `--lift: 0 18px 40px rgba(70, 29, 58, .16)` (Brown Coffee at 16%). A torn sheet is clipped, so it carries the same shadow as a filter: `--lift-drop: drop-shadow(0 18px 20px rgba(70, 29, 58, .16))`. On the pool a floating sheet casts the pool's own shadow instead: `--lift-pool: drop-shadow(0 26px 28px rgba(2, 13, 47, .55))` (Amendment 2). Nothing else casts a shadow.
- **Lines:** paper rules `1px solid var(--fiber)` on sheets only.
- z-index: field 0, content 10, sheets 20, nav 30, overlay menu 40.

## 5. Motion

### Durations
| Token | ms | Use |
|---|---|---|
| `--dur-press` | 67 | Seal squash, button press |
| `--dur-micro` | 133 | Opacity helper |
| `--dur-fade` | 200 | Colour ramps on hover |
| `--dur-seal` | 367 | Seal coming down (snapSettle) |
| `--dur-enter` | 400 | Text and paper entries (softLand) |
| `--dur-exit` | 433 | Leaving (accelExit) |
| `--dur-proof` | 500 | The proof flare (popOver, once) |
| `--dur-sink` | 1100 | A glyph sinking into the pool |
| `--dur-bleed` | 1200 | Ink bleed (linear) |
| `--dur-ripple` | 1600 | A ripple |
| `--dur-proof-ripple` | 2400 | The interference rings |

### Easings (motionmaxxing; exact functions in `src/landing/motion.ts`)
| Token | CSS fit | anime.js v4 |
|---|---|---|
| softLand | `cubic-bezier(.22,.78,.51,.94)` | function |
| snapSettle | `cubic-bezier(.13,1.06,.31,.94)` | function |
| glide | `cubic-bezier(.53,.91,.89,1)` | `'out(1.7)'` |
| softInOut | `cubic-bezier(.34,.07,.66,.93)` | function |
| accelExit | `cubic-bezier(.29,0,.63,.04)` | `'in(2.6)'` |
| popOver | `linear(…)` from motionmaxxing | function (once per page) |
| cruise | `linear` | `'linear'` (bleed, scrubbed values) |

### Staggers, distances, scroll
- Sibling staggers uneven: 100, 67, 67, 67ms; a wave ends under 600ms.
- Headline words 133–200ms apart with ±40% jitter; split by word.
- Hash resolve: each hex digit cycles 3–6 random glyphs over 400ms, left to right, 20ms apart.
- Entries: text rises 0.05 of its line height; paper sheets rise 24px and rotate from −2° to their rest angle.
- Scroll: Lenis duration 1.2; scenes pinned for 160–220vh; scrubbed values are linear in scroll progress.
- Pointer: ink wick follows with a spring `{ stiffness: 100, damping: 18 }`; a pool ripple at most every 140ms.
- WebGL: DPR ≤ 2 (1 on phones), 30fps idle and 60 while scrolling or touched, paused offscreen and on hidden tabs.
- Reduced motion: every scene renders its end state; no loops; Lenis off.

## 6. Components

- **Seal button** (primary): `--seal` fill, `--sheet` text, `--t-ui`, square, padding `--s-2 --s-3`; hover: fill moves to `--seal-hi` in `--dur-fade` and the label nudges 2px right on glide; press .97 in 67ms; focus ring 2px `--glint` offset 3px (blue is allowed here as focus light); disabled 45% opacity.
- **Ink link** (secondary): `--seal` text with a 1px ink underline that bleeds wider on hover (the underline grows from 1 to 3px over `--dur-fade`).
- **Sheet**: `--sheet` with a deckled mask and `--lift`; never holds UI chrome, only document content.
- **Pool text**: `--mist` on the pool; data in Geist Mono `--glint`.

## 7. Page structure (storytelling)

1. **Hero**: washi, a floating invoice sheet, the seal presses on load, the pool on the right answers the pointer. Headline and two calls (open the demo, read the spec).
2. **One fingerprint**: the invoice's fields fold into N; the hash resolves digit by digit.
3. **Into the pool**: N sinks; outsiders see only ripples and the explorer's empty view.
4. **The seal chain**: supplier, buyer, financier seals link; money moves under the surface only once the chain is whole (Sign-to-Pay).
5. **Pressed twice**: the second press cracks, two ripples interfere, the proof flares.
6. **Paid and remembered**: the repayment returns as a ripple, both signatures settle it, and the buyer's history sinks as anchored rings.
7. **Close**: real testnet txids written in ink; open the demo, read the spec, see the repo.
