/*
 * Madden League Trade Calculator - Trade History (read-only)
 *
 * Web v2.0: shows the entered league's trades (MaddenStorage.leagueHistory),
 * newest first, with a review-status badge. Reversed trades are not listed.
 * Corrected trades show the original submission (revision 0) on request.
 * Practice mode shows no history (spec section 3.4). This file never writes to
 * the backend.
 *
 * Team names replace "User Team" / "CPU Team" for display only; the stored
 * text is unchanged. Pre-league trades have no teams and keep the side names.
 *
 * resetTradeHistory() is called by league-mode.js (league entered or left,
 * mode changed), calculator-ui.js (trade submitted) and commissioner.js
 * (review, correction, reversal).
 */

// ----------------------------------------------------------------------------
// History state
// ----------------------------------------------------------------------------

let historyLoaded=false;

let historyRecords=[];

let historyLeagueName=null;

// Clears loaded history; reloads at once if Trade History is on screen.
function resetTradeHistory() {
  historyLoaded=false;
  historyRecords=[];
  historyLeagueName=null;
  let panel=$('#history');
  if(panel&&!panel.hidden)loadTradeHistory();
}

// ----------------------------------------------------------------------------
// Status, teams and display helpers
// ----------------------------------------------------------------------------

// Badge for a listed trade: Pre-league, Corrected, Reviewed or Unreviewed.
function historyStatus(trade) {
  if(trade.is_pre_league)return {key:'pre-league',label:'Pre-league'};
  if(trade.review_status==='REVIEWED') {
    return trade.current_revision>0
      ? {key:'corrected',label:'Corrected'}
      : {key:'reviewed',label:'Reviewed'};
  }
  if(trade.review_status==='UNREVIEWED')return {key:'unreviewed',label:'Unreviewed'};
  return null;
}

function historyBadge(trade) {
  let status=historyStatus(trade);
  return status?`<span class="history-badge ${status.key}">${esc(status.label)}</span>`:'';
}

function historyTeams(trade) {
  return {
    A:typeof trade.submitting_team==='string'&&trade.submitting_team?trade.submitting_team:null,
    B:typeof trade.other_team==='string'&&trade.other_team?trade.other_team:null
  };
}

function historySideHeading(trade,side) {
  let teams=historyTeams(trade);
  let name=teams[side];
  if(name)return `${name.toUpperCase()} RECEIVES`;
  return side==='A'?'USER TEAM RECEIVES':'CPU TEAM RECEIVES';
}

// Escaped text with the trade's team names in place of the engine side names.
function historyText(trade,text) {
  let teams=historyTeams(trade);
  let s=esc(text);
  if(!teams.A||!teams.B)return s;
  let names={'User Team':esc(teams.A),'CPU Team':esc(teams.B)};
  return s.replace(/User Team|CPU Team/g,m=>names[m]);
}

// "94 / 100" from the stored Fairness Score read (v4.4 trades only).
function historyFairness(trade) {
  let read=Array.isArray(trade.trade_intelligence)
    ? trade.trade_intelligence.find(r=>r&&r.label==='FAIRNESS SCORE')
    : null;
  let match=read&&typeof read.value==='string'?read.value.match(/^(\d+(?:\.\d+)?) \/ 100/):null;
  if(!match)return '';
  // As on the calculator: outside the FAIR window never shows 100.
  let score=read.value.includes('Inside the FAIR window')?100:Math.min(99,Math.round(Number(match[1])));
  return `Fairness ${score} / 100`;
}

// ----------------------------------------------------------------------------
// History rendering
// ----------------------------------------------------------------------------

function formatHistoryDate(value) {
  if(!value)return 'Unknown date';
  let date=new Date(value);
  if(Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }
  return date.toLocaleString();
}

function historyAssetLabel(asset) {
  if(!asset||typeof asset!=='object') {
    return 'Unknown asset';
  }
  if(asset.type==='Draft Pick') {
    return asset.pick||'Draft Pick';
  }
  return asset.name||'Player';
}

function historyPackageSummary(assets) {
  if(!Array.isArray(assets)||!assets.length) {
    return 'No stored assets';
  }
  if(assets.length===1) {
    return historyAssetLabel(assets[0]);
  }
  let first=historyAssetLabel(assets[0]);
  return `${first} + ${assets.length-1} more`;
}

