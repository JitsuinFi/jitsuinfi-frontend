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
  "nav.demoShort": { en: "Demo", zh: "演示" },
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
  "hero.pitch": { en: "Watch the pitch", zh: "观看路演视频" },
  "pitch.title": { en: "JitsuinFi, the pitch", zh: "JitsuinFi 路演视频" },
  "pitch.close": { en: "Close the video", zh: "关闭视频" },
  "pitch.frame": { en: "JitsuinFi pitch video", zh: "JitsuinFi 路演视频播放器" },
  "pitch.alt": { en: "Open on YouTube", zh: "在 YouTube 上打开" },
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
  "fp.st.feed": { en: "Lever down: {id} feeds into the press.", zh: "压杆按下：{id} 送入压印机。" },
  "fp.st.hash": { en: "Hashing the whole invoice (BLAKE2b-256)…", zh: "正在对整张发票做哈希（BLAKE2b-256）……" },
  "fp.st.print": { en: "N {n} goes on the public board; the paper drops into the shielded vault.", zh: "N {n} 印上公开登记板；纸质发票落入屏蔽金库。" },
  // chapter 2, the registry press figure (labels drawn inside the SVG)
  "fp.fig.aria": {
    en: "A registry press. A paper invoice, TES-INV-0007, lies in a feed tray in front of it. Pulling the lever feeds it into the press, where a hashing drum turns; a print carriage then stamps the invoice’s short fingerprint N on the next ruled line of an open public board, and the paper invoice drops into the shielded vault under the board. Only N is public.",
    zh: "一台登记压印机。纸质发票 TES-INV-0007 放在前方的进纸托盘里。拉下压杆，发票被送入压印机，哈希滚筒随之转动；随后打印滑架把发票的短指纹 N 印在公开登记簿的下一行，纸质发票则落入登记簿下方的屏蔽金库。公开的只有 N。",
  },
  "fp.fig.feed": { en: "FEED", zh: "进纸" },
  "fp.fig.press": { en: "REGISTRY PRESS", zh: "登记压印机" },
  "fp.fig.vault": { en: "SHIELDED VAULT", zh: "屏蔽金库" },
  "fp.fig.board": { en: "PUBLIC BOARD", zh: "公开登记板" },
  "fp.fig.lever": { en: "Pull the lever (P)", zh: "拉下压杆（P）" },
  "fp.fig.hint": { en: "It plays by itself. Pull the lever (or key P) to take over.", zh: "它会自动播放。拉下压杆（或按 P 键）即可自己操作。" },

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
  "hs.note": { en: "Five certificates, their board entries and the settlements are made in your browser with jitsuin-wasm and test keys. Nothing is sent.", zh: "五张证书、对应的登记和结清记录都在你的浏览器中用 jitsuin-wasm 和测试密钥生成，不会发送任何数据。" },
  "hs.paidOn": { en: "paid {d}", zh: "{d} 付清" },
  "hs.due": { en: "due {d}", zh: "{d} 到期" },
  "hs.onTime": { en: "on time", zh: "按时" },
  "hs.late": { en: "{n} days late", zh: "逾期 {n} 天" },
  "hs.t.onTime": { en: "paid on time", zh: "按时付清" },
  "hs.t.late": { en: "paid late", zh: "逾期付清" },
  "hs.t.default": { en: "defaults", zh: "违约" },
  "hs.hide": { en: "Hide the late invoice", zh: "隐藏逾期的那张发票" },
  "hs.unhide": { en: "Put it back", zh: "放回去" },
  "hs.reset": { en: "Start over", zh: "重新开始" },
  "hs.working": { en: "Building the history…", zh: "正在生成履历…" },
  "hs.ok": { en: "Verified offline: {n} certificates, one unbroken chain, each tied to the board.", zh: "离线验证通过：{n} 张证书，一条完整的链，每张都与登记板相连。" },
  "hs.caught": { en: "Refused: {msg}. A buyer cannot leave a late invoice out.", zh: "被拒绝：{msg}。买方无法隐瞒逾期的发票。" },
  "hs.stats": { en: "{c} certificates · {e} board entries · checked in {ms} ms", zh: "{c} 张证书 · {e} 条登记 · 用时 {ms} 毫秒" },
  "hs.fig.aria": {
    en: "The buyer’s history cabinet. Five drawers hold certificates #0 to #4, TES-INV-0000 to 0004, each riveted to the one before. A lender’s reader on a rail above the drawers opens them in order and checks each certificate against its entry on the public board, which shows only N and a tag; 済 lands on each one paid on time, 遅 on #4, paid three days late. Whom each invoice was with is a blank blue bar. A plate at the back turns to the tally. Click it or press Enter to run it.",
    zh: "买方的履历柜。五个抽屉里放着证书 #0 到 #4（TES-INV-0000 到 0004），每张都铆接在前一张上。贷方的读取器沿抽屉上方的导轨依次打开抽屉，把每张证书与公开登记板上的登记核对，登记板上只有 N 和标签；按时付清的盖上“済”，#4 逾期三天付清，盖上“遅”。每张发票的交易方是一条空白的蓝条。后方的翻牌显示统计。点击或按 Enter 即可运行。",
  },
  "hs.fig.block": { en: "BLOCK", zh: "区块" },
  "hs.fig.tag": { en: "· tag", zh: "· 标签" },
  "hs.fig.history": { en: "HISTORY", zh: "履历" },
  "hs.fig.onTime": { en: "on time", zh: "按时" },
  "hs.fig.late": { en: "late", zh: "逾期" },
  "hs.fig.defaulted": { en: "defaulted", zh: "违约" },
  "hs.fig.buyer": { en: "BUYER", zh: "买方" },
  "hs.fig.certs": { en: "CERTIFICATES", zh: "证书" },
  "hs.fig.check": { en: "BOARD CHECK", zh: "登记板核对" },
  "hs.fig.anchored": { en: "ANCHORED", zh: "已锚定" },
  "hs.fig.missing": { en: "NOT SHOWN", zh: "未出示" },
  "hs.fig.with": { en: "with", zh: "交易方" },
  "hs.fig.notShown": { en: "not shown", zh: "未出示" },
  "hs.fig.hint": { en: "It plays by itself. Click the cabinet to run it yourself.", zh: "它会自动播放。点击柜子即可自己运行。" },
  "hs.fig.idle": { en: "Runs by itself when it comes into view.", zh: "进入视野时自动运行。" },
  "hs.fig.st.post": { en: "Certificate #{i} for {id}; its entry is on the board: N {n}.", zh: "{id} 的证书 #{i}；它的登记已在登记板上：N {n}。" },
  "hs.fig.st.check": { en: "Certificate #{i} · checking the board", zh: "证书 #{i} · 核对登记板" },
  "hs.fig.st.onTime": { en: "Certificate #{i} · anchored · paid on time", zh: "证书 #{i} · 已锚定 · 按时付清" },
  "hs.fig.st.late": { en: "Certificate #{i} · anchored · paid {n} days late", zh: "证书 #{i} · 已锚定 · 逾期 {n} 天付清" },
  "hs.fig.st.missing": { en: "Certificate #{i} is not shown, but its entry is on the board: N {n}.", zh: "证书 #{i} 没有出示，但它的登记就在登记板上：N {n}。" },
  "hs.fig.st.closes": { en: "The chain closes: #0 to #{last}, nothing left out", zh: "链已闭合：#0 到 #{last}，没有遗漏" },
  "hs.fig.st.final": { en: "History: {a} on time · {b} late · {c} defaulted", zh: "履历：{a} 次按时 · {b} 次逾期 · {c} 次违约" },
  "hs.fig.st.refused": { en: "The chain does not close: the check refuses the history.", zh: "链无法闭合：核对拒绝了这份履历。" },
  "hs.fig.st.stopped": { en: "Stopped: {msg}", zh: "已停止：{msg}" },

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
  // HNK-33.T6: the registry office beside the way in (figures/registry-office.svg)
  "fn.fig.aria": {
    en: "A small registry office. At the counter the invoice TES-INV-0003 is sealed by the supplier 売, the buyer 買 and the financier 融, and stays on the counter. Only its fingerprint N travels by wire to the public board on the back wall, a Zcash testnet board that shows N and a block height and nothing else. The advance rolls from the till down a chute into a deep blue shielded pool, where amounts and parties stay private. Then the lamp over the door in the left wall lights OPEN and the door to the console swings open. Click it or press Enter to run it.",
    zh: "一间小小的登记所。在柜台上，发票 TES-INV-0003 由供应商 売、买方 買 和资金方 融 盖章，发票本身留在柜台。只有它的指纹 N 沿着线路送到后墙上的公开登记板：这是 Zcash 测试网上的登记板，只显示 N 和区块高度，别无其他。预付款从收款机滑下滑槽，落入深蓝色的屏蔽池，金额和交易方都保持私密。然后左墙门上的灯亮起“营业中”，通往控制台的门打开。点击它或按 Enter 即可自己运行。",
  },
  "fn.fig.board": { en: "PUBLIC BOARD", zh: "公开登记板" },
  "fn.fig.testnet": { en: "ZCASH TESTNET", zh: "ZCASH 测试网" },
  "fn.fig.block": { en: "BLOCK", zh: "区块" },
  "fn.fig.only": { en: "N and block only · nothing else", zh: "只有 N 和区块 · 别无其他" },
  "fn.fig.office": { en: "REGISTRY OFFICE", zh: "登记处" },
  "fn.fig.console": { en: "CONSOLE", zh: "控制台" },
  "fn.fig.open": { en: "OPEN", zh: "营业中" },
  "fn.fig.pool": { en: "SHIELDED POOL", zh: "屏蔽池" },
  "fn.fig.hint": { en: "It plays by itself. Press the office to take over.", zh: "它会自动播放。点击登记所即可自己操作。" },
  "fn.fig.st.ready": { en: "{id} waits at the counter", zh: "{id} 在柜台等候" },
  "fn.fig.st.seal": { en: "Sealing · {k} {who}", zh: "盖章 · {k} {who}" },
  "fn.fig.st.sealed": { en: "Sealed by 売 買 融 · the paper stays at the counter", zh: "売 買 融 已盖章 · 文件留在柜台" },
  "fn.fig.st.n": { en: "Fingerprint {n}, taken from the sealed paper", zh: "指纹 {n}，取自盖好章的文件" },
  "fn.fig.st.board": { en: "Only N reaches the public board · block {h}", zh: "只有 N 上了公开登记板 · 区块 {h}" },
  "fn.fig.st.pool": { en: "The advance sinks into the shielded pool · amount and parties stay private", zh: "预付款沉入屏蔽池 · 金额和交易方保持私密" },
  "fn.fig.st.open": { en: "Registered once, financed once · the console is open", zh: "登记一次，融资一次 · 控制台已开放" },

  // chapter 4
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
  "tw.found": { en: "found on the board", zh: "在登记板上找到" },
  "tw.notFound": { en: "not on the board", zh: "不在登记板上" },
  "tw.registered": { en: "registered", zh: "已登记" },
  "tw.again": { en: "again", zh: "重复" },
  "tw.refused": { en: "not financed", zh: "不予融资" },
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
  // chapter 4, the second financier's counter (labels drawn inside the SVG, and its readout)
  "tw.fig.aria": {
    en: "A second financier’s counter. On the left an invoice, TES-INV-0007 with the buyer’s seal, slides out of an intake slot onto a tray. A board reader in the middle scans it and looks its fingerprint N up on the public board at the back, where the same N is already registered under financier A’s commitment. A round lamp marked 重 lights on financier B’s counter, a rolling shutter comes down over B’s Zcash drawer so no money leaves, and a small printer at the front prints Exhibit A: the supplier signed twice. Click it or press Enter to run it.",
    zh: "第二家资金方的柜台。左边，一张盖有买方印章的发票 TES-INV-0007 从投入口滑出，落在托盘上。中间的登记板读取器扫描它，并在后方的公开登记板上查询它的指纹 N：同一个 N 已经登记在资金方 A 的承诺名下。资金方 B 的柜台上，一盏写着「重」的圆灯亮起，卷帘落下盖住 B 的 Zcash 抽屉，资金不动；前方的小打印机打印出证据 A：供应商签了两次。点击它或按 Enter 键即可运行。",
  },
  "tw.fig.status": { en: "STATUS", zh: "状态" },
  "tw.fig.registered": { en: "registered", zh: "已登记" },
  "tw.fig.financierA": { en: "financier A", zh: "资金方 A" },
  "tw.fig.commitment": { en: "commitment", zh: "承诺" },
  "tw.fig.financier": { en: "FINANCIER", zh: "资金方" },
  "tw.fig.offers": { en: "OFFERS IN", zh: "报价投入" },
  "tw.fig.lookup": { en: "BOARD LOOKUP", zh: "登记板查询" },
  "tw.fig.seen": { en: "SEEN · A", zh: "已见 · A" },
  "tw.fig.exhibit": { en: "EXHIBIT A", zh: "证据 A" },
  "tw.fig.double": { en: "double signature", zh: "双重签名" },
  "tw.fig.offline": { en: "checked offline", zh: "离线验证" },
  "tw.fig.hint": { en: "It plays by itself. Click the counter to run it yourself.", zh: "它会自动播放。点击柜台即可自己运行。" },
  "tw.fig.st.arrive": { en: "An offer arrives at financier B: {id}.", zh: "一份报价送到资金方 B：{id}。" },
  "tw.fig.st.post": { en: "A’s entry is on the public board: N {n}, commitment {c}.", zh: "A 的登记已在公开登记板上：N {n}，承诺 {c}。" },
  "tw.fig.st.lookup": { en: "B’s reader looks N {n} up on the board.", zh: "B 的读取器在登记板上查询 N {n}。" },
  "tw.fig.st.found": { en: "Same N, another financier: registered under A’s commitment {c}. 重.", zh: "相同的 N，另一家资金方：已登记在 A 的承诺 {c} 名下。重。" },
  "tw.fig.st.refuse": { en: "B refuses: the shutter comes down, no money moves.", zh: "B 拒绝：卷帘落下，资金不动。" },
  "tw.fig.st.exhibit": { en: "Exhibit A: the supplier signed twice; the proof checks out offline.", zh: "证据 A：供应商签了两次；证明已离线验证通过。" },
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

const listeners = new Set<() => void>();

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
  listeners.forEach((f) => f());
}

document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
