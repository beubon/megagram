import { useState, useEffect, useRef, useCallback } from "react";

// ─── EMPTY STATE — no mock tokens ────────────────────────────
const TOKENS  = [];   // populated from blockchain / API
const HOLDINGS = [];
const TRADES   = [];

const fmt = (n) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;

// ─── THEME ───────────────────────────────────────────────────
const G = {
  bg:"#020509", surface:"#060d18", card:"#081020",
  border:"#0f1e38", border2:"#162a4a",
  accent:"#00e5ff", purple:"#8b5cf6", pink:"#f43f5e",
  green:"#10ffa0", yellow:"#fbbf24", orange:"#f97316",
  text:"#dde8ff", muted:"#2d4060", muted2:"#4a6080",
};

// ─── PARTICLE FIELD ──────────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = canvas.width = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;
    let raf;

    const count = 70;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.4 - 0.1,
      alpha: Math.random() * 0.6 + 0.1,
      color: Math.random() > 0.6
        ? `rgba(0,229,255,`
        : Math.random() > 0.5
        ? `rgba(139,92,246,`
        : `rgba(16,255,160,`,
    }));

    // Connection lines between nearby particles
    function draw() {
      ctx.clearRect(0, 0, W, H);
      // Update
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      });
      // Lines
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0,229,255,${0.08 * (1 - dist/90)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      // Dots
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.alpha + ")";
        ctx.fill();
        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color + (p.alpha * 0.15) + ")";
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }
    draw();
    const ro = new ResizeObserver(() => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return (
    <canvas ref={canvasRef} style={{
      position:"absolute", inset:0, width:"100%", height:"100%",
      pointerEvents:"none", zIndex:0,
    }}/>
  );
}

// ─── AURORA BACKGROUND ───────────────────────────────────────
function AuroraBackground() {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
      {/* Base dark */}
      <div style={{ position:"absolute", inset:0, background:G.bg }} />
      {/* Aurora blobs */}
      <div style={{
        position:"absolute", top:"-20%", left:"10%",
        width:"60%", height:"50%",
        background:"radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)",
        animation:"auroraMove1 12s ease-in-out infinite",
        filter:"blur(40px)",
      }}/>
      <div style={{
        position:"absolute", top:"10%", right:"-10%",
        width:"50%", height:"40%",
        background:"radial-gradient(ellipse, rgba(0,229,255,0.09) 0%, transparent 70%)",
        animation:"auroraMove2 15s ease-in-out infinite",
        filter:"blur(50px)",
      }}/>
      <div style={{
        position:"absolute", bottom:"5%", left:"5%",
        width:"45%", height:"35%",
        background:"radial-gradient(ellipse, rgba(16,255,160,0.06) 0%, transparent 70%)",
        animation:"auroraMove3 18s ease-in-out infinite",
        filter:"blur(45px)",
      }}/>
      {/* Grid overlay */}
      <div style={{
        position:"absolute", inset:0,
        backgroundImage:`linear-gradient(rgba(0,229,255,0.025) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(0,229,255,0.025) 1px, transparent 1px)`,
        backgroundSize:"44px 44px",
      }}/>
      {/* Scanlines */}
      <div style={{
        position:"absolute", inset:0,
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,229,255,0.008) 2px,rgba(0,229,255,0.008) 4px)",
      }}/>
    </div>
  );
}

// ─── ANIMATED COUNTER ────────────────────────────────────────
function AnimCounter({ target, prefix="", suffix="" }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / 40;
    const t = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(t); }
      else setVal(Math.floor(start));
    }, 30);
    return () => clearInterval(t);
  }, [target]);
  return <span>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ─── NEON BUTTON ─────────────────────────────────────────────
function NeonButton({ children, color = G.accent, onClick, style = {}, small = false }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: small ? "7px 16px" : "11px 22px",
        border: `1px solid ${color}`,
        borderRadius: 6,
        background: hover ? `${color}18` : `${color}08`,
        color,
        fontFamily: "'Orbitron',sans-serif",
        fontSize: small ? 10 : 12,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: hover ? `0 0 20px ${color}40, 0 0 40px ${color}18` : `0 0 8px ${color}20`,
        whiteSpace: "nowrap",
        ...style,
      }}>
      {children}
    </button>
  );
}

