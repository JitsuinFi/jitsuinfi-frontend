<p align="center">
  <a href="https://jitsuinfi.vercel.app"><img src=".github/readme/banner.svg" alt="JitsuinFi: Zcash stops double-spending. JitsuinFi stops double-financing." width="100%"></a>
</p>

<p align="center">
  <img alt="Zcash testnet, Ironwood pool" src="https://img.shields.io/badge/Zcash-testnet%20%C2%B7%20Ironwood%20pool-032C7D?style=flat-square">
  <img alt="ZECATHON 2026, Private Markets" src="https://img.shields.io/badge/ZECATHON%202026-Private%20Markets-7E2A53?style=flat-square">
  <img alt="License MIT or Apache-2.0" src="https://img.shields.io/badge/license-MIT%20%7C%20Apache--2.0-461D3A?style=flat-square">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-032C7D?style=flat-square&logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-0841C9?style=flat-square&logo=vite&logoColor=white">
  <img alt="three.js" src="https://img.shields.io/badge/three.js-0.186-461D3A?style=flat-square&logo=threedotjs&logoColor=white">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-7E2A53?style=flat-square">
</p>

<p align="center">
  <b>The web app: landing, supplier, buyer and fund-member desks, the verify page, the outsider view and the financier console. All cryptography runs in the page.</b>
</p>

<p align="center">
  <a href="https://jitsuinfi.vercel.app"><b>Landing</b></a> ·
  <a href="https://jitsuinfi.vercel.app/app"><b>App</b></a> ·
  <a href="https://jitsuinfi.vercel.app/try"><b>Try to double-finance</b></a> ·
  <a href="https://jitsuinfi.vercel.app/verify"><b>Verify</b></a> ·
  <a href="https://jitsuinfi-console-demo.vercel.app/console"><b>Console demo</b></a> ·
  <a href="https://youtu.be/RB9hKSLarJo"><b>2-min video</b></a>
</p>

<p align="center">
  <a href="https://youtu.be/RB9hKSLarJo"><img src=".github/readme/video-thumb.jpg" alt="Watch the 2-minute demo on YouTube" width="760"></a>
  <br><sub>Two minutes: the idea, a double-financing attempt caught live on the testnet board, and a whole deal from supplier to settlement.</sub>
</p>

Web app for **JitsuinFi**: supplier, buyer and fund-member desks with a sealed inbox, the financier console, a verify page for auditors and judges, and a page showing what outsiders can see. All cryptography runs in the browser through `jitsuin-wasm` (from `jitsuinfi-zcash`), so the page never has to trust a server's verdict.

Live: <https://jitsuinfi.vercel.app> (landing), [/app](https://jitsuinfi.vercel.app/app) (the app; installable as a PWA), [/verify](https://jitsuinfi.vercel.app/verify), financier console demo <https://jitsuinfi-console-demo.vercel.app/console>. Testnet txids of real deals: [jitsuinfi-zcash README](https://github.com/JitsuinFi/jitsuinfi-zcash#for-judges-verify-the-testnet-board). Other repos: [jitsuinfi-node](https://github.com/JitsuinFi/jitsuinfi-node) (financier node and console API), [jitsuinfi-backend](https://github.com/JitsuinFi/jitsuinfi-backend) (relay).

- React 19 and TanStack Router (HNK-31, D-52): one static single-page app with routes from files in `src/routes/`, built by Vite. Next.js was ruled out: its inline scripts break the strict CSP below.
- No CDN, no third-party requests, no trackers, no inline script. A strict Content-Security-Policy is sent by Vercel (`vercel.json`) and written into the built `index.html` (`'wasm-unsafe-eval'` is the only relaxation, needed for WebAssembly).
- Keys come from a passkey (WebAuthn PRF extension): no seed phrase, no key stored. A test secret stands in on devices without PRF.
- Keys stay in page memory. Deal documents (invoices, signatures, letters, seals, keys handed out, contacts) are kept on the device in IndexedDB, sealed with AES-GCM under a key derived from the passkey, with HMAC record names so the store does not show which invoices it holds (`src/lib/store.ts`).
- The same records sync to the account's other devices (same passkey) through the relay's one state per mailbox: AES-GCM under a key from the passkey, inside a seal to the owner's own mailbox, so the relay sees only ciphertext, its size and when it changes (`src/lib/sync.ts`). A form being written survives a reload, sealed in the tab's session storage and cleared when the tab closes or the action succeeds (`src/app/kept.ts`).
- Registering on the board, the Sign-to-Pay advance and the repayment watchdog run in the financier's node ([`jitsuinfi-node`](https://github.com/JitsuinFi/jitsuinfi-node), built on `jitsuin-flow`); this app covers what the browser does and verifies.

