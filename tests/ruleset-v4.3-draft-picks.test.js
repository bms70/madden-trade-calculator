// Ruleset v4.3 draft-pick regression checks.
// Run from the repo root: node tests/ruleset-v4.3-draft-picks.test.js
// Loads valuation.js unchanged into a sandbox that supplies the calculator
// "state" object, the same way calculator-ui.js does in the browser.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'valuation.js'), 'utf8');
const ctx = { state: { A: [], B: [] } };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.api={PICK_VALUES,TIMING,baseValue,pickTiming,allowedTimings,totals,verdict,state};', ctx);
const api = ctx.api;

let id = 0;
const pick = (p, timing = 'Current draft') => ({ id: ++id, type: 'Draft Pick', pick: p, timing });
const player = (o) => ({ id: ++id, type: 'Player', name: '', cap: '', years: '', league: '', current: '', projected: '', ...o });

function run(A, B) {
  api.state.A = A; api.state.B = B;
  const a = api.totals('A'), b = api.totals('B');
  return { A: a, B: b, v: api.verdict(a, b) };
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail); }
}
const near = (x, y) => Math.abs(x - y) < 1e-9;
const V = api.PICK_VALUES;

// 1. First-round curve anchors
check('1.01 = 100', V['1.01'] === 100);
check('1.16 = 80', V['1.16'] === 80);
check('1.17 = 80', V['1.17'] === 80);
check('1.32 = 50', V['1.32'] === 50);
check('Top 7 hold value (1.07 >= 94)', V['1.07'] >= 94);

// 2. Curve is non-increasing from 1.01 to 1.32, then into round 2
const order = Object.keys(V).filter(k => !k.startsWith('Future'));
let mono = true;
for (let i = 1; i < order.length; i++) if (V[order[i]] > V[order[i - 1]]) mono = false;
check('Pick values never increase down the board', mono);
check('Round 2 sits below 1.32', V['Early 2nd'] < V['1.32']);

// 3. Future 1sts follow the new curve (1.05 / 1.13 / 1.24 / 1.14)
check('Future Early = 1.05', V['Future Early 1st'] === V['1.05']);
check('Future Mid = 1.13', V['Future Mid 1st'] === V['1.13']);
check('Future Late = 1.24', V['Future Late 1st'] === V['1.24']);
check('Future Unknown = 1.14', V['Future 1st - Unknown'] === V['1.14']);

// 4. Pick / timing pairing
check('Slot pick is current draft only', JSON.stringify(api.allowedTimings('1.05')) === '["Current draft"]');
check('Future 1st is next year or later', JSON.stringify(api.allowedTimings('Future Early 1st')) === '["Next year","Two years away"]');
check('Round 2-7 tiers allow all timings', api.allowedTimings('Mid 3rd').length === 3);
check('Future 1st set to Current draft is valued as Next year',
  near(api.baseValue(pick('Future Early 1st', 'Current draft')), 97.2 * 0.85));
check('Future 1st with blank timing is valued as Next year',
  near(api.baseValue(pick('Future Mid 1st', '')), 85.7 * 0.85));
check('Future 1st two years away is discounted once',
  near(api.baseValue(pick('Future Late 1st', 'Two years away')), 66 * 0.7));
check('Slot pick set to Two years away is valued as Current draft',
  near(api.baseValue(pick('1.05', 'Two years away')), 97.2));
check('Future Early 1st (next year) is worth less than current 1.05',
  api.baseValue(pick('Future Early 1st', 'Next year')) < api.baseValue(pick('1.05')));
check('Round 2 next year is discounted', near(api.baseValue(pick('Early 2nd', 'Next year')), 30 * 0.85));

// 5. Draft-only protection keyed to pick identity
// Acquire 1.01 for 1.02: target 100 * 1.15 = 115 adjusted, window 115-124.2.
let r = run([pick('1.01')], [pick('1.02'), pick('Early 2nd')]); // 99.7 + 27 = 126.7: above window
check('1.01 premium uses 1.15x (above window not FAIR)', r.v.v !== 'FAIR', JSON.stringify(r.v));
r = run([pick('1.01')], [pick('1.02'), pick('Mid 2nd')]); // 99.7 + 23.4 = 123.1: inside 115-124.2
check('1.01 premium uses 1.15x (inside window FAIR)', r.v.v === 'FAIR', JSON.stringify(r.v));
// 1.03 for 1.06 + Late 3rd: target 99 * 1.08 = 106.92, window to 115.47; 96.2 + 9 = 105.2: short
r = run([pick('1.03')], [pick('1.06'), pick('Late 3rd')]);
check('1.03 premium uses 1.08x (short not FAIR)', r.v.v !== 'FAIR', JSON.stringify(r.v));
r = run([pick('1.03')], [pick('1.06'), pick('Mid 3rd')]); // 96.2 + 11.7 = 107.9: inside
check('1.03 premium uses 1.08x (inside window FAIR)', r.v.v === 'FAIR', JSON.stringify(r.v));
// 1.04 is not a premium slot even though its value (98.2) is above the old 77 threshold.
// 1.04 for 1.05: 98.2 is not > 97.2 * 1.08, so 1.00x; the trade-down side must still reach 98.2.
r = run([pick('1.04')], [pick('1.05')]);
check('1.04 for 1.05 alone is short of the 1.00x target', r.v.v !== 'FAIR', JSON.stringify(r.v));
r = run([pick('1.04')], [pick('1.05'), pick('7th')]); // 97.2 + 1.8 = 99.0, inside 98.2-106.06
check('1.04 for 1.05 + 7th is near-lateral (1.00x) FAIR', r.v.v === 'FAIR', JSON.stringify(r.v));
// 1.04 for 1.20: 98.2 > 74 * 1.08 -> 1.04x; target 102.13. 1.20 + Early 3rd = 74 + 14.4 = 88.4 -> not FAIR
r = run([pick('1.04')], [pick('1.20'), pick('Early 3rd')]);
check('1.04 for 1.20 + Early 3rd is a meaningful trade-up, not FAIR', r.v.v !== 'FAIR', JSON.stringify(r.v));

// 6. Mixed premium-asset edge cases still behave
const eliteQB = player({ ovr: 92, age: 24, pos: 'QB', dev: 'X-Factor', cap: 8, years: 3 });
r = run([eliteQB], [pick('1.01')]);
check('Elite QB for one 1.01 is not FAIR (QB protection holds)', r.v.v !== 'FAIR', JSON.stringify({ A: r.A.adj, B: r.B.adj, v: r.v.v }));
r = run([eliteQB], [pick('1.20'), pick('1.25'), pick('Early 2nd'), pick('Mid 2nd')]);
check('Elite QB for a bundle of lesser picks is not FAIR', r.v.v !== 'FAIR', JSON.stringify({ A: r.A.adj, B: r.B.adj, v: r.v.v }));
const rookie = player({ ovr: 78, age: 22, pos: 'WR', dev: 'Star', cap: 2, years: 4, league: 0 });
check('Rookie (Year 0) still valued above zero', api.baseValue(rookie) > 0);

console.log(`\n${pass} / ${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
