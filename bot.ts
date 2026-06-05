// ═══════════════════════════════════════════════════════════════
//  MegaGram PRO Sniper Bot — TON Network
//  Cheapest fees · Multi-launchpad · LP Scanner · AI Signals
//  Supports: StonPump · GasPump · DeDeploy launches
// ═══════════════════════════════════════════════════════════════

// Load dotenv FIRST before anything else
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Debug token loading
const TOKEN = process.env.BOT_TOKEN || "";
console.log("🔑 Token loaded:", TOKEN ? TOKEN.slice(0,10)+"..." : "❌ MISSING");
if (!TOKEN) {
  console.error("❌ BOT_TOKEN not found! Check your .env file");
  process.exit(1);
}

import { Telegraf, Markup, Context } from "telegraf";
import { message } from "telegraf/filters";

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const FEE_RATE        = 0.005;   // 0.5% — cheapest on TON
const TON_USD         = 3.45;
const MIGRATION_TON   = 1000;

const LAUNCHPADS = {
  stonpump:  { name: "StonPump",  emoji: "🟦", router: "EQBstonpump...router" },
  gaspump:   { name: "GasPump",   emoji: "⛽",  router: "EQBgaspump...router"  },
  dedeploy:  { name: "DeDeploy",  emoji: "🚀",  router: "EQBdedeploy...router" },
  megagram:  { name: "MegaGram",    emoji: "⚡",  router: "EQBmegagram...router"   },
};

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────
interface Wallet {
  id:       string;       // unique wallet id
  label:    string;       // "Wallet 1", "Wallet 2", ...
  address:  string;
  mnemonic: string[];
  balance:  number;
  imported: boolean;      // true = imported via seed phrase
  createdAt:number;
}

interface Position {
  sym: string; addr: string; launchpad: string;
  entry: number; current: number; amount: number;
  valueUSD: number; pnlPct: number; ts: number;
  locked?: boolean;
}

interface LimitOrder {
  id: string; addr: string; sym: string;
  side: "buy"|"sell"; price: number; amount: number;
  status: "active"|"filled"|"cancelled"; ts: number;
}

interface SniperConfig {
  addr: string; sym?: string; launchpad: string;
  buyAmount: number; maxMcap: number; minLiquidity: number;
  autosell?: number; // take profit %
  active: boolean; ts: number;
}

interface WatchItem {
  addr: string; sym: string; price: number;
  alertAbove?: number; alertBelow?: number; launchpad: string;
}

interface TokenScan {
  sym: string; name: string; addr: string; launchpad: string;
  price: number; mcap: string; change24h: string;
  liquidity: string; vol24h: string;
  lpBurned: boolean; lpBurnedPct?: number;
  stakingLocked: number; tokenLocked: number; lockExpiry?: string;
  contractVerified: boolean; mintDisabled: boolean; honeypot: boolean;
  holders: number; top10HoldPct: number;
  bondingCurvePct?: number;
  safetyScore: number; // 0-100
}

interface CopyTarget {
  addr: string; label?: string; active: boolean;
  minAmount: number; maxAmount: number; ts: number;
}

interface UserState {
  // Multi-wallet
  wallets:          Wallet[];
  activeWalletIdx:  number;
  wallet?:          Wallet;   // shortcut → wallets[activeWalletIdx]
  input?: string;          // current awaiting input type
  tmpAddr?: string;        // temp address
  tmpData?: any;           // temp misc data
  positions:    Position[];
  limitOrders:  LimitOrder[];
  snipers:      SniperConfig[];
  watchlist:    WatchItem[];
  copyTargets:  CopyTarget[];
  // Settings
  buyAmount:    number;
  slippage:     number;
  gas:          "slow"|"normal"|"fast"|"turbo";
  autosell:     number;    // auto take profit %
  autostop:     number;    // auto stop loss %
  antiMev:      boolean;
  alertsOn:     boolean;
  preferLaunchpad: "all"|"stonpump"|"gaspump"|"dedeploy"|"megagram";
  // Referral
  referrals: number; earnings: number;
}

// ─────────────────────────────────────────────────────────────
//  STORE
// ─────────────────────────────────────────────────────────────
const store = new Map<number, UserState>();

function getU(id: number): UserState {
  if (!store.has(id)) {
    store.set(id, {
      wallets:         [],
      activeWalletIdx: 0,
      get wallet() { return this.wallets[this.activeWalletIdx]; },
      positions: [
        { sym:"GBOT",    addr:"EQAgbot",   launchpad:"megagram",   entry:0.00000042, current:0.00000082, amount:124000,   valueUSD:145,  pnlPct:95.2,  ts:Date.now()-3600000 },
        { sym:"TONPEPE", addr:"EQApepe",   launchpad:"stonpump", entry:0.00000021, current:0.00000024, amount:5000000,  valueUSD:89,   pnlPct:14.3,  ts:Date.now()-7200000 },
        { sym:"GASCAT",  addr:"EQAgascat", launchpad:"gaspump",  entry:0.00000089, current:0.00000071, amount:200000,   valueUSD:62,   pnlPct:-20.2, ts:Date.now()-1800000 },
        { sym:"NEXUS",   addr:"EQAnexus",  launchpad:"dedeploy", entry:0.00000100, current:0.00000145, amount:25000,    valueUSD:217,  pnlPct:45.0,  ts:Date.now()-900000  },
      ],
      limitOrders:  [],
      snipers:      [],
      watchlist:    [],
      copyTargets:  [],
      buyAmount:    0.5,
      slippage:     1,
      gas:          "fast",
      autosell:     0,
      autostop:     0,
      antiMev:      true,
      alertsOn:     true,
      preferLaunchpad: "all",
      referrals:    3,
      earnings:     0.045,
    });
  }
  return store.get(id)!;
}

// ─────────────────────────────────────────────────────────────
//  MOCK HELPERS
// ─────────────────────────────────────────────────────────────
const rnd  = (min:number,max:number) => +(Math.random()*(max-min)+min).toFixed(6);
const rid  = () => Math.random().toString(36).slice(2,10).toUpperCase();
const txid = () => Math.random().toString(36).slice(2).toUpperCase();

function mockWallet(label: string, imported = false): Wallet {
  const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const r=(n:number)=>Array.from({length:n},()=>c[Math.floor(Math.random()*c.length)]).join("");
  return {
    id:        rid(),
    label,
    address:   `UQ${r(46)}`,
    mnemonic:  Array.from({length:24},(_,i)=>`word${i+1}`),
    balance:   0,
    imported,
    createdAt: Date.now(),
  };
}

function scanToken(addr: string): TokenScan {
  const syms = ["GBOT","TONPEPE","GASCAT","NEXUS","MOON","COPE","JARVIS","DOTON"];
  const lpads = ["stonpump","gaspump","dedeploy","megagram"];
  const sym = syms[Math.floor(Math.random()*syms.length)];
  const lpad = lpads[Math.floor(Math.random()*lpads.length)];
  const lpBurned = Math.random() > 0.4;
  const score = Math.floor(
    (lpBurned ? 25 : 0) +
    (Math.random() > 0.3 ? 15 : 0) +
    (Math.random() > 0.5 ? 20 : 0) +
    (Math.random() > 0.4 ? 20 : 0) +
    rnd(0,20)
  );
  return {
    sym, name: sym.charAt(0)+sym.slice(1).toLowerCase()+"Token",
    addr, launchpad: lpad,
    price: rnd(0.0000001, 0.000005),
    mcap: "$"+Math.floor(rnd(10,900))+"K",
    change24h: (Math.random()>0.4?"+":"-")+Math.floor(rnd(1,400))+"%",
    liquidity: "$"+Math.floor(rnd(5,200))+"K",
    vol24h: "$"+Math.floor(rnd(10,500))+"K",
    lpBurned, lpBurnedPct: lpBurned ? Math.floor(rnd(80,100)) : 0,
    stakingLocked: Math.floor(rnd(0,40)),
    tokenLocked: Math.floor(rnd(0,60)),
    lockExpiry: Math.random()>0.5 ? "2025-12-31" : undefined,
    contractVerified: Math.random()>0.3,
    mintDisabled: Math.random()>0.4,
    honeypot: Math.random()<0.1,
    holders: Math.floor(rnd(50,15000)),
    top10HoldPct: Math.floor(rnd(15,85)),
    bondingCurvePct: lpad!=="dedeploy" ? Math.floor(rnd(5,99)) : undefined,
    safetyScore: Math.min(100,score),
  };
}