function historySummaryCard(trade) {
  const tradeNumber=Number.isInteger(trade.trade_number) ? `Trade #${trade.trade_number}` : 'Trade';
  const verdict=typeof trade.verdict==='string' ? trade.verdict : 'UNKNOWN';
  const userSummary=historyPackageSummary(trade.user_team_assets);
  const cpuSummary=historyPackageSummary(trade.cpu_team_assets);
  const webRelease=typeof trade.web_release==='string' ? trade.web_release : 'Unknown release';
  const ruleset=typeof trade.ruleset_version==='string' ? trade.ruleset_version : 'Unknown ruleset';
  const fairness=historyFairness(trade);
  const submitter=trade.submitter_name ? ` · Submitted by ${esc(trade.submitter_name)}` : '';
  return `
    <article class="history-card">
      <div class="history-card-head">
        <div>
          <strong>${esc(tradeNumber)}</strong>
          ${historyBadge(trade)}
          <div class="history-time">${esc(formatHistoryDate(trade.accepted_at))}${submitter}</div>
        </div>
        <div class="history-card-verdict">
          <span class="history-verdict">${esc(verdict)}</span>
          ${fairness?`<span class="history-time">${esc(fairness)}</span>`:''}
        </div>
      </div>
      <div class="history-packages">
        <div>
          <b>${esc(historySideHeading(trade,'A'))}</b>
          <span>${esc(userSummary)}</span>
        </div>
        <div>
          <b>${esc(historySideHeading(trade,'B'))}</b>
          <span>${esc(cpuSummary)}</span>
        </div>
      </div>
      <div class="history-card-foot">
        <span>${esc(webRelease)} · Ruleset ${esc(ruleset)}</span>
        <button type="button" class="btn history-view" data-trade-id="${esc(trade.id)}">
          View Trade
        </button>
      </div>
    </article>
  `;
}