// ─── BADGE ───────────────────────────────────────────────────
function Badge({ type, children }) {
  const s = {
    ai:       { bg:"rgba(139,92,246,0.2)",  color:"#a78bfa", b:"rgba(139,92,246,0.35)" },
    meme:     { bg:"rgba(244,63,94,0.18)",  color:"#fb7185", b:"rgba(244,63,94,0.35)"  },
    hot:      { bg:"rgba(251,191,36,0.15)", color:G.yellow,  b:"rgba(251,191,36,0.35)" },
    new:      { bg:"rgba(16,255,160,0.12)", color:G.green,   b:"rgba(16,255,160,0.3)"  },
    migrated: { bg:"rgba(251,191,36,0.12)", color:G.yellow,  b:"rgba(251,191,36,0.3)"  },
  }[type] || { bg:"rgba(139,92,246,0.2)", color:"#a78bfa", b:"rgba(139,92,246,0.35)" };
  return (
    <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.b}`,
      fontSize:8, fontFamily:"'Share Tech Mono',monospace", letterSpacing:"0.12em",
      padding:"2px 7px", borderRadius:3, textTransform:"uppercase", fontWeight:700, whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}

function Spinner() {
  return <span style={{ display:"inline-block", width:14, height:14,
    border:"2px solid rgba(255,255,255,0.2)", borderTopColor:"white",
    borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>;
}

function LiveDot({ color = G.green }) {
  return <span style={{ display:"inline-block", width:6, height:6,
    borderRadius:"50%", background:color, boxShadow:`0 0 6px ${color}`,
    animation:"pulse 1.5s ease-in-out infinite" }}/>;
}

function SectionTitle({ icon, children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
      <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10, color:G.accent,
        letterSpacing:"0.2em", textTransform:"uppercase" }}>{icon} {children}</span>
      <div style={{ flex:1, height:1,
        background:`linear-gradient(90deg,${G.border2},transparent)` }}/>
    </div>
  );
}

function FormRow({ label, required, children }) {
  return (
    <div style={{ marginBottom:11 }}>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9,
        letterSpacing:"0.14em", textTransform:"uppercase", color:G.muted2,
        marginBottom:5, display:"flex", justifyContent:"space-between" }}>
        {label}{required && <span style={{ color:G.pink }}>*</span>}
      </div>
      {children}
    </div>
  );
}

const iS = {
  width:"100%", background:"rgba(0,0,0,0.4)", border:`1px solid ${G.border2}`,
  borderRadius:6, padding:"9px 12px", color:G.text,
  fontFamily:"'Share Tech Mono',monospace", fontSize:12, outline:"none",
};

// ─── CURVE BAR ───────────────────────────────────────────────
function CurveBar({ pct, type, showTon=false, tonRaised=0 }) {
  const color = type==="ai"
    ? `linear-gradient(90deg,${G.purple},${G.accent})`
    : `linear-gradient(90deg,${G.pink},${G.yellow})`;
  const needed = 1000 - tonRaised;
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2,
          letterSpacing:"0.1em", textTransform:"uppercase", whiteSpace:"nowrap" }}>CURVE</span>
        <div style={{ flex:1, height:6, background:"rgba(255,255,255,0.05)", borderRadius:3, overflow:"hidden" }}>
          <div style={{ width:`${Math.min(100,pct)}%`, height:"100%", background:color,
            borderRadius:3, position:"relative", transition:"width 1s ease" }}>
            <span style={{ position:"absolute", right:0, top:0, bottom:0, width:10,
              background:"white", opacity:0.4, filter:"blur(3px)" }}/>
          </div>
        </div>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9,
          color:pct>=100?G.yellow:G.accent, minWidth:32, textAlign:"right" }}>
          {pct>=100?"✓ FULL":`${Math.round(pct)}%`}
        </span>
      </div>
      {showTon && (
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted }}>
          {pct>=100
            ? <span style={{ color:G.yellow }}>1,000 / 1,000 TON — Migrated to STON.FI ✓</span>
            : `${tonRaised.toLocaleString()} / 1,000 TON raised · ${needed.toLocaleString()} TON to migrate`}
        </div>
      )}
    </div>
  );
}

// ─── WALLET MODAL ─────────────────────────────────────────────
const WALLETS = [
  { id:"tonkeeper",   name:"Tonkeeper",   icon:"💎", desc:"Most popular TON wallet",        sub:"iOS, Android, Browser" },
  { id:"mytonwallet", name:"MyTonWallet", icon:"💠", desc:"Official TON Foundation wallet",  sub:"iOS, Android, Web"    },
  { id:"tonhub",      name:"Tonhub",      icon:"🔷", desc:"Secure multi-chain wallet",       sub:"iOS, Android"         },
  { id:"openmask",    name:"OpenMask",    icon:"🟦", desc:"TON browser extension",           sub:"Chrome, Firefox"      },
];

function WalletModal({ onClose, onConnect }) {
  const [step, setStep]     = useState("list");
  const [sel, setSel]       = useState(null);
  const [addr, setAddr]     = useState("");
  const mock = "UQBvl9jKsV7d2pHar8Kx1mN3oFzqTwE6sYcRdLiPaGbA9Rd";

  function pick(w) {
    setSel(w); setStep("connecting");
    setTimeout(() => { setAddr(mock); setStep("success"); }, 1800);
  }
  function done() { onConnect({ address: addr, wallet: sel }); onClose(); }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:999,
      display:"flex", alignItems:"flex-end",
      background:"rgba(0,0,0,0.8)", backdropFilter:"blur(8px)" }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ width:"100%", maxWidth:480, margin:"0 auto",
        background:`linear-gradient(160deg,#0a1428 0%,${G.surface} 100%)`,
        border:`1px solid ${G.border2}`, borderRadius:"20px 20px 0 0",
        padding:"20px 16px 36px", animation:"slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>

        <div style={{ width:40, height:4, background:G.border2, borderRadius:2, margin:"0 auto 18px" }}/>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:15, fontWeight:800,
              color:G.text, letterSpacing:"0.08em" }}>
              {step==="success" ? "✅ Wallet Connected" : "Connect Wallet"}
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2, marginTop:2 }}>
              {step==="list" ? "Choose your TON wallet"
               : step==="connecting" ? `Connecting to ${sel?.name}...`
               : "Ready to trade on MegaGram"}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${G.border2}`,
            color:G.muted2, fontSize:16, width:32, height:32, borderRadius:6, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {step==="list" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {WALLETS.map(w => (
              <button key={w.id} onClick={() => pick(w)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                  background:G.card, border:`1px solid ${G.border}`,
                  borderRadius:10, cursor:"pointer", textAlign:"left", transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=G.accent; e.currentTarget.style.boxShadow=`0 0 16px ${G.accent}20`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=G.border; e.currentTarget.style.boxShadow="none"; }}>
                <div style={{ fontSize:26, width:44, height:44,
                  background:"rgba(255,255,255,0.05)", borderRadius:10,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  border:`1px solid ${G.border}` }}>{w.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:12, fontWeight:700, color:G.text }}>{w.name}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2, marginTop:1 }}>{w.desc}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted, marginTop:1 }}>{w.sub}</div>
                </div>
                <span style={{ color:G.muted2, fontSize:18 }}>›</span>
              </button>
            ))}
            <div style={{ marginTop:8, padding:"10px 12px",
              background:"rgba(0,229,255,0.04)", border:`1px solid rgba(0,229,255,0.12)`,
              borderRadius:8, fontFamily:"'Share Tech Mono',monospace", fontSize:9,
              color:G.muted2, lineHeight:1.7 }}>
              🔒 MegaGram never stores your private keys. Transactions are signed locally in your wallet.
            </div>
          </div>
        )}

        {step==="connecting" && (
          <div style={{ textAlign:"center", padding:"32px 0" }}>
            <div style={{ fontSize:52, marginBottom:16, animation:"pulse 1s ease-in-out infinite" }}>{sel?.icon}</div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:16 }}>
              <Spinner/>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:G.accent }}>
                Waiting for {sel?.name}...
              </span>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>
              Approve the connection request in your wallet app
            </div>
            <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:20 }}>
              {[0,1,2].map(i => <div key={i} style={{ width:8, height:8, borderRadius:"50%",
                background:G.accent, opacity:0.3,
                animation:`bounce 1s ease-in-out ${i*0.2}s infinite` }}/>)}
            </div>
          </div>
        )}

        {step==="success" && (
          <div>
            <div style={{ textAlign:"center", padding:"16px 0 24px" }}>
              {/* Glowing success ring */}
              <div style={{ position:"relative", display:"inline-block", marginBottom:12 }}>
                <div style={{ fontSize:52 }}>💎</div>
                <div style={{ position:"absolute", inset:"-8px", borderRadius:"50%",
                  background:"radial-gradient(circle, rgba(16,255,160,0.2) 0%, transparent 70%)",
                  animation:"pulse 2s ease-in-out infinite" }}/>
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.muted2, marginBottom:8 }}>
                Connected via {sel?.name}
              </div>
              <div style={{ background:G.card, border:`1px solid ${G.green}40`,
                borderRadius:8, padding:"10px 16px", display:"inline-block",
                fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.green,
                letterSpacing:"0.05em", boxShadow:`0 0 16px ${G.green}20` }}>
                {addr.slice(0,10)}...{addr.slice(-8)}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:18 }}>
              {[["Network","TON Mainnet"],["Balance","12.45 TON"],["Status","Ready"]].map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between",
                  padding:"7px 10px", background:"rgba(255,255,255,0.03)",
                  borderRadius:6, border:`1px solid ${G.border}` }}>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>{k}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10,
                    color:k==="Status"?G.green:G.text }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={done} style={{ width:"100%", padding:14, border:"none", borderRadius:8,
              cursor:"pointer", background:`linear-gradient(135deg,${G.accent},${G.purple})`,
              fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:700,
              letterSpacing:"0.1em", color:"#000", textTransform:"uppercase",
              boxShadow:`0 0 24px ${G.accent}40` }}>
              🚀 Start Trading
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PRICE CHART ─────────────────────────────────────────────
function genCandles(seed, count, base, vol, trend) {
  const c = []; let p = base;
  const rng = s => { let x = Math.sin(s)*43758.5453123; return x-Math.floor(x); };
  for (let i = 0; i < count; i++) {
    const r1=rng(seed+i*7.1), r2=rng(seed+i*3.3+1), r3=rng(seed+i*5.7+2), r4=rng(seed+i*2.9+3);
    const move = (r1-0.48+trend*0.04)*vol;
    const open=p, close=Math.max(0.000001,p+move);
    c.push({ open, close, high:Math.max(open,close)*(1+r2*0.012), low:Math.min(open,close)*(1-r3*0.012), vol:0.3+r4*0.7, bull:close>=open });
    p = close;
  }
  return c;
}

function PriceChart({ token }) {
  const [tf, setTf]     = useState("1H");
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const W=420, CH=130, VH=32, GAP=4, totalH=CH+GAP+VH;
  const cfg = {"5M":{count:48,vol:4e-8},"1H":{count:48,vol:1.8e-7},"4H":{count:42,vol:4.5e-7},"1D":{count:30,vol:1.2e-6}}[tf];
  const trend = token.change > 0 ? 1 : -1;
  const seed  = token.id*100 + ["5M","1H","4H","1D"].indexOf(tf)*37;
  const candles = genCandles(seed, cfg.count, 0.00000082, cfg.vol, trend);
  const prices  = candles.flatMap(c=>[c.high,c.low]);
  const pMin=Math.min(...prices), pMax=Math.max(...prices), pR=pMax-pMin||1;
  const vMax = Math.max(...candles.map(c=>c.vol));
  const py = p => CH-((p-pMin)/pR)*(CH-8)-4;
  const vy = v => VH-(v/vMax)*VH*0.9;
  const cw=(W-8)/candles.length, bw=Math.max(1.5,cw-1.5);
  const lp = candles.map((c,i)=>[i*cw+cw/2, py(c.close)]);
  const area = lp.length ? `M ${lp[0][0]} ${CH} `+lp.map(([x,y])=>`L ${x} ${y}`).join(" ")+` L ${lp[lp.length-1][0]} ${CH} Z` : "";
  const last=candles[candles.length-1], lastY=py(last.close);
  const isUp=token.change>=0, cc=isUp?G.green:G.pink;
  const f8 = n => n.toFixed(8);
  function onMM(e){
    if(!svgRef.current) return;
    const r=svgRef.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width);
    const idx=Math.min(candles.length-1,Math.max(0,Math.floor(x/cw)));
    setHover({idx, x:idx*cw+cw/2, candle:candles[idx]});
  }
  return (
    <div style={{ background:"rgba(0,0,0,0.35)", border:`1px solid ${G.border}`,
      borderRadius:10, padding:"10px 10px 8px", marginBottom:12,
      boxShadow:`inset 0 0 30px rgba(0,0,0,0.5)` }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div>
          <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:700, color:cc }}>
            {f8(last.close)} TON
          </span>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:cc, marginLeft:8 }}>
            {isUp?"▲":"▼"} {Math.abs(token.change)}%
          </span>
        </div>
        <div style={{ display:"flex", gap:3 }}>
          {["5M","1H","4H","1D"].map(t=>(
            <button key={t} onClick={()=>{setTf(t);setHover(null);}} style={{
              padding:"3px 7px", borderRadius:4, border:"none", cursor:"pointer",
              fontFamily:"'Share Tech Mono',monospace", fontSize:9,
              background:tf===t?cc:"rgba(255,255,255,0.06)",
              color:tf===t?"#000":G.muted2, fontWeight:tf===t?700:400,
              boxShadow:tf===t?`0 0 8px ${cc}60`:"none",
            }}>{t}</button>
          ))}
        </div>
      </div>
      {hover && (
        <div style={{ display:"flex", gap:12, marginBottom:6, padding:"4px 8px",
          background:"rgba(255,255,255,0.04)", borderRadius:5,
          fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2, flexWrap:"wrap" }}>
          <span>O:<span style={{color:G.text}}>{f8(hover.candle.open)}</span></span>
          <span>H:<span style={{color:G.green}}>{f8(hover.candle.high)}</span></span>
          <span>L:<span style={{color:G.pink}}>{f8(hover.candle.low)}</span></span>
          <span>C:<span style={{color:hover.candle.bull?G.green:G.pink}}>{f8(hover.candle.close)}</span></span>
          <span>Vol:<span style={{color:G.accent}}>{hover.candle.vol.toFixed(2)}</span></span>
        </div>
      )}
      <div style={{ position:"relative", touchAction:"none" }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${totalH}`} width="100%" height={totalH}
          style={{ display:"block", cursor:"crosshair", userSelect:"none" }}
          onMouseMove={onMM} onMouseLeave={()=>setHover(null)}
          onTouchMove={e=>{e.preventDefault();onMM(e.touches[0]);}} onTouchEnd={()=>setHover(null)}>
          <defs>
            <linearGradient id={`ag${token.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cc} stopOpacity="0.2"/>
              <stop offset="100%" stopColor={cc} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {[0.25,0.5,0.75].map(f=>(
            <line key={f} x1={0} y1={CH*f} x2={W} y2={CH*f}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} strokeDasharray="3,4"/>
          ))}
          <path d={area} fill={`url(#ag${token.id})`}/>
          {candles.map((c,i)=>{
            const x=i*cw, cx=x+cw/2, oY=py(c.open), cY=py(c.close);
            const hY=py(c.high), lY=py(c.low), col=c.bull?G.green:G.pink;
            const bT=Math.min(oY,cY), bH=Math.max(1,Math.abs(cY-oY)), hv=hover?.idx===i;
            return <g key={i}>
              <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={col} strokeWidth={hv?1.5:0.8} opacity={hv?1:0.7}/>
              <rect x={x+(cw-bw)/2} y={bT} width={bw} height={bH}
                fill={c.bull?col:"transparent"} stroke={col} strokeWidth={c.bull?0:0.8}
                opacity={hv?1:0.85} rx={0.5}/>
            </g>;
          })}
          <line x1={0} y1={lastY} x2={W} y2={lastY} stroke={cc} strokeWidth={0.8} strokeDasharray="3,3" opacity={0.5}/>
          <rect x={W-72} y={lastY-8} width={70} height={14} fill={cc} rx={2} opacity={0.9}/>
          <text x={W-37} y={lastY+3} textAnchor="middle" fill="#000" fontSize={8}
            fontFamily="'Share Tech Mono',monospace" fontWeight="700">{f8(last.close)}</text>
          {[pMin,pMin+pR*0.5,pMax].map((p,i)=>(
            <text key={i} x={3} y={py(p)-2} fill={G.muted} fontSize={7}
              fontFamily="'Share Tech Mono',monospace">{p.toFixed(8)}</text>
          ))}
          {hover && <g>
            <line x1={hover.x} y1={0} x2={hover.x} y2={CH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="2,3"/>
            <line x1={0} y1={py(hover.candle.close)} x2={W} y2={py(hover.candle.close)} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="2,3"/>
            <circle cx={hover.x} cy={py(hover.candle.close)} r={3} fill={hover.candle.bull?G.green:G.pink} opacity={0.9}/>
          </g>}
          {candles.map((c,i)=>{
            const x=i*cw, vh=Math.max(1,VH-vy(c.vol)), hv=hover?.idx===i;
            return <rect key={i} x={x+(cw-bw)/2} y={CH+GAP+vy(c.vol)} width={bw} height={vh}
              fill={c.bull?`rgba(16,255,160,${hv?0.7:0.3})`:`rgba(244,63,94,${hv?0.7:0.3})`} rx={0.5}/>;
          })}
          <text x={3} y={CH+GAP+8} fill={G.muted} fontSize={7} fontFamily="'Share Tech Mono',monospace">VOL</text>
        </svg>
      </div>
      <div style={{ display:"flex", marginTop:4 }}>
        {[["24H HIGH",Math.max(...candles.map(c=>c.high)).toFixed(8),G.green],
          ["24H LOW", Math.min(...candles.map(c=>c.low)).toFixed(8), G.pink],
          ["VOLUME",  candles.reduce((a,c)=>a+c.vol,0).toFixed(1)+" TON", G.accent]
        ].map(([l,v,c],i)=>(
          <div key={l} style={{ flex:1, textAlign:"center", borderRight:i<2?`1px solid ${G.border}`:"none", paddingTop:4 }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:7, color:G.muted,
              textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:2 }}>{l}</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:c }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TRADE MODAL ─────────────────────────────────────────────
function TradeModal({ token, onClose, walletConnected, onNeedWallet }) {
  const [tab, setTab]     = useState("buy");
  const [amount, setAmount] = useState("0.5");
  const [txState, setTxState] = useState("idle");
  const [preset, setPreset] = useState(1);
  const presets = ["0.1","0.5","1","5"];
  const pct  = Math.min(100, Math.round((token.tonRaised/1000)*100));
  const tokOut = Math.floor((parseFloat(amount)||0)*1219512);
  const fee  = ((parseFloat(amount)||0)*0.01).toFixed(4);
  const tc   = token.type==="ai" ? G.purple : G.pink;

  function trade() {
    if (!walletConnected) { onNeedWallet(); return; }
    setTxState("pending");
    setTimeout(()=>setTxState("done"), 2000);
    setTimeout(()=>{ setTxState("idle"); onClose(); }, 3500);
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:900, display:"flex", alignItems:"flex-end",
      background:"rgba(0,0,0,0.82)", backdropFilter:"blur(8px)" }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:"100%", maxWidth:480, margin:"0 auto",
        background:`linear-gradient(170deg,#0a1428 0%,${G.surface} 100%)`,
        border:`1px solid ${G.border2}`, borderRadius:"20px 20px 0 0",
        padding:"16px 16px 32px", animation:"slideUp 0.25s ease",
        maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ width:40, height:4, background:G.border2, borderRadius:2, margin:"0 auto 14px" }}/>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div style={{ fontSize:32, width:48, height:48, display:"flex", alignItems:"center",
            justifyContent:"center", borderRadius:10,
            background:token.type==="ai"?"rgba(139,92,246,0.2)":"rgba(244,63,94,0.2)",
            border:`1px solid ${tc}40`, boxShadow:`0 0 20px ${tc}20` }}>{token.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:14, fontWeight:800, color:G.text }}>{token.name}</span>
              <Badge type={token.type}>{token.type==="ai"?"AI":"MEME"}</Badge>
              {token.migrated && <Badge type="migrated">⚡ STON.FI</Badge>}
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>${token.sym}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:700, color:G.text }}>{fmt(token.mcap)}</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11,
              color:token.change>=0?G.green:G.pink }}>{token.change>=0?"+":""}{token.change}%</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${G.border}`,
            color:G.muted2, fontSize:14, width:28, height:28, borderRadius:5, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        <PriceChart token={token}/>
        {!token.migrated ? (
          <div style={{ background:"rgba(0,0,0,0.3)", border:`1px solid ${G.border}`,
            borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9,
                color:G.muted2, textTransform:"uppercase", letterSpacing:"0.1em" }}>Bonding Curve Progress</span>
              <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:12, fontWeight:700, color:G.accent }}>{pct}%</span>
            </div>
            <div style={{ height:8, background:"rgba(255,255,255,0.05)", borderRadius:4, overflow:"hidden", marginBottom:6 }}>
              <div style={{ width:`${pct}%`, height:"100%",
                background:token.type==="ai"?`linear-gradient(90deg,${G.purple},${G.accent})`:`linear-gradient(90deg,${G.pink},${G.yellow})`,
                borderRadius:4 }}/>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.green }}>{token.tonRaised.toLocaleString()} TON raised</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted }}>Target: 1,000 TON → STON.FI</span>
            </div>
          </div>
        ) : (
          <div style={{ background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.3)",
            borderRadius:10, padding:"10px 14px", marginBottom:12, textAlign:"center" }}>
            <div style={{ fontSize:18, marginBottom:3 }}>⚡</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:11, fontWeight:700,
              color:G.yellow, letterSpacing:"0.08em" }}>MIGRATED TO STON.FI</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2, marginTop:2 }}>
              1,000 TON raised · Now trading on DEX with full liquidity
            </div>
          </div>
        )}
        <div style={{ display:"flex", background:"rgba(0,0,0,0.3)", borderRadius:8, padding:3, gap:3, marginBottom:12 }}>
          {["buy","sell"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"8px 0", border:"none",
              borderRadius:6, cursor:"pointer", fontFamily:"'Share Tech Mono',monospace",
              fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", transition:"all 0.2s",
              background:tab===t?(t==="buy"?"rgba(16,255,160,0.15)":"rgba(244,63,94,0.15)"):"transparent",
              color:tab===t?(t==="buy"?G.green:G.pink):G.muted2 }}>{t==="buy"?"Buy":"Sell"}</button>
          ))}
        </div>
        {[["Current Price","0.00000082 TON"],["Market Cap",fmt(token.mcap)],["24h Volume","$128K"],["Slippage","1% (auto)"]].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between",
            padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>{k}</span>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.text }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop:12, marginBottom:8, fontFamily:"'Share Tech Mono',monospace",
          fontSize:9, color:G.muted2, textTransform:"uppercase", letterSpacing:"0.12em" }}>Amount (TON)</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6, marginBottom:10 }}>
          {presets.map((p,i)=>(
            <button key={p} onClick={()=>{setPreset(i);setAmount(p);}} style={{
              padding:"8px 0", textAlign:"center",
              border:`1px solid ${preset===i?G.accent:G.border}`,
              borderRadius:5, cursor:"pointer",
              background:preset===i?"rgba(0,229,255,0.1)":G.card,
              fontFamily:"'Share Tech Mono',monospace", fontSize:10,
              color:preset===i?G.accent:G.muted2,
              boxShadow:preset===i?`0 0 8px ${G.accent}30`:"none",
            }}>{p}</button>
          ))}
        </div>
        <input value={amount} onChange={e=>setAmount(e.target.value)}
          style={{ width:"100%", background:"rgba(0,0,0,0.3)", border:`1px solid ${G.border2}`,
            borderRadius:6, padding:"10px 12px", color:G.text,
            fontFamily:"'Share Tech Mono',monospace", fontSize:13, outline:"none" }}
          placeholder="Enter TON amount"/>
        <div style={{ marginTop:8 }}>
          {[["You receive ≈",<span style={{color:G.green}}>{tab==="buy"?`${tokOut.toLocaleString()} $${token.sym}`:`${((parseFloat(amount)||0)*0.97).toFixed(3)} TON`}</span>],
            ["Platform fee (1%)",<span>{fee} TON</span>]].map(([k,v])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between",
              padding:"4px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>{k}</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.text }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={trade} style={{ width:"100%", padding:14, border:"none", borderRadius:8,
          marginTop:14, cursor:"pointer", transition:"all 0.2s",
          background:txState==="done"?`linear-gradient(135deg,${G.green},#00c9ff)`
            :txState==="pending"?"rgba(255,255,255,0.08)"
            :tab==="buy"?`linear-gradient(135deg,${G.green},${G.accent})`
            :`linear-gradient(135deg,${G.pink},${G.orange})`,
          color:txState==="done"?"#000":txState==="pending"?G.muted2:tab==="buy"?"#000":"white",
          fontFamily:"'Orbitron',sans-serif", fontSize:12, fontWeight:700,
          letterSpacing:"0.1em", textTransform:"uppercase",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          boxShadow:txState==="idle"?`0 0 20px ${tab==="buy"?G.accent:G.pink}30`:"none" }}>
          {txState==="pending"?<><Spinner/> Confirming in Wallet...</>
           :txState==="done"?"✅ Transaction Confirmed!"
           :!walletConnected?"🔗 Connect Wallet to Trade"
           :tab==="buy"?`Buy $${token.sym}`:`Sell $${token.sym}`}
        </button>
      </div>
    </div>
  );
}