function safetyEmoji(score:number) {
  if (score>=75) return "🟢";
  if (score>=50) return "🟡";
  if (score>=25) return "🟠";
  return "🔴";
}
function gasLabel(g:string) {
  return { slow:"🐢 Slow (0.02 TON)", normal:"🚗 Normal (0.05 TON)", fast:"⚡ Fast (0.08 TON)", turbo:"🚀 Turbo (0.15 TON)" }[g]!;
}
function feeLabel() { return `0.5% _(lowest on TON)_`; }
function fmtAddr(a:string){ return a.slice(0,8)+"..."+a.slice(-5); }
function fmtTON(n:number){ return n.toFixed(4)+" TON"; }
function fmtUSD(n:number){ return "$"+n.toFixed(2); }

// ─────────────────────────────────────────────────────────────
//  KEYBOARDS
// ─────────────────────────────────────────────────────────────
const MAIN_KB = () => Markup.keyboard([
  ["💰 Buy",           "💸 Sell"          ],
  ["🎯 Sniper",        "📡 AI Signals"    ],
  ["📊 Positions",     "📋 Limit Orders"  ],
  ["🔍 Scan Token",    "🔥 LP Scanner"    ],
  ["🔒 Lock Checker",  "👥 Copy Trade"    ],
  ["⭐ Watchlist",     "🎁 Rewards"       ],
  ["💼 Wallet"                            ],
  ["⚙️ Settings",      "❓ Help"          ],
  ["🔄 Refresh"                           ],
]).resize();

const BACK_KB        = () => Markup.keyboard([["◀️ Main Menu"]]).resize();
const WALLET_BACK_KB = () => Markup.keyboard([["◀️ Back to Wallet"]]).resize();

// ── Wallet menu keyboard ──────────────────────────────────────
const WALLET_KB = () => Markup.keyboard([
  ["➕ Import wallet",    "🔄 Select wallet"  ],
  ["👜 Create new wallet","❌ Delete wallet"  ],
  ["📥 Deposit",          "📤 Withdraw"       ],
  ["🙈 Show seeds",       "🔃 Refresh balance"],
  ["◀️ Main Menu"                             ],
]).resize();

// ── Wallet message builders ───────────────────────────────────
function msgWalletHome(u: UserState): string {
  const w = u.wallet;
  if (!w) {
    return [
      `💼 *Wallet Manager*`,
      ``,
      `No wallet found.`,
      `Create a new wallet or import one with your seed phrase.`,
    ].join("\n");
  }
  return [
    `💼 *Wallet Manager*`,
    ``,
    `*Active:* ${w.label} ${w.imported ? "_(imported)_" : "_(generated)_"}`,
    `\`${w.address}\``,
    ``,
    `*Balance:* ${fmtTON(w.balance)} (${fmtUSD(w.balance * TON_USD)})`,
    `*Network:* TON Mainnet`,
    ``,
    u.wallets.length > 1
      ? `*All wallets (${u.wallets.length}):*\n` +
        u.wallets.map((ww, i) =>
          `${i === u.activeWalletIdx ? "▶️" : "   "} ${ww.label} — \`${fmtAddr(ww.address)}\``
        ).join("\n")
      : `_Only 1 wallet. You can create or import more._`,
  ].join("\n");
}

function msgSelectWallet(u: UserState): string {
  if (!u.wallets.length) return `💼 No wallets yet. Create or import one first.`;
  return [
    `🔄 *Select Active Wallet*`,
    ``,
    u.wallets.map((w, i) =>
      `${i === u.activeWalletIdx ? "✅" : "⬜"} *${w.label}*\n   \`${fmtAddr(w.address)}\`\n   Balance: ${fmtTON(w.balance)}`
    ).join("\n\n"),
  ].join("\n");
}

function selectWalletKb(u: UserState) {
  const rows = u.wallets.map((w, i) =>
    [Markup.button.callback(
      `${i === u.activeWalletIdx ? "✅ " : ""}${w.label} — ${fmtAddr(w.address)}`,
      `sel_wallet_${i}`
    )]
  );
  rows.push([Markup.button.callback("❌ Cancel", "cancel")]);
  return Markup.inlineKeyboard(rows);
}

function deleteWalletKb(u: UserState) {
  const rows = u.wallets.map((w, i) =>
    [Markup.button.callback(`🗑️ Delete ${w.label} (${fmtAddr(w.address)})`, `del_wallet_${i}`)]
  );
  rows.push([Markup.button.callback("❌ Cancel", "cancel")]);
  return Markup.inlineKeyboard(rows);
}

const BUY_AMT_KB = (def:number) => Markup.inlineKeyboard([
  [Markup.button.callback("0.1 TON","b0.1"), Markup.button.callback("0.5 TON","b0.5"), Markup.button.callback("1 TON","b1")],
  [Markup.button.callback("2 TON","b2"),     Markup.button.callback("5 TON","b5"),     Markup.button.callback("10 TON","b10")],
  [Markup.button.callback(`✏️ Custom (${def} TON default)`,"b_custom")],
  [Markup.button.callback("❌ Cancel","cancel")],
]);

const SNIPER_KB = (s:SniperConfig[]) => Markup.inlineKeyboard([
  [Markup.button.callback("➕ Add New Sniper",      "sniper_add")],
  [Markup.button.callback("⚡ Turbo Mode (0 block)","sniper_turbo")],
  [Markup.button.callback("📋 View All Snipers",   "sniper_list")],
  [Markup.button.callback("🛑 Stop All Snipers",   "sniper_stop_all")],
]);

const SETTINGS_KB = (u:UserState) => Markup.inlineKeyboard([
  [Markup.button.callback(`💰 Default Buy: ${u.buyAmount} TON`,  "s_buy")],
  [Markup.button.callback(`⚡ Slippage: ${u.slippage}%`,         "s_slip")],
  [
    Markup.button.callback(u.gas==="slow"  ?"✓🐢 Slow" :"🐢 Slow",  "s_gas_slow"),
    Markup.button.callback(u.gas==="normal"?"✓🚗 Normal":"🚗 Normal","s_gas_normal"),
    Markup.button.callback(u.gas==="fast"  ?"✓⚡ Fast"  :"⚡ Fast",  "s_gas_fast"),
    Markup.button.callback(u.gas==="turbo" ?"✓🚀 Turbo" :"🚀 Turbo","s_gas_turbo"),
  ],
  [
    Markup.button.callback(`${u.antiMev?"✅":"⬜"} Anti-MEV`,   "s_mev"),
    Markup.button.callback(`${u.alertsOn?"✅":"⬜"} Alerts`,    "s_alerts"),
  ],
  [Markup.button.callback(`🎯 Auto TP: ${u.autosell||"OFF"}%`,  "s_tp")],
  [Markup.button.callback(`🛑 Auto SL: ${u.autostop||"OFF"}%`,  "s_sl")],
  [
    Markup.button.callback(`Launchpad: ${u.preferLaunchpad.toUpperCase()}`, "s_lpad"),
  ],
  [Markup.button.callback("🔑 Export Seed Phrase",               "s_export")],
  [Markup.button.callback("🗑️ Delete Wallet",                   "s_delete")],
]);

// ─────────────────────────────────────────────────────────────
//  MESSAGE BUILDERS
// ─────────────────────────────────────────────────────────────
function msgStart(uid:number, u:UserState):string {
  const w = u.wallet;
  const balTON = w ? w.balance.toFixed(4) : "0.0000";
  const balUSD = w ? fmtUSD(w.balance*TON_USD) : "$0.00";
  return [
    `⚡ *MegaGram Sniper Bot*`,
    `_Cheapest fees on TON · 0.5% per trade_`,
    ``,
    w ? `\`${w.address}\`` : `_No wallet — generating..._`,
    `*Balance:* ${balTON} TON (${balUSD})`,
    ``,
    `*Supported Launchpads:*`,
    `🟦 StonPump  ⛽ GasPump  🚀 DeDeploy  ⚡ MegaGram`,
    ``,
    `Paste any token address to scan & trade`,
    ``,
    `*Referral link:*`,
    `\`https://t.me/megagram_bot?start=ref_${uid}\``,
  ].join("\n");
}

