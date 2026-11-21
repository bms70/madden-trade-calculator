/*
 * Madden League Trade Calculator - valuation engine (Ruleset v4.2)
 *
 * GOVERNED CODE. Every constant, multiplier, threshold and comparison in this
 * file is part of the published ruleset. Changing any of them changes trade
 * verdicts and requires a ruleset revision - it is not a refactoring change.
 *
 * - Comparisons use full internal precision. toFixed() appears only inside the
 *   Suggested Correction wording; nothing is rounded before it is compared.
 * - EPS is the floating-point tolerance applied at the acceptance-window
 *   boundaries.
 * - values() and totals() read the calculator "state" object. That object is
 *   declared in calculator-ui.js, which loads after this file; it is only
 *   accessed when these functions are called, never while this file loads.
 *
 * Load order: theme.js, valuation.js, calculator-ui.js, trade-history.js,
 * admin.js.
 */

// ----------------------------------------------------------------------------
// Governed constants: draft pick values, position, timing, package credit, development trait
// ----------------------------------------------------------------------------

const PICK_VALUES={
  "1.01": 90,
  "1.02": 83,
  "1.03": 77,
  "1.04": 71,
  "1.05": 67,
  "1.06": 63,
  "1.07": 60,
  "1.08": 57,
  "1.09": 55,
  "1.10": 53,
  "1.11": 50,
  "1.12": 48,
  "1.13": 46,
  "1.14": 44,
  "1.15": 42,
  "1.16": 40,
  "1.17": 38,
  "1.18": 37,
  "1.19": 36,
  "1.20": 35,
  "1.21": 34,
  "1.22": 33,
  "1.23": 32,
  "1.24": 31,
  "1.25": 30,
  "1.26": 29,
  "1.27": 28,
  "1.28": 27,
  "1.29": 26,
  "1.30": 25,
  "1.31": 24,
  "1.32": 23,
  "Early 2nd": 19,
  "Mid 2nd": 16,
  "Late 2nd": 13,
  "Early 3rd": 9,
  "Mid 3rd": 7,
  "Late 3rd": 5,
  "4th": 4,
  "5th": 3,
  "6th": 2,
  "7th": 1,
  "Future Early 1st": 67,
  "Future Mid 1st": 46,
  "Future Late 1st": 31,
  "Future 1st - Unknown": 44
};

const POS={
  QB:1.4,
  EDGE:1.2,
  CB:1.15,
  WR:1.15,
  LT:1.1,
  DT:1.05,
  TE:1,
  S:1,
  LB:.95,
  HB:.9,
  IOL:.9,
  FB:.5,
  K:.5,
  P:.5
};

const TIMING={'Current draft':1,'Next year':.85,'Two years away':.7};

const CREDIT=[1,.9,.75,.6,.5,.5];

const DEV={
  Normal:[1.15,1.1,1,.8,.65],
  Star:[1.35,1.25,1.15,1.05,.9],
  Superstar:[1.65,1.5,1.3,1.15,1],
  'X-Factor':[2,1.75,1.5,1.3,1.15]
};

const EPS=1e-9;

// ----------------------------------------------------------------------------
// Display helper used in Suggested Correction wording
// ----------------------------------------------------------------------------

function teamName(side) {
  return side==='A'?'User Team':'CPU Team'
}

// ----------------------------------------------------------------------------
// Player and Draft Pick value components
// ----------------------------------------------------------------------------

function ageBand(a) {
  return a<=23?0:a<=26?1:a<=29?2:a<=31?3:4
}

function capMult(a) {
  let c=Number(a.cap||0),
    q=a.pos==='QB';
  return c<=(q?10:5)?1.15:c<=(q?20:10)?1.08:c<=(q?35:20)?1:c<=(q?50:30)?.9:.8
}

function control(a) {
  let y=Number(a.years||1),
    base=y<=1?1:y===2?1.07:y===3?1.16:y===4?1.25:1.34,
    cm=capMult(a);
  return cm>=1?base:cm===.9?1+(base-1)/2:1
}

function role(a) {
  if(!a.current||!a.projected)return 1;
  if(a.current==='Starter'&&a.projected==='Starter')return 1;
  if(a.current==='Starter')return .85;
  if(a.projected==='Starter')return .95;
  return .75
}

function early(a) {
  if(a.league==='')return 1;
  let y=Number(a.league);
  return y===0?1.5:y===1?1.3:y===2?1.15:1
}

function aging(a) {
  let o=+a.ovr,
    ag=+a.age;
  if(o>=70&&o<=79&&ag>=31)return ag<=32?.9:ag<=34?.75:.6;
  return 1
}

function scar(a) {
  return +a.age<=26&&+a.ovr>=87&&['Superstar','X-Factor'].includes(a.dev)?1.25:1
}

function baseValue(a) {
  if(a.type==='Draft Pick')return (PICK_VALUES[a.pick]||0)*(TIMING[a.timing]||1);
  if(a.ovr===''||a.age===''||!a.pos||!a.dev)return 0;
  return Math.max(0,+a.ovr-60)*POS[a.pos]*DEV[a.dev][ageBand(+a.age)]*capMult(a)*scar(a)*early(a)*role(a)*aging(a)*control(a)
}

