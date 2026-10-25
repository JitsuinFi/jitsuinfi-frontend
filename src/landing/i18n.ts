// The landing's two languages: English and Simplified Chinese. Elements bind to a key; switching
// rewrites every bound text in place (no reload) and sets <html lang>. The choice is remembered
// in localStorage when the browser allows it. Kanji in seals and signs stay as they are: they are
// part of the drawings, and readable in both.

export type Lang = "en" | "zh";
type Params = Record<string, string | number>;
type Entry = { en: string; zh: string };

const D: Record<string, Entry> = {
  // nav and hero
  "nav.how": { en: "How it works", zh: "运作方式" },
  "nav.spec": { en: "Read the spec", zh: "阅读规范" },
  "nav.demo": { en: "Open the demo", zh: "打开演示" },
  "nav.signin": { en: "Sign in", zh: "登录" },
  "nav.lang": { en: "Language", zh: "语言" },
  "nav.main": { en: "Main", zh: "主导航" },
  "nav.top": { en: "JitsuinFi, top of page", zh: "JitsuinFi，回到页首" },
  "hero.rail": { en: "Story", zh: "故事" },
  "hero.chip": { en: "Testnet", zh: "测试网" },
  "hero.badge": { en: "Live on Zcash testnet, Ironwood pool", zh: "已在 Zcash 测试网（Ironwood 池）运行" },
  "hero.lede": {
    en: "The private invoice fund on Zcash. Every receivable leaves one fingerprint on a public board, so it is registered once and financed once. Amounts, parties and documents stay in the shielded pool.",
    zh: "Zcash 上的私密发票基金。每笔应收账款在公开登记板上只留下一个指纹，因此只能登记一次、融资一次。金额、交易方和文件都保存在屏蔽池中。",
  },
  "hero.demo": { en: "Open the demo", zh: "打开演示" },
  "hero.watch": { en: "Watch it catch a double", zh: "看它识破重复融资" },
  "hero.registered": { en: "Registered on testnet", zh: "已在测试网登记" },
  "hero.block": { en: "block", zh: "区块" },
  "hero.pause": { en: "Pause the story", zh: "暂停故事" },
  "hero.play": { en: "Play the story", zh: "播放故事" },
  "hero.episode": { en: "Play episode {i}: {title}", zh: "播放第 {i} 集：{title}" },
  "hero.story": {
    en: "An illustrated town plays the life of one invoice: the supplier ships goods, the buyer seals the invoice, only its fingerprint N is posted to a public board while the invoice sinks into a shielded vault, a financier advances cash, a copy sent to a second financier is refused because the same N is already on the board, and the buyer pays on the due date.",
    zh: "一座插画小镇演绎一张发票的一生：供应商发货，买方在发票上盖章，只有它的指纹 N 被公布到公开登记板上，发票本身沉入屏蔽金库；资金方预付现金；送往第二家资金方的副本被拒绝，因为登记板上已有相同的 N；到期日买方付款。",
  },
  "ep1.kanji": { en: "第一話", zh: "第一集" },
  "ep1.title": { en: "The invoice is born", zh: "发票诞生" },
  "ep1.line": { en: "A supplier ships the goods and invoices the buyer: 0.0004 ZEC, due in 60 days.", zh: "供应商发货并向买方开具发票：0.0004 ZEC，60 天后到期。" },
  "ep2.kanji": { en: "第二話", zh: "第二集" },
  "ep2.title": { en: "The buyer's seal", zh: "买方的印章" },
  "ep2.line": { en: "The buyer presses a jitsuin on it. The invoice now has one fingerprint, N.", zh: "买方在发票上盖下实印。发票从此拥有唯一的指纹 N。" },
  "ep3.kanji": { en: "第三話", zh: "第三集" },
  "ep3.title": { en: "One fingerprint, one board", zh: "一个指纹，一块登记板" },
  "ep3.line": { en: "Only N goes up on the public board. The invoice itself sinks into the shielded vault.", zh: "只有 N 被公布在公开登记板上，发票本身沉入屏蔽金库。" },
  "ep4.kanji": { en: "第四話", zh: "第四集" },
  "ep4.title": { en: "Financed once", zh: "只融资一次" },
  "ep4.line": { en: "A financier looks N up, finds it once, and advances cash to the supplier.", zh: "资金方查询 N，确认只出现一次，然后向供应商预付现金。" },
  "ep5.kanji": { en: "第五話", zh: "第五集" },
  "ep5.title": { en: "Financed twice?", zh: "重复融资？" },
  "ep5.line": { en: "A copy flies to a second financier. Same N already on the board: the gate shuts.", zh: "一份副本飞向第二家资金方。登记板上已有相同的 N：大门关闭。" },
  "ep6.kanji": { en: "第六話", zh: "第六集" },
  "ep6.title": { en: "Paid and remembered", zh: "付清并留档" },
  "ep6.line": { en: "On the due date the buyer pays. Both sign, and the buyer's record grows.", zh: "到期日买方付款。双方签署，买方的信用记录随之增长。" },

  // chapter 2
  "fp.kanji": { en: "指紋 · Chapter 2", zh: "指纹 · 第 2 章" },
  "fp.title": { en: "One fingerprint per invoice.", zh: "每张发票，\n一个指纹。" },
  "fp.lede": {
    en: "N is a BLAKE2b-256 hash of the invoice’s exact bytes. The same invoice always gives the same N; change one zat and almost every digit changes. The board keeps N, never the invoice.",
    zh: "N 是对发票精确字节计算的 BLAKE2b-256 哈希。同一张发票总是得到同一个 N；改动一个 zat，几乎每一位都会改变。登记板只保存 N，从不保存发票。",
  },
  "fp.note": { en: "Try it: this runs jitsuin-wasm in your browser. Nothing is sent.", zh: "试试看：这在你的浏览器中运行 jitsuin-wasm，不会发送任何数据。" },
  "fp.sheet": { en: "Test invoice", zh: "测试发票" },
  "doc.invoice": { en: "Invoice", zh: "发票" },
  "doc.supplier": { en: "Supplier", zh: "供应商" },
  "doc.buyer": { en: "Buyer", zh: "买方" },
  "doc.financier": { en: "Financier", zh: "资金方" },
  "doc.amountZat": { en: "Amount (zat)", zh: "金额（zat）" },
  "doc.amount": { en: "Amount", zh: "金额" },
  "doc.due": { en: "Due", zh: "到期日" },
  "doc.terms": { en: "Terms", zh: "条款" },
  "doc.payTo": { en: "Pay to", zh: "收款地址" },
  "doc.fingerprint": { en: "Fingerprint N", zh: "指纹 N" },
  "fp.less": { en: "One zat less", zh: "减少一个 zat" },
  "fp.more": { en: "One zat more", zh: "增加一个 zat" },
  "fp.reset": { en: "Back to TES-INV-0007", zh: "恢复为 TES-INV-0007" },
  "fp.asRegistered": { en: "The invoice as registered.", zh: "已登记的发票。" },
  "fp.changed": { en: "{d} of 64 digits changed.", zh: "64 位中有 {d} 位改变。" },
  "fp.changedBack": { en: "Back to the registered invoice: {d} of 64 digits changed back.", zh: "已恢复为登记的发票：{d} 位改回。" },
  "fp.onBoard": { en: "already on the board · a second financing is refused", zh: "已在登记板上 · 第二次融资将被拒绝" },
  "fp.newN": { en: "new fingerprint · not on the board", zh: "新指纹 · 不在登记板上" },
  "fp.invalid": { en: "That invoice is not valid: {msg}", zh: "该发票无效：{msg}" },
  "pr.core": { en: "core", zh: "核心" },
  "pr.ridges": { en: "{n} ridges", zh: "{n} 条纹线" },
  "pr.tilt": { en: "tilt {deg}", zh: "倾角 {deg}" },
  "pr.rings": { en: "whorl", zh: "斗形纹" },
  "pr.spiral": { en: "spiral whorl", zh: "螺旋斗形纹" },
  "pr.loop": { en: "loop", zh: "箕形纹" },
  "pr.byte": { en: "byte {b}", zh: "字节 {b}" },
  "pr.bytes": { en: "bytes {b}", zh: "字节 {b}" },

  // chapter 3
  "sc.kanji": { en: "連署 · Chapter 3", zh: "联署 · 第 3 章" },
  "sc.title": { en: "Three seals, then the money moves.", zh: "三枚印章，\n资金才会流动。" },
  "sc.lede": {
    en: "The assignment letter hands the invoice to the financier. The supplier seals it, then the buyer, then the financier, each over the seals before. Only a whole chain releases the advance: Sign-to-Pay.",
    zh: "债权转让通知书把发票交给资金方。先由供应商盖章，再由买方，最后由资金方，每一枚都盖在前一枚之上。只有完整的印章链才会放款：签署即付款（Sign-to-Pay）。",
  },
  "sc.note": { en: "Each press makes a real Ed25519 seal in your browser with test keys. Nothing is sent.", zh: "每按一次都会在你的浏览器中用测试密钥生成真实的 Ed25519 印章，不会发送任何数据。" },
  "sc.aria": { en: "Assignment letter", zh: "债权转让通知书" },
  "sc.dueVal": { en: "18 Dec 2026", zh: "2026 年 12 月 18 日" },
  "sc.letter": { en: "Notice of assignment", zh: "债权转让通知" },
  "sc.unsealed": { en: "unsealed", zh: "未盖章" },
  "sc.seal": { en: "seal {b}…", zh: "印章 {b}…" },
  "sc.press.supplier": { en: "Press the supplier’s seal", zh: "盖下供应商的印章" },
  "sc.press.buyer": { en: "Press the buyer’s seal", zh: "盖下买方的印章" },
  "sc.press.financier": { en: "Press the financier’s seal", zh: "盖下资金方的印章" },
  "sc.tamper": { en: "Change one zat on the sealed letter", zh: "在已盖章的通知书上改动一个 zat" },
  "sc.reset": { en: "Start over", zh: "重新开始" },
  "sc.wait.supplier": { en: "Waiting for the supplier’s seal.", zh: "等待供应商盖章。" },
  "sc.wait.buyer": { en: "Waiting for the buyer’s seal.", zh: "等待买方盖章。" },
  "sc.wait.financier": { en: "Waiting for the financier’s seal.", zh: "等待资金方盖章。" },
  "sc.sealed": { en: "Sealed by all three. The advance is released.", zh: "三方均已盖章，预付款已放出。" },
  "sc.refused": { en: "Refused: {msg}", zh: "被拒绝：{msg}" },
  "sc.broken": { en: "One zat changed, the seals no longer match: {msg}. Financing refused.", zh: "改动了一个 zat，印章不再匹配：{msg}。融资被拒绝。" },
  "sc.advance": { en: "+ 0.0004 ZEC advance", zh: "+ 0.0004 ZEC 预付款" },
  // chapter 3, the seal desk figure (labels drawn inside the SVG)
  "sc.fig.aria": {
    en: "A seal desk. An assignment letter with three empty seal circles for supplier, buyer and financier lies in front of a rack of three hanko seals. Behind it a gate holds a coin at the top of a chute that runs into the shielded pool. Each seal lifts one latch of the gate; after the third, the shutter rises and the coin rolls into the pool.",
    zh: "一张盖章桌。债权转让通知书上有供应商、买方、资金方三个空印位，前面是放着三枚印章的印架。后面的闸门把一枚硬币挡在滑槽顶端，滑槽通向屏蔽池。每盖一枚印章就抬起闸门的一个闩；盖完第三枚，挡板升起，硬币滚入池中。",
  },
  "sc.fig.pool": { en: "SHIELDED POOL", zh: "屏蔽池" },
  "sc.fig.supplier": { en: "supplier", zh: "供应商" },
  "sc.fig.buyer": { en: "buyer", zh: "买方" },
  "sc.fig.financier": { en: "financier", zh: "资金方" },
  "sc.fig.hint": { en: "It plays by itself. Press a seal (売, 買, 融 or keys 1, 2, 3) to take over.", zh: "它会自动播放。点击印章（売、買、融，或按键 1、2、3）即可自己操作。" },

  // chapter 5
  "hs.kanji": { en: "履歴 · Chapter 5", zh: "履历 · 第 5 章" },
  "hs.title": { en: "Paid, and remembered.", zh: "付清，\n并被记住。" },
  "hs.lede": {
    en: "Every invoice the buyer receives adds a certificate to its own chain, tied to one entry on the board. A new financier checks the chain offline and learns how the buyer paid, never whom it paid. Leave one invoice out and the chain no longer closes.",
    zh: "买方收到的每一张发票，都会在它自己的链上添加一张证书，并与登记板上的一条记录绑定。新的资金方离线检查这条链，就能知道买方如何付款，却无从得知付给了谁。漏掉任何一张发票，链就无法闭合。",
  },
  "hs.note": { en: "Eight certificates, their board entries and the settlements are made in your browser with jitsuin-wasm and test keys. Nothing is sent.", zh: "八张证书、对应的登记和结清记录都在你的浏览器中用 jitsuin-wasm 和测试密钥生成，不会发送任何数据。" },
  "hs.aria": { en: "The buyer’s payment history, April to December 2026: eight invoices on a ribbon, each tied to the public board", zh: "买方 2026 年 4 月至 12 月的付款履历：八张发票排在一条纸带上，每张都与公开登记板相连" },
  "hs.board": { en: "public board · N and a tag, nothing else", zh: "公开登记板 · 只有 N 和标签" },
  "hs.today": { en: "today · 19 Oct", zh: "今天 · 10月19日" },
  "hs.paidOn": { en: "paid {d}", zh: "{d} 付清" },
  "hs.due": { en: "due {d}", zh: "{d} 到期" },
  "hs.onTime": { en: "on time", zh: "按时" },
  "hs.late": { en: "{n} days late", zh: "逾期 {n} 天" },
  "hs.open": { en: "open", zh: "未结" },
  "hs.t.onTime": { en: "paid on time", zh: "按时付清" },
  "hs.t.late": { en: "paid late", zh: "逾期付清" },
  "hs.t.default": { en: "defaults", zh: "违约" },
  "hs.t.open": { en: "open", zh: "未结" },
  "hs.pay": { en: "Pay TES-INV-0007 today", zh: "今天支付 TES-INV-0007" },
  "hs.paid": { en: "Paid and settled", zh: "已付清并结清" },
  "hs.hide": { en: "Hide the late invoice", zh: "隐藏逾期的那张发票" },
  "hs.unhide": { en: "Put it back", zh: "放回去" },
  "hs.reset": { en: "Start over", zh: "重新开始" },
  "hs.slip": { en: "Repayment request · ZIP-321", zh: "还款请求 · ZIP-321" },
  "hs.slipTo": { en: "0.0004 ZEC to the financier; the buyer’s receipt rides in the memo", zh: "0.0004 ZEC 付给资金方，买方收据附在备注中" },
  "hs.working": { en: "Building the history…", zh: "正在生成履历…" },
  "hs.ok": { en: "Verified offline: {n} certificates, one unbroken chain, each tied to the board.", zh: "离线验证通过：{n} 张证书，一条完整的链，每张都与登记板相连。" },
  "hs.caught": { en: "Refused: {msg}. A buyer cannot leave a late invoice out.", zh: "被拒绝：{msg}。买方无法隐瞒逾期的发票。" },
  "hs.stats": { en: "{c} certificates · {e} board entries · checked in {ms} ms", zh: "{c} 张证书 · {e} 条登记 · 用时 {ms} 毫秒" },

  // chapter 6
  "fn.kanji": { en: "結び · Chapter 6", zh: "结语 · 第 6 章" },
  "fn.title": { en: "On testnet, it already happened.", zh: "在测试网上，\n这一切已经发生。" },
  "fn.lede": {
    en: "One invoice, TES-INV-0003, lived the whole story on Zcash testnet: registered, advanced, repaid, settled, then offered to a second financier and caught. These are its five real transactions.",
    zh: "一张发票 TES-INV-0003 在 Zcash 测试网上走完了整个故事：登记、预付、还款、结清，随后被送往第二家资金方并被识破。下面是它的五笔真实交易。",
  },
  "fn.lens": { en: "Who is looking", zh: "谁在看" },
  "fn.outsider": { en: "As an outsider", zh: "以旁观者身份" },
  "fn.withKey": { en: "With the viewing key", zh: "持有查看密钥" },
  "fn.copy": { en: "Copy the transaction id", zh: "复制交易 ID" },
  "fn.copied": { en: "Copied", zh: "已复制" },
  "fn.shielded": { en: "shielded", zh: "屏蔽交易" },
  "fn.block": { en: "block {h}", zh: "区块 {h}" },
  "fn.fee": { en: "fee 0.0001 TAZ", zh: "手续费 0.0001 TAZ" },
  "fn.a.name": { en: "Registered", zh: "登记" },
  "fn.a.memo": { en: "Register entry: the invoice’s N, financier A’s salted commitment, the supplier’s signature.", zh: "登记记录：发票的 N、资金方 A 的加盐承诺、供应商的签名。" },
  "fn.advance.name": { en: "Advanced", zh: "预付" },
  "fn.advance.memo": { en: "The advance to the supplier, released by the three seals: the financier’s receipt and seal ride in the memo.", zh: "三枚印章放行的预付款：资金方的收据和印章附在备注中。" },
  "fn.repay.name": { en: "Repaid", zh: "还款" },
  "fn.repay.memo": { en: "The buyer pays the financier by ZIP-321; its receipt and claim seal ride in the memo.", zh: "买方通过 ZIP-321 向资金方付款；收据和结清印章附在备注中。" },
  "fn.settled.name": { en: "Settled", zh: "结清" },
  "fn.settled.memo": { en: "Settled entry, signed by buyer and financier, on time. Without N, its tag cannot be linked to the register entry.", zh: "结清记录，由买方和资金方签名，按时。不知道 N 的人无法把它的标签与登记记录关联。" },
  "fn.b.name": { en: "Caught", zh: "识破" },
  "fn.b.memo": { en: "The same N, offered to financier B. It reached the board second, so it loses, and the two entries are the double-signature proof.", zh: "同一个 N 被送往资金方 B。它第二个上板，因此无效，两条登记构成双重签名证明。" },
  "fn.caption": {
    en: "An explorer sees five shielded transactions. Parties, amounts and memos stay encrypted; only the holder of a viewing key reads them. Copy any id to look it up on a testnet explorer.",
    zh: "区块浏览器只能看到五笔屏蔽交易。交易方、金额和备注都保持加密，只有持有查看密钥的人才能读取。复制任意 ID 即可在测试网浏览器上查询。",
  },
  "fn.line1": { en: "Zcash stops double-spending.", zh: "Zcash 杜绝双重支付。" },
  "fn.line2": { en: "JitsuinFi stops double-financing.", zh: "JitsuinFi 杜绝重复融资。" },
  "fn.foot": { en: "ZECATHON 2026 · Private Markets. Every key on this page is a test key derived from a TES- label.", zh: "ZECATHON 2026 · Private Markets。本页所有密钥都是由 TES- 标签派生的测试密钥。" },

  // chapter 4
  "tw.k.n": { en: "invoice fingerprint N", zh: "发票指纹 N" },
  "tw.k.c": { en: "financier commitment", zh: "融资方承诺" },
  "tw.kanji": { en: "二重 · Chapter 4", zh: "二重 · 第 4 章" },
  "tw.title": { en: "Pressed twice, caught once.", zh: "盖了两次，\n一次识破。" },
  "tw.lede": {
    en: "A supplier who signs one invoice for two financiers leaves two signatures on one N. The second financier finds N on the board, refuses, and keeps both entries: a proof anyone can check, offline.",
    zh: "供应商若把同一张发票签给两家资金方，就会在同一个 N 上留下两个签名。第二家资金方在登记板上找到 N，拒绝融资，并保留两条登记：一份任何人都能离线验证的证明。",
  },
  "tw.note": { en: "This flow runs itself in your browser with jitsuin-wasm and test keys; every station is a real call. Nothing is sent.", zh: "这个流程在你的浏览器中用 jitsuin-wasm 和测试密钥自动运行，每一站都是真实的调用，不会发送任何数据。" },
  "tw.st.invoice": { en: "Sealed invoice", zh: "已盖章的发票" },
  "tw.st.entryA": { en: "Entry for financier A", zh: "给资金方 A 的登记" },
  "tw.st.entryB": { en: "Entry for financier B", zh: "给资金方 B 的登记" },
  "tw.st.board": { en: "Public board", zh: "公开登记板" },
  "tw.st.lookup": { en: "B looks N up", zh: "B 查询 N" },
  "tw.st.same": { en: "Same N, another financier", zh: "相同的 N，另一家资金方" },
  "tw.st.refuse": { en: "B refuses", zh: "B 拒绝融资" },
  "tw.st.proof": { en: "Proof, checked offline", zh: "证明，离线验证" },
  "tw.signedBy": { en: "signed by the supplier", zh: "由供应商签名" },
  "tw.toFin": { en: "to Financier {x}", zh: "给资金方 {x}" },
  "tw.found": { en: "found on the board", zh: "在登记板上找到" },
  "tw.notFound": { en: "not on the board", zh: "不在登记板上" },
  "tw.registered": { en: "registered", zh: "已登记" },
  "tw.again": { en: "again", zh: "重复" },
  "tw.refused": { en: "not financed", zh: "不予融资" },
  "tw.verified": { en: "verified", zh: "已验证" },
  "tw.run": { en: "Run it again", zh: "再运行一次" },
  "tw.idle": { en: "Runs by itself when it comes into view.", zh: "进入视野时自动运行。" },
  "tw.running": { en: "Running…", zh: "运行中…" },
  "tw.done": { en: "Done: double financing caught, proof verified.", zh: "完成：识破重复融资，证明已验证。" },
  "tw.stopped": { en: "Stopped: {msg}", zh: "已停止：{msg}" },
  "tw.log.invoice": { en: "The buyer’s sealed invoice gives its fingerprint N", zh: "买方盖章的发票给出它的指纹 N" },
  "tw.log.entryA": { en: "The supplier signs a register entry, committed to financier A", zh: "供应商签署一条登记，承诺给资金方 A" },
  "tw.log.entryB": { en: "The same supplier key signs a second entry, committed to financier B", zh: "同一把供应商密钥签署第二条登记，承诺给资金方 B" },
  "tw.log.board": { en: "Entry A is posted: N is on the public board", zh: "登记 A 已发布：N 出现在公开登记板上" },
  "tw.log.lookup": { en: "Financier B looks N up before paying", zh: "资金方 B 在付款前查询 N" },
  "tw.log.same": { en: "Same N, under another financier’s commitment", zh: "相同的 N，却属于另一家资金方的承诺" },
  "tw.log.refuse": { en: "Financier B refuses to finance it", zh: "资金方 B 拒绝为其融资" },
  "tw.log.proof": { en: "Both entries kept as a double-signature proof, verified offline", zh: "两条登记被保留为双重签名证明，并离线验证" },
  "tw.proof": { en: "Double-signature proof", zh: "双重签名证明" },
  "tw.p.n": { en: "Fingerprint N", zh: "指纹 N" },
  "tw.p.by": { en: "Signed by", zh: "签名者" },
  "tw.p.a": { en: "Entry 1 · financier", zh: "登记 1 · 资金方" },
  "tw.p.b": { en: "Entry 2 · financier", zh: "登记 2 · 资金方" },
  "tw.p.size": { en: "Proof", zh: "证明" },
  "tw.p.sizeVal": { en: "JTSP · {n} bytes · checked offline", zh: "JTSP · {n} 字节 · 离线验证" },
  "tw.p.verdict": { en: "Verified: one supplier key signed one N for two financiers.", zh: "已验证：同一把供应商密钥为同一个 N 签给了两家资金方。" },
  "tw.p.supplier": { en: "supplier {k}", zh: "供应商 {k}" },
  "tw.p.commit": { en: "commitment {k}", zh: "承诺 {k}" },
};