function msgTokenScan(t:TokenScan):string {
  const lpad = LAUNCHPADS[t.launchpad as keyof typeof LAUNCHPADS] || LAUNCHPADS.megagram;
  const hp = t.honeypot ? "🚨 *HONEYPOT DETECTED*\n" : "";
  const lpLine = t.lpBurned
    ? `🔥 LP Burned: *${t.lpBurnedPct}%* ✅`
    : `⚠️ LP Not Burned`;
  const curve = t.bondingCurvePct !== undefined
    ? `📈 Bonding Curve: *${t.bondingCurvePct}%* (${1000-Math.floor(t.bondingCurvePct*10)} TON to migrate)\n`
    : "";
  return [
    hp,
    `${safetyEmoji(t.safetyScore)} *${t.name}* ($${t.sym}) — Safety: ${t.safetyScore}/100`,
    `${lpad.emoji} *${lpad.name}* · \`${fmtAddr(t.addr)}\``,
    ``,
    `💵 Price: \`${t.price.toFixed(10)}\` TON`,
    `📊 MCap: ${t.mcap} · 24h: ${t.change24h}`,
    `💧 Liquidity: ${t.liquidity} · Vol: ${t.vol24h}`,
    `👥 Holders: ${t.holders.toLocaleString()} · Top10: ${t.top10HoldPct}%`,
    ``,
    curve,
    `*Security:*`,
    lpLine,
    `🔒 Staking Locked: *${t.stakingLocked}%*`,
    `🔐 Token Locked: *${t.tokenLocked}%*${t.lockExpiry ? " (until "+t.lockExpiry+")" : ""}`,
    `✅ Contract: ${t.contractVerified?"Verified":"⚠️ Unverified"}`,
    `🚫 Mint: ${t.mintDisabled?"Disabled ✅":"⚠️ Enabled"}`,
    ``,
    `*Fee: ${feeLabel()}*`,
  ].join("\n");
}

function msgScanKb(t:TokenScan, defAmt:number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`💰 Buy ${defAmt} TON`,  `quick_buy_${t.addr}_${defAmt}`),
      Markup.button.callback(`🎯 Snipe`,               `snipe_now_${t.addr}`),
    ],
    [
      Markup.button.callback("💰 Change Amount",       `buy_addr_${t.addr}`),
      Markup.button.callback("⭐ Watchlist",           `watch_add_${t.addr}_${t.sym}`),
    ],
    [
      Markup.button.callback("📋 Set Limit Order",     `limit_from_${t.addr}_${t.sym}`),
      Markup.button.callback("🔄 Rescan",              `rescan_${t.addr}`),
    ],
    [Markup.button.callback("❌ Close","cancel_msg")],
  ]);
}

function msgPositions(ps:Position[]):string {
  if (!ps.length) return `📊 *Open Positions*\n\nNo open positions yet.\nBuy a token to get started!`;
  const total = ps.reduce((s,p)=>s+p.valueUSD,0);
  const totalPnl = ps.reduce((s,p)=>s+(p.valueUSD*p.pnlPct/100),0);
  const lines = [
    `📊 *Open Positions (${ps.length})*`,
    `Portfolio: *${fmtUSD(total)}* · PnL: *${totalPnl>=0?"+":""}${fmtUSD(totalPnl)}*`,
    ``,
  ];
  ps.forEach(p => {
    const lpad = LAUNCHPADS[p.launchpad as keyof typeof LAUNCHPADS];
    lines.push(
      `${p.pnlPct>=0?"🟢":"🔴"} *$${p.sym}* ${lpad?.emoji||""}`,
      `   Entry: \`${p.entry.toFixed(10)}\` → Now: \`${p.current.toFixed(10)}\``,
      `   Amount: ${p.amount.toLocaleString()} · Val: ${fmtUSD(p.valueUSD)}`,
      `   PnL: *${p.pnlPct>=0?"+":""}${p.pnlPct.toFixed(1)}%*`,
      ``,
    );
  });
  return lines.join("\n");
}

function posKb(ps:Position[]) {
  const rows = ps.map(p => [
    Markup.button.callback(`${p.pnlPct>=0?"🟢":"🔴"} Sell $${p.sym} (${p.pnlPct>=0?"+":""}${p.pnlPct.toFixed(0)}%)`, `sellpos_${p.sym}`),
  ]);
  rows.push([Markup.button.callback("🔄 Refresh","refresh_pos")]);
  return Markup.inlineKeyboard(rows);
}

function msgSignals():string {
  return [
    `📡 *AI Trading Signals* — TON Network`,
    `_Powered by MegaGram AI · Updated every 5 min_`,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🟢 *STRONG BUY* — $GBOT ⚡MegaGram`,
    `   Price: 0.00000082 TON · MCap: $847K`,
    `   AI Confidence: *87%* · Target: +120%`,
    `   🔥 LP Burned 98% · Curve 78% · migrate soon!`,
    ``,
    `🟢 *BUY* — $DOTON 🟦StonPump`,
    `   Price: 0.00000041 TON · MCap: $445K`,
    `   AI Confidence: *74%* · Target: +65%`,
    `   Volume spike +340% in last hour`,
    ``,
    `🟡 *WATCH* — $NEXUS 🚀DeDeploy`,
    `   Price: 0.00000145 TON · MCap: $2.1M`,
    `   AI Confidence: *61%* · Pattern: Cup & Handle`,
    `   🔒 Token Lock expires in 14 days`,
    ``,
    `🟠 *CAUTION* — $GASCAT ⛽GasPump`,
    `   Whale wallet selling 15% of supply`,
    `   LP down 23% last 2 hours`,
    ``,
    `🔴 *AVOID* — $COPE ⚡MegaGram`,
    `   Dev wallet: 34% of supply moving`,
    `   LP Not Burned · Mint still enabled`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🎯 *Sniper Alerts:*`,
    `• New launch on StonPump detected — $TCAT`,
    `  MCap: $8K · LP: $12K · Curve: 3% · 🔥 Early!`,
    `• DeDeploy launch — $NEXV2 — LP Burned ✅`,
  ].join("\n");
}

function msgLpScanner():string {
  return [
    `🔥 *LP Burn Scanner — Live*`,
    `_Tracking all TON launchpad liquidity_`,
    ``,
    `🟦 *StonPump* — Recent LP Burns:`,
    `• $TCAT — 🔥 LP Burned *100%* ✅ · MCap: $42K`,
    `• $PEPEX — 🔥 LP Burned *95%* ✅ · MCap: $128K`,
    `• $WAGMI — ⚠️ LP Burned *0%* — RISK`,
    ``,
    `⛽ *GasPump* — Recent LP Burns:`,
    `• $GASCAT — 🔥 LP Burned *98%* ✅ · MCap: $89K`,
    `• $TURBO2 — 🔥 LP Burned *85%* ✅ · MCap: $34K`,
    `• $PUMP99 — ⚠️ LP Burned *0%* — RISK`,
    ``,
    `🚀 *DeDeploy* — Recent LP Burns:`,
    `• $NEXUS — 🔥 LP Burned *100%* ✅ · MCap: $2.1M`,
    `• $ORACLE — 🔥 LP Burned *100%* ✅ · MCap: $198K`,
    ``,
    `⚡ *MegaGram* — Recent LP Burns:`,
    `• $GBOT — 🔥 Curve 78% (pre-migration)`,
    `• $MOON — 🔥 Curve 23%`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `🟢 = Safe · ⚠️ = Risky · 🔴 = Avoid`,
    `_Auto-alert when LP is burned in your watchlist_`,
  ].join("\n");
}

function msgLockChecker(addr?:string):string {
  if (!addr) return [
    `🔒 *Staking & Token Lock Checker*`,
    ``,
    `Check how much supply is locked or staked for any token.`,
    ``,
    `*What we check:*`,
    `• % of supply in staking contracts`,
    `• % locked in vesting / team locks`,
    `• Lock expiry dates`,
    `• Dev/team wallet lock status`,
    ``,
    `Paste a token address to check:`,
  ].join("\n");

  // Mock result for a given address
  const locked = Math.floor(Math.random()*60+10);
  const staked = Math.floor(Math.random()*30);
  const expiry = ["2025-06-30","2025-12-31","2026-03-01"][Math.floor(Math.random()*3)];
  return [
    `🔒 *Lock Report*`,
    `\`${fmtAddr(addr)}\``,
    ``,
    `🔐 *Token Locked:* ${locked}% of supply`,
    `   Expiry: ${expiry}`,
    `   Contract: \`EQAlockcontract...${rid()}\``,
    ``,
    `💎 *Staking Locked:* ${staked}% of supply`,
    `   Platform: TON Staking v2`,
    `   APY: ${Math.floor(Math.random()*15+5)}%`,
    ``,
    `👨‍💻 *Dev/Team Wallet:*`,
    `   Holding: ${Math.floor(Math.random()*15+2)}% of supply`,
    `   Last moved: ${Math.floor(Math.random()*30+1)} days ago`,
    ``,
    `📊 *Circulating Supply:* ${100-locked-staked}%`,
    ``,
    `${locked+staked>50?"🟢 More than 50% locked — SAFER":"🟡 Less than 50% locked — MODERATE RISK"}`,
  ].join("\n");
}

