/*
 * Madden League Trade Calculator - league mode (Web v2.0; picks Web v3.0)
 *
 * The Practice / League switch, the league bar, the two team pickers, the
 * display-only team names, and the league submission built on top of the
 * frozen trade snapshot (spec V5_WEB_V2.0_SPEC.md sections 3 and 7).
 *
 * DISPLAY ONLY: valuation.js writes "User Team" / "CPU Team" into its text.
 * displayTeams() swaps in the chosen team names on screen. The stored snapshot
 * (buildTradeSnapshot in calculator-ui.js) keeps the engine text unchanged.
 *
 * Web v3.0 draft picks: when the entered league tracks picks
 * (currentDraftYear), every Draft Pick in a League trade names the pick being
 * traded (asset.pick_id), chosen from the giving team's picks of that round
 * and year. One matching pick is chosen automatically.
 *
 * Web v4.0 trade posture FYI: each team's record (from the league's current
 * export, editable) and the week give a label (Win-now / Bubble / Rebuilding)
 * and a strength, plus warnings for a human team selling while winning or
 * buying while rebuilding. Information only: it never changes a value or the
 * verdict. The posture shown is sent with the submission.
 *
 * Loaded after valuation.js and before calculator-ui.js. Event wiring runs
 * from LeagueMode.init(), which calculator-ui.js calls before its first
 * render(); every DOM handler here calls the global render() at event time.
 */