const KEY = "jitsuinfi.lang";
let lang: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "zh") return v;
  } catch {
    /* private mode or blocked storage: default */
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
})();

export const getLang = (): Lang => lang;

export function t(key: string, params: Params = {}): string {
  const e = D[key];
  let s = e ? e[lang] : key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Bound texts (the fingerprint print's callouts, drawn as DOM): element → slot → how to rewrite it. */
const bound = new Map<Element, Map<string, () => void>>();
const listeners = new Set<() => void>();
const bind = (el: Element, slot: string, paint: () => void) => {
  let slots = bound.get(el);
  if (!slots) bound.set(el, (slots = new Map()));
  slots.set(slot, paint);
  paint();
};

/** Sets an element's text from a key now and on every switch. */
export function tx<E extends Element>(el: E, key: string, params: Params = {}): E {
  bind(el, "text", () => (el.textContent = t(key, params)));
  return el;
}

/** Calls `f` on every switch, not now; returns the unsubscribe (for React components). */
export function subscribeLang(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* not remembered: fine */
  }
  document.documentElement.lang = next === "zh" ? "zh-Hans" : "en";
  bound.forEach((slots, el) => (el.isConnected ? slots.forEach((paint) => paint()) : bound.delete(el)));
  listeners.forEach((f) => f());
}

document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