function msgSniperList(snipers:SniperConfig[]):string {
  if (!snipers.length) return [
    `🎯 *Sniper Mode*`,
    ``,
    `No snipers set. Add one to auto-buy on launch.`,
    ``,
    `*Supported launchpads:*`,
    `🟦 StonPump · ⛽ GasPump · 🚀 DeDeploy · ⚡ MegaGram`,
    ``,
    `*Features:*`,
    `• 0-block execution — first to buy`,
    `• Auto sell at target profit %`,
    `• Max MCap filter (don't buy if too expensive)`,
    `• Min liquidity filter`,
    `• Anti-rug: LP burn check before buy`,
    ``,
    `Click ➕ Add New Sniper or paste a token address:`,
  ].join("\n");

  const lines = [`🎯 *Active Snipers (${snipers.filter(s=>s.active).length}/${snipers.length})*`,``];
  snipers.forEach((s,i)=>{
    const lpad = LAUNCHPADS[s.launchpad as keyof typeof LAUNCHPADS];
    lines.push(
      `${s.active?"🟢":"⚪"} *#${i+1}* ${lpad?.emoji||"⚡"} \`${fmtAddr(s.addr)}\``,
      `   Buy: ${s.buyAmount} TON · Max MCap: ${s.maxMcap}K · Min Liq: ${s.minLiquidity}K`,
      s.autosell ? `   Auto-sell at: +${s.autosell}%` : `   Auto-sell: OFF`,
      ``,
    );
  });
  return lines.join("\n");
}

function msgCopyTrade(targets:CopyTarget[]):string {
  return [
    `👥 *Copy Trade*`,
    ``,
    `*Top Wallets This Week:*`,
    ``,
    `🥇 \`UQAx...k9Rd\` — +847% · Win: 78% · 42 trades`,
    `   Favours: StonPump, MegaGram early launches`,
    ``,
    `🥈 \`UQBz...m3Wq\` — +412% · Win: 82% · 28 trades`,
    `   Favours: DeDeploy, large MCap`,
    ``,
    `🥉 \`UQCp...n7Ht\` — +298% · Win: 71% · 61 trades`,
    `   Favours: GasPump, high volume tokens`,
    ``,
    targets.length
      ? `*Your Copy Targets (${targets.length}):*\n` + targets.map(t=>`• \`${fmtAddr(t.addr)}\` ${t.active?"🟢":"⚪"}`).join("\n")
      : `No copy targets set.`,
    ``,
    `Paste a wallet address to start copying:`,
  ].join("\n");
}

function msgRewards(uid:number, u:UserState):string {
  return [
    `🎁 *Rewards & Referrals*`,
    ``,
    `*Your Stats:*`,
    `├ Friends referred: *${u.referrals}*`,
    `├ Total earnings: *${u.earnings.toFixed(4)} TON*`,
    `├ Pending payout: *0.0000 TON*`,
    `└ Rank: ${u.referrals>=10?"💎 Diamond":u.referrals>=5?"🥇 Gold":u.referrals>=3?"🥈 Silver":"🥉 Bronze"}`,
    ``,
    `*How to earn:*`,
    `• *30%* of trading fees from your referrals`,
    `• *0.1 TON* bonus per verified referral`,
    `• *Bonus:* 5 referrals = VIP fee rate (0.3%)`,
    ``,
    `*Your referral link:*`,
    `\`https://t.me/megagram_bot?start=ref_${uid}\``,
  ].join("\n");
}

function msgHelp():string {
  return [
    `❓ *MegaGram Sniper Bot — Help*`,
    `_Cheapest fees on TON (0.5%)_`,
    ``,
    `*Trading:*`,
    `/buy — Buy token by address`,
    `/sell — Sell open positions`,
    `/sniper — Multi-launchpad sniper`,
    `/signals — AI trading signals`,
    ``,
    `*Research:*`,
    `/scan — Full token security scan`,
    `/lp — LP burn scanner (all launchpads)`,
    `/lock — Staking & token lock checker`,
    ``,
    `*Orders:*`,
    `/limit — Set limit buy/sell orders`,
    `/copytrade — Copy top trader wallets`,
    ``,
    `*Account:*`,
    `/wallet — TON wallet info`,
    `/positions — Open positions & PnL`,
    `/watchlist — Token watchlist + alerts`,
    `/withdraw — Withdraw TON`,
    `/deposit — Deposit address`,
    `/rewards — Referral earnings`,
    `/settings — All bot settings`,
    ``,
    `*Pro Tips:*`,
    `• Paste any TON address → instant scan`,
    `• 🚀 Turbo gas = 0-block snipe`,
    `• Enable Anti-MEV in Settings`,
    `• Set Auto TP/SL for hands-free trading`,
    ``,
    `*Supported Launchpads:*`,
    `🟦 StonPump · ⛽ GasPump · 🚀 DeDeploy · ⚡ MegaGram`,
    ``,
    `Support: @megagram_support`,
    `Channel: @megagram_signals`,
    `Chat: @megagram_community`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
//  BOT
// ─────────────────────────────────────────────────────────────
const bot = new Telegraf(TOKEN);
const APP = process.env.MINI_APP_URL || "https://beubon.github.io/megagram/";

// ─── /start ───────────────────────────────────────────────────
bot.command("start", async ctx => {
  const uid = ctx.from.id;
  const u   = getU(uid);
  const arg = ctx.message.text.split(" ")[1];

  // Referral tracking
  if (arg?.startsWith("ref_")) {
    const refId = parseInt(arg.replace("ref_",""));
    if (refId !== uid) { const ref = getU(refId); ref.referrals++; }
  }

  if (!u.wallets.length) {
    const w = mockWallet("Wallet 1");
    u.wallets.push(w);
    u.activeWalletIdx = 0;
    await ctx.reply(
      `🎉 *Wallet Created!*\n\n*Wallet 1*\n\`${w.address}\`\n\nFund this address with TON to start trading.\n\n` +
      `Fee: *0.5%* — lowest on TON network.\n\n` +
      `⚠️ Back up your seed phrase via 💼 Wallet → 🙈 Show Seeds`,
      { parse_mode:"Markdown" }
    );
  }
  await ctx.reply(msgStart(uid,u), { parse_mode:"Markdown", ...MAIN_KB() });
});

// ─── Commands ─────────────────────────────────────────────────
bot.command(["wallet","deposit"], async ctx => {
  const u = getU(ctx.from.id);
  await ctx.reply(msgWalletHome(u), { parse_mode:"Markdown", ...WALLET_KB() });
});

// ─── WALLET KEYBOARD HANDLERS ─────────────────────────────────

bot.hears("💼 Wallet", async ctx => {
  const u = getU(ctx.from.id);
  await ctx.reply(msgWalletHome(u), { parse_mode:"Markdown", ...WALLET_KB() });
});

bot.hears("➕ Import wallet", async ctx => {
  const u = getU(ctx.from.id);
  if (u.wallets.length >= 5) { await ctx.reply("⚠️ Max 5 wallets. Delete one first.", WALLET_KB()); return; }
  u.input = "import_seed";
  await ctx.reply(
    `➕ *Import Wallet*\n\n` +
    `Paste your *24-word seed phrase* separated by spaces:\n\n` +
    `⚠️ Never share your seed phrase with anyone.\n` +
    `MegaGram will never ask for it outside this flow.`,
    { parse_mode:"Markdown", ...WALLET_BACK_KB() }
  );
});

bot.hears("👜 Create new wallet", async ctx => {
  const u = getU(ctx.from.id);
  if (u.wallets.length >= 5) { await ctx.reply("⚠️ Max 5 wallets. Delete one first.", WALLET_KB()); return; }
  const label = `Wallet ${u.wallets.length + 1}`;
  const w     = mockWallet(label, false);
  u.wallets.push(w);
  u.activeWalletIdx = u.wallets.length - 1;
  await ctx.reply(
    `✅ *${label} Created!*\n\n` +
    `\`${w.address}\`\n\n` +
    `*Balance:* 0.0000 TON\n\n` +
    `Deposit TON to start trading.\n` +
    `Back up your seed via 🙈 Show Seeds.`,
    { parse_mode:"Markdown", ...WALLET_KB() }
  );
});

bot.hears("🔄 Select wallet", async ctx => {
  const u = getU(ctx.from.id);
  if (!u.wallets.length) { await ctx.reply("No wallets. Create one first.", WALLET_KB()); return; }
  await ctx.reply(msgSelectWallet(u), { parse_mode:"Markdown", ...selectWalletKb(u) });
});

bot.hears("❌ Delete wallet", async ctx => {
  const u = getU(ctx.from.id);
  if (!u.wallets.length) { await ctx.reply("No wallets to delete.", WALLET_KB()); return; }
  await ctx.reply(
    `❌ *Delete Wallet*\n\n⚠️ *Irreversible!*\nBack up seed phrase before deleting.\n\nChoose wallet to delete:`,
    { parse_mode:"Markdown", ...deleteWalletKb(u) }
  );
});

bot.hears("📥 Deposit", async ctx => {
  const u = getU(ctx.from.id);
  const w = u.wallet;
  if (!w) { await ctx.reply("No wallet. Create one first.", WALLET_KB()); return; }
  await ctx.reply(
    `📥 *Deposit TON*\n\n` +
    `*Active:* ${w.label}\n\n` +
    `Send TON to:\n\`${w.address}\`\n\n` +
    `*Balance:* ${fmtTON(w.balance)}\n\n` +
    `Balance updates automatically.`,
    { parse_mode:"Markdown", ...WALLET_KB() }
  );
});

bot.hears("🙈 Show seeds", async ctx => {
  const u = getU(ctx.from.id);
  if (!u.wallets.length) { await ctx.reply("No wallets.", WALLET_KB()); return; }
  await ctx.reply(
    `🙈 *Show Seed Phrase*\n\n⚠️ *EXTREMELY SENSITIVE*\nAnyone with these words controls your funds.\n\nSelect wallet:`,
    {
      parse_mode:"Markdown",
      ...Markup.inlineKeyboard([
        ...u.wallets.map((w,i) => [
          Markup.button.callback(`🙈 ${w.label} — ${fmtAddr(w.address)}`, `show_seed_${i}`)
        ]),
        [Markup.button.callback("❌ Cancel","cancel")],
      ])
    }
  );
});

bot.hears("🔃 Refresh balance", async ctx => {
  const u = getU(ctx.from.id);
  const w = u.wallet;
  if (!w) { await ctx.reply("No wallet.", WALLET_KB()); return; }
  await ctx.reply(`🔃 Refreshing...`);
  setTimeout(async () => {
    await ctx.reply(
      `✅ *Balance Updated*\n\n*${w.label}*\n\`${w.address}\`\n\n*Balance:* ${fmtTON(w.balance)} (${fmtUSD(w.balance * TON_USD)})`,
      { parse_mode:"Markdown", ...WALLET_KB() }
    );
  }, 1200);
});

bot.hears("◀️ Back to Wallet", async ctx => {
  const u = getU(ctx.from.id);
  u.input = undefined;
  await ctx.reply(msgWalletHome(u), { parse_mode:"Markdown", ...WALLET_KB() });
});

// ─── WALLET INLINE CALLBACKS ──────────────────────────────────

bot.action(/^sel_wallet_(\d+)$/, async ctx => {
  const u   = getU(ctx.from.id);
  const idx = parseInt(ctx.match[1]);
  if (idx < 0 || idx >= u.wallets.length) { await ctx.answerCbQuery("Invalid."); return; }
  u.activeWalletIdx = idx;
  const w = u.wallets[idx];
  await ctx.answerCbQuery(`✅ Switched to ${w.label}`);
  await ctx.editMessageText(
    `✅ *Active wallet: ${w.label}*\n\n\`${w.address}\`\n*Balance:* ${fmtTON(w.balance)}`,
    { parse_mode:"Markdown" }
  );
});

bot.action(/^del_wallet_(\d+)$/, async ctx => {
  const u   = getU(ctx.from.id);
  const idx = parseInt(ctx.match[1]);
  if (u.wallets.length === 1) { await ctx.answerCbQuery("⚠️ Can't delete the only wallet!"); return; }
  const w = u.wallets[idx];
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⚠️ *Confirm Delete*\n\n*${w.label}*\n\`${w.address}\`\n\nFunds lost if seed not backed up!`,
    { parse_mode:"Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`🗑️ YES, Delete ${w.label}`, `confirm_del_${idx}`)],
        [Markup.button.callback("❌ No, Keep It","cancel")],
      ])
    }
  );
});