// ─── TOKEN CARD ───────────────────────────────────────────────
function TokenCard({ t, onClick }) {
  const [hov, setHov] = useState(false);
  const pct = Math.min(100, Math.round((t.tonRaised/1000)*100));
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:G.card, border:`1px solid ${hov?G.border2:G.border}`,
        borderRadius:12, padding:"13px 13px 11px", cursor:"pointer",
        transition:"all 0.25s", position:"relative", overflow:"hidden",
        boxShadow:hov?`0 0 24px ${t.type==="ai"?G.purple:G.pink}18`:"none",
        transform:hov?"translateY(-1px)":"none" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1,
        background:t.type==="ai"
          ?`linear-gradient(90deg,transparent,${G.purple}80,${G.accent}80,transparent)`
          :`linear-gradient(90deg,transparent,${G.pink}80,${G.yellow}80,transparent)` }}/>
      {hov && <div style={{ position:"absolute", inset:0, pointerEvents:"none",
        background:`radial-gradient(ellipse at 50% 0%, ${t.type==="ai"?G.purple:G.pink}08 0%, transparent 60%)` }}/>}
      <div style={{ display:"flex", gap:10, marginBottom:10 }}>
        <div style={{ width:46, height:46, borderRadius:10, flexShrink:0,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
          background:t.type==="ai"?"rgba(139,92,246,0.2)":"rgba(244,63,94,0.18)",
          border:`1px solid ${t.type==="ai"?G.purple+"50":G.pink+"50"}`,
          boxShadow:`0 0 12px ${t.type==="ai"?G.purple:G.pink}20` }}>{t.icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:700, color:G.text }}>{t.name}</span>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>${t.sym}</span>
            <Badge type={t.type}>{t.type==="ai"?"AI":"MEME"}</Badge>
            {t.hot && <Badge type="hot">🔥 HOT</Badge>}
            {t.migrated && <Badge type="migrated">⚡ STON.FI</Badge>}
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2,
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.desc}</div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:12, fontWeight:700, color:G.text }}>{fmt(t.mcap)}</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11,
            color:t.change>=0?G.green:G.pink }}>{t.change>=0?"+":""}{t.change}%</div>
        </div>
      </div>
      <CurveBar pct={pct} type={t.type} showTon tonRaised={t.tonRaised}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginTop:9, paddingTop:9, borderTop:"1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display:"flex", gap:10 }}>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2 }}>
            👥 {t.holders>=1000?(t.holders/1000).toFixed(1)+"K":t.holders}
          </span>
          {t.txMin>0
            ? <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2,
                display:"flex", alignItems:"center", gap:4 }}><LiveDot/>{t.txMin} tx/min</span>
            : <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2 }}>🏦 DEX Listed</span>
          }
        </div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10,
          letterSpacing:"0.08em", textTransform:"uppercase", padding:"5px 14px",
          borderRadius:4, border:"none", cursor:"pointer", fontWeight:700,
          background:t.type==="ai"?`linear-gradient(135deg,${G.purple},${G.accent})`:`linear-gradient(135deg,${G.pink},${G.yellow})`,
          color:t.type==="meme"?"#000":"white",
          boxShadow:`0 0 12px ${t.type==="ai"?G.purple:G.pink}40` }}>
          {t.migrated?"Trade":"Buy"}
        </div>
      </div>
    </div>
  );
}

