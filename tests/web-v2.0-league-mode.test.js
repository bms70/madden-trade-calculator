// Web v2.0 league mode in the browser scripts: snapshot contract, display-only
// team names, practice mode, league entry and submission.
// Run from the repo root: node tests/web-v2.0-league-mode.test.js
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
    hidden: selector === '#acceptConfirm',
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
    querySelector(s) { if (!children.has(s)) children.set(s, fakeElement(s)); return children.get(s); },
    closest() { return null; },
  };
}

function makeWindow({ storage, localStore = new Map() } = {}) {
  const elements = new Map();
  const document = {
    elements,
    querySelector(s) { if (!elements.has(s)) elements.set(s, fakeElement(s)); return elements.get(s); },
    querySelectorAll() { return []; },
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
const baselineUiSrc = execFileSync('git', ['show', 'ruleset-v4.4-baseline:calculator-ui.js'], { cwd: root, encoding: 'utf8' });

const current = () => { const w = makeWindow(); load(w, [['valuation.js', valuationSrc], ['league-mode.js', leagueSrc], ['calculator-ui.js', uiSrc]]); return w; };
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
  { team_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', abbreviation: 'DAL', city_name: 'Dallas', nickname: 'Cowboys', division: 'NFC East', controlled_by: 'HUMAN' },
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
    if (keysOk && wa === 'v2.0' && wb === 'v1.5.0' && JSON.stringify(restA) === JSON.stringify(restB)) same++;
    else mismatch.push(scenario.n);
  }

  check(`all ${scenarios.length} parity scenarios produce a snapshot`, compared === scenarios.length, mismatch.join(', '));
  check('v2.0 snapshot = v1.5.0 snapshot apart from web_release (league mode, teams chosen)', same === compared && compared > 0, mismatch.join(', '));

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
  load(w, [['valuation.js', valuationSrc], ['league-mode.js', leagueSrc], ['calculator-ui.js', uiSrc]]);
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
  check('submitted the v2.0 league submission', submitted && submitted[1].web_release === 'v2.0' && submitted[1].submitter_note === 'Deadline deal' && submitted[1].other_team_id === TEAMS[1].team_id);
  check('confirmation message', el('#status').textContent === 'Logged as trade #42, Unreviewed.');
  check('name remembered, note cleared', w.localStore.get('maddenTrade.submitterName') === 'Sam' && el('#submitterNote').value === '');

  run(w, 'render()');
  check('same trade cannot be submitted twice in a row', el('#acceptTrade').disabled === true);

  el('#leagueLeave').onclick();
  check('leave league clears league and memory', !LM.state.entered && !w.localStore.has('maddenTrade.leagueName') && el('#acceptTrade').disabled === true);

  // A returning member in league mode comes back to their league.
  const store = new Map([['maddenTrade.mode', 'LEAGUE'], ['maddenTrade.leagueName', 'Sample League']]);
  const w2 = makeWindow({ storage, localStore: store });
  load(w2, [['valuation.js', valuationSrc], ['league-mode.js', leagueSrc], ['calculator-ui.js', uiSrc]]);
  await new Promise(r => setTimeout(r, 0));
  const LM2 = vm.runInContext('LeagueMode', w2.ctx);
  check('remembered league re-entered on load', LM2.state.mode === 'LEAGUE' && LM2.state.entered && LM2.state.entered.name === 'Sample League');

  // A remembered league that no longer exists is forgotten.
  const gone = new Map([['maddenTrade.mode', 'LEAGUE'], ['maddenTrade.leagueName', 'Old League']]);
  const w3 = makeWindow({ storage, localStore: gone });
  load(w3, [['valuation.js', valuationSrc], ['league-mode.js', leagueSrc], ['calculator-ui.js', uiSrc]]);
  await new Promise(r => setTimeout(r, 0));
  check('unknown remembered league forgotten', !gone.has('maddenTrade.leagueName'));

  console.log(`\n${pass} / ${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
  process.exit(fail ? 1 : 0);
})();
