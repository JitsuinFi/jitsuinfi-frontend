# jitsuinfi-frontend

Web app for **JitsuinFi**: supplier, buyer and financier screens, a verify page for auditors and judges, and a page showing what outsiders can see. All cryptography runs in the browser through `jitsuin-wasm` (from `jitsuinfi-zcash`), so the page never has to trust a server's verdict.

- React 19 and TanStack Router (HNK-31, D-52): one static single-page app with routes from files in `src/routes/`, built by Vite. Next.js was ruled out: its inline scripts break the strict CSP below.
- No CDN, no third-party requests, no trackers, no inline script. A strict Content-Security-Policy is sent by Vercel (`vercel.json`) and written into the built `index.html` (`'wasm-unsafe-eval'` is the only relaxation, needed for WebAssembly).
- Buyer keys come from a passkey (WebAuthn PRF extension): no seed phrase, nothing stored. A test secret stands in on devices without PRF.
- Secrets stay in page memory only; they are never written to storage.
- Registering on the board, the Sign-to-Pay advance and the repayment watchdog run in the financier's backend wallet (`jitsuin-flow`); this app covers what the browser does and verifies.

## Pages

| Path | What | Code |
|---|---|---|
| `/` | Landing, six chapters | `src/app/Landing.tsx`, `src/landing/` |
| `/app` | The 登記所 lobby | `src/app/Lobby.tsx` |
| `/try`, `/try/play` | Try to double-finance (Case File #0417); `/try/play` plays itself for the video | `src/pages/TryPage.tsx`, `src/pages/try/` |
| `/verify`, `/outsider`, `/rates` | Verify a bundle, proof or Exhibit A; what outsiders see; the public rate index | `src/pages/VerifyPage.tsx`, `OutsiderPage.tsx`, `RatesPage.tsx` |
| `/account`, `/supplier`, `/buyer`, `/member` | Sign-in and the role desks (a role page opens only in a session of that role) | `src/pages/AccountPage.tsx`, `SupplierPage.tsx`, `BuyerPage.tsx`, `MemberPage.tsx` |
| `/apply` | Apply for a financier node | `src/pages/ApplyPage.tsx` |
| `/console`, `/console/pair` | Financier console, on the console's own host (D-45) | `src/console/` |

The landing, the app and the console are three worlds loaded on demand; moving between them reloads the page, so their stylesheets never meet. Old addresses (`app.html#/supplier`, `#/index`, `console.html?view=pair`) are moved to these paths (`src/lib/legacy-url.ts`).

## Run

```bash
npm install
npm run wasm      # builds jitsuin-wasm from ../jitsuinfi-zcash into src/wasm/
npm run dev       # or: npm run build && npm run preview
```

Needs Rust with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli 0.2.129` (see the `jitsuinfi-zcash` README). Status: in development for ZECATHON 2026, testnet.

**Network, in one place** (HNK-26.T19): the build is testnet unless `VITE_NETWORK=main` is set when building (`src/lib/network.ts`: labels, the shielded address check). The financier node takes `NETWORK` from its environment and the `jitsuin` CLI reads the network from the viewing key it is given, so a mainnet build never accepts a testnet address and the node refuses a board key of the other network.
