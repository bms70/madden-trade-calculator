/*
 * Madden League Trade Calculator - Admin
 *
 * SECURITY BOUNDARY. Everything in this file runs in the browser and is
 * untrusted by the backend. Session-expiry checks and disabled buttons are
 * usability aids only; authorization is enforced server-side.
 *
 * - Login submits the password to MaddenStorage.adminLogin(), which returns a
 *   temporary signed session { token, expiresAt }.
 * - The token is held in memory only (adminSession). It is never written to
 *   localStorage or sessionStorage, and no secret or service key belongs here.
 * - Privileged calls pass that token to MaddenStorage (getAdminAuditLog,
 *   deleteTrade). Logical deletion and TRADE_DELETED auditing are backend
 *   responsibilities; this file only requests them.
 */

// ----------------------------------------------------------------------------
// Admin state
// ----------------------------------------------------------------------------

let adminSession=null;

let adminLoginPending=false;

let adminTrades=[];

let adminAuditEvents=[];

let adminDeletedTrades=[];

let pendingDeleteTrade=null;

// ----------------------------------------------------------------------------
// Session validity and lock
// ----------------------------------------------------------------------------

function adminSessionIsValid() {
  if( !adminSession|| typeof adminSession.token!=='string'|| typeof adminSession.expiresAt!=='string' ) {
    return false;
  }
  let expiresAt=Date.parse(adminSession.expiresAt);
  return ( Number.isFinite(expiresAt)&& expiresAt>Date.now() );
}

function lockAdmin() {
  adminSession=null;
  adminTrades=[];
  adminAuditEvents=[];
  adminDeletedTrades=[];
  let password=$('#adminPassword');
  let status=$('#adminStatus');
  let tradesList=$('#adminTradesList');
  let auditList=$('#adminAuditList');
  if(password) {
    password.value='';
  }
  if(status) {
    status.textContent='Admin is locked.';
  }
  if(tradesList) {
    tradesList.innerHTML='';
  }
  if(auditList) {
    auditList.innerHTML='';
  }
  closeDeleteConfirmation();
  renderAdminState();
}

// ----------------------------------------------------------------------------
// Trade and audit rendering and loading
// ----------------------------------------------------------------------------

function adminTradeCard(trade) {
  let tradeNumber= Number.isInteger(trade.trade_number) ? `Trade #${trade.trade_number}` : 'Trade';
  let userSummary= historyPackageSummary(trade.user_team_assets);
  let cpuSummary= historyPackageSummary(trade.cpu_team_assets);
  return `
    <article class="admin-trade-card">
      <div class="admin-trade-head">
        <div>
          <strong>${esc(tradeNumber)}</strong>
          <div class="history-time">
            ${esc(formatHistoryDate(trade.accepted_at))}
          </div>
        </div>

        <span class="history-verdict">
          ${esc(trade.verdict||'UNKNOWN')}
        </span>
      </div>

      <div class="admin-trade-packages">
        <div>
          <b>USER TEAM RECEIVES</b>
          <span>${esc(userSummary)}</span>
        </div>

        <div>
          <b>CPU TEAM RECEIVES</b>
          <span>${esc(cpuSummary)}</span>
        </div>
      </div>

      <div class="admin-trade-meta">
        <span>
          ${esc(trade.web_release||'Unknown release')}
          · Ruleset ${esc(trade.ruleset_version||'Unknown')}
        </span>

        <button
          type="button"
          class="btn admin-delete-trade"
          data-trade-id="${esc(trade.id)}">
          Delete Trade
        </button>
      </div>
    </article>
  `;
}

async function loadAdminTrades() {
  let status=$('#adminTradesStatus');
  let list=$('#adminTradesList');
  if(!status||!list)return;
  if(!adminSessionIsValid()) {
    adminTrades=[];
    list.innerHTML='';
    status.textContent='Administrative authorization required.';
    return;
  }
  status.textContent='Loading active trades...';
  list.innerHTML='';
  let result=await window.MaddenStorage.getActiveTrades();
  if(!adminSessionIsValid()) {
    adminTrades=[];
    list.innerHTML='';
    status.textContent='Administrative authorization required.';
    renderAdminState();
    return;
  }
  if(!result.ok) {
    adminTrades=[];
    status.textContent='Active trades could not be loaded.';
    return;
  }
  adminTrades=Array.isArray(result.data)?result.data:[];
  if(!adminTrades.length) {
    status.textContent='No active trades are available.';
    return;
  }
  status.textContent='';
  list.innerHTML=adminTrades.map(adminTradeCard).join('');
  bindAdminTradeCards();
}