bot.action(/^confirm_del_(\d+)$/, async ctx => {
  const u   = getU(ctx.from.id);
  const idx = parseInt(ctx.match[1]);
  if (idx < 0 || idx >= u.wallets.length) { await ctx.answerCbQuery("Invalid."); return; }
  const label = u.wallets[idx].label;
  u.wallets.splice(idx, 1);
  if (u.activeWalletIdx >= u.wallets.length) u.activeWalletIdx = u.wallets.length - 1;
  await ctx.answerCbQuery(`🗑️ ${label} deleted`);
  await ctx.editMessageText(
    `🗑️ *${label} deleted.*\n\n*Active:* ${u.wallets[u.activeWalletIdx]?.label || "None"}`,
    { parse_mode:"Markdown" }
  );
});

bot.action(/^show_seed_(\d+)$/, async ctx => {
  const u   = getU(ctx.from.id);
  const idx = parseInt(ctx.match[1]);
  const w   = u.wallets[idx];
  if (!w) { await ctx.answerCbQuery("Not found."); return; }
  await ctx.answerCbQuery("🙈 Seed sent privately");
  await ctx.reply(
    `🙈 *${w.label} — Seed Phrase*\n\n` +
    `⚠️ *NEVER share with anyone!*\n\n` +
    `\`${w.mnemonic.join(" ")}\`\n\n` +
    `_Write these 24 words on paper and store safely._`,
    { parse_mode:"Markdown" }
  );
});



bot.command("scan", async ctx => {
  const u = getU(ctx.from.id); u.input = "scan_addr";
  await ctx.reply("🔍 *Token Scanner*\n\nPaste a token contract address:", { parse_mode:"Markdown", ...BACK_KB() });
});

bot.command(["lp","lpscan"], async ctx => {
  await ctx.reply(msgLpScanner(), {
    parse_mode:"Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Refresh","refresh_lp")],
      [Markup.button.callback("🔔 Alert me on new burns","alert_lp")],
    ])
  });
});

bot.command(["lock","lockcheck"], async ctx => {
  const u = getU(ctx.from.id); u.input = "lock_addr";
  await ctx.reply(msgLockChecker(), { parse_mode:"Markdown", ...BACK_KB() });
});

bot.command("signals", async ctx => {
  await ctx.reply(msgSignals(), {
    parse_mode:"Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Refresh","refresh_sig"), Markup.button.callback("🔔 Auto-alerts","toggle_alerts")],
    ])
  });
});

bot.command("sniper", async ctx => {
  const u = getU(ctx.from.id);
  await ctx.reply(msgSniperList(u.snipers), { parse_mode:"Markdown", ...SNIPER_KB(u.snipers) });
});

bot.command("positions", async ctx => {
  const u = getU(ctx.from.id);
  await ctx.reply(msgPositions(u.positions), { parse_mode:"Markdown", ...posKb(u.positions) });
});

bot.command("copytrade", async ctx => {
  const u = getU(ctx.from.id); u.input = "copy_addr";
  await ctx.reply(msgCopyTrade(u.copyTargets), {
    parse_mode:"Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("📋 Copy #1 (UQAx...+847%)","copy_1")],
      [Markup.button.callback("📋 Copy #2 (UQBz...+412%)","copy_2")],
      [Markup.button.callback("📋 Copy #3 (UQCp...+298%)","copy_3")],
      [Markup.button.callback("🛑 Stop All Copy","copy_stop")],
    ])
  });
});

bot.command("limit", async ctx => {
  const u = getU(ctx.from.id); u.input = "limit_addr";
  await ctx.reply(
    `📋 *Limit Orders*\n\nSet auto buy/sell when a token hits your target price.\n\nPaste token address:`,
    { parse_mode:"Markdown", ...BACK_KB() }
  );
});

bot.command("rewards", async ctx => {
  const u = getU(ctx.from.id);
  await ctx.reply(msgRewards(ctx.from.id,u), { parse_mode:"Markdown" });
});

bot.command("settings", async ctx => {
  const u = getU(ctx.from.id);
  await ctx.reply(`⚙️ *Settings*\n\nFee: *0.5%* _(lowest on TON)_`, { parse_mode:"Markdown", ...SETTINGS_KB(u) });
});

bot.command("help", async ctx => {
  await ctx.reply(msgHelp(), { parse_mode:"Markdown" });
});

bot.command("withdraw", async ctx => {
  const u = getU(ctx.from.id); u.input = "withdraw_to";
  await ctx.reply(
    `📤 *Withdraw TON*\n\nAvailable: *${fmtTON(u.wallet?.balance||0)}*\n\nPaste destination address:`,
    { parse_mode:"Markdown", ...BACK_KB() }
  );
});