// ─── MASCOT ──────────────────────────────────────────────────
const MASCOT_SRC = "data:image/png;base64,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";

// ─── HERO / EMPTY STATE ───────────────────────────────────────
function HeroEmpty({ onLaunch, onConnect, walletConnected }) {
  const [tick, setTick] = useState(0);
  const [mHov, setMHov] = useState(false);
  useEffect(() => { const t = setInterval(()=>setTick(n=>n+1),2500); return ()=>clearInterval(t); },[]);
  const words = ["AI Agents","Meme Coins","TON Tokens","DeFi Tools"];
  return (
    <div style={{ position:"relative", overflow:"hidden", paddingBottom:28 }}>
      <ParticleField/>

      {/* ── MASCOT + TITLE ROW ── */}
      <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"flex-end", padding:"16px 4px 0" }}>

        {/* Mascot */}
        <div style={{ position:"relative", flexShrink:0, width:155 }}
          onMouseEnter={()=>setMHov(true)} onMouseLeave={()=>setMHov(false)}>
          {/* Glow blob */}
          <div style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)",
            width:120, height:120, borderRadius:"50%",
            background:"radial-gradient(circle, rgba(0,229,255,0.28) 0%, rgba(139,92,246,0.18) 45%, transparent 70%)",
            filter:"blur(18px)", animation:"pulse 3s ease-in-out infinite", zIndex:0 }}/>
          {/* Scan sweep */}
          <div style={{ position:"absolute", inset:0, zIndex:2, pointerEvents:"none", overflow:"hidden", borderRadius:8 }}>
            <div style={{ position:"absolute", left:0, right:0, height:"30%",
              background:"linear-gradient(180deg,transparent,rgba(0,229,255,0.07),transparent)",
              animation:"scanSweep 2.5s linear infinite" }}/>
          </div>
          {/* Mascot image */}
          <img src={MASCOT_SRC} alt="MegaGram Guardian"
            style={{
              position:"relative", zIndex:1,
              width:148, height:148, objectFit:"contain",
              filter: mHov
                ? "drop-shadow(0 0 28px rgba(0,229,255,1)) drop-shadow(0 0 56px rgba(139,92,246,0.6)) brightness(1.12)"
                : "drop-shadow(0 0 14px rgba(0,229,255,0.55)) drop-shadow(0 0 28px rgba(139,92,246,0.3))",
              transform: mHov ? "scale(1.05) translateY(-6px)" : "translateY(0)",
              transition:"all 0.3s ease",
              animation: mHov ? "none" : "mascotFloat 4s ease-in-out infinite",
            }}/>
          {/* Sparkles */}
          {[
            {top:"12%",left:"72%",c:"#00e5ff",d:0},
            {top:"28%",left:"8%", c:"#8b5cf6",d:0.4},
            {top:"60%",left:"78%",c:"#10ffa0",d:0.8},
            {top:"18%",left:"45%",c:"#fbbf24",d:1.2},
          ].map((s,i)=>(
            <div key={i} style={{
              position:"absolute", top:s.top, left:s.left,
              width:5, height:5, borderRadius:"50%", zIndex:3,
              background:s.c, boxShadow:`0 0 8px ${s.c}`,
              animation:`sparkle ${1.6+i*0.3}s ease-in-out ${s.d}s infinite`,
              pointerEvents:"none",
            }}/>
          ))}
        </div>

        {/* Right: Title */}
        <div style={{ flex:1, textAlign:"left", paddingLeft:8, paddingBottom:10 }}>
          <div style={{ fontSize:20, marginBottom:4,
            filter:"drop-shadow(0 0 12px rgba(0,229,255,0.9))",
            animation:"float 2.2s ease-in-out infinite" }}>⚡</div>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:22, fontWeight:900,
            lineHeight:1.1, letterSpacing:"0.04em", marginBottom:5,
            background:"linear-gradient(135deg,#00e5ff,#8b5cf6,#10ffa0)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
            filter:"drop-shadow(0 0 6px rgba(0,229,255,0.3))" }}>
            MegaGram
          </div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8,
            color:"#5a7090", letterSpacing:"0.1em", marginBottom:10,
            textTransform:"uppercase", lineHeight:1.7 }}>
            AI × MEME Launchpad<br/>on TON Network
          </div>
          {/* Typewriter */}
          <div style={{ height:20, overflow:"hidden", marginBottom:14 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:10, fontWeight:700,
              transition:"transform 0.5s cubic-bezier(0.4,0,0.2,1)",
              transform:`translateY(-${(tick%words.length)*20}px)` }}>
              {words.map(w=>(
                <div key={w} style={{ height:20, display:"flex", alignItems:"center",
                  color:"#00e5ff", gap:4 }}>
                  <span style={{fontSize:9}}>🚀</span> Launch {w}
                </div>
              ))}
            </div>
          </div>
          {/* Buttons */}
          <div style={{ display:"flex", gap:7 }}>
            <button onClick={onLaunch} style={{
              padding:"7px 14px", border:"1px solid #00e5ff",
              borderRadius:5, background:"rgba(0,229,255,0.12)",
              color:"#00e5ff", fontFamily:"'Orbitron',sans-serif",
              fontSize:9, fontWeight:700, letterSpacing:"0.08em",
              textTransform:"uppercase", cursor:"pointer",
              boxShadow:"0 0 14px rgba(0,229,255,0.3)" }}>⚡ Launch</button>
            {!walletConnected && (
              <button onClick={onConnect} style={{
                padding:"7px 14px", border:"1px solid #8b5cf6",
                borderRadius:5, background:"rgba(139,92,246,0.12)",
                color:"#8b5cf6", fontFamily:"'Orbitron',sans-serif",
                fontSize:9, fontWeight:700, letterSpacing:"0.08em",
                textTransform:"uppercase", cursor:"pointer",
                boxShadow:"0 0 14px rgba(139,92,246,0.28)" }}>🔗 Wallet</button>
            )}
          </div>
        </div>
      </div>

      {/* ── STATS ── */}
      <div style={{ position:"relative", zIndex:1, margin:"14px 0",
        background:"#0e1628", border:"1px solid #162040",
        borderRadius:10, overflow:"hidden",
        boxShadow:"0 0 20px rgba(0,229,255,0.06)" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:1,
          background:"linear-gradient(90deg,transparent,rgba(0,229,255,0.5),rgba(139,92,246,0.5),transparent)" }}/>
        <div style={{ display:"flex" }}>
          {[{v:"0",l:"Live Tokens"},{v:"1,000",l:"TON to Migrate"},{v:"0.5%",l:"Platform Fee"}].map((s,i)=>(
            <div key={s.l} style={{ flex:1, textAlign:"center", padding:"11px 4px",
              borderRight:i<2?"1px solid #162040":"none" }}>
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:15, fontWeight:900,
                color:"#00e5ff", marginBottom:2 }}>{s.v}</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8,
                color:"#4a6080", textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURE PILLS ── */}
      <div style={{ position:"relative", zIndex:1,
        display:"flex", flexWrap:"wrap", gap:5, justifyContent:"center" }}>
        {["🟦 StonPump","⛽ GasPump","🚀 DeDeploy","⚡ MegaGram",
          "🔥 LP Scanner","🎯 Sniper Bot","📡 AI Signals","🔒 Lock Checker"].map(f=>(
          <span key={f} style={{
            fontFamily:"'Share Tech Mono',monospace", fontSize:8,
            padding:"3px 9px", borderRadius:20,
            background:"rgba(0,229,255,0.05)",
            border:"1px solid rgba(0,229,255,0.12)",
            color:"#4a6080", letterSpacing:"0.06em" }}>{f}</span>
        ))}
      </div>
    </div>
  );
}
// ─── EXPLORE TAB ─────────────────────────────────────────────
function ExploreTab({ onTrade, onLaunch, walletConnected, onConnect }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort]     = useState("trending");
  const tokens = TOKENS; // will be fetched from API in production

  const sorted = [...tokens]
    .filter(t => filter==="all" || t.type===filter)
    .sort((a,b) => sort==="mcap"?b.mcap-a.mcap:sort==="new"?b.id-a.id:b.change-a.change);

  return (
    <div>
      {/* Live stats bar */}
      <div style={{ overflow:"hidden", background:"rgba(0,229,255,0.04)",
        border:"1px solid rgba(0,229,255,0.1)", borderRadius:6, marginBottom:12, padding:"6px 0" }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10,
          color:G.muted2, textAlign:"center", letterSpacing:"0.1em" }}>
          <LiveDot/> &nbsp;MEGAGRAM LIVE · TON NETWORK · 0 tokens launched
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
        {[{v:"0",l:"Live Tokens",c:`linear-gradient(90deg,${G.accent},${G.purple})`},
          {v:"$0",l:"24h Volume",c:`linear-gradient(90deg,${G.purple},${G.pink})`},
          {v:"0",l:"Migrated",c:`linear-gradient(90deg,${G.pink},${G.yellow})`}
        ].map(s=>(
          <div key={s.l} style={{ background:G.card, border:`1px solid ${G.border}`,
            borderRadius:8, padding:"10px 8px", textAlign:"center", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:s.c }}/>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:15, fontWeight:700,
              color:G.accent, marginBottom:2 }}>{s.v}</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9,
              color:G.muted2, textTransform:"uppercase", letterSpacing:"0.1em" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {[["all","All"],["ai","AI Agent"],["meme","Meme"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{
            padding:"6px 14px", borderRadius:5,
            border:`1px solid ${filter===v?G.accent:G.border}`,
            background:filter===v?"rgba(0,229,255,0.1)":G.card,
            color:filter===v?G.accent:G.muted2, cursor:"pointer",
            fontFamily:"'Share Tech Mono',monospace", fontSize:10,
            boxShadow:filter===v?`0 0 10px ${G.accent}20`:"none",
          }}>{l}</button>
        ))}
        <div style={{flex:1}}/>
        <select value={sort} onChange={e=>setSort(e.target.value)} style={{
          padding:"6px 10px", borderRadius:5, border:`1px solid ${G.border}`,
          background:G.card, color:G.muted2, cursor:"pointer",
          fontFamily:"'Share Tech Mono',monospace", fontSize:10, outline:"none" }}>
          <option value="trending">Trending</option>
          <option value="mcap">Market Cap</option>
          <option value="new">Newest</option>
        </select>
      </div>

      {/* Token list or empty state */}
      {sorted.length > 0 ? (
        <>
          <SectionTitle icon="🔥">Trending Now</SectionTitle>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sorted.map(t=><TokenCard key={t.id} t={t} onClick={()=>onTrade(t)}/>)}
          </div>
        </>
      ) : (
        <HeroEmpty onLaunch={onLaunch} onConnect={onConnect} walletConnected={walletConnected}/>
      )}
    </div>
  );
}

