// Web v2.0 / v2.1 / v3.0 league mode in the browser scripts: snapshot contract, display-only
// team names, practice mode, league entry and submission.
// Run from the repo root: node tests/web-league-mode.test.js
// Also covers league Trade History (trade-history.js, step 4) and the
// Commissioner area with correction mode (commissioner.js, step 5).
//
// Loads valuation.js, league-mode.js and calculator-ui.js unchanged into a vm
// with a small fake DOM, and compares every parity scenario's snapshot with
// the v1.5.0 calculator-ui.js from the ruleset-v4.4-baseline tag.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail); }
}

// ---------------------------------------------------------------------------
// Fake DOM: every selector gets one element; elements make children on demand.
// ---------------------------------------------------------------------------
function fakeElement(selector) {
  const children = new Map();
  const classes = new Set();
  return {
    selector,
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: ['#acceptConfirm', '#history', '#commAction', '#correctionBar'].includes(selector),
    disabled: false,
    className: '',
    dataset: {},
    attributes: {},
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : on; v ? classes.add(c) : classes.delete(c); return v; },
      contains: c => classes.has(c),
    },
    setAttribute(k, v) { this.attributes[k] = v; },
    focus() {},
    click() {},
    scrollIntoView() {},
    querySelector(s) { if (!children.has(s)) children.set(s, fakeElement(s)); return children.get(s); },
    closest() { return null; },
  };
}

function makeWindow({ storage, localStore = new Map() } = {}) {
  const elements = new Map();
  const buttons = new Map();
  const document = {
    elements,
    querySelector(s) { if (!elements.has(s)) elements.set(s, fakeElement(s)); return elements.get(s); },
    querySelectorAll(sel) {
      if (sel === '#commTeams [data-team]') {
        const html = (elements.get('#commTeams') || { innerHTML: '' }).innerHTML;
        return [...html.matchAll(/<(select|input)[^>]*id="(teamCtl|teamLabel)-([^"]+)"[^>]*data-team="([^"]+)"/g)].map(m => {
          const el = document.querySelector('#' + m[2] + '-' + m[3]);
          el.tagName = m[1].toUpperCase();
          el.dataset = { team: m[4] };
          const v = m[0].match(/value="([^"]*)"/);
          if (m[1] === 'input' && v && el.value === '') el.value = v[1];
          return el;
        });
      }
      if (sel !== '#commissioner [data-action]') return [];
      const html = ['#commQueue', '#commAll'].map(id => (elements.get(id) || { innerHTML: '' }).innerHTML).join('');
      return [...html.matchAll(/data-action="([A-Z]+)" data-trade-id="([^"]+)"/g)].map(m => {
        const key = m[1] + '|' + m[2];
        if (!buttons.has(key)) {
          const button = fakeElement('button');
          button.dataset = { action: m[1], tradeId: m[2] };
          buttons.set(key, button);
        }
        return buttons.get(key);
      });
    },
  };
  const localStorage = {
    getItem: k => (localStore.has(k) ? localStore.get(k) : null),
    setItem: (k, v) => localStore.set(k, String(v)),
    removeItem: k => localStore.delete(k),
  };
  const ctx = { document, console, requestAnimationFrame: () => {}, localStorage, loadTradeHistory: async () => {}, historyLoaded: false, applyTheme: () => {} };
  ctx.window = ctx;
  ctx.MaddenStorage = storage || { isConfigured: true };
  vm.createContext(ctx);
  return { ctx, document, localStore };
}

function load(win, files) {
  for (const [name, src] of files) vm.runInContext(src, win.ctx, { filename: name });
}

const valuationSrc = read('valuation.js');
const leagueSrc = read('league-mode.js');
const uiSrc = read('calculator-ui.js');
const historySrc = read('trade-history.js');
const commSrc = read('commissioner.js');
const baselineUiSrc = execFileSync('git', ['show', 'ruleset-v4.4-baseline:calculator-ui.js'], { cwd: root, encoding: 'utf8' });

const PAGE = [['valuation.js', valuationSrc], ['league-mode.js', leagueSrc], ['calculator-ui.js', uiSrc], ['trade-history.js', historySrc], ['commissioner.js', commSrc]];
const current = () => { const w = makeWindow(); load(w, PAGE); return w; };
const baseline = () => { const w = makeWindow(); load(w, [['valuation.js', valuationSrc], ['calculator-ui.js', baselineUiSrc]]); return w; };
const run = (w, code) => vm.runInContext(code, w.ctx);

// Scenario assets in the calculator's own shape.
function toAsset(a, id) {
  if (a.t === 'Draft Pick') return { id, type: 'Draft Pick', name: '', pick: a.pick, timing: a.timing || 'Current draft', ovr: '', age: '', pos: 'QB', dev: 'Normal', cap: '', years: '', league: '', current: '', projected: '' };
  return { id, type: 'Player', name: a.name || '', pick: '1.01', timing: 'Current draft', ovr: String(a.ovr ?? ''), age: String(a.age ?? ''), pos: a.pos, dev: a.dev, cap: a.cap === undefined ? '' : String(a.cap), years: a.years === undefined ? '' : String(a.years), league: a.league === undefined ? '' : String(a.league), current: a.current || '', projected: a.projected || '' };
}

function setTrade(w, scenario) {
  let id = 0;
  const A = scenario.A.map(a => toAsset(a, ++id));
  const B = scenario.B.map(a => toAsset(a, ++id));
  w.ctx.__trade = { A, B };
  run(w, 'state = JSON.parse(JSON.stringify(__trade)); render();');
}

const TEAMS = [
  { team_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', abbreviation: 'DAL', city_name: 'Dallas', nickname: 'Cowboys', division: 'NFC East', controlled_by: 'USER' },
  { team_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', abbreviation: 'OMH', city_name: 'Omaha', nickname: '<Steaks> & Co', division: 'AFC West', controlled_by: 'CPU' },
];
const LEAGUE = { id: '11111111-1111-4111-8111-111111111111', name: 'Sample League' };

function enterLeague(w, a = TEAMS[0].team_id, b = TEAMS[1].team_id) {
  w.ctx.__teams = TEAMS; w.ctx.__league = LEAGUE;
  run(w, `Object.assign(LeagueMode.state, { mode: 'LEAGUE', entered: __league, teams: __teams, teamA: '${a}', teamB: '${b}' }); render();`);
}

const scenarios = JSON.parse(read('tests/parity-scenarios-v4.4.json'));

// ---------------------------------------------------------------------------
// 1. Governed files
// ---------------------------------------------------------------------------
{
  const manifest = read('docs/roadmap/v5/V5_BASELINE_MANIFEST_v4.4.md');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'valuation.js'))).digest('hex');
  check('valuation.js matches the baseline manifest hash', manifest.includes(hash));
}

