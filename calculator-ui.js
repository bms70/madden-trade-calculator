/*
 * Madden League Trade Calculator - calculator UI
 *
 * Shared DOM helpers, calculator state, rendering, the accepted-Trade snapshot
 * builder, and calculator event wiring. Valuation logic lives in valuation.js.
 *
 * PERSISTENCE BOUNDARY: buildTradeSnapshot() defines the frozen accepted-Trade
 * snapshot. Its field names are a contract with storage.js and the database;
 * do not rename, add or remove fields here without a coordinated backend and
 * migration change. Web v2.0/v2.1: the snapshot is the v1.5.0 snapshot with
 * web_release "v2.1" ("v2.0" before v2.1); league-mode.js adds the league fields on submission and
 * swaps team names into the displayed text only (never the stored text).
 * Web v3.0: web_release "v3.0", and each asset adds pick_id (the chosen
 * draft pick in League mode when the league tracks picks; null otherwise).
 * Practice mode doesn't log trades.
 *
 * Initial render() runs at the end of this file, so everything render() calls
 * must be declared in this file or in valuation.js.
 */

// ----------------------------------------------------------------------------
// Shared DOM helpers
// ----------------------------------------------------------------------------

const $=s=>document.querySelector(s),
  $$=s=>[...document.querySelectorAll(s)];

// ----------------------------------------------------------------------------
// Calculator state
// ----------------------------------------------------------------------------

let uid=0,
  state={A:[],B:[]};

let loggingTrade=false;

let lastLoggedSnapshotKey=null;

// ----------------------------------------------------------------------------
// Asset model and HTML helpers
// ----------------------------------------------------------------------------

function emptyAsset() {
  return {
    id:++uid,
    type:'Player',
    name:'',
    pick:'1.01',
    timing:'Current draft',
    ovr:'',
    age:'',
    pos:'QB',
    dev:'Normal',
    cap:'',
    years:'',
    league:'',
    current:'',
    projected:'',
    pick_id:''
  }
}

// Ruleset v4.4 Fairness Score read: score plus which side the trade favours.
// Display only: a trade outside the window never shows 100, even when its
// exact score rounds there.
function scoreText(v,digits=0) {
  if(!v.favored)return '100';
  let cap=digits?99.9:99;
  return Math.min(cap,v.score).toFixed(digits)
}

function fairnessRead(v) {
  let score=scoreText(v,1);
  return v.favored
    ? `${score} / 100. Favors ${teamName(v.favored)}; ${(v.distance*100).toFixed(1)}% outside the FAIR window.`
    : `${score} / 100. Inside the FAIR window.`
}

function opts(list,val) {
  return list.map(x=>`<option ${x===val?'selected':''}>${x}</option>`).join('')
}

function esc(s) {
  return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
}

// Web v3.0: "Whose pick" in League mode (league-mode.js pickField).
function pickFieldHtml(side,a) {
  let f=window.LeagueMode?window.LeagueMode.pickField(side,a):{tracking:false};
  if(!f.tracking)return '';
  let options=f.loading?'<option value="">Loading picks...</option>'
    :!f.choices.length?`<option value="">${esc(f.empty)}</option>`
    :(f.selected?'':'<option value="">Choose...</option>')+f.choices.map(c=>`<option value="${esc(c.value)}"${c.value===f.selected?' selected':''}>${esc(c.label)}</option>`).join('');
  return `<label>Whose pick<select data-k="pick_id">${options}</select></label>`
}

function pickMeta(side,a) {
  let f=window.LeagueMode?window.LeagueMode.pickField(side,a):{tracking:false};
  if(!f.tracking||f.loading)return '';
  let chosen=f.choices.find(c=>c.value===f.selected);
  return chosen?` · ${chosen.label.split(' · ')[1]}`:' · choose whose pick';
}

