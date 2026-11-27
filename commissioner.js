/*
 * Madden League Trade Calculator - Commissioner area (Web v2.0)
 *
 * Replaces the v1.5.0 Admin tab. Per league, behind that league's
 * commissioner password: the review queue, all trades, Mark reviewed /
 * Correct / Reverse, and the league's audit log (spec section 3.5).
 *
 * SECURITY BOUNDARY. Everything here runs in the browser and is untrusted by
 * the backend. The session token is held in memory only (never localStorage
 * or sessionStorage), is tied to one league, and every action is authorized
 * server-side (review-trade checks the token's league). Expiry checks and
 * hidden buttons here are usability aids only.
 *
 * Correction mode loads a trade into the calculator; v4.4 re-runs as usual
 * and Save correction sends buildTradeSnapshot() with a reason.
 *
 * Web v3.0: Draft picks (move a pick by hand, Draft complete) and Exports
 * (review each Snallabot export, mark one current). Corrections keep each
 * pick's choice; the picks the trade moved are offered again.
 *
 * Loaded last. Uses $, esc, state, emptyAsset, render, buildTradeSnapshot
 * (calculator-ui.js), historyBadge, historySideHeading, historyPackageSummary,
 * formatHistoryDate, resetTradeHistory (trade-history.js) and LeagueMode.
 */