(function () {
  'use strict';

  const STORE_MODE = 'maddenTrade.mode';
  const STORE_LEAGUE = 'maddenTrade.leagueName';
  const STORE_SUBMITTER = 'maddenTrade.submitterName';

  const NAME_MAX = 60;
  const NOTE_MAX = 500;

  const league = {
    mode: 'PRACTICE',   // 'PRACTICE' | 'LEAGUE'
    entered: null,      // { id, name } once a league is entered
    teams: [],          // rows from league_team_list
    teamA: '',          // "Your team" (side A, user_team_*)
    teamB: '',          // "Other team" (side B, cpu_team_*)
    busy: false,
    message: '',        // last league-entry message (unknown name, errors)
    picks: {            // Web v3.0: the two chosen teams' picks
      key: '',          // teams (and correction trade) the rows are for
      loading: false,
      error: '',
      rows: []          // rows from league_pick_choices
    },
    correctionTradeId: null, // set by commissioner.js while correcting
    posture: {          // Web v4.0: records behind the posture FYI
      leagueId: '',
      loaded: false,
      loading: false,
      error: '',
      rows: [],         // rows from league_posture_inputs
      edits: { A: null, B: null },  // { wins, losses, ties } typed by the member
      week: null        // week typed by the member (null = the export's)
    }
  };

  // --------------------------------------------------------------------------
  // Pure helpers (tested in Node: tests/web-v2.0-league-mode.test.js)
  // --------------------------------------------------------------------------

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try {
      if (value === null || value === '') window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch { /* storage unavailable: nothing is remembered */ }
  }

  function teamFullName(team) {
    if (!team) return '';
    return [team.city_name, team.nickname].filter(Boolean).join(' ') || team.abbreviation || 'Team';
  }

  // league_teams.controlled_by is 'USER' (human) or 'CPU'.
  function teamOptionLabel(team) {
    let control = team.controlled_by === 'USER' ? 'Human' : 'CPU';
    return `${teamFullName(team)} (${team.abbreviation}) · ${control}`;
  }

  function findTeam(id) {
    return league.teams.find(t => t.team_id === id) || null;
  }

  // League mode with a league entered and two different teams chosen.
  function teamsReady() {
    return league.mode === 'LEAGUE' &&
      !!league.entered &&
      !!findTeam(league.teamA) &&
      !!findTeam(league.teamB) &&
      league.teamA !== league.teamB;
  }

  // Swap the engine's side names for the chosen teams. One pass, so a team
  // name that happens to contain "CPU Team" is never replaced twice.
  // escapeFn is applied to team names only (engine text is trusted).
  function displayTeams(text, escapeFn) {
    let s = String(text ?? '');
    if (!teamsReady()) return s;
    let names = {
      'User Team': teamFullName(findTeam(league.teamA)),
      'CPU Team': teamFullName(findTeam(league.teamB))
    };
    let esc = typeof escapeFn === 'function' ? escapeFn : (x => x);
    return s.replace(/User Team|CPU Team/g, m => esc(names[m]));
  }

  function sideHeading(side) {
    if (!teamsReady()) return side === 'A' ? 'USER TEAM RECEIVES' : 'CPU TEAM RECEIVES';
    let team = findTeam(side === 'A' ? league.teamA : league.teamB);
    return `${teamFullName(team).toUpperCase()} RECEIVES`;
  }

  function scoreLabel(side) {
    if (!teamsReady()) return side === 'A' ? 'USER TEAM ADJUSTED' : 'CPU TEAM ADJUSTED';
    let team = findTeam(side === 'A' ? league.teamA : league.teamB);
    return `${team.abbreviation} ADJUSTED`;
  }

  // --------------------------------------------------------------------------
  // Draft picks (Web v3.0)
  // --------------------------------------------------------------------------

  // '1.05' / 'Future Mid 1st' -> 1, 'Early 2nd' -> 2, 'Late 3rd' -> 3, '4th'..'7th'.
  // Same rule as the database's pick_round().
  function pickRound(label) {
    let s = String(label ?? '');
    if (/^1\.\d{2}$/.test(s) || /1st/i.test(s)) return 1;
    if (/2nd/i.test(s)) return 2;
    if (/3rd/i.test(s)) return 3;
    let m = /^([4-7])th$/.exec(s);
    return m ? Number(m[1]) : null;
  }

  function pickYearOffset(timing) {
    return { 'Current draft': 0, 'Next year': 1, 'Two years away': 2 }[timing] ?? null;
  }

  function ordinal(round) {
    return { 1: '1st', 2: '2nd', 3: '3rd' }[round] || `${round}th`;
  }

  // League mode, a league that tracks picks, and two teams chosen.
  function pickTracking() {
    return teamsReady() && typeof league.entered.currentDraftYear === 'number';
  }

  // Side A lists what your team receives, so the other team gives it.
  function givingTeam(side) {
    return side === 'A' ? league.teamB : league.teamA;
  }

  function pickYear(asset) {
    let offset = pickYearOffset(asset.timing);
    return offset === null || !league.entered ? null : league.entered.currentDraftYear + offset;
  }

  // The giving team's picks matching the asset's round and year.
  function pickChoices(side, asset) {
    if (!pickTracking() || !asset || asset.type !== 'Draft Pick') return [];
    let round = pickRound(asset.pick);
    let year = pickYear(asset);
    let giving = givingTeam(side);
    return league.picks.rows.filter(r =>
      r.owner_team_id === giving && r.round === round && r.draft_year === year);
  }

  // '2029 2nd · own' or '2029 2nd · via DAL'
  function pickOptionLabel(row, side) {
    let own = row.original_team_id === givingTeam(side);
    return `${row.draft_year} ${ordinal(row.round)} · ${own ? 'own' : `via ${row.original_abbreviation}`}`;
  }

  // What the "Whose pick" field shows for an asset.
  // { tracking, loading, choices: [{ value, label }], selected, empty }
  function pickField(side, asset) {
    if (!pickTracking() || !asset || asset.type !== 'Draft Pick') return { tracking: false };
    let choices = pickChoices(side, asset).map(r => ({ value: r.pick_id, label: pickOptionLabel(r, side) }));
    let giving = findTeam(givingTeam(side));
    let year = pickYear(asset);
    let round = pickRound(asset.pick);
    return {
      tracking: true,
      loading: league.picks.loading,
      choices,
      selected: choices.some(c => c.value === asset.pick_id) ? asset.pick_id : '',
      empty: `None: ${giving ? giving.abbreviation : 'the team'} doesn't own a ${year ?? ''} ${round ? ordinal(round) : ''} pick`.replace(/\s+/g, ' ')
    };
  }

  // Keeps every Draft Pick's pick_id valid: kept when it's still a choice,
  // chosen when exactly one pick fits (and no other asset in the trade has it),
  // blank otherwise. Outside pick tracking pick_id is blank.
  function resolvePicks(sides) {
    let all = ['A', 'B'].flatMap(side => ((sides && sides[side]) || []).map(asset => ({ side, asset })));
    for (let { side, asset } of all) {
      if (asset.type !== 'Draft Pick' || !pickTracking()) { asset.pick_id = ''; continue; }
      if (league.picks.loading) continue;
      let choices = pickChoices(side, asset);
      if (choices.some(c => c.pick_id === asset.pick_id)) continue;
      let taken = new Set(all.filter(x => x.asset !== asset && x.asset.pick_id).map(x => x.asset.pick_id));
      let free = choices.filter(c => !taken.has(c.pick_id));
      asset.pick_id = free.length === 1 && choices.length === 1 ? free[0].pick_id : '';
    }
  }

  // { ok, error }: every Draft Pick names a pick, and no pick is used twice.
  function picksReady(sides) {
    if (!pickTracking()) return { ok: true, error: '' };
    if (league.picks.loading) return { ok: false, error: 'Loading draft picks...' };
    if (league.picks.error) return { ok: false, error: league.picks.error };
    let seen = new Set();
    for (let side of ['A', 'B']) {
      for (let asset of (sides && sides[side]) || []) {
        if (asset.type !== 'Draft Pick') continue;
        if (!asset.pick_id) {
          // The giving team owns no pick in that round and year: say so,
          // rather than asking for a choice the list can't offer.
          if (!pickChoices(side, asset).length) {
            let giving = findTeam(givingTeam(side));
            let year = pickYear(asset);
            let round = pickRound(asset.pick);
            return { ok: false, error: `${giving ? giving.abbreviation : 'That team'} doesn't own a ${year ?? ''} ${round ? ordinal(round) : ''} pick, so it can't trade one. If that's wrong, the commissioner can fix it under Draft picks.`.replace(/\s+/g, ' ') };
          }
          return { ok: false, error: `Choose whose pick ${asset.pick} (${asset.timing}) is.` };
        }
        if (seen.has(asset.pick_id)) return { ok: false, error: 'The same pick is in the trade twice.' };
        seen.add(asset.pick_id);
      }
    }
    return { ok: true, error: '' };
  }

  // Loads the two teams' picks (again when force is set, e.g. after a submit).
  async function loadPicks(force) {
    if (!pickTracking()) {
      league.picks = { key: '', loading: false, error: '', rows: [] };
      return;
    }
    let key = `${league.entered.id}|${league.teamA}|${league.teamB}|${league.correctionTradeId || ''}`;
    if (!force && league.picks.key === key) return;
    league.picks = { key, loading: true, error: '', rows: [] };
    refresh();
    let result = await window.MaddenStorage.leaguePickChoices(
      league.entered.name, league.teamA, league.teamB, league.correctionTradeId);
    if (league.picks.key !== key) return;  // teams changed while loading
    league.picks = {
      key,
      loading: false,
      error: result.ok ? '' : (result.error || 'Draft picks could not be loaded.'),
      rows: result.ok ? result.picks : []
    };
    refresh();
  }

  // commissioner.js: correcting a trade lists the picks that trade moved.
  function setCorrectionTrade(tradeId) {
    league.correctionTradeId = tradeId || null;
    return loadPicks(true);
  }

  // --------------------------------------------------------------------------
  // Trade posture FYI (Web v4.0). The Ruleset v5.0 roadmap rules for timing:
  // no effect weeks 1-3, a squared ramp to full at week 9; preseason fades
  // last season's record to zero by week 3; other stages count fully.
  // Labels: Win-now at .600+, Rebuilding at .400 or below, else Bubble.
  // Record strength: full at .250 from .500 (e.g. 6-2 or 2-6).
  // --------------------------------------------------------------------------

  const POSTURE_LABELS = { WIN_NOW: 'Win-now', BUBBLE: 'Bubble', REBUILDING: 'Rebuilding' };

  function postureWeight(week, stageIndex) {
    let w = Number(week);
    if (!Number.isFinite(w)) return 0;
    if (stageIndex === 1) {
      if (w <= 3) return 0;
      if (w >= 9) return 1;
      return Math.pow((w - 3) / 6, 2);
    }
    if (stageIndex === 0) return w >= 3 ? 0 : Math.pow((3 - Math.max(0, w)) / 3, 2);
    return 1;
  }

  // { wins, losses, ties, games, pct, label, recordStrength, weight, strength }
  function postureOf(record, week, stageIndex) {
    let wins = Math.max(0, Number(record && record.wins) || 0);
    let losses = Math.max(0, Number(record && record.losses) || 0);
    let ties = Math.max(0, Number(record && record.ties) || 0);
    let games = wins + losses + ties;
    let pct = games ? (wins + ties / 2) / games : 0.5;
    let label = !games ? 'BUBBLE' : pct >= 0.6 ? 'WIN_NOW' : pct <= 0.4 ? 'REBUILDING' : 'BUBBLE';
    let recordStrength = Math.min(1, Math.abs(pct - 0.5) / 0.25);
    let weight = postureWeight(week, stageIndex);
    return { wins, losses, ties, games, pct, label, recordStrength, weight, strength: recordStrength * weight };
  }

  function postureWord(p) {
    if (p.weight === 0) return 'too early';
    if (p.strength < 0.15) return 'slight';
    if (p.strength < 0.5) return 'moderate';
    return 'strong';
  }

  function postureReady() {
    return teamsReady() && !league.posture.loading && league.posture.leagueId === league.entered.id && league.posture.rows.length > 0;
  }

  function postureAsOf() {
    let row = league.posture.rows[0] || {};
    return {
      season: row.season ?? null,
      stage_index: row.stage_index ?? null,
      week: league.posture.week ?? row.week ?? null,
      export_week: row.week ?? null,
      received_at: row.received_at ?? null,
      from_current: row.is_current === true
    };
  }

  function postureRecord(side) {
    let teamId = side === 'A' ? league.teamA : league.teamB;
    let row = league.posture.rows.find(r => r.team_id === teamId);
    let base = row ? { wins: row.wins ?? 0, losses: row.losses ?? 0, ties: row.ties ?? 0 } : { wins: 0, losses: 0, ties: 0 };
    let edit = league.posture.edits[side];
    return { record: edit || base, edited: !!edit, base };
  }

  function postureFor(side) {
    let asOf = postureAsOf();
    let { record, edited } = postureRecord(side);
    return Object.assign(postureOf(record, asOf.week, asOf.stage_index), { edited });
  }

  // Warnings for human teams whose trade cuts against their situation.
  // sides = { A: [assets with value], B: [...] }; A lists what team A receives.
  function postureWarnings(sides) {
    let warnings = [];
    for (let side of ['A', 'B']) {
      let team = findTeam(side === 'A' ? league.teamA : league.teamB);
      if (!team || team.controlled_by !== 'USER') continue;
      let p = postureFor(side);
      if (p.label === 'BUBBLE' || p.strength < 0.15) continue;
      let received = (sides && sides[side]) || [];
      let given = (sides && sides[side === 'A' ? 'B' : 'A']) || [];
      let sum = (list, test) => list.filter(test).reduce((s, a) => s + (Number(a.value) || 0), 0);
      let isPlayer = a => a.type !== 'Draft Pick';
      let isPick = a => a.type === 'Draft Pick';
      if (p.label === 'WIN_NOW') {
        let playerOut = sum(given, isPlayer), playerIn = sum(received, isPlayer), pickIn = sum(received, isPick);
        if (playerOut > playerIn && pickIn > 0) {
          warnings.push({ side, team: team.abbreviation, code: 'SELLING_WHILE_WINNING',
            text: `${team.abbreviation} is Win-now but is giving up players for draft picks.` });
        }
      } else {
        let total = sum(received, () => true);
        let vetIn = sum(received, a => isPlayer(a) && Number(a.age) >= 29);
        let futureOut = sum(given, a => isPick(a) || (isPlayer(a) && Number(a.age) > 0 && Number(a.age) <= 25));
        if (vetIn > 0 && vetIn >= total / 2 && futureOut > 0) {
          warnings.push({ side, team: team.abbreviation, code: 'BUYING_WHILE_REBUILDING',
            text: `${team.abbreviation} is Rebuilding but is trading picks or young players for veterans.` });
        }
      }
    }
    return warnings;
  }

  // What's sent with a submission (null when the FYI isn't available).
  function postureSnapshot(sides) {
    if (!postureReady()) return null;
    let round = x => Math.round(x * 1000) / 1000;
    let asOf = postureAsOf();
    return {
      version: 1,
      as_of: { season: asOf.season, stage_index: asOf.stage_index, week: asOf.week, export_week: asOf.export_week,
               received_at: asOf.received_at, from_current_export: asOf.from_current },
      teams: ['A', 'B'].map(side => {
        let p = postureFor(side);
        let team = findTeam(side === 'A' ? league.teamA : league.teamB);
        return { side, team: team ? team.abbreviation : '', control: team ? team.controlled_by : '',
                 wins: p.wins, losses: p.losses, ties: p.ties, label: p.label,
                 strength: round(p.strength), weight: round(p.weight), edited: p.edited };
      }),
      warnings: postureWarnings(sides).map(w => ({ team: w.team, code: w.code }))
    };
  }

  async function loadPosture() {
    if (!teamsReady() || !window.MaddenStorage?.leaguePostureInputs) return;
    if (league.posture.leagueId === league.entered.id && (league.posture.loaded || league.posture.loading)) return;
    let entered = league.entered;
    league.posture = { leagueId: entered.id, loaded: false, loading: true, error: '', rows: [], edits: { A: null, B: null }, week: null };
    let result = await window.MaddenStorage.leaguePostureInputs(entered.name);
    if (league.entered !== entered) return;
    league.posture.loading = false;
    league.posture.loaded = true;
    league.posture.rows = result.ok ? result.rows : [];
    league.posture.error = result.ok ? '' : (result.error || 'Team records could not be loaded.');
    refresh();
  }

  function setPostureRecord(side, field, value) {
    let current = Object.assign({}, postureRecord(side).record);
    let n = Math.max(0, Math.min(25, Math.floor(Number(value) || 0)));
    current[field] = n;
    let base = postureRecord(side).base;
    league.posture.edits[side] = (current.wins === base.wins && current.losses === base.losses && current.ties === base.ties) ? null : current;
  }

  function setPostureWeek(value) {
    let n = Math.floor(Number(value));
    league.posture.week = Number.isFinite(n) && n >= 0 && n <= 30 && n !== postureAsOf().export_week ? n : null;
  }

  function escHtml(v) {
    return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Draws the FYI panel (#posturePanel). sides: assets with value.
  function paintPosture(sides) {
    let panel = q('#posturePanel');
    if (!panel) return;
    let show = league.mode === 'LEAGUE' && teamsReady();
    panel.hidden = !show;
    if (!show) return;
    if (league.posture.leagueId !== league.entered.id || (!league.posture.loaded && !league.posture.loading)) {
      loadPosture();
    }
    if (league.posture.loading) { panel.innerHTML = '<div class="posture-head"><b>League context (FYI)</b></div><p class="posture-note">Loading team records...</p>'; return; }
    if (!postureReady()) {
      panel.innerHTML = `<div class="posture-head"><b>League context (FYI)</b></div><p class="posture-note">${escHtml(league.posture.error || 'No team records yet. They come from the league\'s Snallabot exports.')}</p>`;
      return;
    }
    let asOf = postureAsOf();
    let rows = ['A', 'B'].map(side => {
      let p = postureFor(side);
      let team = findTeam(side === 'A' ? league.teamA : league.teamB);
      let num = (k, v) => `<input type="number" min="0" max="25" inputmode="numeric" data-posture-side="${side}" data-posture-k="${k}" value="${v}" aria-label="${escHtml(team.abbreviation)} ${k}">`;
      return `
        <div class="posture-team posture-${p.label.toLowerCase()}">
          <span class="posture-abbr">${escHtml(team.abbreviation)}</span>
          <span class="posture-label">${POSTURE_LABELS[p.label]} · ${postureWord(p)}</span>
          <span class="posture-record">${num('wins', p.wins)}<i>-</i>${num('losses', p.losses)}<i>-</i>${num('ties', p.ties)}${p.edited ? ' <em>edited</em>' : ''}</span>
        </div>`;
    }).join('');
    let warnings = postureWarnings(sides);
    let source = asOf.season ? `${asOf.season} season, ${asOf.stage_index === 1 ? 'week' : `stage ${asOf.stage_index}, week`}` : 'Week';
    panel.innerHTML = `
      <div class="posture-head"><b>League context (FYI)</b>
        <label class="posture-week">${escHtml(source)} <input type="number" min="0" max="30" data-posture-week value="${asOf.week ?? ''}" aria-label="Week"></label>
      </div>
      ${rows}
      ${warnings.map(w => `<div class="posture-warning">⚠ ${escHtml(w.text)}</div>`).join('')}
      <p class="posture-note">Information only. It doesn't change any value or the verdict. Records are from the ${asOf.from_current ? 'current' : 'newest'} export; correct them if it's behind.</p>`;
    for (let input of panel.querySelectorAll ? panel.querySelectorAll('[data-posture-side]') : []) {
      input.onchange = () => { setPostureRecord(input.dataset.postureSide, input.dataset.postureK, input.value); refresh(); };
    }
    let week = panel.querySelector ? panel.querySelector('[data-posture-week]') : null;
    if (week && week.dataset !== undefined) week.onchange = () => { setPostureWeek(week.value); refresh(); };
  }

  function checkSubmitter(name, note) {
    let n = String(name ?? '').trim();
    let t = String(note ?? '').trim();
    if (n.length < 1 || n.length > NAME_MAX) {
      return { ok: false, error: `Your name must be 1 to ${NAME_MAX} characters.` };
    }
    if (t.length > NOTE_MAX) {
      return { ok: false, error: `The note must be ${NOTE_MAX} characters or fewer.` };
    }
    return { ok: true, name: n, note: t.length ? t : null };
  }

  // The v2.0 submission: the frozen snapshot, unchanged, plus the league
  // fields; v4.0 adds the posture FYI shown (sides: assets with value).
  function buildSubmission(snapshot, name, note, sides) {
    if (!snapshot || !teamsReady()) return null;
    let who = checkSubmitter(name, note);
    if (!who.ok) return null;
    return Object.assign({}, snapshot, {
      mode: 'LEAGUE',
      league_name: league.entered.name,
      submitting_team_id: league.teamA,
      other_team_id: league.teamB,
      submitter_name: who.name,
      submitter_note: who.note,
      posture: postureSnapshot(sides)
    });
  }

  // Duplicate guard: the same trade between the same two teams.
  function submissionKey(snapshotKey) {
    if (snapshotKey === null) return null;
    return `${snapshotKey}|${league.entered ? league.entered.id : ''}|${league.teamA}|${league.teamB}`;
  }

  // --------------------------------------------------------------------------
  // DOM wiring
  // --------------------------------------------------------------------------

  const q = s => document.querySelector(s);

  function barStatus() {
    if (league.mode !== 'LEAGUE') return 'Practice mode: try trades freely. Nothing is logged.';
    if (league.busy) return 'Looking up the league...';
    if (!league.entered) return league.message || 'Type your league name to enter it.';
    if (league.teamA && league.teamA === league.teamB) return 'Choose two different teams.';
    if (!teamsReady()) return 'Choose your team and the other team.';
    return '';
  }

  function fillTeamPickers() {
    for (let [id, value, placeholder] of [
      ['#teamA', league.teamA, 'Choose your team'],
      ['#teamB', league.teamB, 'Choose the other team']
    ]) {
      let select = q(id);
      if (!select) continue;
      let options = [`<option value="">${placeholder}</option>`].concat(
        league.teams.map(t => {
          let label = teamOptionLabel(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
          return `<option value="${t.team_id}"${t.team_id === value ? ' selected' : ''}>${label}</option>`;
        })
      );
      select.innerHTML = options.join('');
    }
  }

  // Shows the right parts of the bar and pickers for the current state.
  function paint() {
    let isLeague = league.mode === 'LEAGUE';

    for (let button of document.querySelectorAll('.mode-option')) {
      let active = button.dataset.mode === league.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    let entry = q('#leagueEntry');
    let current = q('#leagueCurrent');
    if (entry) entry.hidden = !isLeague || !!league.entered;
    if (current) current.hidden = !isLeague || !league.entered;

    let name = q('#leagueName');
    if (name && league.entered) name.textContent = league.entered.name;

    for (let picker of document.querySelectorAll('.team-pick')) {
      picker.hidden = !isLeague || !league.entered;
    }

    let enter = q('#leagueEnter');
    if (enter) enter.disabled = league.busy;

    let status = q('#leagueStatus');
    if (status) status.textContent = barStatus();
  }

  function refresh() {
    paint();
    if (typeof render === 'function') render();
  }

  // Trade History and the Commissioner area follow the entered league.
  function historyChanged() {
    if (typeof resetTradeHistory === 'function') resetTradeHistory();
    if (window.CommissionerArea) window.CommissionerArea.leagueChanged();
  }

  async function enterLeague(rawName, quiet) {
    let name = String(rawName ?? '').trim();
    league.message = '';

    if (!name) {
      refresh();
      return;
    }

    if (!window.MaddenStorage?.isConfigured) {
      league.message = 'League data is unavailable right now.';
      refresh();
      return;
    }

    league.busy = true;
    paint();

    try {
      let found = await window.MaddenStorage.leagueLookup(name);

      if (!found.ok) {
        league.message = found.error || 'League data is unavailable right now.';
        return;
      }

      if (!found.league) {
        if (quiet) storageSet(STORE_LEAGUE, null);
        league.message = 'No league with that name.';
        return;
      }

      let teams = await window.MaddenStorage.leagueTeams(found.league.name);

      if (!teams.ok) {
        league.message = teams.error || 'The team list could not be loaded.';
        return;
      }

      league.entered = {
        id: found.league.id,
        name: found.league.name,
        currentDraftYear: typeof found.league.currentDraftYear === 'number' ? found.league.currentDraftYear : null
      };
      league.teams = teams.teams;
      league.teamA = '';
      league.teamB = '';
      storageSet(STORE_LEAGUE, found.league.name);
      fillTeamPickers();
      historyChanged();
    } catch (error) {
      console.error('League entry failed:', error);
      league.message = 'League data is unavailable right now.';
    } finally {
      league.busy = false;
      refresh();
    }
  }

  // Re-reads the entered league's teams (after a commissioner edit), keeping
  // the chosen teams.
  async function reloadTeams() {
    if (!league.entered || !window.MaddenStorage?.isConfigured) return;
    let entered = league.entered;
    let teams = await window.MaddenStorage.leagueTeams(entered.name);
    if (!teams.ok || league.entered !== entered) return;
    league.teams = teams.teams;
    if (!findTeam(league.teamA)) league.teamA = '';
    if (!findTeam(league.teamB)) league.teamB = '';
    fillTeamPickers();
    refresh();
    loadPicks();
  }

  function leaveLeague() {
    league.entered = null;
    league.message = '';
    league.teams = [];
    league.teamA = '';
    league.teamB = '';
    storageSet(STORE_LEAGUE, null);
    fillTeamPickers();
    let input = q('#leagueInput');
    if (input) input.value = '';
    refresh();
    historyChanged();
    if (input) input.focus();
  }

  function setMode(mode) {
    league.mode = mode === 'LEAGUE' ? 'LEAGUE' : 'PRACTICE';
    storageSet(STORE_MODE, league.mode);
    refresh();
    historyChanged();
    if (league.mode === 'LEAGUE' && !league.entered) q('#leagueInput')?.focus();
  }

  function init() {
    for (let button of document.querySelectorAll('.mode-option')) {
      button.onclick = () => setMode(button.dataset.mode);
    }

    let form = q('#leagueEntry');
    if (form) {
      form.onsubmit = event => {
        event.preventDefault();
        return enterLeague(q('#leagueInput')?.value, false);
      };
    }

    let leave = q('#leagueLeave');
    if (leave) leave.onclick = leaveLeague;

    for (let [id, key] of [['#teamA', 'teamA'], ['#teamB', 'teamB']]) {
      let select = q(id);
      if (select) select.onchange = () => {
        league[key] = select.value;
        league.posture.edits = { A: null, B: null };
        refresh();
        loadPicks();
        loadPosture();
      };
    }

    // Practice is the default; a returning member comes back to their league.
    league.mode = storageGet(STORE_MODE) === 'LEAGUE' ? 'LEAGUE' : 'PRACTICE';
    paint();

    let remembered = storageGet(STORE_LEAGUE);
    if (league.mode === 'LEAGUE' && remembered) {
      let input = q('#leagueInput');
      if (input) input.value = remembered;
      enterLeague(remembered, true);
    }
  }

  window.LeagueMode = Object.freeze({
    state: league,
    NAME_MAX,
    NOTE_MAX,
    init,
    isLeague: () => league.mode === 'LEAGUE',
    reloadTeams,
    teamsReady,
    findTeam,
    teamFullName,
    teamOptionLabel,
    displayTeams,
    sideHeading,
    scoreLabel,
    checkSubmitter,
    buildSubmission,
    submissionKey,
    pickRound,
    pickYearOffset,
    pickTracking,
    pickChoices,
    pickField,
    resolvePicks,
    picksReady,
    loadPicks,
    reloadPicks: () => loadPicks(true),
    postureOf,
    postureWeight,
    postureFor,
    postureWarnings,
    postureSnapshot,
    paintPosture,
    loadPosture,
    setPostureRecord,
    setPostureWeek,
    setCorrectionTrade,
    rememberedSubmitter: () => storageGet(STORE_SUBMITTER) || '',
    rememberSubmitter: name => storageSet(STORE_SUBMITTER, name)
  });
})();
