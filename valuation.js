/*
 * Madden League Trade Calculator - valuation engine (Ruleset v4.4)
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
  "1.01": 100,
  "1.02": 99.7,
  "1.03": 99,
  "1.04": 98.2,
  "1.05": 97.2,
  "1.06": 96.2,
  "1.07": 94.9,
  "1.08": 93.6,
  "1.09": 92.2,
  "1.10": 90.7,
  "1.11": 89.1,
  "1.12": 87.4,
  "1.13": 85.7,
  "1.14": 83.9,
  "1.15": 82,
  "1.16": 80,
  "1.17": 80,
  "1.18": 78,
  "1.19": 76,
  "1.20": 74,
  "1.21": 72,
  "1.22": 70,
  "1.23": 68,
  "1.24": 66,
  "1.25": 64,
  "1.26": 62,
  "1.27": 60,
  "1.28": 58,
  "1.29": 56,
  "1.30": 54,
  "1.31": 52,
  "1.32": 50,
  "Early 2nd": 30,
  "Mid 2nd": 26,
  "Late 2nd": 22,
  "Early 3rd": 16,
  "Mid 3rd": 13,
  "Late 3rd": 10,
  "4th": 7,
  "5th": 5,
  "6th": 3,
  "7th": 2,
  "Future Early 1st": 97.2,
  "Future Mid 1st": 85.7,
  "Future Late 1st": 66,
  "Future 1st - Unknown": 83.9
};

const POS={
  QB:1.4,
  EDGE:1.2,
  CB:1.2,
  WR:1.2,
  OT:1.1,
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

// Ruleset v4.4: continuous draft discount. Timing = e^(-r*t), with r chosen so
// that one year out is exactly 0.85: r = ln(1/0.85).
const DRAFT_RATE=Math.log(1/.85);

const TIMING={
  'Current draft':1,
  'Next year':Math.exp(-DRAFT_RATE*1),
  'Two years away':Math.exp(-DRAFT_RATE*2)
};

// Pick / timing pairing (Ruleset v4.4). Exact first-round slots (1.01-1.32)
// exist only in the current draft. Future 1st projections exist only in a
// later draft. Round 2-7 tiers may be any timing. An invalid or blank timing
// is read as the pick's default timing, so each pick is discounted once.
function isSlotPick(pick) {
  return /^1\.\d\d$/.test(pick||'')
}

function isFutureFirst(pick) {
  return (pick||'').startsWith('Future ')
}

function allowedTimings(pick) {
  if(isSlotPick(pick))return ['Current draft'];
  if(isFutureFirst(pick))return ['Next year','Two years away'];
  return Object.keys(TIMING)
}

function pickTiming(a) {
  let allowed=allowedTimings(a.pick);
  return allowed.includes(a.timing)?a.timing:allowed[0]
}

const CREDIT=[1,.9,.75,.6,.5,.5];

const DEV={
  Normal:[1.15,1.1,1,.8,.65],
  Star:[1.35,1.25,1.15,1.05,.9],
  Superstar:[1.65,1.5,1.3,1.15,1],
  'X-Factor':[2,1.75,1.5,1.3,1.15]
};

// Ruleset v4.4 curve and verdict constants
const OVR_FLOOR=60,       // OVR at or below this is worth zero
  OVR_ANCHOR=30,          // OVR 90 (floor + 30) keeps the v4.2 value of 30
  OVR_POWER=1.3;          // > 1: each OVR point is worth more than the last

const AGING={             // Aging = e^(-k * max(0, age - start))
  under80:{start:30,k:.105},
  over80:{start:31,k:.08}
};

const CONTROL_RATE=.1,    // per-year discount on future contract control
  CONTROL_AT_5=1.34;      // 5 years of control keeps the v4.2 value

const FAIR_WINDOW=.05,    // FAIR = target through target x 1.05; 5% even-trade window
  QUESTIONABLE_LIMIT=.05, // under 5% outside the FAIR window
  UNFAIR_LIMIT=.15,       // 5% to under 15% outside; 15%+ = LEAGUE-BREAKING
  SCORE_SPREAD=.12;       // Fairness Score = 100 * e^(-(d / 0.12)^2)

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

// Ruleset v4.4: OVR value = 30 * ((OVR - 60) / 30)^1.3. The derivative,
// 1.3 * ((OVR - 60) / 30)^0.3, rises with OVR, so stars outgain depth players.
function ovrValue(ovr) {
  let d=Math.max(0,ovr-OVR_FLOOR);
  return OVR_ANCHOR*Math.pow(d/OVR_ANCHOR,OVR_POWER)
}

function ageBand(a) {
  return a<=23?0:a<=26?1:a<=29?2:a<=31?3:4
}

function capMult(a) {
  let c=Number(a.cap||0),
    q=a.pos==='QB';
  return c<=(q?10:5)?1.15:c<=(q?20:10)?1.08:c<=(q?35:20)?1:c<=(q?50:30)?.9:.8
}

// Ruleset v4.4: contract control is the integral of discounted future years,
//   base(Y) = 1 + b * integral from 0 to (Y - 1) of e^(-0.1 t) dt
//           = 1 + b * (1 - e^(-0.1 (Y - 1))) / 0.1,
// with b set so five years of control is exactly 1.34.
function controlIntegral(y) {
  return (1-Math.exp(-CONTROL_RATE*(y-1)))/CONTROL_RATE
}

const CONTROL_SCALE=(CONTROL_AT_5-1)/controlIntegral(5);

function control(a) {
  let y=Math.max(1,Number(a.years||1)),
    base=1+CONTROL_SCALE*controlIntegral(y),
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

// Ruleset v4.4: exponential aging decay, the solution of dA/dage = -k * A.
// Under 80 OVR decays from age 30 at k = 0.105; 80+ OVR from age 31 at
// k = 0.08. Applies to every development trait.
function aging(a) {
  let o=+a.ovr,
    ag=+a.age,
    c=o>=80?AGING.over80:AGING.under80;
  return Math.exp(-c.k*Math.max(0,ag-c.start))
}

function scar(a) {
  return +a.age<=26&&+a.ovr>=87&&['Superstar','X-Factor'].includes(a.dev)?1.25:1
}

function baseValue(a) {
  if(a.type==='Draft Pick')return (PICK_VALUES[a.pick]||0)*TIMING[pickTiming(a)];
  if(a.ovr===''||a.age===''||!a.pos||!a.dev)return 0;
  return ovrValue(+a.ovr)*POS[a.pos]*DEV[a.dev][ageBand(+a.age)]*capMult(a)*scar(a)*early(a)*role(a)*aging(a)*control(a)
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

// Ruleset v4.4: severity is measured as distance outside the FAIR window,
// relative to the nearest window edge. Band edges are lower-inclusive (EPS).
function severity(d) {
  return d<=EPS?'FAIR':d<QUESTIONABLE_LIMIT-EPS?'QUESTIONABLE':d<UNFAIR_LIMIT-EPS?'UNFAIR':'LEAGUE-BREAKING'
}

// Fairness Score: a Gaussian falloff from 100 inside the FAIR window.
function fairnessScore(d) {
  return 100*Math.exp(-Math.pow(Math.max(0,d)/SCORE_SPREAD,2))
}

// Directional window test. "pay" is what the paying side's partner receives
// (the counter-package); target and ceiling bound the FAIR window.
// Returns distance outside the window and which side the miss favours.
function windowRead(pay,target,ceiling,protectedSide,payingSide) {
  if(pay<target-EPS)return {d:(target-pay)/target,favored:protectedSide,short:true};
  if(pay>ceiling+EPS)return {d:(pay-ceiling)/ceiling,favored:payingSide,short:false};
  return {d:0,favored:null,short:false}
}

function result(v) {
  return {...v,score:v.mode==='INCOMPLETE'?0:fairnessScore(v.distance)}
}

function verdict(A,B) {
  if(!A.adj||!B.adj)return {v:'ADD ASSETS',gap:0,distance:0,score:0,favored:null,mode:'INCOMPLETE',correction:''};
  let gap=Math.abs(A.adj-B.adj)/Math.max(A.adj,B.adj),
    all=[...A.arr,...B.arr],
    allDraft=all.length&&all.every(a=>a.type==='Draft Pick'),
    hi=Math.max(A.adj,B.adj),
    lo=Math.min(A.adj,B.adj),
    hiSide=A.adj>B.adj?'A':B.adj>A.adj?'B':null,
    loSide=hiSide==='A'?'B':'A';
  // Even-trade path: the lower package must reach 95% of the higher one.
  function evenPath(mode) {
    let d=Math.max(0,gap-FAIR_WINDOW),
      fair=d<=EPS,
      amount=Math.max(0,hi*(1-FAIR_WINDOW)-lo);
    return result({
      v:severity(d),
      gap,
      distance:d,
      favored:fair?null:hiSide,
      mode,
      correction:fair?'No correction needed.':`Increase ${teamName(loSide)} received package by ${amount.toFixed(4)} adjusted-value points to enter the ${FAIR_WINDOW*100}% window.`
    })
  }
  if(allDraft) {
    let ba=Math.max(...A.arr.map(x=>x.value)),
      bb=Math.max(...B.arr.map(x=>x.value));
    if(ba===bb)return evenPath('DRAFT_ONLY');
    let strongSide=ba>bb?'A':'B',
      strong=strongSide==='A'?A:B,
      weakSide=strongSide==='A'?'B':'A',
      weak=strongSide==='A'?B:A,
      best=Math.max(ba,bb),
      other=Math.min(ba,bb),
      // The trade-up premium is keyed to the strongest pick's identity
      // (1.01 / 1.02-1.03), not to its value.
      top=strong.arr.reduce((t,x)=>x.value>t.value?x:t),
      prem=top.pick==='1.01'?1.15:['1.02','1.03'].includes(top.pick)?1.08:best>other*1.08?1.04:1,
      target=strong.adj*prem,
      ceiling=target*(1+FAIR_WINDOW),
      w=windowRead(weak.adj,target,ceiling,strongSide,weakSide),
      amount=w.short?target-weak.adj:weak.adj-ceiling;
    return result({
      v:severity(w.d),
      gap,
      distance:w.d,
      favored:w.favored,
      mode:'DRAFT_ONLY',
      protectedSide:strongSide,
      requiredTarget:target,
      fairMaximum:ceiling,
      correction:w.d<=EPS?'No correction needed.':w.short?`Increase ${teamName(weakSide)} received package by ${amount.toFixed(4)} adjusted-value points.`:`Reduce ${teamName(weakSide)} received package by ${amount.toFixed(4)} adjusted-value points.`
    })
  }
  let ca=candidate(A.arr),
    cb=candidate(B.arr);
  if((ca&&cb&&ca.value===cb.value)||(!ca&&!cb))return evenPath(ca?'POSITIVE_PLAYER_TIE':'NO_ELIGIBLE_PLAYER');
  let protectedSide=!cb||(ca&&ca.value>cb.value)?'A':'B',
    pc=protectedSide==='A'?ca:cb,
    protectedPkg=protectedSide==='A'?A.adj:B.adj,
    counterPkg=protectedSide==='A'?B.adj:A.adj,
    m=pc.rank===3?1.3:pc.rank===2?1.2:1.1,
    target=protectedPkg*m,
    ceiling=target*(1+FAIR_WINDOW),
    counterSide=protectedSide==='A'?'B':'A',
    w=windowRead(counterPkg,target,ceiling,protectedSide,counterSide),
    amount=w.short?target-counterPkg:counterPkg-ceiling;
  return result({
    v:severity(w.d),
    gap,
    distance:w.d,
    favored:w.favored,
    mode:'DIRECTIONAL',
    tier:pc.rank===3?'ELITE_QB':pc.rank===2?'CORNERSTONE':'STANDARD',
    protectedSide,
    requiredTarget:target,
    fairMaximum:ceiling,
    correction:w.d<=EPS?'No correction needed.':w.short?`Increase ${teamName(counterSide)} received package by ${amount.toFixed(4)} adjusted-value points.`:`Reduce ${teamName(counterSide)} received package by ${amount.toFixed(4)} adjusted-value points.`
  })
}