<table>
  <tr>
    <td width="50%" valign="top"><img src=".github/readme/town.webp" alt="Kota Piutang, the landing's 3D town" width="100%"><br><b>Kota Piutang, the landing's 3D town</b><br><sub>A cel-shaded receivables town (three.js) plays one invoice's life: seal, fingerprint to the board, advance, a copy refused, settled.</sub></td>
    <td width="50%" valign="top"><img src=".github/readme/seal.webp" alt="One fingerprint per invoice" width="100%"><br><b>One fingerprint per invoice</b><br><sub>The buyer's jitsuin seals the invoice; only its fingerprint N reaches the public board.</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src=".github/readme/try.webp" alt="/try: try to double-finance" width="100%"><br><b>/try: try to double-finance</b><br><sub>Case File #0417 against the live testnet board: 偽 when a digit changes, 重 when it is sold twice.</sub></td>
    <td width="50%" valign="top"><img src=".github/readme/deal.webp" alt="Phone first" width="100%"><br><b>Phone first</b><br><sub>Supplier and buyer on phones: write, deliver sealed, sign with one passkey touch.</sub></td>
  </tr>
</table>

## Map of the app

```mermaid
flowchart TD
    L["/ landing<br/>3D receivables town"]:::sys --> APP["/app<br/>登記所 lobby"]:::sys
    APP --> PUB
    APP --> ROLES
    subgraph PUB [Open to anyone, no account]
      T["/try<br/>try to double-finance"]:::seal
      V["/verify<br/>bundle, proof, Exhibit A"]:::sys
      O["/outsider<br/>what the chain shows"]:::zcash
      RT["/rates<br/>k ≥ 5 rate index"]:::zcash
    end
    subgraph ROLES [With your passkey]
      SU["Supplier<br/>write, offer, seal"]:::human
      BU["Buyer<br/>sign, seal, pay by QR, history"]:::human
      FM["Fund member<br/>deposit, units"]:::human
    end
    CON["Financier console<br/>on the node's own host"]:::human
    SU -. sealed letters .- BU
    SU -. offer .- CON
    classDef human fill:#FCFCFE,stroke:#7E2A53,color:#461D3A,stroke-width:2px
    classDef zcash fill:#020D2F,stroke:#1D97F1,color:#C4C7F2,stroke-width:2px
    classDef sys fill:#F6F5FC,stroke:#032C7D,color:#020D2F,stroke-width:2px
    classDef seal fill:#7E2A53,stroke:#461D3A,color:#FCFCFE,stroke-width:2px
```

<p align="center"><img src=".github/readme/route.svg" alt="The deal route: 照 sent to the buyer, 署 buyer signs, 登 public record, 印 financing letter sealed, 金 advance, 済 settled" width="100%"></p>

## Flow in this repo (frontend)

Everything secret stays in the page: keys come from the passkey, signing and verification run in `jitsuin-wasm`, and only sealed ciphertext leaves the browser.

**Sequence: a buyer signs an invoice, then anyone verifies a deal**

```mermaid
sequenceDiagram
    autonumber
    actor U as Buyer
    participant P as Page (React)
    participant K as Passkey (WebAuthn PRF)
    participant W as jitsuin-wasm
    participant D as IndexedDB (sealed)
    participant R as Relay /api
    participant N as Node /api/board
    U->>P: open inbox (bell)
    P->>K: get assertion with PRF
    K-->>P: PRF output (stays in page memory)
    P->>W: derive buyer keys, mailbox key
    P->>R: challenge, proof, read token
    R-->>P: sealed invoice letter
    P->>W: open seal, check invoice bytes and PDF hash
    U->>P: Sign invoice (one passkey touch)
    P->>W: sign canonical invoice
    P->>D: keep the record (AES-GCM, HMAC names)
    P->>R: POST signature sealed to the supplier's mailbox
    Note over P,N: /verify, no account
    U->>P: paste deal file, proof or Exhibit A
    P->>N: GET live board (falls back to the last kept copy)
    P->>W: check seals, entries, order against the board
    W-->>P: 真 genuine / 重 double financed / 偽 forged
```

**DFD: what the browser keeps and sends**

```mermaid
flowchart LR
    U[User<br/>supplier, buyer, member]:::human
    PK[Passkey<br/>platform authenticator]:::human
    RL[Relay<br/>jitsuinfi-backend]:::sys
    ND[Financier node<br/>/api/board]:::zcash
    P1((1.0<br/>Unlock keys<br/>PRF → keys)):::seal
    P2((2.0<br/>Write, sign,<br/>seal documents)):::sys
    P3((3.0<br/>Inbox:<br/>send, read)):::sys
    P4((4.0<br/>Sync devices)):::sys
    P5((5.0<br/>Verify, outsider,<br/>rates)):::sys
    D1[(D1 page memory<br/>keys, never stored)]:::store
    D2[(D2 IndexedDB<br/>sealed records)]:::store
    D3[(D3 session storage<br/>sealed drafts)]:::store
    D4[(D4 localStorage<br/>last public board)]:::store
    U -- passkey touch --> P1
    PK -- PRF output --> P1
    P1 -- keys --> D1
    U -- invoice fields, PDF --> P2
    D1 -- keys --> P2
    P2 -- records --> D2
    P2 -- form in progress --> D3
    P2 -- sealed letters --> P3
    P3 <-- ciphertext --> RL
    D2 -- records --> P4
    P4 <-- sealed state blob --> RL
    ND -- board entries --> P5
    P5 -- last board --> D4
    U -- bundle, proof, Exhibit A --> P5
    P5 -- verdict --> U
    classDef human fill:#FCFCFE,stroke:#7E2A53,color:#461D3A,stroke-width:2px
    classDef zcash fill:#020D2F,stroke:#1D97F1,color:#C4C7F2,stroke-width:2px
    classDef sys fill:#F6F5FC,stroke:#032C7D,color:#020D2F,stroke-width:2px
    classDef seal fill:#7E2A53,stroke:#461D3A,color:#FCFCFE,stroke-width:2px
    classDef store fill:#ECD0EC,stroke:#7E2A53,color:#461D3A,stroke-width:1px
```
<sub>DFD legend: rectangles are external entities, circles are processes, cylinders are data stores; arrows carry the named data.</sub>

