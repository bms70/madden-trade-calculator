/*
 * Madden League Trade Calculator - Trade History (public, read-only)
 *
 * Displays accepted Trades returned by MaddenStorage.getActiveTrades().
 * Records are rendered as received; this file never writes to the backend.
 *
 * historyLoaded / historyRecords are also reset by admin.js after a deletion.
 */

// ----------------------------------------------------------------------------
// History state
// ----------------------------------------------------------------------------

let historyLoaded=false;

let historyRecords=[];

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
  return `
    <article class="history-card">
      <div class="history-card-head">
        <div>
          <strong>${esc(tradeNumber)}</strong>
          <div class="history-time">${esc(formatHistoryDate(trade.accepted_at))}</div>
        </div>
        <span class="history-verdict">${esc(verdict)}</span>
      </div>
      <div class="history-packages">
        <div>
          <b>USER TEAM RECEIVES</b>
          <span>${esc(userSummary)}</span>
        </div>
        <div>
          <b>CPU TEAM RECEIVES</b>
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

function historyTradeDetail(trade) {
  const tradeNumber=Number.isInteger(trade.trade_number) ? `Trade #${trade.trade_number}` : 'Trade';
  const userAssets=Array.isArray(trade.user_team_assets) ? trade.user_team_assets.map(historyAssetDetail).join('') : '';
  const cpuAssets=Array.isArray(trade.cpu_team_assets) ? trade.cpu_team_assets.map(historyAssetDetail).join('') : '';
  const intelligence=Array.isArray(trade.trade_intelligence) ? trade.trade_intelligence : [];
  const protectionTier=trade.protection_tier||'Not applicable';
  const requiredTarget=typeof trade.required_target==='number' ? historyValue(trade.required_target) : 'Not applicable';
  const fairMaximum=typeof trade.fair_maximum==='number' ? historyValue(trade.fair_maximum) : 'Not applicable';
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
    <div class="history-detail-verdict">${esc(trade.verdict||'UNKNOWN')}</div>
    <div class="history-detail-packages">
      <section>
        <h3>USER TEAM RECEIVES</h3>
        ${userAssets||'<p>No stored assets.</p>'}
      </section>
      <section>
        <h3>CPU TEAM RECEIVES</h3>
        ${cpuAssets||'<p>No stored assets.</p>'}
      </section>
    </div>
    <div class="history-evaluation">
      <h3>Original Evaluation</h3>
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
            <span>${esc(read?.value||'')}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="history-correction">
      <b>Suggested Correction</b>
      <span>${esc(trade.suggested_correction||'No stored correction.')}</span>
    </div>
  `;
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
  historyState.textContent='Loading Trade History...';
  historyList.hidden=false;
  historyList.innerHTML='';
  historyDetail.hidden=true;
  historyDetail.innerHTML='';
  if(!window.MaddenStorage?.isConfigured) {
    historyState.textContent='Trade History is currently unavailable.';
    return;
  }
  const result=await window.MaddenStorage.getActiveTrades();
  if(!result.ok) {
    historyState.textContent='Trade History could not be loaded. Please try again later.';
    return;
  }
  historyLoaded=true;
  historyRecords=Array.isArray(result.data)?result.data:[];
  if(!historyRecords.length) {
    historyState.textContent='No accepted trades have been logged yet.';
    return;
  }
  historyState.hidden=true;
  historyList.innerHTML=historyRecords.map(historySummaryCard).join('');
  bindHistoryCards();
}