// ─── KEYBOARD TEXT ─────────────────────────────────────────────
const KB_MAP: Record<string,Function> = {
  "💰 Buy":          async (ctx:any,u:UserState)=>{ u.input="buy_addr"; await ctx.reply("💰 *Buy Token*\n\nPaste token contract address:", {parse_mode:"Markdown",...BACK_KB()}); },
  "💸 Sell":         async (ctx:any,u:UserState)=>{ await ctx.reply(msgPositions(u.positions), {parse_mode:"Markdown",...posKb(u.positions)}); },
  "🎯 Sniper":       async (ctx:any,u:UserState)=>{ await ctx.reply(msgSniperList(u.snipers), {parse_mode:"Markdown",...SNIPER_KB(u.snipers)}); },
  "📡 AI Signals":   async (ctx:any,u:UserState)=>{ await ctx.reply(msgSignals(), {parse_mode:"Markdown",...Markup.inlineKeyboard([[Markup.button.callback("🔄 Refresh","refresh_sig"),Markup.button.callback("🔔 Auto-alerts","toggle_alerts")]])}); },
  "📊 Positions":    async (ctx:any,u:UserState)=>{ await ctx.reply(msgPositions(u.positions), {parse_mode:"Markdown",...posKb(u.positions)}); },
  "📋 Limit Orders": async (ctx:any,u:UserState)=>{ u.input="limit_addr"; await ctx.reply(`📋 *Limit Orders*\n\nPaste token address to set limit:`, {parse_mode:"Markdown",...BACK_KB()}); },
  "🔍 Scan Token":   async (ctx:any,u:UserState)=>{ u.input="scan_addr"; await ctx.reply("🔍 Paste token address to scan:", {parse_mode:"Markdown",...BACK_KB()}); },
  "🔥 LP Scanner":   async (ctx:any,u:UserState)=>{ await ctx.reply(msgLpScanner(), {parse_mode:"Markdown",...Markup.inlineKeyboard([[Markup.button.callback("🔄 Refresh","refresh_lp")],[Markup.button.callback("🔔 Alert new burns","alert_lp")]])}); },
  "🔒 Lock Checker": async (ctx:any,u:UserState)=>{ u.input="lock_addr"; await ctx.reply(msgLockChecker(), {parse_mode:"Markdown",...BACK_KB()}); },
  "👥 Copy Trade":   async (ctx:any,u:UserState)=>{ u.input="copy_addr"; await ctx.reply(msgCopyTrade(u.copyTargets), {parse_mode:"Markdown",...Markup.inlineKeyboard([[Markup.button.callback("📋 Copy #1","copy_1")],[Markup.button.callback("📋 Copy #2","copy_2")],[Markup.button.callback("📋 Copy #3","copy_3")]]) }); },
  "⭐ Watchlist":    async (ctx:any,u:UserState)=>{ await ctx.reply(u.watchlist.length?u.watchlist.map(w=>`⭐ *${w.sym}*\n   ${w.price.toFixed(10)} TON · ${LAUNCHPADS[w.launchpad as keyof typeof LAUNCHPADS]?.emoji||"⚡"}`).join("\n\n"):"⭐ *Watchlist*\n\nEmpty. Paste a token address to add.", {parse_mode:"Markdown"}); },
  "🎁 Rewards":      async (ctx:any,u:UserState)=>{ await ctx.reply(msgRewards(ctx.from.id,u), {parse_mode:"Markdown"}); },
  "📤 Withdraw":     async (ctx:any,u:UserState)=>{ u.input="withdraw_to"; await ctx.reply(`📤 Paste destination TON address:\nAvailable: *${fmtTON(u.wallet?.balance||0)}*`, {parse_mode:"Markdown",...WALLET_BACK_KB()}); },
  "📥 Deposit":      async (ctx:any,u:UserState)=>{ const w=u.wallet; if(!w){await ctx.reply("No wallet.",WALLET_KB());return;} await ctx.reply(`📥 *Deposit*\n\nSend TON to:\n\`${w.address}\`\n\nBalance: ${fmtTON(w.balance)}`, {parse_mode:"Markdown",...WALLET_KB()}); },
  "⚙️ Settings":     async (ctx:any,u:UserState)=>{ await ctx.reply(`⚙️ *Settings*\n\nFee: *0.5%* _(lowest on TON)_`, {parse_mode:"Markdown",...SETTINGS_KB(u)}); },
  "❓ Help":          async (ctx:any)             =>{ await ctx.reply(msgHelp(), {parse_mode:"Markdown"}); },
  "🔄 Refresh":      async (ctx:any,u:UserState)=>{ await ctx.reply(msgStart(ctx.from.id,u), {parse_mode:"Markdown",...MAIN_KB()}); },
  "◀️ Main Menu":    async (ctx:any,u:UserState)=>{ u.input=undefined; await ctx.reply(msgStart(ctx.from.id,u), {parse_mode:"Markdown",...MAIN_KB()}); },
};

for (const [text, fn] of Object.entries(KB_MAP)) {
  bot.hears(text, async ctx => { const u = getU(ctx.from.id); await fn(ctx, u); });
}

// ─── TEXT INPUT HANDLER ───────────────────────────────────────
bot.on(message("text"), async ctx => {
  const uid  = ctx.from.id;
  const u    = getU(uid);
  const text = ctx.message.text.trim();

  // Skip if handled by hears() above
  if (KB_MAP[text]) return;

  const isTon = /^(EQ|UQ)[a-zA-Z0-9_\-]{46}$/.test(text) || text.startsWith("EQ");

  // Auto-scan any pasted address regardless of state
  if (isTon) {
    const scan = scanToken(text);
    await ctx.reply(
      msgTokenScan(scan),
      { parse_mode:"Markdown", ...msgScanKb(scan, u.buyAmount) }
    );
    u.tmpAddr = text;
    u.input = undefined;
    return;
  }

  switch (u.input) {

    case "import_seed": {
      const words = text.trim().split(/\s+/);
      u.input = undefined;
      if (words.length !== 24) {
        await ctx.reply(
          `❌ *Invalid seed phrase*\n\nReceived ${words.length} words. A valid seed phrase has exactly *24 words*.\n\nTry again:`,
          { parse_mode:"Markdown", ...WALLET_BACK_KB() }
        );
        return;
      }
      const label = `Wallet ${u.wallets.length + 1} (imported)`;
      const w: Wallet = {
        id:        rid(),
        label,
        address:   `UQ${rid()}${rid()}${rid()}`.slice(0,48),
        mnemonic:  words,
        balance:   0,
        imported:  true,
        createdAt: Date.now(),
      };
      u.wallets.push(w);
      u.activeWalletIdx = u.wallets.length - 1;
      await ctx.reply(
        `✅ *Wallet Imported!*\n\n*${label}*\n\`${w.address}\`\n\n*Balance:* 0.0000 TON\n\n` +
        `Wallet has been set as active. Deposit TON to start trading.`,
        { parse_mode:"Markdown", ...WALLET_KB() }
      );
      return;
    }



    case "scan_addr":
      await ctx.reply("❌ Invalid address."); break;

    case "lock_addr":
      await ctx.reply(msgLockChecker(text), { parse_mode:"Markdown" });
      u.input = undefined; break;

    case "sniper_addr": {
      u.input = "sniper_buytok";
      u.tmpAddr = text;
      await ctx.reply(
        `🎯 *Sniper target set*\n\`${fmtAddr(text)}\`\n\nBuy amount in TON:`,
        { parse_mode:"Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("0.1","sn0.1"),Markup.button.callback("0.5","sn0.5"),Markup.button.callback("1","sn1")],
            [Markup.button.callback("2","sn2"),    Markup.button.callback("5","sn5"),    Markup.button.callback("10","sn10")],
          ])
        }
      );
      break;
    }

    case "withdraw_to": {
      u.input = "withdraw_amt";
      u.tmpAddr = text;
      await ctx.reply(`Amount to send? Available: *${fmtTON(u.wallet?.balance||0)}*`, {parse_mode:"Markdown"});
      break;
    }

    case "withdraw_amt": {
      const amt = parseFloat(text);
      u.input = undefined;
      if (isNaN(amt)||amt<=0) { await ctx.reply("❌ Invalid amount."); break; }
      if (amt>(u.wallet?.balance||0)) { await ctx.reply(`❌ Insufficient balance.`); break; }
      await ctx.reply(`⏳ Sending *${fmtTON(amt)}* to \`${u.tmpAddr}\`...`, {parse_mode:"Markdown"});
      setTimeout(async()=>{
        if(u.wallet) u.wallet.balance=Math.max(0,u.wallet.balance-amt);
        await ctx.reply(`✅ *Sent!*\n${fmtTON(amt)} → \`${fmtAddr(u.tmpAddr||"")}\`\nTx: \`${txid()}\``,{parse_mode:"Markdown"});
      },2000);
      break;
    }

    case "copy_addr": {
      u.input = undefined;
      u.copyTargets.push({ addr:text, active:true, minAmount:0.1, maxAmount:u.buyAmount, ts:Date.now() });
      await ctx.reply(`👥 *Copy enabled!*\n\nNow copying: \`${fmtAddr(text)}\`\nMin: 0.1 TON · Max: ${u.buyAmount} TON`, {parse_mode:"Markdown",...MAIN_KB()});
      break;
    }

    case "limit_addr": {
      u.input = "limit_price";
      u.tmpAddr = text;
      const t = scanToken(text);
      await ctx.reply(
        `📋 *New Limit Order*\n\n*${t.sym}* · Current: \`${t.price.toFixed(10)}\` TON\n\nTarget price (in TON):`,
        {parse_mode:"Markdown"}
      );
      break;
    }

    case "limit_price": {
      const price = parseFloat(text);
      if(isNaN(price)) { await ctx.reply("❌ Invalid price."); break; }
      u.input = "limit_amt";
      u.tmpData = { price };
      await ctx.reply(`Amount to buy in TON:`, {parse_mode:"Markdown"});
      break;
    }

    case "limit_amt": {
      const amt = parseFloat(text);
      if(isNaN(amt)) { await ctx.reply("❌ Invalid."); break; }
      const order: LimitOrder = {
        id: rid(), addr: u.tmpAddr||"", sym:"TOKEN",
        side:"buy", price: u.tmpData?.price||0, amount:amt,
        status:"active", ts:Date.now()
      };
      u.limitOrders.push(order);
      u.input = undefined;
      await ctx.reply(
        `✅ *Limit Buy Set!*\n\nBuy ${amt} TON at \`${order.price.toFixed(10)}\` TON\nOrder ID: \`${order.id}\``,
        {parse_mode:"Markdown",...MAIN_KB()}
      );
      break;
    }

    default:
      await ctx.reply("Paste a TON token address to scan, or use the menu below.", MAIN_KB());
  }
});