function historyValue(value,digits=4) {
  if(typeof value!=='number'||!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

function historyAssetDetail(asset) {
  if(!asset||typeof asset!=='object') {
    return '';
  }
  const value=historyValue(asset.value);
  if(asset.type==='Draft Pick') {
    return `
      <div class="history-asset">
        <strong>${esc(asset.pick||'Draft Pick')}</strong>
        <span>${esc(asset.timing||'Current draft')}</span>
        <b>Individual Value: ${esc(value)}</b>
      </div>
    `;
  }
  const details=[
    asset.pos||'',
    asset.ovr!==''&&asset.ovr!=null ? `${asset.ovr} OVR` : '',
    asset.age!==''&&asset.age!=null ? `Age ${asset.age}` : '',
    asset.dev||''
  ].filter(Boolean).join(' · ');
  return `
    <div class="history-asset">
      <strong>${esc(asset.name||'Player')}</strong>
      <span>${esc(details)}</span>
      <span>
        Cap $${esc(asset.cap||'0')}M ·
        ${esc(asset.years||'—')} years left ·
        Year ${esc(asset.league===''?'—':asset.league)}
      </span>
      <span>
        ${esc(asset.current||'No current role')} →
        ${esc(asset.projected||'No projected role')}
      </span>
      <b>Individual Value: ${esc(value)}</b>
    </div>
  `;
}

function historyPackages(trade,snapshot) {
  const userAssets=Array.isArray(snapshot.user_team_assets) ? snapshot.user_team_assets.map(historyAssetDetail).join('') : '';
  const cpuAssets=Array.isArray(snapshot.cpu_team_assets) ? snapshot.cpu_team_assets.map(historyAssetDetail).join('') : '';
  return `
    <div class="history-detail-packages">
      <section>
        <h3>${esc(historySideHeading(trade,'A'))}</h3>
        ${userAssets||'<p>No stored assets.</p>'}
      </section>
      <section>
        <h3>${esc(historySideHeading(trade,'B'))}</h3>
        ${cpuAssets||'<p>No stored assets.</p>'}
      </section>
    </div>
  `;
}

function historyReviewLine(trade) {
  let status=historyStatus(trade);
  if(!status)return '';
  let text={
    'pre-league':'Logged before league mode. Not reviewed.',
    'unreviewed':'Waiting for the commissioner to review it.',
    'reviewed':`Reviewed${trade.reviewed_at?' '+formatHistoryDate(trade.reviewed_at):''}.`,
    'corrected':`Corrected by the commissioner${trade.reviewed_at?' '+formatHistoryDate(trade.reviewed_at):''}. The values below are the corrected ones.`
  }[status.key];
  return `<div class="history-review">${historyBadge(trade)} <span>${esc(text)}</span></div>`;
}

function historyTradeDetail(trade) {
  const tradeNumber=Number.isInteger(trade.trade_number) ? `Trade #${trade.trade_number}` : 'Trade';
  const intelligence=Array.isArray(trade.trade_intelligence) ? trade.trade_intelligence : [];
  const protectionTier=trade.protection_tier||'Not applicable';
  const requiredTarget=typeof trade.required_target==='number' ? historyValue(trade.required_target) : 'Not applicable';
  const fairMaximum=typeof trade.fair_maximum==='number' ? historyValue(trade.fair_maximum) : 'Not applicable';
  const corrected=historyStatus(trade)?.key==='corrected';
  const submitter=trade.submitter_name
    ? `<div class="history-submitter"><b>Submitted by</b> ${esc(trade.submitter_name)}${trade.submitter_note?`<p>${esc(trade.submitter_note)}</p>`:''}</div>`
    : '';
  return `
    <div class="history-detail-head">
      <div>
        <strong>${esc(tradeNumber)}</strong>
        <div class="history-time">Accepted ${esc(formatHistoryDate(trade.accepted_at))}</div>
        <div class="history-time">
          ${esc(trade.web_release||'Unknown release')} ·
          Ruleset ${esc(trade.ruleset_version||'Unknown')}
        </div>
      </div>
      <button type="button" class="btn history-close">Close</button>
    </div>
    ${historyReviewLine(trade)}
    ${submitter}
    <div class="history-detail-verdict">${esc(trade.verdict||'UNKNOWN')}</div>
    ${historyPackages(trade,trade)}
    <div class="history-evaluation">
      <h3>${corrected?'Corrected Evaluation':'Original Evaluation'}</h3>
      <div class="history-metrics">
        <div><b>User Raw</b><span>${esc(historyValue(trade.user_raw_value))}</span></div>
        <div><b>CPU Raw</b><span>${esc(historyValue(trade.cpu_raw_value))}</span></div>
        <div><b>User Adjusted</b><span>${esc(historyValue(trade.user_adjusted_value))}</span></div>
        <div><b>CPU Adjusted</b><span>${esc(historyValue(trade.cpu_adjusted_value))}</span></div>
        <div>
          <b>Adjusted Gap</b>
          <span>${typeof trade.adjusted_gap==='number'
            ? esc((trade.adjusted_gap*100).toFixed(4)+'%')
            : '—'}</span>
        </div>
        <div><b>Evaluation Path</b><span>${esc(trade.evaluation_mode||'Unknown')}</span></div>
        <div><b>Protection Tier</b><span>${esc(protectionTier)}</span></div>
        <div><b>Required Target</b><span>${esc(requiredTarget)}</span></div>
        <div><b>FAIR Maximum</b><span>${esc(fairMaximum)}</span></div>
      </div>
    </div>
    <div class="history-intelligence">
      <h3>Trade Intelligence</h3>
      <div class="history-intelligence-grid">
        ${intelligence.map(read=>`
          <div class="read">
            <b>${esc(read?.label||'READ')}</b>
            <span>${historyText(trade,read?.value||'')}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="history-correction">
      <b>Suggested Correction</b>
      <span>${historyText(trade,trade.suggested_correction||'No stored correction.')}</span>
    </div>
    ${corrected?`
      <div class="history-original">
        <button type="button" class="btn history-original-toggle" aria-expanded="false">Show original submission</button>
        <div class="history-original-body" hidden></div>
      </div>
    `:''}
  `;
}

// The original submission (revision 0) and the correction reason.
function historyOriginalDetail(trade,revisions) {
  let original=revisions.find(r=>r.revision===0);
  let latest=revisions.reduce((a,b)=>(b.revision>a.revision?b:a),revisions[0]);
  if(!original||!original.snapshot)return '<p>The original submission could not be found.</p>';
  let snap=original.snapshot;
  let reason=latest&&latest.revision>0
    ? `<p class="history-time">Corrected by ${esc(latest.created_by_name||'the commissioner')} on ${esc(formatHistoryDate(latest.created_at))}: ${esc(latest.reason||'')}</p>`
    : '';
  return `
    ${reason}
    <div class="history-detail-verdict">Original verdict: ${esc(snap.verdict||'UNKNOWN')}</div>
    ${historyPackages(trade,snap)}
    <div class="history-metrics">
      <div><b>User Adjusted</b><span>${esc(historyValue(snap.user_adjusted_value))}</span></div>
      <div><b>CPU Adjusted</b><span>${esc(historyValue(snap.cpu_adjusted_value))}</span></div>
      <div><b>Evaluation Path</b><span>${esc(snap.evaluation_mode||'Unknown')}</span></div>
    </div>
  `;
}

function bindOriginalToggle(trade,container) {
  let toggle=container.querySelector('.history-original-toggle');
  let body=container.querySelector('.history-original-body');
  if(!toggle||!body)return;
  toggle.onclick=async()=> {
    let open=body.hidden;
    body.hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));
    toggle.textContent=open?'Hide original submission':'Show original submission';
    if(!open||body.dataset.loaded)return;
    body.innerHTML='<p class="history-time">Loading the original submission...</p>';
    let result=await window.MaddenStorage.leagueTradeRevisions(historyLeagueName,trade.id);
    if(!result.ok) {
      body.innerHTML=`<p>${esc(result.error)}</p>`;
      return;
    }
    body.dataset.loaded='1';
    body.innerHTML=historyOriginalDetail(trade,result.revisions);
  };
}

function showHistoryTrade(tradeId) {
  const trade=historyRecords.find( record=>String(record.id)===String(tradeId) );
  if(!trade)return;
  const historyList=$('#historyList');
  const historyDetail=$('#historyDetail');
  const historyState=$('#historyState');
  historyState.hidden=true;
  historyList.hidden=true;
  historyDetail.innerHTML=historyTradeDetail(trade);
  historyDetail.hidden=false;
  bindOriginalToggle(trade,historyDetail);
  const closeButton=historyDetail.querySelector('.history-close');
  if(closeButton) {
    closeButton.onclick=()=> {
      historyDetail.hidden=true;
      historyDetail.innerHTML='';
      historyList.hidden=false;
    };
  }
  historyDetail.scrollIntoView({behavior:'smooth',block:'start'});
}

function bindHistoryCards() {
  $$('.history-view').forEach(button=> {
    button.onclick=()=>showHistoryTrade(button.dataset.tradeId);
  });
}

// ----------------------------------------------------------------------------
// History loading
// ----------------------------------------------------------------------------

async function loadTradeHistory() {
  const historyState=$('#historyState');
  const historyList=$('#historyList');
  const historyDetail=$('#historyDetail');
  if(!historyState||!historyList||!historyDetail)return;
  historyState.hidden=false;
  historyList.hidden=false;
  historyList.innerHTML='';
  historyDetail.hidden=true;
  historyDetail.innerHTML='';
  let entered=window.LeagueMode?.isLeague()?window.LeagueMode.state.entered:null;
  if(!entered) {
    historyState.textContent='Enter a league to see its trade history.';
    return;
  }
  historyState.textContent='Loading Trade History...';
  if(!window.MaddenStorage?.isConfigured) {
    historyState.textContent='Trade History is currently unavailable.';
    return;
  }
  const result=await window.MaddenStorage.leagueHistory(entered.name);
  // The league may have changed while loading.
  if(window.LeagueMode?.state.entered!==entered)return;
  if(!result.ok) {
    historyState.textContent='Trade History could not be loaded. Please try again later.';
    return;
  }
  historyLoaded=true;
  historyLeagueName=entered.name;
  historyRecords=Array.isArray(result.data)?result.data:[];
  if(!historyRecords.length) {
    historyState.textContent=`No trades have been logged in ${entered.name} yet.`;
    return;
  }
  historyState.hidden=true;
  historyList.innerHTML=historyRecords.map(historySummaryCard).join('');
  bindHistoryCards();
}