function card(a,side,val) {
  let label=a.type==='Draft Pick'?a.pick:(a.name||'Player'),
    meta=a.type==='Draft Pick'?`Draft Pick · ${a.timing}${pickMeta(side,a)}`:`${a.pos} · ${a.ovr||'—'} OVR · ${a.dev}`;
  return `<div class="asset" data-id="${a.id}" data-side="${side}"><button type="button" class="summary toggle"><div><div class="aname">${esc(label)}</div><div class="meta">${esc(meta)}</div></div><div class="aval">${val?val.toFixed(1):'—'}</div></button><div class="editor"><div class="fields"><label>Asset type<select data-k="type">${opts(['Player','Draft Pick'],a.type)}</select></label>${a.type==='Draft Pick'?`<label>Pick<select data-k="pick">${opts(Object.keys(PICK_VALUES),a.pick)}</select></label><label>Timing<select data-k="timing">${opts(allowedTimings(a.pick),pickTiming(a))}</select></label>${pickFieldHtml(side,a)}`:`<label>Player name<input data-k="name" value="${esc(a.name)}"></label><label>OVR<input type="number" min="0" max="99" data-k="ovr" value="${a.ovr}"></label><label>Age<input type="number" min="18" max="60" data-k="age" value="${a.age}"></label><label>Position<select data-k="pos">${opts(Object.keys(POS),a.pos)}</select></label><label>Dev trait<select data-k="dev">${opts(Object.keys(DEV),a.dev)}</select></label><label>Cap hit $M<input type="number" min="0" data-k="cap" value="${a.cap}"></label><label>Years left<input type="number" min="1" max="10" step="1" inputmode="numeric" data-k="years" value="${a.years}"></label><label>Years in league<input type="number" min="0" max="40" data-k="league" value="${a.league}"></label><label>Current role<select data-k="current"><option value=""></option>${opts(['Starter','Backup'],a.current)}</select></label><label>Projected role<select data-k="projected"><option value=""></option>${opts(['Starter','Backup'],a.projected)}</select></label>`}</div><div class="acts"><button type="button" class="btn remove">Remove</button><button type="button" class="btn done">Done</button></div></div></div>`
}

// ----------------------------------------------------------------------------
// Accepted-Trade snapshot (frozen schema) and duplicate-state key
// ----------------------------------------------------------------------------

function snapshotAsset(asset) {
  return {
    id: asset.id,
    type: asset.type,
    name: asset.name,
    pick: asset.pick,
    timing: asset.timing,
    ovr: asset.ovr,
    age: asset.age,
    pos: asset.pos,
    dev: asset.dev,
    cap: asset.cap,
    years: asset.years,
    league: asset.league,
    current: asset.current,
    projected: asset.projected,
    value: asset.value,
    pick_id: asset.type==='Draft Pick'&&asset.pick_id ? asset.pick_id : null
  };
}

function tradeSnapshotKey(snapshot) {
  if(!snapshot)return null;
  return JSON.stringify({
    web_release:snapshot.web_release,
    ruleset_version:snapshot.ruleset_version,
    user_team_assets:snapshot.user_team_assets,
    cpu_team_assets:snapshot.cpu_team_assets,
    user_raw_value:snapshot.user_raw_value,
    cpu_raw_value:snapshot.cpu_raw_value,
    user_adjusted_value:snapshot.user_adjusted_value,
    cpu_adjusted_value:snapshot.cpu_adjusted_value,
    adjusted_gap:snapshot.adjusted_gap,
    verdict:snapshot.verdict,
    evaluation_mode:snapshot.evaluation_mode,
    protection_tier:snapshot.protection_tier,
    required_target:snapshot.required_target,
    fair_maximum:snapshot.fair_maximum,
    trade_intelligence:snapshot.trade_intelligence,
    suggested_correction:snapshot.suggested_correction
  });
}