(function () {
  'use strict';

  const STORE_NAME = 'maddenTrade.commissionerName';

  const area = {
    session: null,        // { token, expiresAt, leagueId, leagueName }
    signingIn: false,
    trades: [],
    pending: null,        // { trade, action } for the Review / Reverse form
    notice: '',           // last action's result, shown before the queue count
    correction: null,     // { trade, teamA, teamB } while correcting
    teams: [],            // commissioner team list (v2.1), with owner labels
    teamNotice: '',       // last team save result, shown before the team count
    picks: null,          // v3.0: { currentDraftYear, rolloverDue, latestSeason, picks }
    pickYear: null,       // Draft picks filter
    pickRound: 1,
    pickNotice: '',
    confirmDraft: false,  // Draft complete asks once more
    snapshots: [],        // v3.0: newest exports
    snapshotNotice: ''
  };

  const ACTIONS = {
    TRADE_REVIEWED: 'Reviewed',
    TRADE_CORRECTED: 'Corrected',
    TRADE_REVERSED: 'Reversed',
    TRADE_DELETED: 'Deleted (v1.5.0 Admin)',
    PRE_LEAGUE_MIGRATION: 'Pre-league history moved in',
    LEAGUE_CREATED: 'League created',
    LEAGUE_RENAMED: 'League renamed',
    LEAGUE_STATUS_CHANGED: 'League status changed',
    COMMISSIONER_PASSWORD_SET: 'Commissioner password set',
    IMPORT_SECRET_ROTATED: 'Import secret changed',
    TEAM_UPDATED: 'Team updated',
    PICK_OWNERSHIP_CHANGED: 'Pick moved',
    PICKS_SET_UP: 'Draft picks set up',
    DRAFT_COMPLETED: 'Draft complete',
    SNAPSHOT_MARKED_CURRENT: 'Export marked current'
  };

  const CONTROL = { USER: 'Human', CPU: 'CPU' };

  const ASSET_FIELDS = ['type', 'name', 'pick', 'timing', 'ovr', 'age', 'pos', 'dev', 'cap', 'years', 'league', 'current', 'projected', 'pick_id'];

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* not remembered */ }
  }

  function entered() {
    return window.LeagueMode?.isLeague() ? window.LeagueMode.state.entered : null;
  }

  function sessionValid() {
    let league = entered();
    if (!area.session || !league || area.session.leagueId !== league.id) return false;
    let expires = Date.parse(area.session.expiresAt);
    return Number.isFinite(expires) && expires > Date.now();
  }

  function text(id, value) {
    let el = $(id);
    if (el) el.textContent = value || '';
  }

  function teamByName(name) {
    if (!name || !window.LeagueMode) return null;
    return window.LeagueMode.state.teams.find(t => window.LeagueMode.teamFullName(t) === name) || null;
  }

  function assetKey(list) {
    return (Array.isArray(list) ? list : [])
      .map(a => [a.type, a.name, a.pick, a.timing, a.ovr, a.age, a.pos].join('|'))
      .sort()
      .join(';');
  }

  // Why a trade deserves a look: not FAIR, human to human, or a near-duplicate
  // (same teams and assets within 24 hours of another active trade).
  function tradeFlags(trade, all) {
    let flags = [];
    if (trade.verdict && trade.verdict !== 'FAIR') flags.push(`Rated ${trade.verdict}`);

    let a = teamByName(trade.submitting_team);
    let b = teamByName(trade.other_team);
    if (a && b && a.controlled_by === 'USER' && b.controlled_by === 'USER') flags.push('Human to human');

    let when = Date.parse(trade.accepted_at);
    let key = assetKey(trade.user_team_assets) + '>' + assetKey(trade.cpu_team_assets);
    let swapped = assetKey(trade.cpu_team_assets) + '>' + assetKey(trade.user_team_assets);
    let twin = all.some(other => {
      if (String(other.id) === String(trade.id) || !trade.submitting_team) return false;
      let gap = Math.abs(Date.parse(other.accepted_at) - when);
      if (!(gap <= 24 * 3600 * 1000)) return false;
      let same = other.submitting_team === trade.submitting_team && other.other_team === trade.other_team &&
        assetKey(other.user_team_assets) + '>' + assetKey(other.cpu_team_assets) === key;
      let mirror = other.submitting_team === trade.other_team && other.other_team === trade.submitting_team &&
        assetKey(other.user_team_assets) + '>' + assetKey(other.cpu_team_assets) === swapped;
      return same || mirror;
    });
    if (twin) flags.push('Possible duplicate');
    return flags;
  }

  // Oldest first, unreviewed league trades only (pre-league trades stay in All trades).
  function queueTrades(all) {
    return all
      .filter(t => t.review_status === 'UNREVIEWED' && !t.is_pre_league)
      .sort((x, y) => Date.parse(x.accepted_at) - Date.parse(y.accepted_at));
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  function tradeCard(trade, flags) {
    let number = Number.isInteger(trade.trade_number) ? `Trade #${trade.trade_number}` : 'Trade';
    let actions = [];
    if (trade.review_status === 'UNREVIEWED') actions.push(['REVIEW', 'Mark reviewed', 'comm-review']);
    actions.push(['CORRECT', 'Correct', 'comm-correct']);
    actions.push(['REVERSE', 'Reverse', 'admin-delete-trade']);
    return `
      <article class="admin-trade-card">
        <div class="admin-trade-head">
          <div>
            <strong>${esc(number)}</strong> ${historyBadge(trade)}
            <div class="history-time">${esc(formatHistoryDate(trade.accepted_at))}${trade.submitter_name ? ' · ' + esc(trade.submitter_name) : ''}</div>
          </div>
          <span class="history-verdict">${esc(trade.verdict || 'UNKNOWN')}</span>
        </div>
        ${flags.length ? `<div class="comm-flags">${flags.map(f => `<span class="comm-flag">${esc(f)}</span>`).join('')}</div>` : ''}
        <div class="admin-trade-packages">
          <div><b>${esc(historySideHeading(trade, 'A'))}</b><span>${esc(historyPackageSummary(trade.user_team_assets))}</span></div>
          <div><b>${esc(historySideHeading(trade, 'B'))}</b><span>${esc(historyPackageSummary(trade.cpu_team_assets))}</span></div>
        </div>
        ${trade.submitter_note ? `<p class="comm-note">${esc(trade.submitter_note)}</p>` : ''}
        <div class="admin-trade-meta">
          <span>${esc(trade.web_release || '')} · Ruleset ${esc(trade.ruleset_version || '')}</span>
          <span class="comm-actions">
            ${actions.map(([action, label, cls]) => `<button type="button" class="btn ${cls}" data-action="${action}" data-trade-id="${esc(trade.id)}">${label}</button>`).join('')}
          </span>
        </div>
      </article>`;
  }

  function auditCard(event) {
    let label = ACTIONS[event.action] || event.action || 'Action';
    let who = [event.actorName, event.actorRole ? event.actorRole.toLowerCase() : ''].filter(Boolean).join(', ');
    let d = event.details && typeof event.details === 'object' ? event.details : {};
    let details = '';
    if (d.verdict_before) {
      details = `Verdict ${d.verdict_before} → ${d.verdict_after}`;
    } else if (event.action === 'TEAM_UPDATED' && d.team) {
      let parts = [];
      if (d.controlled_by_before && d.controlled_by_before !== d.controlled_by_after) {
        parts.push(`${CONTROL[d.controlled_by_before] || d.controlled_by_before} → ${CONTROL[d.controlled_by_after] || d.controlled_by_after}`);
      }
      if (d.owner_label_changed) parts.push('owner label changed');
      if (d.source === 'snallabot') parts.push('loaded from Snallabot');
      details = `${d.team}${parts.length ? ': ' + parts.join(', ') : ''}`;
    } else if (event.action === 'TEAM_UPDATED' && d.source === 'snallabot') {
      details = `Teams loaded from Snallabot (${d.added || 0} added, ${d.updated || 0} updated)`;
    }
    return `
      <article class="admin-audit-card">
        <div class="admin-audit-head">
          <div>
            <strong>${Number.isInteger(event.tradeNumber) ? `Trade #${event.tradeNumber}` : 'League'}</strong>
            <div class="history-time">${esc(formatHistoryDate(event.occurredAt))}${who ? ' · ' + esc(who) : ''}</div>
          </div>
          <span class="admin-audit-action comm-audit-${esc(String(event.action || '').toLowerCase())}">${esc(label)}</span>
        </div>
        ${event.reason || details ? `<div class="admin-audit-detail">${details ? `<span>${esc(details)}</span>` : ''}${event.reason ? `<span>${esc(event.reason)}</span>` : ''}</div>` : ''}
      </article>`;
  }

  function bindActions() {
    for (let button of document.querySelectorAll('#commissioner [data-action]')) {
      button.onclick = () => {
        let trade = area.trades.find(t => String(t.id) === button.dataset.tradeId);
        if (!trade) return;
        if (button.dataset.action === 'CORRECT') startCorrection(trade);
        else openAction(trade, button.dataset.action);
      };
    }
  }

  function renderLists() {
    let queue = queueTrades(area.trades);
    $('#commQueue').innerHTML = queue.map(t => tradeCard(t, tradeFlags(t, area.trades))).join('');
    let count = queue.length ? `${queue.length} to review.` : 'Nothing to review.';
    text('#commQueueStatus', area.notice ? `${area.notice} ${count}` : count);
    $('#commAll').innerHTML = area.trades.map(t => tradeCard(t, [])).join('');
    text('#commAllStatus', area.trades.length ? '' : 'No trades in this league yet.');
    bindActions();
  }

  function paint() {
    let league = entered();
    let valid = sessionValid();
    $('#commNoLeague').hidden = !!league;
    $('#commLocked').hidden = !league || valid;
    $('#commUnlocked').hidden = !league || !valid;
    if (league) text('#commLeagueName', league.name);
    if (valid) {
      text('#commSessionStatus', `Signed in to ${area.session.leagueName} until ${new Date(area.session.expiresAt).toLocaleTimeString()}.`);
    }
  }

  // --------------------------------------------------------------------------
  // Session
  // --------------------------------------------------------------------------

  function signOut(message) {
    area.session = null;
    area.trades = [];
    area.pending = null;
    area.notice = '';
    if (area.correction) endCorrection(false);
    let password = $('#commPassword');
    if (password) password.value = '';
    $('#commAction').hidden = true;
    $('#commQueue').innerHTML = '';
    $('#commAll').innerHTML = '';
    $('#commAudit').innerHTML = '';
    area.teams = [];
    area.teamNotice = '';
    $('#commTeams').innerHTML = '';
    text('#commTeamsStatus', '');
    area.picks = null;
    area.pickNotice = '';
    area.confirmDraft = false;
    $('#commPicks').innerHTML = '';
    text('#commPicksStatus', '');
    area.snapshots = [];
    area.snapshotNotice = '';
    $('#commSnapshots').innerHTML = '';
    text('#commSnapshotsStatus', '');
    text('#commStatus', message || '');
    paint();
  }

  // 401 from any function = the session is over.
  function handleFailure(result, statusId) {
    if (result.status === 401) {
      signOut('Your commissioner session ended. Sign in again.');
      return;
    }
    text(statusId, result.error);
  }

  async function signIn(event) {
    event.preventDefault();
    let league = entered();
    if (!league || area.signingIn) return;
    let password = $('#commPassword').value;
    if (!password) return;

    area.signingIn = true;
    $('#commLoginButton').disabled = true;
    text('#commStatus', 'Signing in...');

    try {
      let result = await window.MaddenStorage.commissionerLogin(league.name, password);
      $('#commPassword').value = '';

      if (!result.ok) {
        if (result.status === 429 && result.data && Number.isFinite(result.data.retryAfterSeconds)) {
          let minutes = Math.max(1, Math.ceil(result.data.retryAfterSeconds / 60));
          text('#commStatus', `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
        } else {
          text('#commStatus', result.error);
        }
        return;
      }

      let session = result.data.session;
      if (!session || session.leagueId !== league.id) {
        text('#commStatus', 'Sign-in returned an unexpected result.');
        return;
      }

      area.session = session;
      text('#commStatus', '');
      let name = $('#commName');
      if (name && !name.value) name.value = storageGet(STORE_NAME) || '';
      paint();
      await loadAll();
    } finally {
      area.signingIn = false;
      $('#commLoginButton').disabled = false;
    }
  }

  // --------------------------------------------------------------------------
  // Loading
  // --------------------------------------------------------------------------

  async function loadAll() {
    if (!sessionValid()) { paint(); return; }
    let league = entered();
    let token = area.session.token;
    text('#commQueueStatus', 'Loading trades...');
    text('#commAuditStatus', 'Loading the audit log...');

    let [history, audit, teams, picks, snapshots] = await Promise.all([
      window.MaddenStorage.leagueHistory(league.name),
      window.MaddenStorage.commissionerAuditLog(token, league.id),
      window.MaddenStorage.commissionerTeams(token, league.id),
      window.MaddenStorage.commissionerPicks(token, league.id),
      window.MaddenStorage.commissionerSnapshots(token, league.id)
    ]);

    if (!sessionValid() || entered() !== league) return;

    if (history.ok) {
      area.trades = history.data;
      renderLists();
    } else {
      text('#commQueueStatus', history.error);
    }

    if (audit.ok) {
      let events = Array.isArray(audit.data.events) ? audit.data.events : [];
      $('#commAudit').innerHTML = events.map(auditCard).join('');
      text('#commAuditStatus', events.length ? '' : 'No actions yet.');
    } else {
      handleFailure(audit, '#commAuditStatus');
    }

    if (!sessionValid()) return;
    if (teams.ok) {
      area.teams = Array.isArray(teams.data.teams) ? teams.data.teams : [];
      renderTeams();
    } else {
      handleFailure(teams, '#commTeamsStatus');
    }

    if (!sessionValid()) return;
    if (picks.ok) {
      setPicks(picks.data);
    } else {
      handleFailure(picks, '#commPicksStatus');
    }

    if (!sessionValid()) return;
    if (snapshots.ok) {
      area.snapshots = Array.isArray(snapshots.data.snapshots) ? snapshots.data.snapshots : [];
      renderSnapshots();
    } else {
      handleFailure(snapshots, '#commSnapshotsStatus');
    }
  }

  // --------------------------------------------------------------------------
  // Draft picks (v3.0)
  // --------------------------------------------------------------------------

  function ordinal(round) {
    return { 1: '1st', 2: '2nd', 3: '3rd' }[round] || `${round}th`;
  }

  function setPicks(data) {
    area.picks = {
      currentDraftYear: typeof data.currentDraftYear === 'number' ? data.currentDraftYear : null,
      rolloverDue: data.rolloverDue === true,
      latestSeason: data.latestSeason ?? null,
      picks: Array.isArray(data.picks) ? data.picks : []
    };
    let years = [...new Set(area.picks.picks.map(p => p.draftYear))].sort();
    if (!years.includes(area.pickYear)) area.pickYear = years[0] ?? null;
    area.confirmDraft = false;
    renderPicks();
  }

  function pickTeamOptions(selected) {
    let teams = [...area.teams].sort((a, b) => String(a.abbreviation).localeCompare(String(b.abbreviation)));
    return teams.map(t => `<option value="${attr(t.teamId)}"${t.teamId === selected ? ' selected' : ''}>${esc(t.abbreviation)}</option>`).join('');
  }

  function renderPicks() {
    let info = area.picks;
    let year = info && info.currentDraftYear;
    $('#commPickControls').hidden = !year;
    $('#commDraftComplete').hidden = !year;
    $('#commPickRollover').hidden = !(year && info.rolloverDue);
    if (!year) {
      text('#commPicksSummary', 'not set up');
      text('#commPicksStatus', info ? "Draft picks aren't set up for this league yet. The site owner turns them on." : '');
      $('#commPicks').innerHTML = '';
      return;
    }
    let moved = info.picks.filter(p => p.ownerTeamId !== p.originalTeamId).length;
    text('#commPicksSummary', `current draft ${year} · ${moved} ${moved === 1 ? 'pick' : 'picks'} moved`);
    text('#commPickRollover', info.rolloverDue
      ? `The newest export shows the ${info.latestSeason} season. If the ${year} draft is done, select Draft complete.`
      : '');

    let years = [...new Set(info.picks.map(p => p.draftYear))].sort();
    $('#commPickYear').innerHTML = years.map(y => `<option value="${y}"${y === area.pickYear ? ' selected' : ''}>${y}${y === year ? ' (current)' : ''}</option>`).join('');
    $('#commPickRound').innerHTML = [1, 2, 3, 4, 5, 6, 7].map(r => `<option value="${r}"${r === area.pickRound ? ' selected' : ''}>${ordinal(r)} round</option>`).join('');

    let rows = info.picks
      .filter(p => p.draftYear === area.pickYear && p.round === area.pickRound)
      .sort((a, b) => String(a.originalAbbreviation).localeCompare(String(b.originalAbbreviation)));
    $('#commPicks').innerHTML = rows.map(p => `
      <div class="comm-team-line comm-pick-line${p.ownerTeamId !== p.originalTeamId ? ' moved' : ''}">
        <span class="comm-team-abbr">${esc(p.originalAbbreviation)}</span>
        <span class="comm-pick-arrow" aria-hidden="true">owned by</span>
        <select data-pick="${attr(p.pickId)}" aria-label="${attr(`${p.draftYear} ${ordinal(p.round)} (${p.originalAbbreviation}) owned by`)}">${pickTeamOptions(p.ownerTeamId)}</select>
      </div>`).join('');
    text('#commPicksStatus', area.pickNotice || 'Picks move automatically with submitted trades. Change one here only for a trade made outside the calculator.');
    for (let select of document.querySelectorAll('#commPicks [data-pick]')) {
      select.onchange = () => savePickOwner(select.dataset.pick, select.value);
    }
    let button = $('#commDraftComplete');
    button.textContent = area.confirmDraft ? `Confirm: the ${year} draft is complete` : 'Draft complete';
    $('#commDraftCancel').hidden = !area.confirmDraft;
  }

  async function savePickOwner(pickId, ownerTeamId) {
    let pick = area.picks && area.picks.picks.find(p => p.pickId === pickId);
    if (!pick) return;
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }
    let name = commissionerName();
    if (!name) {
      area.pickNotice = '';
      renderPicks();
      text('#commPicksStatus', 'Add your name at the top first; it goes in the audit log. Nothing was saved.');
      return;
    }
    let label = `${pick.draftYear} ${ordinal(pick.round)} (${pick.originalAbbreviation})`;
    text('#commPicksStatus', `Saving ${label}...`);
    let result = await window.MaddenStorage.setPickOwner({
      token: area.session.token, leagueId: area.session.leagueId, pickId, ownerTeamId, commissionerName: name
    });
    if (!result.ok) {
      area.pickNotice = '';
      if (result.status !== 401) renderPicks();
      handleFailure(result, '#commPicksStatus');
      return;
    }
    let saved = result.data.pick;
    pick.ownerTeamId = saved.ownerTeamId;
    pick.ownerAbbreviation = saved.ownerAbbreviation;
    area.pickNotice = saved.changed ? `${label} now belongs to ${saved.ownerAbbreviation}.` : `${label}: nothing changed.`;
    renderPicks();
    if (saved.changed) {
      if (window.LeagueMode) await window.LeagueMode.reloadPicks();
      await loadAudit();
    }
  }

  async function draftComplete() {
    let info = area.picks;
    if (!info || !info.currentDraftYear) return;
    if (!area.confirmDraft) {
      area.confirmDraft = true;
      renderPicks();
      text('#commPicksStatus', `The ${info.currentDraftYear} picks will be marked used, ${info.currentDraftYear + 1} becomes the current draft, and ${info.currentDraftYear + 3} picks are added. Select Confirm to go ahead.`);
      return;
    }
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }
    let name = commissionerName();
    if (!name) {
      text('#commPicksStatus', 'Add your name at the top first; it goes in the audit log. Nothing was saved.');
      return;
    }
    $('#commDraftComplete').disabled = true;
    try {
      let result = await window.MaddenStorage.draftComplete({
        token: area.session.token, leagueId: area.session.leagueId,
        expectedYear: info.currentDraftYear, commissionerName: name
      });
      if (!result.ok) {
        area.confirmDraft = false;
        renderPicks();
        handleFailure(result, '#commPicksStatus');
        return;
      }
      let done = result.data.draft;
      area.pickNotice = `The ${info.currentDraftYear} draft is complete. The current draft is now ${done.currentDraftYear}.`;
      let picks = await window.MaddenStorage.commissionerPicks(area.session.token, area.session.leagueId);
      if (picks.ok) setPicks(picks.data);
      // Members' "Whose pick" years follow the new current draft.
      if (window.LeagueMode) await window.LeagueMode.reloadPicks();
      await loadAudit();
    } finally {
      $('#commDraftComplete').disabled = false;
    }
  }

  // --------------------------------------------------------------------------
  // Exports (v3.0): review each Snallabot export and mark one current
  // --------------------------------------------------------------------------

  function snapshotLine(s) {
    let when = s.receivedAt ? new Date(s.receivedAt).toLocaleString() : '';
    let season = s.season ? `${s.season}, ${s.stageIndex === 1 ? 'week' : `stage ${s.stageIndex}, week`} ${s.week}` : 'season unknown';
    let healthy = s.complete && !s.missingRosters && !s.historyFailed;
    let issues = [];
    if (!s.complete) issues.push('incomplete');
    if (s.missingRosters) issues.push(`${s.missingRosters} rosters missing`);
    if (s.historyFailed) issues.push(`${s.historyFailed} files failed`);
    let action = s.isCurrent
      ? '<span class="comm-snapshot-current">Current</span>'
      : `<button type="button" class="btn comm-snapshot-mark" data-snapshot="${attr(s.snapshotId)}">Mark current</button>`;
    return `
      <div class="comm-snapshot-line${s.isCurrent ? ' current' : ''}">
        <div>
          <div class="comm-snapshot-title">${esc(season)}</div>
          <div class="comm-snapshot-meta">${esc(when)} · ${esc(`${s.rostersReceived ?? 0}/${s.teamsInLeague ?? 0} rosters`)} · ${esc(`${(s.players ?? 0).toLocaleString()} players`)} · ${esc(`${(s.freeAgents ?? 0).toLocaleString()} free agents`)}</div>
        </div>
        <span class="comm-snapshot-health ${healthy ? 'ok' : 'warn'}">${healthy ? 'Healthy' : esc(issues.join(', '))}</span>
        ${action}
      </div>`;
  }

  function renderSnapshots() {
    let current = area.snapshots.find(s => s.isCurrent);
    text('#commSnapshotsSummary', current
      ? `current: ${current.season}, week ${current.week}`
      : (area.snapshots.length ? 'none marked current' : 'no exports yet'));
    $('#commSnapshots').innerHTML = area.snapshots.map(snapshotLine).join('');
    text('#commSnapshotsStatus', area.snapshotNotice || (area.snapshots.length
      ? 'Check an export is healthy, then mark it current.'
      : 'No Snallabot exports yet.'));
    for (let button of document.querySelectorAll('#commSnapshots [data-snapshot]')) {
      button.onclick = () => markCurrent(button.dataset.snapshot);
    }
  }

  async function markCurrent(snapshotId) {
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }
    let name = commissionerName();
    if (!name) {
      text('#commSnapshotsStatus', 'Add your name at the top first; it goes in the audit log. Nothing was saved.');
      return;
    }
    text('#commSnapshotsStatus', 'Saving...');
    let result = await window.MaddenStorage.markSnapshotCurrent({
      token: area.session.token, leagueId: area.session.leagueId, snapshotId, commissionerName: name
    });
    if (!result.ok) {
      area.snapshotNotice = '';
      handleFailure(result, '#commSnapshotsStatus');
      return;
    }
    let saved = result.data.snapshot;
    for (let s of area.snapshots) s.isCurrent = s.snapshotId === saved.snapshotId;
    area.snapshotNotice = `Marked current: ${saved.season}, week ${saved.week}.`;
    renderSnapshots();
    let picks = await window.MaddenStorage.commissionerPicks(area.session.token, area.session.leagueId);
    if (picks.ok) setPicks(picks.data);
    await loadAudit();
  }

  // --------------------------------------------------------------------------
  // Teams (v2.1): human / CPU and owner label
  // --------------------------------------------------------------------------

  function attr(value) {
    return esc(value || '').replace(/"/g, '&quot;');
  }

  // One compact line: abbreviation, Human/CPU, owner label. Changes save
  // automatically (select: on change; label: on blur or Enter).
  function teamLine(team) {
    let id = attr(team.teamId);
    let name = [team.cityName, team.nickname].filter(Boolean).join(' ') || team.abbreviation;
    return `
      <div class="comm-team-line">
        <span class="comm-team-abbr" title="${attr(name)}">${esc(team.abbreviation)}</span>
        <select id="teamCtl-${id}" data-team="${id}" aria-label="${attr(name)}: Human or CPU">
          <option value="USER"${team.controlledBy === 'USER' ? ' selected' : ''}>Human</option>
          <option value="CPU"${team.controlledBy === 'CPU' ? ' selected' : ''}>CPU</option>
        </select>
        <input type="text" id="teamLabel-${id}" data-team="${id}" maxlength="60" placeholder="Owner"
          aria-label="${attr(name)}: owner label" value="${attr(team.ownerLabel)}">
      </div>`;
  }

  function teamSummary() {
    let humans = area.teams.filter(t => t.controlledBy === 'USER').length;
    text('#commTeamsSummary', area.teams.length ? `${area.teams.length} teams, ${humans} human` : 'no teams loaded');
  }

  // Teams grouped by division, in the order the list arrives (division, city).
  function renderTeams() {
    let groups = new Map();
    for (let team of area.teams) {
      let key = team.division || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(team);
    }
    $('#commTeams').innerHTML = [...groups].map(([division, teams]) => `
      <div class="comm-team-group">
        <h3>${esc(division)}</h3>
        ${teams.map(teamLine).join('')}
      </div>`).join('');
    teamSummary();
    text('#commTeamsStatus', area.teams.length ? area.teamNotice : 'No teams loaded yet. The site owner loads them from Snallabot.');
    for (let field of document.querySelectorAll('#commTeams [data-team]')) {
      field.onchange = () => saveTeam(field.dataset.team);
      if (field.tagName === 'INPUT') {
        field.onkeydown = event => { if (event.key === 'Enter') field.blur(); };
      }
    }
  }

  // Audit log only (after a team save, so the team list isn't redrawn).
  async function loadAudit() {
    if (!sessionValid()) return;
    let league = entered();
    let audit = await window.MaddenStorage.commissionerAuditLog(area.session.token, league.id);
    if (!sessionValid() || entered() !== league) return;
    if (audit.ok) {
      let events = Array.isArray(audit.data.events) ? audit.data.events : [];
      $('#commAudit').innerHTML = events.map(auditCard).join('');
      text('#commAuditStatus', events.length ? '' : 'No actions yet.');
    } else {
      handleFailure(audit, '#commAuditStatus');
    }
  }

  // Puts a team's fields back to its saved values.
  function restoreTeam(team) {
    let control = $(`#teamCtl-${team.teamId}`);
    let label = $(`#teamLabel-${team.teamId}`);
    if (control) control.value = team.controlledBy;
    if (label) label.value = team.ownerLabel || '';
  }

  async function saveTeam(teamId) {
    let team = area.teams.find(t => String(t.teamId) === String(teamId));
    if (!team) return;
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }
    let name = commissionerName();
    if (!name) {
      area.teamNotice = '';
      restoreTeam(team);
      text('#commTeamsStatus', 'Add your name at the top first; it goes in the audit log. Nothing was saved.');
      return;
    }
    let control = $(`#teamCtl-${teamId}`).value;
    let label = $(`#teamLabel-${teamId}`).value.trim();
    text('#commTeamsStatus', `Saving ${team.abbreviation}...`);
    let result = await window.MaddenStorage.updateTeam({
      token: area.session.token,
      leagueId: area.session.leagueId,
      teamId,
      controlledBy: control,
      ownerLabel: label,
      commissionerName: name
    });
    if (!result.ok) {
      area.teamNotice = '';
      if (result.status !== 401) restoreTeam(team);
      handleFailure(result, '#commTeamsStatus');
      return;
    }
    let saved = result.data.team;
    area.teamNotice = saved.changed ? `${team.abbreviation} saved.` : `${team.abbreviation}: nothing changed.`;
    text('#commTeamsStatus', area.teamNotice);
    if (!saved.changed) return;
    // Update in place (no redraw, so focus stays in the next field).
    team.controlledBy = saved.controlledBy;
    team.ownerLabel = saved.ownerLabel;
    teamSummary();
    // Team pickers and the human-to-human flags follow the change.
    if (window.LeagueMode) await window.LeagueMode.reloadTeams();
    renderLists();
    await loadAudit();
  }

  // --------------------------------------------------------------------------
  // Mark reviewed and Reverse
  // --------------------------------------------------------------------------

  function commissionerName() {
    let input = $('#commName');
    let name = input ? input.value.trim() : '';
    if (name.length < 1 || name.length > 60) {
      if (input) input.focus();
      return null;
    }
    storageSet(STORE_NAME, name);
    return name;
  }

  function openAction(trade, action) {
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }
    if (!commissionerName()) {
      text('#commQueueStatus', 'Add your name at the top first; it goes in the audit log.');
      return;
    }
    area.pending = { trade, action };
    let number = `trade #${trade.trade_number}`;
    let reverse = action === 'REVERSE';
    text('#commActionTitle', reverse ? `Reverse ${number}?` : `Mark ${number} reviewed?`);
    text('#commActionDescription', reverse
      ? 'The trade leaves Trade History. Nothing is erased: it stays in the audit log with your reason.'
      : 'The trade shows as Reviewed in Trade History.');
    text('#commReasonHint', reverse ? 'Required' : 'Optional comment');
    $('#commReason').value = '';
    $('#commReason').required = reverse;
    $('#commActionConfirm').textContent = reverse ? 'Reverse trade' : 'Mark reviewed';
    $('#commActionConfirm').className = reverse ? 'btn admin-confirm-delete' : 'btn accept-confirm-button';
    text('#commActionStatus', '');
    let form = $('#commAction');
    form.hidden = false;
    $('#commReason').focus();
    if (form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeAction() {
    area.pending = null;
    $('#commAction').hidden = true;
  }

  async function confirmAction(event) {
    event.preventDefault();
    let pending = area.pending;
    if (!pending) return;
    let reason = $('#commReason').value.trim();
    if (pending.action === 'REVERSE' && !reason) {
      text('#commActionStatus', 'Reversing a trade needs a reason.');
      return;
    }
    let name = commissionerName();
    if (!name) { text('#commActionStatus', 'Add your name at the top first.'); return; }
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }

    $('#commActionConfirm').disabled = true;
    text('#commActionStatus', 'Saving...');
    try {
      let result = await window.MaddenStorage.reviewTrade({
        token: area.session.token,
        leagueId: area.session.leagueId,
        tradeId: pending.trade.id,
        action: pending.action,
        commissionerName: name,
        reason
      });
      if (!result.ok) { handleFailure(result, '#commActionStatus'); return; }
      closeAction();
      if (typeof resetTradeHistory === 'function') resetTradeHistory();
      area.notice = pending.action === 'REVERSE'
        ? `Trade #${pending.trade.trade_number} reversed.`
        : `Trade #${pending.trade.trade_number} marked reviewed.`;
      await loadAll();
    } finally {
      $('#commActionConfirm').disabled = false;
    }
  }

  // --------------------------------------------------------------------------
  // Correction mode
  // --------------------------------------------------------------------------

  function toCalculatorAsset(stored) {
    let asset = emptyAsset();
    for (let field of ASSET_FIELDS) {
      let value = stored ? stored[field] : undefined;
      if (value !== undefined && value !== null) asset[field] = typeof value === 'number' ? String(value) : value;
    }
    if (asset.type !== 'Draft Pick') asset.type = 'Player';
    return asset;
  }

  function showTab(name) {
    let tab = document.querySelector(`.tab[data-tab="${name}"]`);
    if (tab) tab.click();
  }

  function startCorrection(trade) {
    if (!sessionValid()) { signOut('Your commissioner session ended. Sign in again.'); return; }
    if (!commissionerName()) {
      text('#commQueueStatus', 'Add your name at the top first; it goes in the audit log.');
      return;
    }
    closeAction();
    let LM = window.LeagueMode;
    area.correction = { trade, teamA: LM.state.teamA, teamB: LM.state.teamB };

    // Show the trade's own teams (display only; corrections never change teams).
    let a = teamByName(trade.submitting_team);
    let b = teamByName(trade.other_team);
    LM.state.teamA = a ? a.team_id : '';
    LM.state.teamB = b ? b.team_id : '';
    if ($('#teamA')) $('#teamA').value = LM.state.teamA;
    if ($('#teamB')) $('#teamB').value = LM.state.teamB;

    state = {
      A: (trade.user_team_assets || []).map(toCalculatorAsset),
      B: (trade.cpu_team_assets || []).map(toCalculatorAsset)
    };
    // v3.0: the picks this trade moved are offered again with their choices.
    LM.setCorrectionTrade(trade.id);

    text('#correctionTitle', `Correcting trade #${trade.trade_number}`);
    $('#correctionReason').value = '';
    text('#correctionStatus', '');
    $('#correctionBar').hidden = false;
    showTab('calc');
    render();
    $('#correctionReason').focus();
  }

  function endCorrection(restoreTeams) {
    let correction = area.correction;
    area.correction = null;
    $('#correctionBar').hidden = true;
    if (correction && restoreTeams !== false && window.LeagueMode) {
      window.LeagueMode.state.teamA = correction.teamA;
      window.LeagueMode.state.teamB = correction.teamB;
      if ($('#teamA')) $('#teamA').value = correction.teamA;
      if ($('#teamB')) $('#teamB').value = correction.teamB;
    }
    state = { A: [], B: [] };
    if (window.LeagueMode) window.LeagueMode.setCorrectionTrade(null);
    render();
  }

  async function saveCorrection() {
    let correction = area.correction;
    if (!correction) return;
    let reason = $('#correctionReason').value.trim();
    if (!reason) {
      text('#correctionStatus', 'A correction needs a reason.');
      $('#correctionReason').focus();
      return;
    }
    let snapshot = buildTradeSnapshot();
    if (!snapshot) {
      text('#correctionStatus', 'Complete both sides of the trade first.');
      return;
    }
    if (!sessionValid()) {
      text('#correctionStatus', 'Your commissioner session ended. Sign in again on the Commissioner tab; your edits are still here.');
      return;
    }
    let name = commissionerName();
    if (!name) {
      text('#correctionStatus', 'Add your name on the Commissioner tab first.');
      return;
    }
    let picks = window.LeagueMode ? window.LeagueMode.picksReady(state) : { ok: true };
    if (!picks.ok) {
      text('#correctionStatus', picks.error);
      return;
    }

    $('#saveCorrection').disabled = true;
    text('#correctionStatus', 'Saving the correction...');
    try {
      let result = await window.MaddenStorage.reviewTrade({
        token: area.session.token,
        leagueId: area.session.leagueId,
        tradeId: correction.trade.id,
        action: 'CORRECT',
        commissionerName: name,
        reason,
        trade: snapshot
      });
      if (!result.ok) {
        if (result.status === 401) {
          area.session = null;
          text('#correctionStatus', 'Your commissioner session ended. Sign in again on the Commissioner tab; your edits are still here.');
        } else {
          text('#correctionStatus', result.error);
        }
        return;
      }
      endCorrection(true);
      text('#status', `Trade #${correction.trade.trade_number} corrected (verdict now ${snapshot.verdict}).`);
      if (typeof resetTradeHistory === 'function') resetTradeHistory();
      area.notice = `Trade #${correction.trade.trade_number} corrected.`;
      showTab('commissioner');
    } finally {
      $('#saveCorrection').disabled = false;
    }
  }

  function cancelCorrection() {
    if (!area.correction) return;
    let number = area.correction.trade.trade_number;
    endCorrection(true);
    text('#status', `Correction of trade #${number} cancelled. Nothing was saved.`);
    showTab('commissioner');
  }

  // --------------------------------------------------------------------------
  // Wiring
  // --------------------------------------------------------------------------

  $('#commLoginForm').onsubmit = signIn;
  $('#commSignOut').onclick = () => signOut('Signed out.');
  $('#commAction').onsubmit = confirmAction;
  $('#commActionCancel').onclick = closeAction;
  $('#saveCorrection').onclick = saveCorrection;
  $('#cancelCorrection').onclick = cancelCorrection;
  $('#commPickYear').onchange = () => { area.pickYear = Number($('#commPickYear').value); area.pickNotice = ''; renderPicks(); };
  $('#commPickRound').onchange = () => { area.pickRound = Number($('#commPickRound').value); area.pickNotice = ''; renderPicks(); };
  $('#commDraftComplete').onclick = draftComplete;
  $('#commDraftCancel').onclick = () => { area.confirmDraft = false; area.pickNotice = ''; renderPicks(); };
  paint();

  window.CommissionerArea = Object.freeze({
    // Commissioner tab opened.
    show() {
      paint();
      if (sessionValid()) return loadAll();
      if (area.session) signOut('Your commissioner session ended. Sign in again.');
    },
    // League entered, left, or mode changed: a session only works for its league.
    leagueChanged() {
      let league = entered();
      if (area.session && (!league || league.id !== area.session.leagueId)) signOut('');
      else if (area.correction && !league) endCorrection(false);
      paint();
    },
    isCorrecting: () => !!area.correction,
    // For tests.
    _area: area,
    _tradeFlags: tradeFlags,
    _queueTrades: queueTrades,
    _saveTeam: saveTeam,
    _savePickOwner: savePickOwner,
    _draftComplete: draftComplete,
    _markCurrent: markCurrent
  });
})();