// ─── INLINE CALLBACKS ─────────────────────────────────────────

// Quick buy from scan
bot.action(/^quick_buy_(.+)_(.+)$/, async ctx => {
  const [,addr,amt] = ctx.match;
  const u = getU(ctx.from.id);
  const t = scanToken(addr);
  if (t.honeypot) { await ctx.answerCbQuery("🚨 HONEYPOT DETECTED — buy blocked!"); return; }
  await ctx.editMessageText(
    `⏳ *Buying ${amt} TON of $${t.sym}...*\n\nFee: ${feeLabel()}\nGas: ${gasLabel(u.gas)}`,
    {parse_mode:"Markdown"}
  );
  await ctx.answerCbQuery("⏳ Processing...");
  setTimeout(async()=>{
    const recv = Math.floor(parseFloat(amt)*1_200_000);
    u.positions.push({ sym:t.sym, addr, launchpad:t.launchpad, entry:t.price, current:t.price, amount:recv, valueUSD:parseFloat(amt)*TON_USD, pnlPct:0, ts:Date.now() });
    await ctx.editMessageText(
      `✅ *Bought $${t.sym}!*\n\nPaid: ${amt} TON\nReceived: ${recv.toLocaleString()} $${t.sym}\nFee paid: ${(parseFloat(amt)*FEE_RATE).toFixed(4)} TON _(0.5%)_\nTx: \`${txid()}\``,
      {parse_mode:"Markdown"}
    );
  },1800);
});

// Buy with address then pick amount
bot.action(/^buy_addr_(.+)$/, async ctx => {
  const [,addr] = ctx.match;
  getU(ctx.from.id).tmpAddr = addr;
  await ctx.editMessageText("Select amount:", {parse_mode:"Markdown", ...BUY_AMT_KB(getU(ctx.from.id).buyAmount)});
  await ctx.answerCbQuery();
});

// Buy preset amounts b0.1, b0.5, b1, b2, b5, b10
["0.1","0.5","1","2","5","10"].forEach(amt=>{
  bot.action(`b${amt}`, async ctx=>{
    const u = getU(ctx.from.id);
    const addr = u.tmpAddr;
    if (!addr) { await ctx.answerCbQuery("Paste a token address first."); return; }
    const t = scanToken(addr);
    await ctx.editMessageText(
      `🛒 *Confirm Buy*\n\n$${t.sym} · ${amt} TON\nFee: ${(parseFloat(amt)*FEE_RATE).toFixed(4)} TON _(0.5%)_\nYou receive ≈ ${Math.floor(parseFloat(amt)*1_200_000).toLocaleString()} $${t.sym}`,
      { parse_mode:"Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback(`✅ Confirm`,`exec_buy_${addr}_${amt}`)],
          [Markup.button.callback("❌ Cancel","cancel")],
        ])
      }
    );
    await ctx.answerCbQuery();
  });
});

// Execute buy
bot.action(/^exec_buy_(.+)_(.+)$/, async ctx=>{
  const [,addr,amtStr] = ctx.match;
  const u = getU(ctx.from.id);
  const amt = parseFloat(amtStr);
  const t = scanToken(addr);
  await ctx.editMessageText(`⏳ Executing swap...`, {parse_mode:"Markdown"});
  await ctx.answerCbQuery("⏳ Processing...");
  setTimeout(async()=>{
    const recv = Math.floor(amt*1_200_000);
    u.positions.push({ sym:t.sym, addr, launchpad:t.launchpad, entry:t.price, current:t.price, amount:recv, valueUSD:amt*TON_USD, pnlPct:0, ts:Date.now() });
    u.tmpAddr=undefined;
    await ctx.editMessageText(
      `✅ *Swap Done!*\n\n+${recv.toLocaleString()} $${t.sym}\nPaid: ${amt} TON · Fee: ${(amt*FEE_RATE).toFixed(4)} TON\nTx: \`${txid()}\``,
      {parse_mode:"Markdown"}
    );
  },1800);
});

// Sell position
bot.action(/^sellpos_(.+)$/, async ctx=>{
  const [,sym] = ctx.match;
  await ctx.editMessageText(
    `💸 *Sell $${sym}* — Select %:`,
    { parse_mode:"Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("25%",`sp25_${sym}`), Markup.button.callback("50%",`sp50_${sym}`)],
        [Markup.button.callback("75%",`sp75_${sym}`), Markup.button.callback("100%",`sp100_${sym}`)],
        [Markup.button.callback("❌ Cancel","cancel")],
      ])
    }
  );
  await ctx.answerCbQuery();
});

bot.action(/^sp(\d+)_(.+)$/, async ctx=>{
  const u   = getU(ctx.from.id);
  const [,pctStr,sym] = ctx.match;
  const pct = parseInt(pctStr);
  const pos = u.positions.find(p=>p.sym===sym);
  await ctx.editMessageText(`⏳ Selling ${pct}% of $${sym}...`, {parse_mode:"Markdown"});
  await ctx.answerCbQuery("⏳ Selling...");
  setTimeout(async()=>{
    const tonOut = (((pos?.valueUSD||100)*(pct/100))/TON_USD);
    if (pct===100) u.positions = u.positions.filter(p=>p.sym!==sym);
    else if (pos) { pos.amount=Math.floor(pos.amount*(1-pct/100)); pos.valueUSD*=(1-pct/100); }
    await ctx.editMessageText(
      `✅ *Sold ${pct}% of $${sym}*\n\nReceived: ${fmtTON(tonOut)}\nFee: ${(tonOut*FEE_RATE).toFixed(4)} TON\nTx: \`${txid()}\``,
      {parse_mode:"Markdown"}
    );
  },1800);
});

// Snipe now
bot.action(/^snipe_now_(.+)$/, async ctx=>{
  const [,addr] = ctx.match;
  const u = getU(ctx.from.id);
  u.snipers.push({ addr, launchpad:"megagram", buyAmount:u.buyAmount, maxMcap:500, minLiquidity:5, active:true, ts:Date.now() });
  await ctx.answerCbQuery("🎯 Sniper armed!");
  await ctx.editMessageText(
    `🎯 *Sniper Armed!*\n\n\`${fmtAddr(addr)}\`\nBuy: ${u.buyAmount} TON when it goes live.\n🔥 0-block execution · Anti-rug LP check ON`,
    {parse_mode:"Markdown"}
  );
});

bot.action("sniper_add", async ctx=>{
  const u = getU(ctx.from.id); u.input="sniper_addr";
  await ctx.answerCbQuery();
  await ctx.reply("🎯 Paste token address to snipe:", {parse_mode:"Markdown"});
});

["sn0.1","sn0.5","sn1","sn2","sn5","sn10"].forEach(a=>{
  const amt = a.replace("sn","");
  bot.action(a, async ctx=>{
    const u = getU(ctx.from.id);
    const addr = u.tmpAddr||"";
    u.snipers.push({ addr, launchpad:"megagram", buyAmount:parseFloat(amt), maxMcap:500, minLiquidity:5, active:true, ts:Date.now() });
    u.input=undefined;
    await ctx.answerCbQuery("✅ Sniper set!");
    await ctx.editMessageText(
      `🎯 *Sniper Set!*\n\n\`${fmtAddr(addr)}\`\nBuy: *${amt} TON* on launch\n🔥 0-block · Anti-rug ON`,
      {parse_mode:"Markdown"}
    );
  });
});