// ---------------------------------------------------------------------------
// 2. Snapshot contract: v1.5.0 fields unchanged for every parity scenario
// ---------------------------------------------------------------------------
{
  const FIELDS = ['web_release', 'ruleset_version', 'user_team_assets', 'cpu_team_assets', 'user_raw_value', 'cpu_raw_value', 'user_adjusted_value', 'cpu_adjusted_value', 'adjusted_gap', 'verdict', 'evaluation_mode', 'protection_tier', 'required_target', 'fair_maximum', 'trade_intelligence', 'suggested_correction'];
  let same = 0, compared = 0, mismatch = [];

  for (const scenario of scenarios) {
    const now = current(), then = baseline();
    setTrade(now, scenario); setTrade(then, scenario);
    // League mode with teams chosen must not change the stored text.
    enterLeague(now);
    const a = run(now, 'buildTradeSnapshot()');
    const b = run(then, 'buildTradeSnapshot()');
    if (!a || !b) { mismatch.push(scenario.n + ' (incomplete)'); continue; }
    compared++;
    const keysOk = JSON.stringify(Object.keys(a)) === JSON.stringify(FIELDS) && JSON.stringify(Object.keys(b)) === JSON.stringify(FIELDS);
    const { web_release: wa, ...restA } = a;
    const { web_release: wb, ...restB } = b;
    // v3.0 adds pick_id to every asset (null outside pick tracking), last.
    const pickIds = [...restA.user_team_assets, ...restA.cpu_team_assets].map(x => x.pick_id);
    const lastKey = [...restA.user_team_assets, ...restA.cpu_team_assets].every(x => Object.keys(x).at(-1) === 'pick_id');
    const strip = list => list.map(({ pick_id, ...x }) => x);
    restA.user_team_assets = strip(restA.user_team_assets);
    restA.cpu_team_assets = strip(restA.cpu_team_assets);
    if (keysOk && wa === 'v3.0' && wb === 'v1.5.0' && lastKey && pickIds.every(x => x === null) && JSON.stringify(restA) === JSON.stringify(restB)) same++;
    else mismatch.push(scenario.n);
  }

  check(`all ${scenarios.length} parity scenarios produce a snapshot`, compared === scenarios.length, mismatch.join(', '));
  check('v3.0 snapshot = v1.5.0 snapshot apart from web_release and pick_id: null (league without pick tracking)', same === compared && compared > 0, mismatch.join(', '));

  const w = current();
  setTrade(w, scenarios[0]);
  enterLeague(w);
  const snap = run(w, 'buildTradeSnapshot()');
  const stored = JSON.stringify(snap.trade_intelligence) + snap.suggested_correction;
  check('stored text keeps the engine side names', /User Team|CPU Team/.test(stored) && !stored.includes('Cowboys') && !stored.includes('Steaks'));
}

// ---------------------------------------------------------------------------
// 3. Display-only team names
// ---------------------------------------------------------------------------
{
  const w = current();
  const el = s => w.document.querySelector(s);
  setTrade(w, scenarios[0]);
  check('practice: engine names on screen', el('#aheading').textContent === 'USER TEAM RECEIVES' && el('#alabel').textContent === 'USER TEAM ADJUSTED');
  check('practice: reads unchanged', el('#reads').innerHTML.includes('User Team') || el('#reads').innerHTML.includes('CPU Team'));

  enterLeague(w);
  check('league: side headings use team names', el('#aheading').textContent === 'DALLAS COWBOYS RECEIVES' && el('#bheading').textContent === 'OMAHA <STEAKS> & CO RECEIVES');
  check('league: score labels use abbreviations', el('#alabel').textContent === 'DAL ADJUSTED' && el('#blabel').textContent === 'OMH ADJUSTED');
  const reads = el('#reads').innerHTML + el('#primary').innerHTML;
  check('league: reads show team names, not side names', !/User Team|CPU Team/.test(reads) && (reads.includes('Dallas Cowboys') || reads.includes('Omaha')));
  check('league: team names are HTML-escaped in reads', !reads.includes('<Steaks>') && (reads.includes('&lt;Steaks&gt; &amp; Co') || !reads.includes('Omaha')));
  check('league: textContent fields are not escaped', !el('#gap').textContent.includes('&lt;'));

  const LM = run(w, 'LeagueMode');
  check('displayTeams is one pass', (() => {
    w.ctx.__t = [{ ...TEAMS[0], city_name: 'CPU', nickname: 'Team' }, TEAMS[1]];
    run(w, "LeagueMode.state.teams = __t;");
    const out = LM.displayTeams('User Team vs CPU Team');
    run(w, 'LeagueMode.state.teams = __teams;');
    return out === 'CPU Team vs Omaha <Steaks> & Co';
  })());

  enterLeague(w, TEAMS[0].team_id, TEAMS[0].team_id);
  check('same team twice: not ready, engine names shown', !LM.teamsReady() && el('#aheading').textContent === 'USER TEAM RECEIVES');
}

// ---------------------------------------------------------------------------
// 4. Practice mode doesn't log; league submit button state
// ---------------------------------------------------------------------------
{
  const w = current();
  const el = s => w.document.querySelector(s);
  setTrade(w, scenarios[0]);
  check('practice: submit hidden, note shown', el('#acceptTrade').hidden === true && el('#practiceNote').hidden === false);

  run(w, "LeagueMode.state.mode = 'LEAGUE'; render();");
  check('league, no league entered: submit shown but disabled', el('#acceptTrade').hidden === false && el('#acceptTrade').disabled === true && el('#practiceNote').hidden === true);

  enterLeague(w);
  check('league, teams chosen, complete trade: submit enabled', el('#acceptTrade').disabled === false);

  run(w, 'state = {A: [], B: []}; render();');
  check('league, empty trade: submit disabled', el('#acceptTrade').disabled === true);

  run(w, 'openAcceptConfirmation()');
  check('empty trade cannot open the submit form', el('#acceptConfirm').hidden === true);
}

// ---------------------------------------------------------------------------
// 5. Submission and the duplicate guard
// ---------------------------------------------------------------------------
{
  const w = current();
  setTrade(w, scenarios[0]);
  enterLeague(w);
  const LM = run(w, 'LeagueMode');
  const snap = run(w, 'buildTradeSnapshot()');

  const sub = LM.buildSubmission(snap, '  Sam  ', '   ');
  check('submission adds the league fields', sub.mode === 'LEAGUE' && sub.league_name === 'Sample League' && sub.submitting_team_id === TEAMS[0].team_id && sub.other_team_id === TEAMS[1].team_id);
  check('submitter trimmed, blank note null', sub.submitter_name === 'Sam' && sub.submitter_note === null);
  check('submission keeps every snapshot field', Object.keys(snap).every(k => JSON.stringify(sub[k]) === JSON.stringify(snap[k])));
  check('name over 60 refused', LM.buildSubmission(snap, 'x'.repeat(61), '') === null && !LM.checkSubmitter('', '').ok);
  check('note over 500 refused', !LM.checkSubmitter('Sam', 'x'.repeat(501)).ok);

  const key = run(w, 'tradeSnapshotKey(buildTradeSnapshot())');
  const k1 = LM.submissionKey(key);
  run(w, `LeagueMode.state.teamB = '${TEAMS[0].team_id}'; LeagueMode.state.teamA = '${TEAMS[1].team_id}';`);
  check('duplicate key changes with the teams', LM.submissionKey(key) !== k1);
}