// ─── LAUNCH TAB ───────────────────────────────────────────────
function LaunchTab({ walletConnected, onNeedWallet }) {
  const [type, setType]   = useState("ai");
  const [form, setForm]   = useState({ name:"", sym:"", desc:"", img:"", tg:"", web:"", supply:"1,000,000,000", model:"Claude Sonnet", persona:"" });
  const [toggles, setToggles] = useState({ memory:true, autoTrade:false, twitter:true, telegram:true });
  const [txState, setTxState] = useState("idle");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const tog = k => setToggles(t=>({...t,[k]:!t[k]}));
  const miss = !form.name.trim() || !form.sym.trim() || !form.desc.trim();

  function launch() {
    if (!walletConnected) { onNeedWallet(); return; }
    if (miss) return;
    setTxState("pending");
    setTimeout(()=>setTxState("done"),2200);
    setTimeout(()=>setTxState("idle"),4000);
  }

  return (
    <div>
      {/* Type toggle */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
        {[{v:"ai",icon:"🤖",label:"AI AGENT TOKEN",c:G.purple},
          {v:"meme",icon:"🎭",label:"MEME TOKEN",c:G.pink}].map(b=>(
          <button key={b.v} onClick={()=>setType(b.v)} style={{
            padding:"12px 8px", borderRadius:8, cursor:"pointer", textAlign:"center",
            border:`1px solid ${type===b.v?b.c:G.border}`,
            background:type===b.v?`${b.c}18`:G.card,
            boxShadow:type===b.v?`0 0 20px ${b.c}25, inset 0 0 20px ${b.c}06`:"none",
            transition:"all 0.2s" }}>
            <div style={{ fontSize:24, marginBottom:4 }}>{b.icon}</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:9, fontWeight:700,
              letterSpacing:"0.1em", color:type===b.v?b.c:G.muted2 }}>{b.label}</div>
          </button>
        ))}
      </div>

      <div style={{ background:G.card, border:`1px solid ${G.border}`, borderRadius:10, padding:14, marginBottom:10 }}>
        <SectionTitle icon="⚡">{type==="ai"?"AI Agent Config":"Meme Token Config"}</SectionTitle>
        {[{k:"name",label:"Token Name",ph:"e.g. GhostBot",req:true},{k:"sym",label:"Symbol",ph:"$GBOT",req:true}].map(f=>(
          <FormRow key={f.k} label={f.label} required={f.req}>
            <input value={form[f.k]} onChange={e=>set(f.k,e.target.value)} style={iS} placeholder={f.ph}/>
          </FormRow>
        ))}
        <FormRow label="Total Supply">
          <input value={form.supply} onChange={e=>set("supply",e.target.value)} style={iS} placeholder="1,000,000,000"/>
        </FormRow>
        <FormRow label="Description" required>
          <textarea value={form.desc} onChange={e=>set("desc",e.target.value)}
            style={{...iS,height:64,resize:"none"}}
            placeholder={type==="ai"?"Describe your AI agent and its purpose...":"Tell us about your meme token..."}/>
        </FormRow>
        <FormRow label="Token Image URL">
          <input value={form.img} onChange={e=>set("img",e.target.value)} style={iS} placeholder="https://..."/>
        </FormRow>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <FormRow label="Telegram">
            <input value={form.tg} onChange={e=>set("tg",e.target.value)} style={iS} placeholder="https://t.me/..."/>
          </FormRow>
          <FormRow label="Website">
            <input value={form.web} onChange={e=>set("web",e.target.value)} style={iS} placeholder="https://..."/>
          </FormRow>
        </div>
      </div>

      {type==="ai" && (
        <div style={{ background:"rgba(139,92,246,0.06)", border:"1px solid rgba(139,92,246,0.2)",
          borderRadius:10, padding:14, marginBottom:10 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.purple,
            letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:12 }}>🧠 AI Agent Settings</div>
          <FormRow label="AI Base Model">
            <select value={form.model} onChange={e=>set("model",e.target.value)}
              style={{...iS,appearance:"none",cursor:"pointer"}}>
              {["Claude Sonnet — Smart & Balanced","GPT-4o Mini — Fast & Cheap","Gemini Flash — Low Cost","Custom API Endpoint"].map(m=><option key={m}>{m}</option>)}
            </select>
          </FormRow>
          <FormRow label="Agent System Prompt">
            <textarea value={form.persona} onChange={e=>set("persona",e.target.value)}
              style={{...iS,height:64,resize:"none"}}
              placeholder="You are an autonomous DeFi agent on TON. Your goal is to..."/>
          </FormRow>
          {[{k:"memory",l:"On-Chain Memory",s:"Agent remembers past on-chain interactions"},
            {k:"autoTrade",l:"Auto-Trade Mode",s:"Executes trades autonomously"},
            {k:"twitter",l:"Twitter / X Feed",s:"Posts social media updates"},
            {k:"telegram",l:"Telegram Bot Mode",s:"Runs as interactive Telegram bot"},
          ].map(({k,l,s})=>(
            <div key={k} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
              <div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.text }}>{l}</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2, marginTop:1 }}>{s}</div>
              </div>
              <div onClick={()=>tog(k)} style={{ width:38, height:22, borderRadius:11, cursor:"pointer",
                background:toggles[k]?G.purple:G.border, transition:"all 0.2s", position:"relative",
                boxShadow:toggles[k]?`0 0 10px ${G.purple}60`:"none" }}>
                <div style={{ position:"absolute", width:16, height:16, borderRadius:"50%",
                  background:"white", top:3, transition:"transform 0.2s",
                  transform:toggles[k]?"translateX(18px)":"translateX(3px)" }}/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Migration info */}
      <div style={{ background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.15)",
        borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.accent,
          letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:8 }}>⚡ Bonding Curve & Auto-Migration</div>
        {[["Migration Threshold",<b style={{color:G.green}}>1,000 TON</b>],
          ["Migration Target","STON.FI DEX (automatic)"],
          ["Liquidity Added","800 TON → STON.FI pool"],
          ["Creator Reward","100 TON on migration"],
          ["Platform Fee","1% per trade + 100 TON migration"],
        ].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>{k}</span>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.text }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Fee */}
      <div style={{ background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.12)",
        borderRadius:8, padding:"10px 12px", marginBottom:14 }}>
        {[["Launch Fee","0.5 TON"],["Gas Estimate","~0.05 TON"]].map(([k,v])=>(
          <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.muted2 }}>{k}</span>
            <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.accent }}>{v}</span>
          </div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", paddingTop:8,
          borderTop:"1px solid rgba(0,229,255,0.12)" }}>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.text }}>You Pay</span>
          <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:14, fontWeight:700, color:G.green }}>0.55 TON</span>
        </div>
      </div>

      {miss && (
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:G.pink,
          marginBottom:10, padding:"8px 12px", background:"rgba(244,63,94,0.08)",
          border:"1px solid rgba(244,63,94,0.2)", borderRadius:6 }}>
          ⚠ Please fill in Name, Symbol, and Description
        </div>
      )}

      <button onClick={launch} disabled={txState==="pending"} style={{
        width:"100%", padding:15, border:"none", borderRadius:8,
        cursor:miss?"not-allowed":"pointer", opacity:miss?0.5:1,
        background:txState==="done"?`linear-gradient(135deg,${G.green},#00c9ff)`
          :type==="ai"?`linear-gradient(135deg,${G.purple},${G.accent})`
          :`linear-gradient(135deg,${G.pink},${G.yellow})`,
        color:(type==="meme"||txState==="done")?"#000":"white",
        fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:700,
        letterSpacing:"0.1em", textTransform:"uppercase",
        display:"flex", alignItems:"center", justifyContent:"center", gap:10,
        boxShadow:miss?"none":`0 0 24px ${type==="ai"?G.purple:G.pink}40`,
        transition:"all 0.2s" }}>
        {txState==="pending"?<><Spinner/> Deploying Contract...</>
         :txState==="done"?"✅ Token Launched Successfully!"
         :!walletConnected?"🔗 Connect Wallet to Launch"
         :type==="ai"?"⚡ Deploy AI Agent Token":"🚀 Launch Meme Token"}
      </button>
    </div>
  );
}