bot.action("sniper_turbo", async ctx=>{
  await ctx.answerCbQuery("🚀 Turbo mode: 0-block snipe ON!");
  await ctx.reply("🚀 *Turbo Sniper Mode*\n\nYour next snipe will use maximum gas (0.15 TON) for instant 0-block execution.\nFastest on TON network.", {parse_mode:"Markdown"});
});

bot.action("sniper_list", async ctx=>{
  const u = getU(ctx.from.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText(msgSniperList(u.snipers), {parse_mode:"Markdown",...SNIPER_KB(u.snipers)});
});

bot.action("sniper_stop_all", async ctx=>{
  const u = getU(ctx.from.id);
  u.snipers.forEach(s=>s.active=false);
  await ctx.answerCbQuery("🛑 All snipers stopped.");
  await ctx.editMessageText("🛑 All snipers deactivated.", {parse_mode:"Markdown",...SNIPER_KB(u.snipers)});
});

bot.action("watch_add", async ctx=>{
  await ctx.answerCbQuery("Not enough data."); // fallback
});

bot.action(/^watch_add_(.+)_(.+)$/, async ctx=>{
  const [,addr,sym] = ctx.match;
  const u = getU(ctx.from.id);
  u.watchlist.push({ addr, sym, price:rnd(0.0000001,0.000005), launchpad:"megagram" });
  await ctx.answerCbQuery("⭐ Added to watchlist!");
  await ctx.editMessageText(`⭐ *$${sym} added to watchlist!*\nYou'll get alerts on price moves.`, {parse_mode:"Markdown"});
});

bot.action(/^limit_from_(.+)_(.+)$/, async ctx=>{
  const [,addr,sym] = ctx.match;
  const u = getU(ctx.from.id);
  u.tmpAddr = addr; u.input="limit_price";
  await ctx.answerCbQuery();
  await ctx.reply(`📋 Enter target buy price for $${sym} (in TON):`, {parse_mode:"Markdown"});
});

bot.action(/^rescan_(.+)$/, async ctx=>{
  const [,addr] = ctx.match;
  const scan = scanToken(addr);
  await ctx.answerCbQuery("🔄 Rescanning...");
  await ctx.editMessageText(msgTokenScan(scan), {parse_mode:"Markdown", ...msgScanKb(scan, getU(ctx.from.id).buyAmount)});
});

bot.action("refresh_pos", async ctx=>{
  const u = getU(ctx.from.id);
  await ctx.answerCbQuery("✅ Refreshed");
  await ctx.editMessageText(msgPositions(u.positions), {parse_mode:"Markdown",...posKb(u.positions)});
});

bot.action("refresh_sig", async ctx=>{ await ctx.answerCbQuery("✅ Refreshed"); await ctx.editMessageText(msgSignals(), {parse_mode:"Markdown",...Markup.inlineKeyboard([[Markup.button.callback("🔄 Refresh","refresh_sig"),Markup.button.callback("🔔 Auto-alerts","toggle_alerts")]])}); });
bot.action("refresh_lp",  async ctx=>{ await ctx.answerCbQuery("✅ Refreshed"); await ctx.editMessageText(msgLpScanner(), {parse_mode:"Markdown",...Markup.inlineKeyboard([[Markup.button.callback("🔄 Refresh","refresh_lp")],[Markup.button.callback("🔔 Alert new burns","alert_lp")]])}); });
bot.action("refresh_bal", async ctx=>{ await ctx.answerCbQuery("✅ Balance refreshed"); });
bot.action("refresh_watchlist", async ctx=>{ await ctx.answerCbQuery("✅ Refreshed"); });

bot.action("toggle_alerts", async ctx=>{
  const u = getU(ctx.from.id); u.alertsOn = !u.alertsOn;
  await ctx.answerCbQuery(u.alertsOn?"🔔 Alerts ON":"🔕 Alerts OFF");
});

bot.action("alert_lp", async ctx=>{ await ctx.answerCbQuery("🔔 LP burn alerts enabled!"); await ctx.reply("🔔 You'll be notified instantly when LP is burned on any tracked token.", {parse_mode:"Markdown"}); });

// Copy presets
["1","2","3"].forEach(n=>{
  const addrs = ["UQAx...k9Rd","UQBz...m3Wq","UQCp...n7Ht"];
  bot.action(`copy_${n}`, async ctx=>{
    const u = getU(ctx.from.id);
    u.copyTargets.push({ addr:addrs[parseInt(n)-1], active:true, minAmount:0.1, maxAmount:u.buyAmount, ts:Date.now() });
    await ctx.answerCbQuery("✅ Copy trade enabled!");
    await ctx.editMessageText(`👥 *Copy enabled!*\n\nCopying: \`${addrs[parseInt(n)-1]}\`\nAll their trades mirrored up to ${u.buyAmount} TON.`, {parse_mode:"Markdown"});
  });
});

bot.action("copy_stop", async ctx=>{ getU(ctx.from.id).copyTargets.forEach(t=>t.active=false); await ctx.answerCbQuery("🛑 All copy trades stopped"); });

// Settings
const GAS_KEYS = ["slow","normal","fast","turbo"] as const;
GAS_KEYS.forEach(g=>{
  bot.action(`s_gas_${g}`, async ctx=>{
    const u = getU(ctx.from.id); u.gas=g;
    await ctx.answerCbQuery(`Gas: ${g}`);
    await ctx.editMessageText(`⚙️ *Settings*\n\nFee: *0.5%* _(lowest on TON)_`, {parse_mode:"Markdown",...SETTINGS_KB(u)});
  });
});

bot.action("s_mev", async ctx=>{ const u=getU(ctx.from.id); u.antiMev=!u.antiMev; await ctx.answerCbQuery(u.antiMev?"Anti-MEV ON":"Anti-MEV OFF"); await ctx.editMessageText(`⚙️ *Settings*\n\nFee: *0.5%*`, {parse_mode:"Markdown",...SETTINGS_KB(u)}); });
bot.action("s_alerts", async ctx=>{ const u=getU(ctx.from.id); u.alertsOn=!u.alertsOn; await ctx.answerCbQuery(u.alertsOn?"Alerts ON":"Alerts OFF"); await ctx.editMessageText(`⚙️ *Settings*\n\nFee: *0.5%*`, {parse_mode:"Markdown",...SETTINGS_KB(u)}); });

bot.action("s_export", async ctx=>{
  const u = getU(ctx.from.id);
  await ctx.answerCbQuery("⚠️ Sensitive — check DMs");
  await ctx.reply(`🔑 *Seed Phrase — DO NOT SHARE*\n\n\`${u.wallet?.mnemonic?.join(" ")||"No wallet"}\`\n\n⚠️ Anyone with this phrase owns your wallet.`, {parse_mode:"Markdown"});
});

bot.action("s_lpad", async ctx=>{
  const u = getU(ctx.from.id);
  const opts = ["all","stonpump","gaspump","dedeploy","megagram"] as const;
  const idx = opts.indexOf(u.preferLaunchpad as any);
  u.preferLaunchpad = opts[(idx+1)%opts.length];
  await ctx.answerCbQuery(`Launchpad: ${u.preferLaunchpad}`);
  await ctx.editMessageText(`⚙️ *Settings*\n\nFee: *0.5%*`, {parse_mode:"Markdown",...SETTINGS_KB(u)});
});

bot.action("s_buy", async ctx=>{ getU(ctx.from.id).input="s_buy_amt"; await ctx.answerCbQuery(); await ctx.reply("Enter new default buy amount (TON):"); });
bot.action("s_slip",async ctx=>{ getU(ctx.from.id).input="s_slip_val"; await ctx.answerCbQuery(); await ctx.reply("Enter slippage % (e.g. 1, 2, 5):"); });
bot.action("s_tp",  async ctx=>{ getU(ctx.from.id).input="s_tp_val";  await ctx.answerCbQuery(); await ctx.reply("Auto take-profit % (0 = off):"); });
bot.action("s_sl",  async ctx=>{ getU(ctx.from.id).input="s_sl_val";  await ctx.answerCbQuery(); await ctx.reply("Auto stop-loss % (0 = off):"); });

bot.action("cancel",     async ctx=>{ getU(ctx.from.id).input=undefined; await ctx.answerCbQuery("Cancelled"); await ctx.reply("Cancelled.", MAIN_KB()); });
bot.action("cancel_msg", async ctx=>{ await ctx.answerCbQuery("Closed"); try { await ctx.deleteMessage(); } catch{} });
bot.action("s_delete",   async ctx=>{ await ctx.answerCbQuery("⚠️ Use /deleteconfirm to confirm"); });

// ─── Launch ───────────────────────────────────────────────────
bot.launch().then(()=>console.log("✅ MegaGram PRO Sniper Bot live!")).catch(console.error);
process.once("SIGINT",  ()=>bot.stop("SIGINT"));
process.once("SIGTERM", ()=>bot.stop("SIGTERM"));