function adminAuditCard(event) {
  let tradeNumber= Number.isInteger(event.trade_number) ? `Trade #${event.trade_number}` : 'Trade';
  let reason= typeof event.reason==='string' && event.reason.trim() ? event.reason : 'No deletion reason provided.';
  return `
    <article class="admin-audit-card">
      <div class="admin-audit-head">
        <div>
          <strong>${esc(tradeNumber)}</strong>
          <div class="history-time">
            ${esc(formatHistoryDate(event.occurred_at))}
          </div>
        </div>

        <span class="admin-audit-action">
          ${esc(event.action||'AUDIT EVENT')}
        </span>
      </div>

      <div class="admin-audit-detail">
        <b>Administrator Name</b>
        <span>${esc(event.administrator_name||'Unknown')}</span>
      </div>

      <div class="admin-audit-detail">
        <b>Reason</b>
        <span>${esc(reason)}</span>
      </div>
    </article>
  `;
}

async function loadAdminAuditLog() {
  let status=$('#adminAuditStatus');
  let list=$('#adminAuditList');
  if(!status||!list)return;
  if(!adminSessionIsValid()) {
    adminAuditEvents=[];
    adminDeletedTrades=[];
    list.innerHTML='';
    status.textContent= 'Administrative authorization required.';
    return;
  }
  status.textContent='Loading Audit Log...';
  list.innerHTML='';
  let result= await window.MaddenStorage.getAdminAuditLog( adminSession.token );
  if(!adminSessionIsValid()) {
    adminAuditEvents=[];
    adminDeletedTrades=[];
    list.innerHTML='';
    status.textContent= 'Administrative authorization required.';
    renderAdminState();
    return;
  }
  if(!result.ok) {
    adminAuditEvents=[];
    adminDeletedTrades=[];
    status.textContent= result.error|| 'Audit Log could not be loaded.';
    return;
  }
  adminAuditEvents= Array.isArray(result.auditEvents) ? result.auditEvents : [];
  adminDeletedTrades= Array.isArray(result.deletedTrades) ? result.deletedTrades : [];
  if(!adminAuditEvents.length) {
    status.textContent= 'No administrative Audit Events are available.';
    return;
  }
  status.textContent='';
  list.innerHTML= adminAuditEvents .map(adminAuditCard) .join('');
}

// ----------------------------------------------------------------------------
// Delete confirmation
// ----------------------------------------------------------------------------

function closeDeleteConfirmation() {
  pendingDeleteTrade=null;
  let confirm=$('#adminDeleteConfirm');
  let name=$('#adminDeleteName');
  let reason=$('#adminDeleteReason');
  let status=$('#adminDeleteStatus');
  if(confirm) {
    confirm.hidden=true;
  }
  if(name) {
    name.value='';
  }
  if(reason) {
    reason.value='';
  }
  if(status) {
    status.textContent='';
  }
}

function openDeleteConfirmation(tradeId) {
  if(!adminSessionIsValid()) {
    renderAdminState();
    return;
  }
  let trade=adminTrades.find( item=>String(item.id)===String(tradeId) );
  if(!trade)return;
  pendingDeleteTrade=trade;
  let confirm=$('#adminDeleteConfirm');
  let title=$('#adminDeleteTitle');
  let description=$('#adminDeleteDescription');
  let name=$('#adminDeleteName');
  let reason=$('#adminDeleteReason');
  let status=$('#adminDeleteStatus');
  if(!confirm||!title||!description)return;
  let tradeNumber= Number.isInteger(trade.trade_number) ? `Trade #${trade.trade_number}` : 'this Trade';
  title.textContent=`Delete ${tradeNumber}?`;
  description.textContent= `${tradeNumber} will be removed from public Trade History. `+ `The original accepted Trade record will be retained and an `+ `administrative Audit Event will be created.`;
  if(name) {
    name.value='';
  }
  if(reason) {
    reason.value='';
  }
  if(status) {
    status.textContent='';
  }
  confirm.hidden=false;
  if(name) {
    name.focus();
  }
  confirm.scrollIntoView({ behavior:'smooth', block:'start' });
}

function bindAdminTradeCards() {
  $$('.admin-delete-trade').forEach(button=> {
    button.onclick=()=> {
      openDeleteConfirmation(button.dataset.tradeId);
    };
  });
}

// ----------------------------------------------------------------------------
// Admin panel state
// ----------------------------------------------------------------------------