// ---------------------------------------------------------------------------
// 6. League entry and submit flow, with a fake storage
// ---------------------------------------------------------------------------
(async () => {
  const calls = [];
  const storage = {
    isConfigured: true,
    leagueLookup: async name => { calls.push(['lookup', name]); return name.toLowerCase().replace(/\s+/g, ' ') === 'sample league' ? { ok: true, league: { ...LEAGUE, maddenVersion: '27' } } : { ok: true, league: null }; },
    leagueTeams: async name => { calls.push(['teams', name]); return { ok: true, teams: TEAMS }; },
    submitLeagueTrade: async s => { calls.push(['submit', s]); return { ok: true, trade: { tradeNumber: 42, leagueName: 'Sample League' } }; },
  };
  const w = makeWindow({ storage });
  load(w, PAGE);
  const el = s => w.document.querySelector(s);
  const LM = run(w, 'LeagueMode');

  check('starts in practice mode', LM.state.mode === 'PRACTICE' && el('#leagueStatus').textContent.startsWith('Practice mode'));

  run(w, "LeagueMode.state.mode = 'LEAGUE';");
  el('#leagueInput').value = 'Nope';
  await el('#leagueEntry').onsubmit({ preventDefault() {} });
  check('unknown league message', el('#leagueStatus').textContent === 'No league with that name.' && !LM.state.entered);

  el('#leagueInput').value = '  sample   LEAGUE ';
  await el('#leagueEntry').onsubmit({ preventDefault() {} });
  check('league entered with its stored name', LM.state.entered && LM.state.entered.name === 'Sample League' && calls.some(c => c[0] === 'teams' && c[1] === 'Sample League'));
  check('league name remembered in this browser', w.localStore.get('maddenTrade.leagueName') === 'Sample League');
  check('team pickers filled and escaped', el('#teamA').innerHTML.includes('Dallas Cowboys (DAL) · Human') && el('#teamB').innerHTML.includes('&lt;Steaks&gt; &amp; Co (OMH) · CPU'));
  check('asks for both teams', el('#leagueStatus').textContent === 'Choose your team and the other team.');

  el('#teamA').value = TEAMS[0].team_id; el('#teamA').onchange();
  el('#teamB').value = TEAMS[1].team_id; el('#teamB').onchange();
  check('ready once both teams are chosen', LM.teamsReady() && el('#leagueStatus').textContent === '');

  setTrade(w, scenarios[0]);
  run(w, 'openAcceptConfirmation()');
  check('submit form opens', el('#acceptConfirm').hidden === false);
  const verdict = run(w, 'buildTradeSnapshot().verdict');
  check('non-FAIR warning matches the verdict', verdict === 'FAIR' ? el('#acceptWarning').hidden : el('#acceptWarning').textContent.includes(verdict));

  el('#submitterName').value = '';
  await el('#acceptConfirm').onsubmit({ preventDefault() {} });
  check('empty name refused in the form', el('#acceptConfirmError').textContent.includes('1 to 60') && !calls.some(c => c[0] === 'submit'));

  el('#submitterName').value = 'Sam';
  el('#submitterNote').value = 'Deadline deal';
  await el('#acceptConfirm').onsubmit({ preventDefault() {} });
  const submitted = calls.find(c => c[0] === 'submit');
  check('submitted the v3.0 league submission', submitted && submitted[1].web_release === 'v3.0' && submitted[1].submitter_note === 'Deadline deal' && submitted[1].other_team_id === TEAMS[1].team_id);
  check('confirmation message', el('#status').textContent === 'Logged as trade #42, Unreviewed.');
  check('name remembered, note cleared', w.localStore.get('maddenTrade.submitterName') === 'Sam' && el('#submitterNote').value === '');

  run(w, 'render()');
  check('same trade cannot be submitted twice in a row', el('#acceptTrade').disabled === true);

  el('#leagueLeave').onclick();
  check('leave league clears league and memory', !LM.state.entered && !w.localStore.has('maddenTrade.leagueName') && el('#acceptTrade').disabled === true);

  // A returning member in league mode comes back to their league.
  const store = new Map([['maddenTrade.mode', 'LEAGUE'], ['maddenTrade.leagueName', 'Sample League']]);
  const w2 = makeWindow({ storage, localStore: store });
  load(w2, PAGE);
  await new Promise(r => setTimeout(r, 0));
  const LM2 = vm.runInContext('LeagueMode', w2.ctx);
  check('remembered league re-entered on load', LM2.state.mode === 'LEAGUE' && LM2.state.entered && LM2.state.entered.name === 'Sample League');

  // A remembered league that no longer exists is forgotten.
  const gone = new Map([['maddenTrade.mode', 'LEAGUE'], ['maddenTrade.leagueName', 'Old League']]);
  const w3 = makeWindow({ storage, localStore: gone });
  load(w3, PAGE);
  await new Promise(r => setTimeout(r, 0));
  check('unknown remembered league forgotten', !gone.has('maddenTrade.leagueName'));

  // -------------------------------------------------------------------------
  // 7. League Trade History (step 4)
  // -------------------------------------------------------------------------
  const snapA = run(current(), '(() => { state = JSON.parse(JSON.stringify(__t)); return buildTradeSnapshot(); })'.replace('__t', JSON.stringify((() => { let id = 0; return { A: scenarios[0].A.map(a => toAsset(a, ++id)), B: scenarios[0].B.map(a => toAsset(a, ++id)) }; })())))();
  const row = (o) => Object.assign({ trade_id: o.id, id: o.id, accepted_at: '2026-11-22T12:00:00Z', ruleset_version: 'v4.4', current_revision: 0, submitter_name: null, submitter_note: null, reviewed_at: null, submitting_team: 'Dallas Cowboys', other_team: '<Omaha> & Co' }, snapA, o);
  const historyRows = [
    row({ id: 't-unrev', trade_number: 60, web_release: 'v2.0', review_status: 'UNREVIEWED', is_pre_league: false, submitter_name: 'Sam <b>', submitter_note: 'Deadline deal' }),
    row({ id: 't-corr', trade_number: 59, web_release: 'v2.0', review_status: 'REVIEWED', is_pre_league: false, current_revision: 1, reviewed_at: '2026-11-22T13:00:00Z', verdict: 'FAIR' }),
    row({ id: 't-rev', trade_number: 58, web_release: 'v2.0', review_status: 'REVIEWED', is_pre_league: false }),
    row({ id: 't-pre', trade_number: 12, web_release: 'v1.5.0', review_status: 'UNREVIEWED', is_pre_league: true, submitting_team: null, other_team: null }),
  ];
  const revisions = [
    { revision: 0, created_at: '2026-11-22T12:00:00Z', created_by_role: 'MEMBER', created_by_name: 'Sam', reason: null, verdict: snapA.verdict, snapshot: snapA },
    { revision: 1, created_at: '2026-11-22T13:00:00Z', created_by_role: 'COMMISSIONER', created_by_name: 'Commish', reason: 'Wrong pick entered', verdict: 'FAIR', snapshot: { ...snapA, verdict: 'FAIR' } },
  ];
  const hcalls = [];
  const hstorage = Object.assign({}, storage, {
    leagueHistory: async name => { hcalls.push(['history', name]); return { ok: true, data: historyRows }; },
    leagueTradeRevisions: async (name, id) => { hcalls.push(['revisions', name, id]); return { ok: true, revisions }; },
  });
  const h = makeWindow({ storage: hstorage });
  load(h, PAGE);
  const hel = s => h.document.querySelector(s);
  hel('#history').hidden = true;

  await vm.runInContext('loadTradeHistory()', h.ctx);
  check('history: practice mode asks for a league', hel('#historyState').textContent === 'Enter a league to see its trade history.' && hcalls.length === 0);

  vm.runInContext("LeagueMode.state.mode = 'LEAGUE';", h.ctx);
  hel('#leagueInput').value = 'Sample League';
  await hel('#leagueEntry').onsubmit({ preventDefault() {} });
  await vm.runInContext('loadTradeHistory()', h.ctx);
  const list = hel('#historyList').innerHTML;
  check('history: reads the entered league by name', hcalls[0] && hcalls[0][1] === 'Sample League');
  check('history: four badges', ['unreviewed">Unreviewed', 'corrected">Corrected', 'reviewed">Reviewed', 'pre-league">Pre-league'].every(b => list.includes(b)));
  check('history: team headings, escaped', list.includes('DALLAS COWBOYS RECEIVES') && list.includes('&lt;OMAHA&gt; &amp; CO RECEIVES') && !list.includes('<OMAHA>'));
  check('history: pre-league keeps side names', list.includes('USER TEAM RECEIVES') && list.includes('CPU TEAM RECEIVES'));
  check('history: submitter escaped on the card', list.includes('Submitted by Sam &lt;b&gt;'));
  check('history: Fairness on v4.4 cards', /Fairness \d+ \/ 100/.test(list));

  vm.runInContext("showHistoryTrade('t-unrev')", h.ctx);
  let detail = hel('#historyDetail').innerHTML;
  check('detail: note and status line', detail.includes('Deadline deal') && detail.includes('Waiting for the commissioner'));
  check('detail: team names in reads, escaped; stored rows untouched', !/User Team|CPU Team/.test(detail.split('Trade Intelligence')[1]) && detail.includes('&lt;Omaha&gt; &amp; Co') && JSON.stringify(historyRows[0].trade_intelligence).includes('Team'));
  check('detail: no original-submission button for an uncorrected trade', !detail.includes('history-original-toggle'));

  vm.runInContext("showHistoryTrade('t-pre')", h.ctx);
  detail = hel('#historyDetail').innerHTML;
  check('detail: pre-league keeps engine names', detail.includes('Logged before league mode') && /User Team|CPU Team/.test(detail));

  vm.runInContext("showHistoryTrade('t-corr')", h.ctx);
  detail = hel('#historyDetail').innerHTML;
  check('detail: corrected trade', detail.includes('Corrected Evaluation') && detail.includes('history-original-toggle'));
  const toggle = hel('#historyDetail').querySelector('.history-original-toggle');
  const body = hel('#historyDetail').querySelector('.history-original-body');
  body.hidden = true;
  await toggle.onclick();
  check('original submission loaded on request', hcalls.some(c => c[0] === 'revisions' && c[2] === 't-corr') && body.innerHTML.includes('Original verdict: ' + snapA.verdict) && body.innerHTML.includes('Wrong pick entered') && body.innerHTML.includes('Commish'));
  const before = hcalls.length;
  await toggle.onclick(); await toggle.onclick();
  check('original submission fetched once', hcalls.length === before && body.hidden === false);

  hel('#history').hidden = false;
  hel('#leagueLeave').onclick();
  await new Promise(r => setTimeout(r, 0));
  check('leaving the league clears history on screen', hel('#historyState').textContent === 'Enter a league to see its trade history.' && vm.runInContext('historyRecords.length', h.ctx) === 0);

  // -------------------------------------------------------------------------
  // 8. Commissioner area and correction mode (step 5)
  // -------------------------------------------------------------------------
  const TEAMS3 = TEAMS.concat([{ team_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', abbreviation: 'AZ', city_name: 'Arizona', nickname: 'Cardinals', division: 'NFC West', controlled_by: 'USER' }]);
  const NOW = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const tradeRow = o => Object.assign({ trade_id: o.id, accepted_at: iso(NOW - 3600e3), ruleset_version: 'v4.4', web_release: 'v2.0', review_status: 'UNREVIEWED', is_pre_league: false, current_revision: 0, submitter_name: 'Sam', submitter_note: null, reviewed_at: null, submitting_team: 'Dallas Cowboys', other_team: '<Omaha> & Co' }, snapA, o);
  const commRows = [
    tradeRow({ id: 'c-new', trade_number: 70, accepted_at: iso(NOW - 600e3), verdict: 'FAIR', submitting_team: 'Dallas Cowboys', other_team: 'Arizona Cardinals' }),
    tradeRow({ id: 'c-dup', trade_number: 69, accepted_at: iso(NOW - 1200e3) }),
    tradeRow({ id: 'c-old', trade_number: 68, accepted_at: iso(NOW - 7200e3) }),
    tradeRow({ id: 'c-done', trade_number: 67, review_status: 'REVIEWED', verdict: 'FAIR' }),
    tradeRow({ id: 'c-pre', trade_number: 5, web_release: 'v1.5.0', is_pre_league: true, submitting_team: null, other_team: null }),
  ];
  const ccalls = [];
  let reviewReply = { ok: true, data: { ok: true, trade: { tradeNumber: 68, reviewStatus: 'REVIEWED', currentRevision: 0 } }, error: null, status: 200 };
  const commTeams = TEAMS3.map(t => ({ teamId: t.team_id, abbreviation: t.abbreviation, cityName: t.city_name, nickname: t.nickname, division: t.division, controlledBy: t.controlled_by, ownerLabel: t.controlled_by === 'USER' ? 'Owner "Q" <x>' : null, updatedAt: 't' }));
  let teamsReply = { ok: true, data: { ok: true, teams: commTeams }, error: null, status: 200 };
  let updateReply = { ok: true, data: { ok: true, team: { teamId: TEAMS3[1].team_id, abbreviation: 'OMH', controlledBy: 'USER', ownerLabel: 'New', changed: true } }, error: null, status: 200 };
  let loginReply = { ok: false, data: { ok: false, error: 'Wrong password.' }, error: 'Wrong password.', status: 401 };
  const cstorage = Object.assign({}, hstorage, {
    leagueTeams: async () => { ccalls.push(['leagueTeams']); return { ok: true, teams: TEAMS3 }; },
    commissionerTeams: async (token, id) => { ccalls.push(['teams', token, id]); return teamsReply; },
    updateTeam: async args => { ccalls.push(['updateTeam', args]); return updateReply; },
    leagueHistory: async name => { ccalls.push(['history', name]); return { ok: true, data: commRows.map(r => Object.assign({ id: r.trade_id }, r)) }; },
    commissionerLogin: async (name, pw) => { ccalls.push(['login', name, pw]); return loginReply; },
    commissionerAuditLog: async (token, id) => { ccalls.push(['audit', token, id]); return { ok: true, data: { ok: true, events: [{ occurredAt: iso(NOW), action: 'TRADE_CORRECTED', tradeNumber: 66, actorRole: 'COMMISSIONER', actorName: 'Commish', reason: 'Fix <pick>', details: { verdict_before: 'UNFAIR', verdict_after: 'FAIR' } }] }, error: null, status: 200 }; },
    reviewTrade: async args => { ccalls.push(['review', args]); return reviewReply; },
    commissionerPicks: async (token, id) => { ccalls.push(['picks', token, id]); return { ok: true, data: { ok: true, currentDraftYear: null, rolloverDue: false, latestSeason: null, picks: [] }, error: null, status: 200 }; },
    commissionerSnapshots: async (token, id) => { ccalls.push(['snapshots', token, id]); return { ok: true, data: { ok: true, snapshots: [] }, error: null, status: 200 }; },
    leaguePickChoices: async () => ({ ok: true, picks: [], currentDraftYear: null }),
  });
  const cw = makeWindow({ storage: cstorage });
  load(cw, PAGE);
  const cel = s => cw.document.querySelector(s);
  const CA = vm.runInContext('CommissionerArea', cw.ctx);
  const CLM = vm.runInContext('LeagueMode', cw.ctx);

  await CA.show();
  check('commissioner: no league -> asks for one', cel('#commNoLeague').hidden === false && cel('#commLocked').hidden === true && cel('#commUnlocked').hidden === true);

  vm.runInContext("LeagueMode.state.mode = 'LEAGUE';", cw.ctx);
  cel('#leagueInput').value = 'Sample League';
  await cel('#leagueEntry').onsubmit({ preventDefault() {} });
  await CA.show();
  check('commissioner: league entered -> sign-in shown', cel('#commLocked').hidden === false && cel('#commLeagueName').textContent === 'Sample League');

  cel('#commPassword').value = 'nope';
  await cel('#commLoginForm').onsubmit({ preventDefault() {} });
  check('wrong password message, password cleared', cel('#commStatus').textContent === 'Wrong password.' && cel('#commPassword').value === '' && cel('#commUnlocked').hidden === true);

  loginReply = { ok: false, data: { ok: false, error: 'Too many wrong passwords. Try again later.', retryAfterSeconds: 610 }, error: 'Too many wrong passwords. Try again later.', status: 429 };
  cel('#commPassword').value = 'nope';
  await cel('#commLoginForm').onsubmit({ preventDefault() {} });
  check('lockout shows minutes', cel('#commStatus').textContent === 'Too many wrong passwords. Try again in 11 minutes.');

  const session = { token: 'tok-123', expiresAt: iso(NOW + 1800e3), leagueId: LEAGUE.id, leagueName: 'Sample League' };
  loginReply = { ok: true, data: { ok: true, session }, error: null, status: 200 };
  cel('#commPassword').value = 'right';
  await cel('#commLoginForm').onsubmit({ preventDefault() {} });
  check('signed in: unlocked, sign-in sent the league name', cel('#commUnlocked').hidden === false && ccalls.some(c => c[0] === 'login' && c[1] === 'Sample League' && c[2] === 'right'));
  check('token kept out of browser storage', ![...cw.localStore.values()].some(v => String(v).includes('tok-123')));
  check('audit log loaded with the token and league', ccalls.some(c => c[0] === 'audit' && c[1] === 'tok-123' && c[2] === LEAGUE.id));
  const audit = cel('#commAudit').innerHTML;
  check('audit card: label, verdict change, escaped reason', audit.includes('Corrected') && audit.includes('Verdict UNFAIR → FAIR') && audit.includes('Fix &lt;pick&gt;'));

  const queue = cel('#commQueue').innerHTML;
  const order = ['Trade #68', 'Trade #69', 'Trade #70'].map(t => queue.indexOf(t));
  check('queue: unreviewed league trades only, oldest first', order.every(i => i >= 0) && order[0] < order[1] && order[1] < order[2] && !queue.includes('Trade #67') && !queue.includes('Trade #5<'));
  check('queue status counts 3', cel('#commQueueStatus').textContent === '3 to review.');
  const flagsOf = id => CA._tradeFlags(commRows.map(r => Object.assign({ id: r.trade_id }, r)).find(r => r.id === id), commRows.map(r => Object.assign({ id: r.trade_id }, r)));
  check('flags: not FAIR', flagsOf('c-old').includes('Rated ' + snapA.verdict) || snapA.verdict === 'FAIR');
  check('flags: human to human', flagsOf('c-new').includes('Human to human') && !flagsOf('c-old').includes('Human to human'));
  check('flags: possible duplicate within 24h', flagsOf('c-dup').includes('Possible duplicate') && flagsOf('c-old').includes('Possible duplicate') && !flagsOf('c-new').includes('Possible duplicate'));
  check('all trades lists every active trade', ['Trade #70', 'Trade #67', 'Trade #5'].every(t => cel('#commAll').innerHTML.includes(t)));
  check('reviewed trade has no Mark reviewed button', !/data-action="REVIEW" data-trade-id="c-done"/.test(cel('#commAll').innerHTML));

  const button = (action, id) => cw.document.querySelectorAll('#commissioner [data-action]').find(b => b.dataset.action === action && b.dataset.tradeId === id);

  cel('#commName').value = '';
  button('REVIEW', 'c-old').onclick();
  check('actions need the commissioner name', cel('#commAction').hidden !== false && cel('#commQueueStatus').textContent.startsWith('Add your name'));

  cel('#commName').value = 'Commish';
  button('REVERSE', 'c-old').onclick();
  cel('#commReason').value = '  ';
  await cel('#commAction').onsubmit({ preventDefault() {} });
  check('reverse needs a reason (no call)', cel('#commActionStatus').textContent === 'Reversing a trade needs a reason.' && !ccalls.some(c => c[0] === 'review'));

  button('REVIEW', 'c-old').onclick();
  cel('#commReason').value = 'Looks fine';
  await cel('#commAction').onsubmit({ preventDefault() {} });
  const reviewCall = ccalls.find(c => c[0] === 'review');
  check('mark reviewed sends token, league, trade, name, comment', reviewCall && reviewCall[1].token === 'tok-123' && reviewCall[1].leagueId === LEAGUE.id && reviewCall[1].tradeId === 'c-old' && reviewCall[1].action === 'REVIEW' && reviewCall[1].commissionerName === 'Commish' && reviewCall[1].reason === 'Looks fine');
  check('after review: form closed, message, name remembered', cel('#commAction').hidden === true && cel('#commQueueStatus').textContent === 'Trade #68 marked reviewed. 3 to review.' && cw.localStore.get('maddenTrade.commissionerName') === 'Commish');

  // Correction mode
  vm.runInContext(`LeagueMode.state.teamA = '${TEAMS[1].team_id}'; LeagueMode.state.teamB = '';`, cw.ctx);
  button('CORRECT', 'c-new').onclick();
  check('correction: bar shown, submit hidden', CA.isCorrecting() && cel('#correctionBar').hidden === false && cel('#acceptTrade').hidden === true && cel('#correctionTitle').textContent === 'Correcting trade #70');
  check('correction: trade teams shown', CLM.state.teamA === TEAMS[0].team_id && CLM.state.teamB === TEAMS3[2].team_id && cel('#aheading').textContent === 'DALLAS COWBOYS RECEIVES');
  const loaded = vm.runInContext('JSON.stringify(state)', cw.ctx);
  const loadedState = JSON.parse(loaded);
  check('correction: assets loaded into the calculator', loadedState.A.length === snapA.user_team_assets.length && loadedState.B.length === snapA.cpu_team_assets.length && loadedState.A[0].type === snapA.user_team_assets[0].type);
  const reloaded = vm.runInContext('buildTradeSnapshot()', cw.ctx);
  check('correction: reloaded trade re-evaluates to the same values', reloaded && Math.abs(reloaded.user_adjusted_value - snapA.user_adjusted_value) < 1e-9 && reloaded.verdict === snapA.verdict);

  await cel('#saveCorrection').onclick();
  check('save needs a reason', cel('#correctionStatus').textContent === 'A correction needs a reason.' && ccalls.filter(c => c[0] === 'review').length === 1);

  vm.runInContext("state.B.push(Object.assign(emptyAsset(), { type: 'Draft Pick', pick: '1.20', timing: 'Current draft' })); render();", cw.ctx);
  cel('#correctionReason').value = 'Missing pick';
  reviewReply = { ok: true, data: { ok: true, trade: { tradeNumber: 70, reviewStatus: 'REVIEWED', currentRevision: 1 } }, error: null, status: 200 };
  await cel('#saveCorrection').onclick();
  const correctCall = ccalls.filter(c => c[0] === 'review')[1];
  check('correction sends CORRECT with the edited v3.0 snapshot', correctCall && correctCall[1].action === 'CORRECT' && correctCall[1].reason === 'Missing pick' && correctCall[1].trade.web_release === 'v3.0' && correctCall[1].trade.cpu_team_assets.length === snapA.cpu_team_assets.length + 1);
  check('correction snapshot keeps engine side names', /User Team|CPU Team/.test(JSON.stringify(correctCall[1].trade.trade_intelligence)));
  check('after save: bar hidden, teams restored, trade cleared', !CA.isCorrecting() && cel('#correctionBar').hidden === true && CLM.state.teamA === TEAMS[1].team_id && CLM.state.teamB === '' && vm.runInContext('state.A.length + state.B.length', cw.ctx) === 0);

  // Session end on a 401
  reviewReply = { ok: false, data: { ok: false, error: 'Commissioner sign-in required.', reason: 'expired' }, error: 'Commissioner sign-in required.', status: 401 };
  button('REVIEW', 'c-dup').onclick();
  await cel('#commAction').onsubmit({ preventDefault() {} });
  check('401 signs the commissioner out', cel('#commUnlocked').hidden === true && cel('#commStatus').textContent.includes('session ended'));

  // Teams (v2.1)
  loginReply = { ok: true, data: { ok: true, session }, error: null, status: 200 };
  cel('#commPassword').value = 'right';
  await cel('#commLoginForm').onsubmit({ preventDefault() {} });
  const teamsHtml = cel('#commTeams').innerHTML;
  check('teams: listed after sign-in with the token and league', ccalls.some(c => c[0] === 'teams' && c[1] === 'tok-123' && c[2] === LEAGUE.id) && (teamsHtml.match(/comm-team-line/g) || []).length === 3);
  check('teams: grouped by division', (teamsHtml.match(/comm-team-group/g) || []).length === 3 && teamsHtml.includes('<h3>NFC East</h3>'));
  check('teams: summary counts teams and humans', cel('#commTeamsSummary').textContent === '3 teams, 2 human' && cel('#commTeamsStatus').textContent === '');
  check('teams: control preselected, label escaped', /value="USER" selected>Human/.test(teamsHtml) && /value="CPU" selected>CPU/.test(teamsHtml) && teamsHtml.includes('Owner &quot;Q&quot; &lt;x&gt;') && !teamsHtml.includes('<x>'));
  const fields = cw.document.querySelectorAll('#commTeams [data-team]');
  check('teams: a control and a label field per team, all auto-saving', fields.length === 6 && fields.every(f => typeof f.onchange === 'function'));
  const omhId = TEAMS3[1].team_id;
  const omhCtl = fields.find(f => f.tagName === 'SELECT' && f.dataset.team === omhId);
  const omhLabel = fields.find(f => f.tagName === 'INPUT' && f.dataset.team === omhId);
  cel('#commName').value = '';
  omhCtl.value = 'USER';
  await omhCtl.onchange();
  check('teams: no name -> nothing saved, field restored', !ccalls.some(c => c[0] === 'updateTeam') && cel('#commTeamsStatus').textContent.startsWith('Add your name') && omhCtl.value === 'CPU');
  cel('#commName').value = 'Commish';
  omhCtl.value = 'USER';
  omhLabel.value = '  New  ';
  const pickerLoadsBefore = ccalls.filter(c => c[0] === 'leagueTeams').length;
  const listLoadsBefore = ccalls.filter(c => c[0] === 'teams').length;
  await omhCtl.onchange();
  const upd = ccalls.find(c => c[0] === 'updateTeam');
  check('teams: change saves token, league, team, control, trimmed label, name', upd && upd[1].token === 'tok-123' && upd[1].leagueId === LEAGUE.id && upd[1].teamId === omhId && upd[1].controlledBy === 'USER' && upd[1].ownerLabel === 'New' && upd[1].commissionerName === 'Commish');
  check('teams: pickers reloaded, team list not redrawn', ccalls.filter(c => c[0] === 'leagueTeams').length === pickerLoadsBefore + 1 && ccalls.filter(c => c[0] === 'teams').length === listLoadsBefore);
  check('teams: saved notice and updated summary', cel('#commTeamsStatus').textContent === 'OMH saved.' && cel('#commTeamsSummary').textContent === '3 teams, 3 human');
  updateReply = { ok: true, data: { ok: true, team: { teamId: omhId, abbreviation: 'OMH', controlledBy: 'USER', ownerLabel: 'New', changed: false } }, error: null, status: 200 };
  const loadsBefore2 = ccalls.filter(c => c[0] === 'leagueTeams').length;
  await omhLabel.onchange();
  check('teams: unchanged save says so, no reload', cel('#commTeamsStatus').textContent === 'OMH: nothing changed.' && ccalls.filter(c => c[0] === 'leagueTeams').length === loadsBefore2);
  updateReply = { ok: false, data: { ok: false, error: 'The owner label must be 60 characters or fewer.' }, error: 'The owner label must be 60 characters or fewer.', status: 400 };
  omhLabel.value = 'x'.repeat(61);
  await omhLabel.onchange();
  check('teams: failed save shows the error and restores the field', cel('#commTeamsStatus').textContent.includes('60 characters') && omhLabel.value === 'New');
  updateReply = { ok: false, data: { ok: false, error: 'Commissioner sign-in required.', reason: 'expired' }, error: 'Commissioner sign-in required.', status: 401 };
  await omhCtl.onchange();
  check('teams: 401 signs out and clears the team list', cel('#commUnlocked').hidden === true && cel('#commTeams').innerHTML === '');

  // League change signs out
  cel('#commPassword').value = 'right';
  await cel('#commLoginForm').onsubmit({ preventDefault() {} });
  cel('#leagueLeave').onclick();
  check('leaving the league signs out', cel('#commUnlocked').hidden === true && cel('#commNoLeague').hidden === false && CA._area.session === null);
  check('commissioner: picks and exports loaded with the token (not set up / none)', ccalls.some(c => c[0] === 'picks' && c[1] === 'tok-123') && ccalls.some(c => c[0] === 'snapshots' && c[1] === 'tok-123'));

  // -------------------------------------------------------------------------
  // 9. Web v3.0 draft picks: "Whose pick", submit, correction
  // -------------------------------------------------------------------------
  const DAL = TEAMS[0].team_id, OMH = TEAMS[1].team_id, KCX = 'cccccccc-cccc-4ccc-8ccc-000000000003';
  const P = n => `dddddddd-dddd-4ddd-8ddd-00000000000${n}`;
  // OMH owns its 2029 2nd and KC's 2029 2nd; DAL owns its 2028 1st. OMH owns no 2030 3rd.
  let pickRows = [
    { pick_id: P(1), draft_year: 2029, round: 2, original_team_id: OMH, original_abbreviation: 'OMH', owner_team_id: OMH, in_this_trade: false, current_draft_year: 2028 },
    { pick_id: P(2), draft_year: 2029, round: 2, original_team_id: KCX, original_abbreviation: 'KC', owner_team_id: OMH, in_this_trade: false, current_draft_year: 2028 },
    { pick_id: P(3), draft_year: 2028, round: 1, original_team_id: DAL, original_abbreviation: 'DAL', owner_team_id: DAL, in_this_trade: false, current_draft_year: 2028 },
    { pick_id: P(4), draft_year: 2029, round: 3, original_team_id: OMH, original_abbreviation: 'OMH', owner_team_id: OMH, in_this_trade: false, current_draft_year: 2028 },
  ];
  const pcalls = [];
  const pstorage = {
    isConfigured: true,
    leagueLookup: async () => ({ ok: true, league: { ...LEAGUE, maddenVersion: '27', currentDraftYear: 2028 } }),
    leagueTeams: async () => ({ ok: true, teams: TEAMS }),
    leaguePickChoices: async (name, a, b, tradeId) => { pcalls.push(['choices', name, a, b, tradeId || null]); return { ok: true, picks: pickRows, currentDraftYear: 2028 }; },
    submitLeagueTrade: async sub => { pcalls.push(['submit', sub]); return { ok: true, trade: { tradeNumber: 77, leagueName: 'Sample League' } }; },
  };
  const pw = makeWindow({ storage: pstorage });
  load(pw, PAGE);
  const pel = s => pw.document.querySelector(s);
  const PLM = vm.runInContext('LeagueMode', pw.ctx);
  const prun = code => vm.runInContext(code, pw.ctx);
  const settle = () => new Promise(r => setTimeout(r, 0));

  check('pickRound matches the database rule', ['1.05', 'Future Mid 1st', 'Early 2nd', 'Late 3rd', '4th', '7th', '8th'].map(PLM.pickRound).join(',') === '1,1,2,3,4,7,');
  check('pickYearOffset', ['Current draft', 'Next year', 'Two years away', 'x'].map(PLM.pickYearOffset).join(',') === '0,1,2,');

  prun("LeagueMode.state.mode = 'LEAGUE';");
  pel('#leagueInput').value = 'Sample League';
  await pel('#leagueEntry').onsubmit({ preventDefault() {} });
  check('league entry keeps the current draft year', PLM.state.entered.currentDraftYear === 2028 && !PLM.pickTracking());
  pel('#teamA').value = DAL; pel('#teamA').onchange();
  pel('#teamB').value = OMH; pel('#teamB').onchange();
  await settle();
  const choiceCall = pcalls.filter(c => c[0] === 'choices').at(-1);
  check('both teams chosen: their picks are loaded', PLM.pickTracking() && choiceCall && choiceCall[2] === DAL && choiceCall[3] === OMH && choiceCall[4] === null && PLM.state.picks.rows.length === 4);

  // DAL receives OMH's "Late 3rd, Next year" (one fit) and gives a player.
  const pickAsset = (id, pick, timing) => `Object.assign(emptyAsset(), { id: ${id}, type: 'Draft Pick', pick: '${pick}', timing: '${timing}' })`;
  const player = id => `Object.assign(emptyAsset(), { id: ${id}, type: 'Player', name: 'Vet', pos: 'WR', ovr: '82', age: '27', dev: 'Normal' })`;
  prun(`state = { A: [${pickAsset(901, 'Late 3rd', 'Next year')}], B: [${player(902)}] }; render();`);
  check('one fitting pick is chosen automatically', prun('state.A[0].pick_id') === P(4));
  const aHtml = pel('.side[data-side="A"]').querySelector('.assets').innerHTML;
  check('card shows "Whose pick" with the choice and "own"', aHtml.includes('Whose pick') && aHtml.includes('2029 3rd · own') && aHtml.includes('Draft Pick · Next year · own'));
  check('submit enabled once every pick is chosen', pel('#acceptTrade').disabled === false && pel('#pickNotice').hidden === true);

  // Two fits: OMH's own 2029 2nd and KC's.
  prun(`state.A.push(${pickAsset(903, 'Mid 2nd', 'Next year')}); render();`);
  check('two fitting picks: nothing chosen, submit disabled, notice shown', prun('state.A[1].pick_id') === '' && pel('#acceptTrade').disabled === true && pel('#pickNotice').hidden === false && pel('#pickNotice').textContent.startsWith('Choose whose pick Mid 2nd'));
  const aHtml2 = pel('.side[data-side="A"]').querySelector('.assets').innerHTML;
  check('both choices offered, with "via KC"', aHtml2.includes('Choose...') && aHtml2.includes('2029 2nd · own') && aHtml2.includes('2029 2nd · via KC'));
  prun(`state.A[1].pick_id = '${P(2)}'; render();`);
  check('a chosen pick is kept and submit is enabled', prun('state.A[1].pick_id') === P(2) && pel('#acceptTrade').disabled === false);

  // No fit: OMH owns no 2030 3rd ("Late 3rd, Two years away").
  prun(`state.A.push(${pickAsset(904, 'Late 3rd', 'Two years away')}); render();`);
  const aHtml3 = pel('.side[data-side="A"]').querySelector('.assets').innerHTML;
  check('no fitting pick: says so, submit disabled', aHtml3.includes('OMH has no 2030 3rd pick') && pel('#acceptTrade').disabled === true);
  prun('state.A.pop(); render();');

  // Changing the round drops a choice that no longer fits.
  prun("state.A[1].pick = 'Early 3rd'; render();");
  check('changing the round drops the old choice; the only fit is already in the trade, so none is chosen', prun('state.A[1].pick_id') === '');
  check('the same pick twice blocks submit', (prun(`state.A[1].pick_id = '${P(4)}'; LeagueMode.picksReady(state).error`)) === 'The same pick is in the trade twice.');
  prun(`state.A[1].pick = 'Mid 2nd'; state.A[1].pick_id = '${P(2)}'; render();`);

  run(pw, 'openAcceptConfirmation()');
  pel('#submitterName').value = 'Sam';
  await pel('#acceptConfirm').onsubmit({ preventDefault() {} });
  const psub = pcalls.find(c => c[0] === 'submit');
  check('submission carries each pick_id (players: null)', psub && psub[1].web_release === 'v3.0' && psub[1].user_team_assets.map(a => a.pick_id).join(',') === `${P(4)},${P(2)}` && psub[1].cpu_team_assets[0].pick_id === null);
  check('after submit the pick choices reload', pcalls.filter(c => c[0] === 'choices').length >= 2 && pcalls.at(-1)[0] === 'choices');

  // Practice mode: no pick tracking, pick_id null.
  prun("LeagueMode.state.mode = 'PRACTICE'; render();");
  check('practice mode: no "Whose pick", pick_id null', !pel('.side[data-side="A"]').querySelector('.assets').innerHTML.includes('Whose pick') && prun('buildTradeSnapshot()').user_team_assets.every(a => a.pick_id === null));
  prun("LeagueMode.state.mode = 'LEAGUE'; render();");

  // Correction lists the trade's own picks.
  await PLM.setCorrectionTrade('t-corr-1');
  check('correction loads choices for that trade', pcalls.filter(c => c[0] === 'choices').at(-1)[4] === 't-corr-1');
  await PLM.setCorrectionTrade(null);
  check('ending the correction reloads without it', pcalls.filter(c => c[0] === 'choices').at(-1)[4] === null);

  // Choices that fail to load block submit with the reason.
  pstorage.leaguePickChoices = async () => ({ ok: false, picks: [], currentDraftYear: null, error: 'Draft picks could not be loaded.' });
  await PLM.reloadPicks();
  check('failed pick load blocks submit', PLM.picksReady(vm.runInContext('state', pw.ctx)).error === 'Draft picks could not be loaded.' && pel('#acceptTrade').disabled === true);

  // -------------------------------------------------------------------------
  // 10. Web v3.0 commissioner: Draft picks and Exports
  // -------------------------------------------------------------------------
  const commPick = (n, year, round, orig, origAbbr, owner, ownerAbbr) => ({ pickId: P(n), draftYear: year, round, originalTeamId: orig, originalAbbreviation: origAbbr, ownerTeamId: owner, ownerAbbreviation: ownerAbbr });
  let picksData = { ok: true, currentDraftYear: 2028, rolloverDue: true, latestSeason: 2028, picks: [
    commPick(1, 2028, 1, DAL, 'DAL', DAL, 'DAL'), commPick(2, 2028, 1, OMH, 'OMH', DAL, 'DAL'),
    commPick(3, 2029, 2, OMH, 'OMH', OMH, 'OMH'), commPick(4, 2030, 7, DAL, 'DAL', DAL, 'DAL') ] };
  let snapsData = { ok: true, snapshots: [
    { snapshotId: 'snap-9', receivedAt: '2026-11-27T16:32:26Z', status: 'RECEIVING', season: 2027, stageIndex: 1, week: 9, rostersReceived: 32, teamsInLeague: 32, missingRosters: 0, complete: true, players: 2056, freeAgents: 580, historyFailed: 0, isCurrent: false },
    { snapshotId: 'snap-8', receivedAt: '2026-11-25T04:47:29Z', status: 'RECEIVED', season: 2027, stageIndex: 1, week: 8, rostersReceived: 31, teamsInLeague: 32, missingRosters: 1, complete: false, players: 1990, freeAgents: 581, historyFailed: 0, isCurrent: true } ] };
  const kcalls = [];
  const kstorage = Object.assign({}, cstorage, {
    commissionerPicks: async (t, id) => { kcalls.push(['picks', t, id]); return { ok: true, data: picksData, error: null, status: 200 }; },
    commissionerSnapshots: async (t, id) => { kcalls.push(['snapshots', t, id]); return { ok: true, data: snapsData, error: null, status: 200 }; },
    setPickOwner: async args => { kcalls.push(['setOwner', args]); return { ok: true, data: { ok: true, pick: { pickId: args.pickId, ownerTeamId: args.ownerTeamId, ownerAbbreviation: 'OMH', changed: true } }, error: null, status: 200 }; },
    draftComplete: async args => { kcalls.push(['draft', args]); return { ok: true, data: { ok: true, draft: { currentDraftYear: 2029, picksRetired: 224, picksCreated: 224 } }, error: null, status: 200 }; },
    markSnapshotCurrent: async args => { kcalls.push(['mark', args]); return { ok: true, data: { ok: true, snapshot: { snapshotId: args.snapshotId, season: 2027, week: 9, changed: true } }, error: null, status: 200 }; },
    commissionerAuditLog: async () => ({ ok: true, data: { ok: true, events: [{ occurredAt: iso(NOW), action: 'DRAFT_COMPLETED', tradeNumber: null, actorRole: 'COMMISSIONER', actorName: 'Commish', reason: null, details: {} }] }, error: null, status: 200 }),
  });
  const kw = makeWindow({ storage: kstorage });
  load(kw, PAGE);
  const kel = s => kw.document.querySelector(s);
  const KCA = vm.runInContext('CommissionerArea', kw.ctx);
  vm.runInContext("LeagueMode.state.mode = 'LEAGUE';", kw.ctx);
  kel('#leagueInput').value = 'Sample League';
  await kel('#leagueEntry').onsubmit({ preventDefault() {} });
  kel('#commPassword').value = 'right';
  loginReply = { ok: true, data: { ok: true, session }, error: null, status: 200 };
  await kel('#commLoginForm').onsubmit({ preventDefault() {} });
  check('draft picks: summary and rollover hint', kel('#commPicksSummary').textContent === 'current draft 2028 · 1 pick moved' && kel('#commPickRollover').hidden === false && kel('#commPickRollover').textContent.includes('2028 season') && kel('#commPickRollover').textContent.includes('2028 draft is done'));
  const pickHtml = kel('#commPicks').innerHTML;
  check('draft picks: 2028 1st round shown (2 picks), moved one marked', (pickHtml.match(/comm-pick-line/g) || []).length === 2 && pickHtml.includes('comm-pick-line moved') && kel('#commPickYear').innerHTML.includes('2028 (current)'));
  kel('#commPickYear').value = '2030'; kel('#commPickYear').onchange();
  kel('#commPickRound').value = '7'; kel('#commPickRound').onchange();
  check('draft picks: year and round filter', (kel('#commPicks').innerHTML.match(/comm-pick-line/g) || []).length === 1);
  check('audit label for draft complete', kel('#commAudit').innerHTML.includes('Draft complete'));

  kel('#commName').value = '';
  await KCA._savePickOwner(P(4), OMH);
  check('pick move needs the commissioner name', !kcalls.some(c => c[0] === 'setOwner') && kel('#commPicksStatus').textContent.startsWith('Add your name'));
  kel('#commName').value = 'Commish';
  await KCA._savePickOwner(P(4), OMH);
  const so = kcalls.find(c => c[0] === 'setOwner');
  check('pick move sends token, league, pick, team, name', so && so[1].token === 'tok-123' && so[1].leagueId === LEAGUE.id && so[1].pickId === P(4) && so[1].ownerTeamId === OMH && so[1].commissionerName === 'Commish');
  check('pick move notice', kel('#commPicksStatus').textContent === '2030 7th (DAL) now belongs to OMH.');

  await KCA._draftComplete();
  check('draft complete asks to confirm first (no call)', !kcalls.some(c => c[0] === 'draft') && kel('#commDraftComplete').textContent === 'Confirm: the 2028 draft is complete' && kel('#commDraftCancel').hidden === false);
  picksData = { ok: true, currentDraftYear: 2029, rolloverDue: false, latestSeason: 2028, picks: [commPick(5, 2029, 1, DAL, 'DAL', DAL, 'DAL')] };
  await KCA._draftComplete();
  const dc = kcalls.find(c => c[0] === 'draft');
  check('draft complete sends the expected year', dc && dc[1].expectedYear === 2028 && dc[1].commissionerName === 'Commish');
  check('after draft complete: new year shown, hint gone', kel('#commPicksSummary').textContent === 'current draft 2029 · 0 picks moved' && kel('#commPickRollover').hidden === true && kel('#commPicksStatus').textContent.includes('current draft is now 2029'));

  const snapsHtml = kel('#commSnapshots').innerHTML;
  check('exports: listed newest first with health', snapsHtml.indexOf('2027, week 9') < snapsHtml.indexOf('2027, week 8') && snapsHtml.includes('Healthy') && snapsHtml.includes('incomplete, 1 rosters missing') && snapsHtml.includes('2,056 players'));
  check('exports: current one marked, others have the button', snapsHtml.includes('comm-snapshot-current') && snapsHtml.includes('data-snapshot="snap-9"') && !snapsHtml.includes('data-snapshot="snap-8"'));
  check('exports: summary shows the current export', kel('#commSnapshotsSummary').textContent === 'current: 2027, week 8');
  await KCA._markCurrent('snap-9');
  const mc = kcalls.find(c => c[0] === 'mark');
  check('mark current sends token, league, export, name', mc && mc[1].snapshotId === 'snap-9' && mc[1].token === 'tok-123' && mc[1].commissionerName === 'Commish');
  check('mark current updates the list', kel('#commSnapshotsSummary').textContent === 'current: 2027, week 9' && kel('#commSnapshotsStatus').textContent === 'Marked current: 2027, week 9.');

  console.log(`\n${pass} / ${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
  process.exit(fail ? 1 : 0);
})();