function buildTradeSnapshot() {
  let A=totals('A');
  let B=totals('B');
  let v=verdict(A,B);
  if(v.mode==='INCOMPLETE') {
    return null;
  }
  let bestA=A.sorted[0];
  let bestB=B.sorted[0];
  let draftA=A.arr .filter(x=>x.type==='Draft Pick') .reduce((sum,x)=>sum+x.value,0);
  let draftB=B.arr .filter(x=>x.type==='Draft Pick') .reduce((sum,x)=>sum+x.value,0);
  let primary= v.mode==='DRAFT_ONLY' ? 'Draft trade-up protection and the 5% acceptance window apply.' : v.mode==='POSITIVE_PLAYER_TIE' ? 'Exact protected-player value tie; the 5% adjusted-value window applies.' : v.mode==='NO_ELIGIBLE_PLAYER' ? 'No eligible positive-value Player; the 5% adjusted-value window applies.' : v.tier==='ELITE_QB' ? `Elite QB acquisition protection governs ${teamName(v.protectedSide)}.` : v.tier==='CORNERSTONE' ? `Franchise Cornerstone acquisition protection governs ${teamName(v.protectedSide)}.` : `Standard player acquisition protection governs ${teamName(v.protectedSide)}.`;
  let tradeIntelligence=[
    { label:'PRIMARY READ', value:primary },
    {
      label:'BEST ASSET',
      value: !bestA||!bestB ? 'Add assets to both sides.' : bestA.value>bestB.value ? 'User Team receives the best single asset.' : bestB.value>bestA.value ? 'CPU Team receives the best single asset.' : 'Best single asset is even.'
    },
    {
      label:'RAW VALUE',
      value: A.raw>B.raw ? 'User Team leads raw value.' : B.raw>A.raw ? 'CPU Team leads raw value.' : 'Raw value is even.'
    },
    {
      label:'ADJUSTED VALUE',
      value: A.adj>B.adj ? 'User Team leads adjusted value.' : B.adj>A.adj ? 'CPU Team leads adjusted value.' : 'Adjusted value is even.'
    },
    {
      label:'DRAFT CAPITAL',
      value: draftA>draftB ? 'User Team receives more raw draft capital.' : draftB>draftA ? 'CPU Team receives more raw draft capital.' : draftA ? 'Draft capital is even.' : 'No draft capital in this trade.'
    },
    {
      label:'PACKAGE STRUCTURE',
      value: state.A.length>=3||state.B.length>=3 ? 'Quantity-for-quality protection is active.' : 'Package compression is limited in this deal.'
    },
    { label:'FAIRNESS SCORE', value:fairnessRead(v) },
    { label:'SUGGESTED CORRECTION', value:v.correction }
  ];
  let requiredTarget= typeof v.requiredTarget==='number' ? v.requiredTarget : null;
  let fairMaximum= typeof v.fairMaximum==='number' ? v.fairMaximum : null;
  return {
    web_release:'v3.0',
    ruleset_version:'v4.4',
    user_team_assets:A.arr.map(snapshotAsset),
    cpu_team_assets:B.arr.map(snapshotAsset),
    user_raw_value:A.raw,
    cpu_raw_value:B.raw,
    user_adjusted_value:A.adj,
    cpu_adjusted_value:B.adj,
    adjusted_gap:v.gap,
    verdict:v.v,
    evaluation_mode:v.mode,
    protection_tier:v.tier||null,
    required_target:requiredTarget,
    fair_maximum:fairMaximum,
    trade_intelligence:tradeIntelligence,
    suggested_correction:v.correction
  };
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

// Team names in league mode, for display only (see league-mode.js).
function shown(text,html) {
  return window.LeagueMode?window.LeagueMode.displayTeams(text,html?esc:null):String(text??'')
}

function currentSubmissionKey() {
  let snapshot=buildTradeSnapshot();
  let key=tradeSnapshotKey(snapshot);
  return window.LeagueMode?window.LeagueMode.submissionKey(key):key;
}

// Submit to league: league mode, both teams chosen, a complete trade, storage
// available, not mid-submit, every draft pick chosen (v3.0), and not the trade
// that was just logged.
function picksCheck() {
  return window.LeagueMode?window.LeagueMode.picksReady(state):{ok:true,error:''};
}

function acceptDisabled(v) {
  return v.mode==='INCOMPLETE'||
    !window.MaddenStorage?.isConfigured||
    loggingTrade||
    !window.LeagueMode?.teamsReady()||
    !picksCheck().ok||
    (lastLoggedSnapshotKey!==null&&currentSubmissionKey()===lastLoggedSnapshotKey);
}

function render() {
  closeAcceptConfirmation();
  if(window.LeagueMode)window.LeagueMode.resolvePicks(state);
  let leagueMode=!!window.LeagueMode?.isLeague();
  // Correction mode (commissioner.js) saves through its own bar, not Submit.
  let correcting=!!window.CommissionerArea?.isCorrecting();
  for(let side of ['A','B']) {
    let heading=$(side==='A'?'#aheading':'#bheading'),
      label=$(side==='A'?'#alabel':'#blabel');
    if(heading)heading.textContent=window.LeagueMode?window.LeagueMode.sideHeading(side):heading.textContent;
    if(label)label.textContent=window.LeagueMode?window.LeagueMode.scoreLabel(side):label.textContent;
  }
  for(let side of ['A','B']) {
    let t=totals(side),
      el=document.querySelector(`.side[data-side="${side}"]`);
    el.querySelector('.assets').innerHTML=t.arr.map(a=>card(a,side,a.value)).join('');
    el.querySelector('.count').textContent=`${state[side].length} / 6`;
    el.querySelector('.add').disabled=state[side].length>=6
  }
  let A=totals('A'),
    B=totals('B'),
    v=verdict(A,B);
  let acceptBtn=$('#acceptTrade');
  if(acceptBtn) {
    acceptBtn.hidden=!leagueMode||correcting;
    acceptBtn.disabled=acceptDisabled(v);
  }
  let practiceNote=$('#practiceNote');
  if(practiceNote)practiceNote.hidden=leagueMode||correcting;
  let pickNotice=$('#pickNotice');
  if(pickNotice) {
    let pc=picksCheck();
    let show=leagueMode&&v.mode!=='INCOMPLETE'&&!pc.ok;
    pickNotice.hidden=!show;
    pickNotice.textContent=show?pc.error:'';
  }
  $('#atotal').textContent=A.adj.toFixed(1);
  $('#btotal').textContent=B.adj.toFixed(1);
  $('#verdict').textContent=v.v;
  $('#gap').textContent=v.v==='ADD ASSETS'?'':shown(`Fairness ${scoreText(v)} / 100${v.favored?` · favors ${teamName(v.favored)}`:''}`);
  $('#vbox').className='verdict '+v.v.toLowerCase().replace(' ','-');
  let all=[...A.arr,...B.arr],
    bestA=A.sorted[0],
    bestB=B.sorted[0],
    draftA=A.arr.filter(x=>x.type==='Draft Pick').reduce((s,x)=>s+x.value,0),
    draftB=B.arr.filter(x=>x.type==='Draft Pick').reduce((s,x)=>s+x.value,0);
  let primary=v.mode==='INCOMPLETE'?'Add assets to both sides.':v.mode==='DRAFT_ONLY'?'Draft trade-up protection and the 5% acceptance window apply.':v.mode==='POSITIVE_PLAYER_TIE'?'Exact protected-player value tie; the 5% adjusted-value window applies.':v.mode==='NO_ELIGIBLE_PLAYER'?'No eligible positive-value Player; the 5% adjusted-value window applies.':v.tier==='ELITE_QB'?`Elite QB acquisition protection governs ${teamName(v.protectedSide)}.`:v.tier==='CORNERSTONE'?`Franchise Cornerstone acquisition protection governs ${teamName(v.protectedSide)}.`:`Standard player acquisition protection governs ${teamName(v.protectedSide)}.`;
  $('#primary').innerHTML='<b>Primary Read:</b> '+shown(primary,true);
  let reads=[
    [
      'BEST ASSET',
      !bestA||!bestB?'Add assets to both sides.':bestA.value>bestB.value?'User Team receives the best single asset.':bestB.value>bestA.value?'CPU Team receives the best single asset.':'Best single asset is even.'
    ],
    [
      'RAW VALUE',
      A.raw>B.raw?'User Team leads raw value.':B.raw>A.raw?'CPU Team leads raw value.':'Raw value is even.'
    ],
    [
      'ADJUSTED VALUE',
      A.adj>B.adj?'User Team leads adjusted value.':B.adj>A.adj?'CPU Team leads adjusted value.':'Adjusted value is even.'
    ],
    [
      'DRAFT CAPITAL',
      draftA>draftB?'User Team receives more raw draft capital.':draftB>draftA?'CPU Team receives more raw draft capital.':draftA?'Draft capital is even.':'No draft capital in this trade.'
    ],
    [
      'PACKAGE STRUCTURE',
      state.A.length>=3||state.B.length>=3?'Quantity-for-quality protection is active.':'Package compression is limited in this deal.'
    ],
    ['FAIRNESS SCORE',v.mode==='INCOMPLETE'?'Add assets to both sides.':fairnessRead(v)],
    ['SUGGESTED CORRECTION',v.correction]
  ];
  $('#reads').innerHTML=reads.map(r=>`<div class="read"><b>${r[0]}</b><span>${shown(r[1],true)}</span></div>`).join('');
  bindCards()
}

function bindCards() {
  $$('.toggle').forEach(b=>b.onclick=()=> {
    let a=b.closest('.asset');
    $$('.asset').forEach(x=> {
      if(x!==a)x.classList.remove('open')
    });
    a.classList.toggle('open')
  });
  $$('.editor input,.editor select').forEach(el=>el.onchange=()=> {
    let card=el.closest('.asset'),
      side=card.dataset.side,
      a=state[side].find(x=>x.id==card.dataset.id);
    a[el.dataset.k]=el.value;
    // Ruleset v4.4: exact 1st-round slots are current draft only and Future
    // 1sts are next year or later, so keep timing valid for the chosen pick.
    if(a.type==='Draft Pick')a.timing=pickTiming(a);
    render();
    requestAnimationFrame(()=> {
      let c=document.querySelector(`.asset[data-id="${a.id}"]`);
      if(c)c.classList.add('open')
    })
  });
  // Years left must be 1 or more: 0, negatives, decimals and exponents cannot
  // be entered. (Years in league still accepts 0 for rookies.) Blank stays
  // allowed and keeps its neutral default.
  $$('.editor input[data-k="years"]').forEach(el=> {
    el.onkeydown=e=> {
      if(['-','+','e','E','.',','].includes(e.key))e.preventDefault();
    };
    el.oninput=()=> {
      if(el.value!==''&&!(Number(el.value)>=1&&Number.isInteger(Number(el.value)))) {
        el.value='';
        $('#status').textContent='Years left must be 1 or more. Leave it blank if unknown.';
      }
    };
  });
  $$('.done').forEach(b=>b.onclick=()=>b.closest('.asset').classList.remove('open'));
  $$('.remove').forEach(b=>b.onclick=()=> {
    let c=b.closest('.asset'),
      side=c.dataset.side;
    state[side]=state[side].filter(x=>x.id!=c.dataset.id);
    render()
  })
}

// ----------------------------------------------------------------------------
// Event registration
// ----------------------------------------------------------------------------

$$('.add').forEach(b=>b.onclick=()=> {
  let side=b.closest('.side').dataset.side;
  if(state[side].length<6) {
    let a=emptyAsset();
    state[side].push(a);
    render();
    requestAnimationFrame(()=>document.querySelector(`.asset[data-id="${a.id}"]`).classList.add('open'))
  }
});

// ----------------------------------------------------------------------------
// Submit to league (Web v2.0)
//
// Submit to league opens an inline form for your name and an optional note.
// Nothing is saved until Submit is confirmed. render() closes the form, so any
// change to the trade while it is open cancels it. Practice mode has no submit
// (Q25).
// ----------------------------------------------------------------------------

function closeAcceptConfirmation() {
  let panel=$('#acceptConfirm');
  if(panel)panel.hidden=true;
}

function openAcceptConfirmation() {
  if(loggingTrade)return;
  let snapshot=buildTradeSnapshot();
  if(!snapshot) {
    $('#status').textContent= 'Complete both sides of the trade before submitting it.';
    render();
    return;
  }
  if(!window.LeagueMode?.teamsReady()) {
    $('#status').textContent= 'Enter your league and choose both teams first.';
    return;
  }
  if(!window.MaddenStorage?.isConfigured) {
    $('#status').textContent= 'Trade storage is unavailable. No historical record was created.';
    return;
  }
  let pc=picksCheck();
  if(!pc.ok) {
    $('#status').textContent=pc.error;
    return;
  }
  let panel=$('#acceptConfirm');
  if(!panel)return;
  let warning=$('#acceptWarning');
  if(warning) {
    let rated=snapshot.verdict!=='FAIR';
    warning.hidden=!rated;
    warning.textContent=rated?`This trade is rated ${snapshot.verdict}. You can still submit it; it'll be flagged for the commissioner.`:'';
  }
  let error=$('#acceptConfirmError');
  if(error)error.textContent='';
  let name=$('#submitterName');
  if(name&&!name.value)name.value=window.LeagueMode.rememberedSubmitter();
  panel.hidden=false;
  $('#status').textContent='Add your name below and select Submit, or select Cancel.';
  if(name)name.focus();
}

$('#acceptTrade').onclick=openAcceptConfirmation;

$('#cancelAcceptTrade').onclick=()=> {
  closeAcceptConfirmation();
  $('#status').textContent='Trade was not submitted.';
  $('#acceptTrade').focus();
};

$('#acceptConfirm').onsubmit=async event=> {
  event.preventDefault();
  let who=window.LeagueMode.checkSubmitter($('#submitterName').value,$('#submitterNote').value);
  if(!who.ok) {
    $('#acceptConfirmError').textContent=who.error;
    return;
  }
  closeAcceptConfirmation();
  await logAcceptedTrade(who.name,who.note);
};

async function logAcceptedTrade(name,note) {
  if(loggingTrade)return;
  let snapshot=buildTradeSnapshot();
  if(!snapshot) {
    $('#status').textContent= 'Complete both sides of the trade before submitting it.';
    render();
    return;
  }
  let submission=window.LeagueMode?.buildSubmission(snapshot,name,note);
  if(!submission) {
    $('#status').textContent= 'Enter your league, choose both teams and add your name first.';
    return;
  }
  if(!window.MaddenStorage?.isConfigured) {
    $('#status').textContent= 'Trade storage is unavailable. No historical record was created.';
    return;
  }
  loggingTrade=true;
  let button=$('#acceptTrade');
  button.disabled=true;
  button.textContent='Submitting...';
  $('#status').textContent= 'Saving the current trade evaluation...';
  try {
    let result=await window.MaddenStorage.submitLeagueTrade(submission);
    if(!result.ok) {
      $('#status').textContent= result.error|| 'Trade could not be logged. No historical record was created.';
      return;
    }
    lastLoggedSnapshotKey=window.LeagueMode.submissionKey(tradeSnapshotKey(snapshot));
    window.LeagueMode.rememberSubmitter(submission.submitter_name);
    $('#submitterNote').value='';
    $('#status').textContent= `Logged as trade #${result.trade.tradeNumber}, Unreviewed.`;
    if(typeof resetTradeHistory==='function')resetTradeHistory();
    // The traded picks have moved: refresh the "Whose pick" choices.
    if(window.LeagueMode)await window.LeagueMode.reloadPicks();
  } catch(error) {
    console.error('Unexpected Trade logging failure:',error);
    $('#status').textContent= 'Trade could not be logged. No historical record was created.';
  } finally {
    loggingTrade=false;
    button.textContent='Submit to league';
    button.disabled=acceptDisabled(verdict(totals('A'),totals('B')));
  }
}

$('#clear').onclick=()=> {
  state={A:[],B:[]};
  render()
};

$('#analysisBtn').onclick=()=> {
  let a=$('#analysis'),
    o=a.classList.toggle('open');
  $('#analysisBtn').setAttribute('aria-expanded',o);
  $('#chev').textContent=o?'▴':'▾'
};

$$('.tab').forEach(b=>b.onclick=async()=> {
  $$('.tab').forEach(x=> x.classList.toggle('active',x===b) );
  $$('.panel').forEach(p=> p.hidden=p.id!==b.dataset.tab );
  if(b.dataset.tab==='history'&&!historyLoaded) {
    await loadTradeHistory();
  }
  if(b.dataset.tab==='commissioner'&&window.CommissionerArea) {
    await window.CommissionerArea.show();
  }
});

// ----------------------------------------------------------------------------
// Theme toggle wiring (theme logic is in theme.js)
// ----------------------------------------------------------------------------

let themeToggle=$('#themeToggle');

if(themeToggle) {
  themeToggle.onclick=()=> {
    let current=document.documentElement.dataset.theme==='dark'?'dark':'light';
    applyTheme(current==='dark'?'light':'dark');
  };
}

// ----------------------------------------------------------------------------
// Initial render
// ----------------------------------------------------------------------------

$('#pickGrid').innerHTML=Object.entries(PICK_VALUES).filter(([k])=>k.startsWith('1.')).map(([k,v])=>`<div class="pill"><b>${k}</b> = ${v}</div>`).join('');

if(window.LeagueMode)window.LeagueMode.init();

render();