function renderAdminState() {
  let locked=$('#adminLocked');
  let unlocked=$('#adminUnlocked');
  let sessionStatus=$('#adminSessionStatus');
  if(!locked||!unlocked)return;
  let valid=adminSessionIsValid();
  locked.hidden=valid;
  unlocked.hidden=!valid;
  if(valid&&sessionStatus) {
    let expiration=new Date(adminSession.expiresAt);
    sessionStatus.textContent= `Administrative access is active until ${expiration.toLocaleTimeString()}.`;
  }
}

// ----------------------------------------------------------------------------
// Event registration
// ----------------------------------------------------------------------------

let adminLoginForm=$('#adminLoginForm');

if(adminLoginForm) {
  adminLoginForm.onsubmit=async event=> {
    event.preventDefault();
    if(adminLoginPending)return;
    let passwordInput=$('#adminPassword');
    let status=$('#adminStatus');
    let submitButton= adminLoginForm.querySelector( '.admin-login-button' );
    let password= passwordInput?.value||'';
    if(!password) {
      status.textContent='Access denied.';
      return;
    }
    adminLoginPending=true;
    if(submitButton) {
      submitButton.disabled=true;
      submitButton.textContent='Verifying...';
    }
    status.textContent='Verifying administrative access...';
    try {
      let result= await window.MaddenStorage.adminLogin( password );
      passwordInput.value='';
      if(!result.ok) {
        adminSession=null;
        status.textContent= result.error||'Access denied.';
        renderAdminState();
        return;
      }
      adminSession={ token:result.session.token, expiresAt:result.session.expiresAt };
      status.textContent='';
      renderAdminState();
      await Promise.all([ loadAdminTrades(), loadAdminAuditLog() ]);
    } catch(error) {
      console.error( 'Unexpected Admin login failure:', error );
      adminSession=null;
      passwordInput.value='';
      status.textContent= 'Administrative access is unavailable.';
      renderAdminState();
    } finally {
      adminLoginPending=false;
      if(submitButton) {
        submitButton.disabled=false;
        submitButton.textContent='Unlock Admin';
      }
    }
  };
}

let lockAdminButton=$('#lockAdmin');

if(lockAdminButton) {
  lockAdminButton.onclick=lockAdmin;
}

let cancelDeleteButton= $('#cancelDeleteTrade');

if(cancelDeleteButton) {
  cancelDeleteButton.onclick= closeDeleteConfirmation;
}

let adminDeleteForm= $('#adminDeleteForm');

if(adminDeleteForm) {
  adminDeleteForm.onsubmit=async event=> {
    event.preventDefault();
    let status= $('#adminDeleteStatus');
    let nameInput= $('#adminDeleteName');
    let reasonInput= $('#adminDeleteReason');
    let submitButton= adminDeleteForm.querySelector( '.admin-confirm-delete' );
    if( !adminSessionIsValid()|| !pendingDeleteTrade ) {
      if(status) {
        status.textContent= 'Administrative authorization required.';
      }
      renderAdminState();
      return;
    }
    let administratorName= (nameInput?.value||'').trim();
    let reason= (reasonInput?.value||'').trim();
    if(!administratorName) {
      if(status) {
        status.textContent= 'Administrator Name is required.';
      }
      if(nameInput) {
        nameInput.focus();
      }
      return;
    }
    if(submitButton) {
      submitButton.disabled=true;
      submitButton.textContent= 'Deleting Trade...';
    }
    if(status) {
      status.textContent= 'Processing protected Trade deletion...';
    }
    try {
      let result= await window.MaddenStorage.deleteTrade({ token:adminSession.token, tradeId:pendingDeleteTrade.id, administratorName, reason });
      if(!result.ok) {
        if(status) {
          status.textContent= result.error|| 'The Trade could not be deleted.';
        }
        return;
      }
      let deletedTradeNumber= result.deletion.tradeNumber;
      closeDeleteConfirmation();
      historyLoaded=false;
      historyRecords=[];
      await Promise.all([ loadAdminTrades(), loadAdminAuditLog() ]);
      if(status) {
        status.textContent='';
      }
      let adminStatus= $('#adminTradesStatus');
      if(adminStatus) {
        adminStatus.textContent= `Trade #${deletedTradeNumber} deleted and audited successfully.`;
      }
    } catch(error) {
      console.error( 'Unexpected protected deletion failure:', error );
      if(status) {
        status.textContent= 'The Trade could not be deleted.';
      }
    } finally {
      if(submitButton) {
        submitButton.disabled=false;
        submitButton.textContent= 'Confirm Delete';
      }
    }
  };
}

// ----------------------------------------------------------------------------
// Initial render
// ----------------------------------------------------------------------------

renderAdminState();
