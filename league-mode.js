/*
 * Madden League Trade Calculator - league mode (Web v2.0)
 *
 * The Practice / League switch, the league bar, the two team pickers, the
 * display-only team names, and the league submission built on top of the
 * frozen trade snapshot (spec V5_WEB_V2.0_SPEC.md sections 3 and 7).
 *
 * DISPLAY ONLY: valuation.js writes "User Team" / "CPU Team" into its text.
 * displayTeams() swaps in the chosen team names on screen. The stored snapshot
 * (buildTradeSnapshot in calculator-ui.js) keeps the engine text unchanged.
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
    message: ''         // last league-entry message (unknown name, errors)
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

  function teamOptionLabel(team) {
    let control = team.controlled_by === 'HUMAN' ? 'Human' : 'CPU';
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

  // The v2.0 submission: the frozen snapshot, unchanged, plus the league fields.
  function buildSubmission(snapshot, name, note) {
    if (!snapshot || !teamsReady()) return null;
    let who = checkSubmitter(name, note);
    if (!who.ok) return null;
    return Object.assign({}, snapshot, {
      mode: 'LEAGUE',
      league_name: league.entered.name,
      submitting_team_id: league.teamA,
      other_team_id: league.teamB,
      submitter_name: who.name,
      submitter_note: who.note
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

      league.entered = { id: found.league.id, name: found.league.name };
      league.teams = teams.teams;
      league.teamA = '';
      league.teamB = '';
      storageSet(STORE_LEAGUE, found.league.name);
      fillTeamPickers();
    } catch (error) {
      console.error('League entry failed:', error);
      league.message = 'League data is unavailable right now.';
    } finally {
      league.busy = false;
      refresh();
    }
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
    if (input) input.focus();
  }

  function setMode(mode) {
    league.mode = mode === 'LEAGUE' ? 'LEAGUE' : 'PRACTICE';
    storageSet(STORE_MODE, league.mode);
    refresh();
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
      if (select) select.onchange = () => { league[key] = select.value; refresh(); };
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
    rememberedSubmitter: () => storageGet(STORE_SUBMITTER) || '',
    rememberSubmitter: name => storageSet(STORE_SUBMITTER, name)
  });
})();