function qbage(a,other) {
  if(a.type!=='Player'||a.pos!=='QB')return 1;
  let qs=other.filter(x=>x.type==='Player'&&x.pos==='QB'&&x.age!=='');
  if(!qs.length)return 1;
  let oa=Math.min(...qs.map(x=>+x.age)),
    d=+a.age-oa;
  if(d===0)return 1;
  let ad=Math.abs(d),
    m=ad<=2?(d<0?1.05:.98):ad<=4?(d<0?1.10:.95):(d<0?1.15:.90);
  return m
}

// ----------------------------------------------------------------------------
// Per-side values and package totals (full internal precision)
// ----------------------------------------------------------------------------

function values(side) {
  let other=state[side==='A'?'B':'A'];
  return state[side].map(a=>({...a,value:baseValue(a)*qbage(a,other)}))
}

function totals(side) {
  let arr=values(side),
    raw=arr.reduce((s,a)=>s+a.value,0),
    sorted=[...arr].sort((a,b)=>b.value-a.value||a.id-b.id),
    adj=sorted.reduce((s,a,i)=>s+a.value*CREDIT[i],0);
  return {arr,raw,adj,sorted}
}

// ----------------------------------------------------------------------------
// Protection tiers, acceptance windows and verdict
// ----------------------------------------------------------------------------

function protectionRank(a) {
  if(a.type!=='Player'||a.value<=0)return 0;
  if(a.pos==='QB'&&+a.age<=26&&+a.ovr>=90&&['Superstar','X-Factor'].includes(a.dev))return 3;
  if(+a.age<=26&&+a.ovr>=87&&['Superstar','X-Factor'].includes(a.dev))return 2;
  return 1
}

function candidate(arr) {
  let ps=arr.filter(a=>a.type==='Player'&&a.value>0).map(a=>({...a,rank:protectionRank(a)}));
  ps.sort((a,b)=>b.value-a.value||b.rank-a.rank||a.id-b.id);
  return ps[0]||null
}

function fallback(g) {
  return g<.12?'QUESTIONABLE':g<.22?'UNFAIR':'LEAGUE-BREAKING'
}

function verdict(A,B) {
  if(!A.adj||!B.adj)return {v:'ADD ASSETS',gap:0,mode:'INCOMPLETE',correction:''};
  let gap=Math.abs(A.adj-B.adj)/Math.max(A.adj,B.adj),
    all=[...A.arr,...B.arr],
    allDraft=all.length&&all.every(a=>a.type==='Draft Pick');
  if(allDraft) {
    let ba=Math.max(...A.arr.map(x=>x.value)),
      bb=Math.max(...B.arr.map(x=>x.value)),
      fair=false;
    if(ba===bb)fair=gap<=.08+EPS;
    else {
      let strong=ba>bb?A:B,
        weak=ba>bb?B:A,
        best=Math.max(ba,bb),
        other=Math.min(ba,bb),
        prem=best===90?1.15:best>=77?1.08:best>other*1.08?1.04:1,
        target=strong.adj*prem;
      fair=weak.adj>=target-EPS&&weak.adj<=target*1.08+EPS
    }
    return {
      v:fair?'FAIR':fallback(gap),
      gap,
      mode:'DRAFT_ONLY',
      correction:fair?'No correction needed.':'Adjust the trade-down package to the protected target window.'
    }
  }
  let ca=candidate(A.arr),
    cb=candidate(B.arr);
  if((ca&&cb&&ca.value===cb.value)||(!ca&&!cb)) {
    let fair=gap<=.08+EPS,
      hi=Math.max(A.adj,B.adj),
      lo=Math.min(A.adj,B.adj),
      side=A.adj<B.adj?'A':'B',
      amount=Math.max(0,hi*.92-lo);
    return {
      v:fair?'FAIR':fallback(gap),
      gap,
      mode:ca?'POSITIVE_PLAYER_TIE':'NO_ELIGIBLE_PLAYER',
      correction:fair?'No correction needed.':`Increase ${teamName(side)} received package by ${amount.toFixed(4)} adjusted-value points to enter the 8% window.`
    }
  }
  let protectedSide=!cb||(ca&&ca.value>cb.value)?'A':'B',
    pc=protectedSide==='A'?ca:cb,
    protectedPkg=protectedSide==='A'?A.adj:B.adj,
    counterPkg=protectedSide==='A'?B.adj:A.adj,
    m=pc.rank===3?1.3:pc.rank===2?1.2:1.1,
    target=protectedPkg*m,
    ceiling=target*1.08,
    fair=counterPkg>=target-EPS&&counterPkg<=ceiling+EPS,
    counterSide=protectedSide==='A'?'B':'A',
    amount=counterPkg<target?target-counterPkg:counterPkg-ceiling;
  return {
    v:fair?'FAIR':fallback(gap),
    gap,
    mode:'DIRECTIONAL',
    tier:pc.rank===3?'ELITE_QB':pc.rank===2?'CORNERSTONE':'STANDARD',
    protectedSide,
    correction:fair?'No correction needed.':counterPkg<target?`Increase ${teamName(counterSide)} received package by ${amount.toFixed(4)} adjusted-value points.`:`Reduce ${teamName(counterSide)} received package by ${amount.toFixed(4)} adjusted-value points.`
  }
}
