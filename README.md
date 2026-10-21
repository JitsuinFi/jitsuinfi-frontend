# jitsuinfi-frontend

Web app for **JitsuinFi**: supplier, buyer and financier screens, a verify page for auditors and judges, and a page showing what outsiders can see. All cryptography runs in the browser through `jitsuin-wasm` (from `jitsuinfi-zcash`), so the page never has to trust a server's verdict.

- No CDN, no third-party requests, no trackers. A strict Content-Security-Policy is set in `index.html` (`'wasm-unsafe-eval'` is the only relaxation, needed for WebAssembly).
- Buyer keys come from a passkey (WebAuthn PRF extension): no seed phrase, nothing stored. A test secret stands in on devices without PRF.
- Secrets stay in page memory only; they are never written to storage.
- Registering on the board, the Sign-to-Pay advance and the repayment watchdog run in the financier's backend wallet (`jitsuin-flow`); this app covers what the browser does and verifies.

## Run

```bash
npm install
npm run wasm      # builds jitsuin-wasm from ../jitsuinfi-zcash into src/wasm/
npm run dev       # or: npm run build && npm run preview
```

Needs Rust with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli 0.2.129` (see the `jitsuinfi-zcash` README). Status: in development for ZECATHON 2026, testnet.

**Network, in one place** (HNK-26.T19): the build is testnet unless `VITE_NETWORK=main` is set when building (`src/lib/network.ts`: labels, the shielded address check). The financier node takes `NETWORK` from its environment and the `jitsuin` CLI reads the network from the viewing key it is given, so a mainnet build never accepts a testnet address and the node refuses a board key of the other network.