// ─── PORTFOLIO TAB ────────────────────────────────────────────
function PortfolioTab({ walletConnected, onNeedWallet }) {
  if (!walletConnected) return (
    <div style={{ textAlign:"center", padding:"60px 20px", position:"relative" }}>
      <ParticleField/>
      <div style={{ position:"relative", zIndex:1 }}>
        <div style={{ fontSize:56, marginBottom:16, filter:"drop-shadow(0 0 20px rgba(139,92,246,0.5))",
          animation:"float 3s ease-in-out infinite" }}>💼</div>
        <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:16, fontWeight:700,
          color:G.text, marginBottom:8 }}>Your Portfolio</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.muted2,
          marginBottom:28, lineHeight:1.7 }}>
          Connect your TON wallet to view holdings,<br/>track PnL, and manage your positions.
        </div>
        <NeonButton color={G.accent} onClick={onNeedWallet}>🔗 Connect Wallet</NeonButton>
      </div>
    </div>
  );

  if (HOLDINGS.length === 0) return (
    <div style={{ textAlign:"center", padding:"48px 20px", position:"relative" }}>
      <ParticleField/>
      <div style={{ position:"relative", zIndex:1 }}>
        <div style={{ fontSize:48, marginBottom:14 }}>📊</div>
        <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:14, fontWeight:700,
          color:G.text, marginBottom:8 }}>No Holdings Yet</div>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.muted2,
          marginBottom:20, lineHeight:1.7 }}>
          You haven't bought any tokens yet.<br/>Explore tokens and make your first trade!
        </div>
        <div style={{ background:G.card, border:`1px solid ${G.border}`, borderRadius:10,
          padding:14, textAlign:"left", marginBottom:16 }}>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.accent,
            textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:8 }}>Your Wallet</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.text }}>
            Balance: <span style={{ color:G.green }}>0.0000 TON</span>
          </div>
        </div>
      </div>
    </div>
  );

  const total = HOLDINGS.reduce((s,h)=>s+h.usd,0);
  return (
    <div>
      <div style={{ background:G.card, border:`1px solid ${G.border}`, borderRadius:12,
        padding:16, marginBottom:12, textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0,
          background:"radial-gradient(ellipse at 50% -20%, rgba(0,229,255,0.08) 0%, transparent 60%)",
          pointerEvents:"none" }}/>
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2,
          textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:4 }}>Total Portfolio Value</div>
        <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:32, fontWeight:900, color:G.accent }}>
          ${total.toLocaleString()}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          {["Deposit","Withdraw","History"].map((l,i)=>(
            <button key={l} style={{ flex:1, padding:"9px 0", borderRadius:6, cursor:"pointer",
              border:`1px solid ${i===1?G.accent:G.border}`,
              background:i===1?G.accent:"transparent",
              color:i===1?"#000":G.text,
              fontFamily:"'Share Tech Mono',monospace", fontSize:10,
              letterSpacing:"0.05em", textTransform:"uppercase", fontWeight:i===1?700:400 }}>{l}</button>
          ))}
        </div>
      </div>
      <SectionTitle icon="💼">My Holdings</SectionTitle>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
        {HOLDINGS.map(h=>(
          <div key={h.id} style={{ background:G.card, border:`1px solid ${G.border}`,
            borderRadius:8, padding:"11px 13px", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:22, width:40, height:40, display:"flex", alignItems:"center",
              justifyContent:"center", borderRadius:8,
              background:h.type==="ai"?"rgba(139,92,246,0.18)":"rgba(244,63,94,0.15)",
              border:`1px solid ${h.type==="ai"?G.purple+"40":G.pink+"40"}` }}>{h.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:11, fontWeight:700, color:G.text }}>{h.name}</span>
                <Badge type={h.type}>{h.type==="ai"?"AI":"MEME"}</Badge>
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2 }}>{h.amount} ${h.sym}</div>
              <div style={{ marginTop:5 }}><CurveBar pct={h.curve} type={h.type}/></div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:12, color:G.text }}>${h.usd.toLocaleString()}</div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10,
                color:h.pnl>=0?G.green:G.pink, marginTop:2 }}>
                {h.pnl>=0?"+":""}{h.pnl>=0?"$"+h.pnl.toLocaleString():"-$"+Math.abs(h.pnl)} ({h.pnlPct>0?"+":""}{h.pnlPct}%)
              </div>
            </div>
          </div>
        ))}
      </div>
      <SectionTitle icon="📜">Recent Trades</SectionTitle>
      {TRADES.length===0 ? (
        <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.muted2,
          textAlign:"center", padding:20 }}>No trades yet</div>
      ) : (
        <div style={{ background:G.card, border:`1px solid ${G.border}`, borderRadius:10, overflow:"hidden" }}>
          {TRADES.map((t,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
              borderBottom:i<TRADES.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
              <div style={{ fontSize:16 }}>{t.type==="buy"?"🟢":"🔴"}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.text }}>{t.name}</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2, marginTop:1 }}>{t.time} · {t.ton}</div>
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11,
                color:t.usd>=0?G.green:G.pink }}>{t.usd>=0?"+$":"−$"}{Math.abs(t.usd)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LEADERBOARD TAB ──────────────────────────────────────────
function LeaderboardTab({ onTrade }) {
  const [period, setPeriod] = useState("24h");
  const sorted = [...TOKENS].sort((a,b)=>b.mcap-a.mcap);
  const rankColors = [G.yellow,"#c0c0c0","#cd7f32"];
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
        {[{v:"0",l:"Migrated",g:`linear-gradient(90deg,${G.accent},${G.purple})`},
          {v:"$0",l:"Total MCap",g:`linear-gradient(90deg,${G.purple},${G.pink})`},
          {v:"0",l:"Holders",g:`linear-gradient(90deg,${G.pink},${G.yellow})`}
        ].map(s=>(
          <div key={s.l} style={{ background:G.card, border:`1px solid ${G.border}`,
            borderRadius:8, padding:"10px 8px", textAlign:"center", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:s.g }}/>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:14, fontWeight:700, color:G.accent }}>{s.v}</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2,
              textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:12 }}>
        {["1h","24h","7d","All"].map(p=>(
          <button key={p} onClick={()=>setPeriod(p)} style={{
            padding:"6px 14px", borderRadius:5,
            border:`1px solid ${period===p?G.accent:G.border}`,
            background:period===p?"rgba(0,229,255,0.1)":G.card,
            color:period===p?G.accent:G.muted2, cursor:"pointer",
            fontFamily:"'Share Tech Mono',monospace", fontSize:10 }}>{p}</button>
        ))}
      </div>
      <SectionTitle icon="🏆">Top Tokens</SectionTitle>
      {sorted.length===0 ? (
        <div style={{ textAlign:"center", padding:"48px 20px", position:"relative" }}>
          <ParticleField/>
          <div style={{ position:"relative", zIndex:1 }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🏆</div>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:14, fontWeight:700,
              color:G.text, marginBottom:8 }}>No Tokens Yet</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.muted2,
              lineHeight:1.7 }}>
              Be the first to launch a token on MegaGram!<br/>
              The leaderboard will fill as tokens are created.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background:G.card, border:`1px solid ${G.border}`, borderRadius:10, overflow:"hidden" }}>
          {sorted.map((t,i)=>(
            <div key={t.id} onClick={()=>onTrade(t)} style={{ display:"flex", alignItems:"center",
              gap:10, padding:"11px 12px",
              borderBottom:i<sorted.length-1?"1px solid rgba(255,255,255,0.04)":"none",
              cursor:"pointer", transition:"background 0.15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:12, fontWeight:700,
                width:22, textAlign:"center", color:i<3?rankColors[i]:G.muted }}>{i+1}</div>
              <div style={{ fontSize:20, width:36, height:36, display:"flex", alignItems:"center",
                justifyContent:"center", borderRadius:8,
                background:t.type==="ai"?"rgba(139,92,246,0.15)":"rgba(244,63,94,0.12)",
                border:`1px solid ${t.type==="ai"?G.purple+"35":G.pink+"35"}` }}>{t.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                  <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:11, fontWeight:700, color:G.text }}>{t.name}</span>
                  <Badge type={t.type}>{t.type==="ai"?"AI":"MEME"}</Badge>
                </div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.muted2 }}>
                  ${t.sym} · {t.migrated?<span style={{color:G.yellow}}>⚡ STON.FI</span>:`${t.tonRaised}/1,000 TON`}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.accent }}>{fmt(t.mcap)}</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, marginTop:2,
                  color:t.change>=0?G.green:G.pink }}>{t.change>=0?"+":""}{t.change}% {period}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]         = useState("explore");
  const [wallet, setWallet]   = useState(null);
  const [showW, setShowW]     = useState(false);
  const [tradeT, setTradeT]   = useState(null);

  const TABS = [
    { id:"explore",     icon:"🔭", label:"Explore"   },
    { id:"launch",      icon:"⚡", label:"Launch"    },
    { id:"portfolio",   icon:"💼", label:"Portfolio" },
    { id:"leaderboard", icon:"🏆", label:"Top"       },
  ];

  // Telegram WebApp integration
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready(); tg.expand();
      tg.enableClosingConfirmation();
      tg.setHeaderColor("#020509");
      tg.setBackgroundColor("#020509");
    }
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:${G.bg}; overflow-x:hidden; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 8px rgba(0,229,255,0.3)} 50%{box-shadow:0 0 24px rgba(0,229,255,0.7)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes bounce { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(-6px);opacity:1} }
        @keyframes auroraMove1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(5%,8%) scale(1.1)} }
        @keyframes auroraMove2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-8%,5%) scale(1.15)} }
        @keyframes mascotFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes scanSweep { 0%{top:-30%} 100%{top:130%} }
        @keyframes sparkle { 0%,100%{opacity:0;transform:scale(0.5)} 50%{opacity:1;transform:scale(1.3)} }
        @keyframes auroraMove3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(6%,-5%) scale(1.05)} }
        input, textarea, select { color-scheme:dark; }
        input:focus, textarea:focus, select:focus { border-color:${G.accent}!important; box-shadow:0 0 8px rgba(0,229,255,0.15)!important; }
        ::-webkit-scrollbar { width:2px; }
        ::-webkit-scrollbar-thumb { background:${G.border2}; border-radius:2px; }
      `}</style>

      <AuroraBackground/>

      <div style={{ position:"relative", zIndex:1, minHeight:"100vh", maxWidth:480, margin:"0 auto",
        fontFamily:"'Share Tech Mono',monospace" }}>

        {/* HEADER */}
        <header style={{ position:"sticky", top:0, zIndex:200,
          background:"rgba(2,5,9,0.92)", backdropFilter:"blur(16px)",
          borderBottom:`1px solid ${G.border}`,
          padding:"12px 16px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ position:"relative", display:"inline-block" }}>
              <span style={{ fontFamily:"'Orbitron',sans-serif", fontSize:22, fontWeight:900,
                letterSpacing:"0.06em",
                background:`linear-gradient(90deg,${G.accent},${G.purple},${G.green})`,
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
                filter:"drop-shadow(0 0 8px rgba(0,229,255,0.4))" }}>MegaGram</span>
              <span style={{ position:"absolute", left:2, top:2, fontFamily:"'Orbitron',sans-serif",
                fontSize:22, fontWeight:900, letterSpacing:"0.06em",
                background:`linear-gradient(90deg,${G.pink},${G.purple})`,
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
                opacity:0.2, animation:"pulse 4s ease-in-out infinite", pointerEvents:"none" }}>MegaGram</span>
            </div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:G.accent,
              letterSpacing:"0.2em", opacity:0.7, marginTop:-1 }}>AI × MEME LAUNCHPAD · TON</div>
          </div>
          {wallet ? (
            <div style={{ display:"flex", alignItems:"center", gap:8,
              background:"rgba(16,255,160,0.08)", border:"1px solid rgba(16,255,160,0.3)",
              borderRadius:6, padding:"7px 12px", cursor:"pointer",
              boxShadow:"0 0 12px rgba(16,255,160,0.15)" }}
              onClick={()=>setShowW(true)}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:G.green,
                boxShadow:`0 0 8px ${G.green}`, display:"inline-block", animation:"pulse 2s infinite" }}/>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:G.green }}>
                {wallet.address.slice(0,6)}...{wallet.address.slice(-4)}
              </span>
            </div>
          ) : (
            <button onClick={()=>setShowW(true)} style={{ display:"flex", alignItems:"center", gap:7,
              background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.3)",
              color:G.accent, fontFamily:"'Share Tech Mono',monospace", fontSize:11,
              padding:"7px 14px", borderRadius:6, cursor:"pointer",
              letterSpacing:"0.05em", animation:"glow 3s ease-in-out infinite" }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:G.muted, display:"inline-block" }}/>
              Connect Wallet
            </button>
          )}
        </header>

        {/* TOP NAV */}
        <div style={{ display:"flex", background:"rgba(6,13,24,0.9)", backdropFilter:"blur(8px)",
          borderBottom:`1px solid ${G.border}`, position:"sticky", top:58, zIndex:150 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, textAlign:"center",
              padding:"9px 4px", fontFamily:"'Share Tech Mono',monospace", fontSize:10,
              letterSpacing:"0.07em", textTransform:"uppercase", cursor:"pointer",
              border:"none", background:"transparent",
              borderBottom:`2px solid ${tab===t.id?G.accent:"transparent"}`,
              color:tab===t.id?G.accent:G.muted, transition:"all 0.2s", position:"relative",
              textShadow:tab===t.id?`0 0 8px ${G.accent}`:"none" }}>
              <span style={{ marginRight:3 }}>{t.icon}</span>{t.label}
              {t.id==="portfolio" && !wallet && (
                <span style={{ position:"absolute", top:5, right:"20%", width:6, height:6,
                  borderRadius:"50%", background:G.pink, border:`1px solid ${G.bg}`,
                  animation:"pulse 2s infinite" }}/>
              )}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ padding:"14px 14px 90px", position:"relative", zIndex:1,
          animation:"fadeIn 0.25s ease" }} key={tab}>
          {tab==="explore"     && <ExploreTab     onTrade={setTradeT} onLaunch={()=>setTab("launch")} walletConnected={!!wallet} onConnect={()=>setShowW(true)}/>}
          {tab==="launch"      && <LaunchTab      walletConnected={!!wallet} onNeedWallet={()=>setShowW(true)}/>}
          {tab==="portfolio"   && <PortfolioTab   walletConnected={!!wallet} onNeedWallet={()=>setShowW(true)}/>}
          {tab==="leaderboard" && <LeaderboardTab onTrade={setTradeT}/>}
        </div>

        {/* BOTTOM NAV */}
        <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
          width:"100%", maxWidth:480,
          background:"rgba(2,5,9,0.96)", backdropFilter:"blur(20px)",
          borderTop:`1px solid ${G.border}`, display:"flex", zIndex:200 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1,
              display:"flex", flexDirection:"column", alignItems:"center", gap:3,
              padding:"9px 0 7px", cursor:"pointer", border:"none", background:"transparent",
              borderTop:`2px solid ${tab===t.id?G.accent:"transparent"}`,
              transition:"all 0.2s", position:"relative",
              boxShadow:tab===t.id?`inset 0 2px 12px ${G.accent}15`:"none" }}>
              <span style={{ fontSize:19,
                filter:tab===t.id?`drop-shadow(0 0 6px ${G.accent})`:"none" }}>{t.icon}</span>
              <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8,
                letterSpacing:"0.1em", textTransform:"uppercase",
                color:tab===t.id?G.accent:G.muted,
                textShadow:tab===t.id?`0 0 8px ${G.accent}`:"none" }}>{t.label}</span>
              {t.id==="portfolio" && !wallet && (
                <span style={{ position:"absolute", top:6, right:"22%", width:7, height:7,
                  borderRadius:"50%", background:G.pink, border:`1px solid ${G.bg}`,
                  animation:"pulse 2s infinite" }}/>
              )}
            </button>
          ))}
        </nav>
      </div>

      {showW && <WalletModal onClose={()=>setShowW(false)} onConnect={w=>{setWallet(w);setShowW(false);}}/>}
      {tradeT && <TradeModal token={tradeT} onClose={()=>setTradeT(null)} walletConnected={!!wallet} onNeedWallet={()=>{setTradeT(null);setShowW(true);}}/>}
    </>
  );
}