## Design: seal ink on document paper, Zcash as the deep pool

Shippori Mincho B1 for display, Geist for text, Geist Mono for real data only. Ten colours, no pure black or white: blues are Zcash (the shielded pool), plums are people (ink, signatures, the registered seal). Dark Raspberry is the only red, kept for the seal and primary actions. Full rules: [`MASTER.md`](MASTER.md).

<p align="center"><img src=".github/readme/palette.svg" alt="The JitsuinFi palette" width="100%"></p>

## Pages

<details>
<summary>All routes and where their code lives</summary>

| Path | What | Code |
|---|---|---|
| `/` | Landing, six chapters | `src/app/Landing.tsx`, `src/landing/` |
| `/app` | The 登記所 lobby | `src/app/Lobby.tsx` |
| `/try`, `/try/play` | Try to double-finance (Case File #0417); `/try/play` plays itself for the video | `src/pages/TryPage.tsx`, `src/pages/try/` |
| `/verify`, `/outsider`, `/rates` | Verify a bundle, proof or Exhibit A; what outsiders see; the public rate index | `src/pages/VerifyPage.tsx`, `OutsiderPage.tsx`, `RatesPage.tsx` |
| `/account` | Sign-in (passkey) and the account menu | `src/pages/AccountPage.tsx` |
| `/supplier/invoices`, `/supplier/invoices/new`, `/supplier/deal/$ref`, `/supplier/contacts` | Supplier desk: invoices, write an invoice, one deal's steps, contacts | `src/pages/supplier/` |
| `/buyer/invoices`, `/buyer/invoices/$ref`, `/buyer/invoices/key`, `/buyer/pay`, `/buyer/history`, `/buyer/contacts` | Buyer desk: invoices to sign, the key for a supplier, repay by ZIP-321 QR, the payment history, contacts | `src/pages/buyer/` |
| `/member/fund`, `/member/units`, `/member/contacts` | Fund member: deposit and withdraw, check each holding against the period's root, contacts | `src/pages/member/` |
| `/app/contact` | A contact link (`/app/contact#<card>`): the card stays in the fragment, is checked and added in one confirm | `src/pages/ContactLinkPage.tsx` |
| `/financier` | A financier simulation, by address only; real financiers use the console | `src/pages/FinancierPage.tsx` |
| `/apply` | Apply for a financier node | `src/pages/ApplyPage.tsx` |
| `/console`, `/console/pair` | Financier console, on the console's own host (D-45) | `src/console/` |

A role page opens only in a session of that role. Signed in, a bell opens one inbox sheet for every sealed letter (a full-height sheet on a phone), with each letter's action inline (`src/app/InboxPanel.tsx`). `manifest.webmanifest` makes the app installable; the console host serves its own manifest (`console.webmanifest`). QR codes are scanned in the app (BarcodeDetector, or jsQR 1.4.0 where it is missing; `src/app/Scanner.tsx`, `src/lib/scan.ts`) under `Permissions-Policy: camera=(self)`.

The landing, the app and the console are three worlds loaded on demand; moving between them reloads the page, so their stylesheets never meet. Old addresses (`app.html#/supplier`, `#/index`, `console.html?view=pair`) are moved to these paths (`src/lib/legacy-url.ts`).

</details>

## Run

```bash
npm install
npm run wasm      # builds jitsuin-wasm from ../jitsuinfi-zcash into src/wasm/
npm run dev       # or: npm run build && npm run preview
```

Needs Rust with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli 0.2.129` (see the `jitsuinfi-zcash` README). Status: in development for ZECATHON 2026, testnet.

**Network, in one place** (HNK-26.T19): the build is testnet unless `VITE_NETWORK=main` is set when building (`src/lib/network.ts`: labels, the shielded address check). The financier node takes `NETWORK` from its environment and the `jitsuin` CLI reads the network from the viewing key it is given, so a mainnet build never accepts a testnet address and the node refuses a board key of the other network.

<p align="center"><img src=".github/readme/outro.webp" alt="Zcash stops double-spending. JitsuinFi stops double-financing." width="640"></p>

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT), at your option. Unless you explicitly state otherwise, any contribution you submit for inclusion in this work, as defined in the Apache-2.0 license, is dual licensed as above, without any additional terms or conditions.
