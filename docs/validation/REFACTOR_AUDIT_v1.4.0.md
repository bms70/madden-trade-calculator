# Madden League Trade Calculator - v1.4.0 Structural Refactor Audit

**Web Release:** v1.4.0  
**Ruleset:** v4.2  
**Ruleset impact:** None  
**Refactor branch:** `refactor/v1.4.0-code-cleanup`  
**Status:** Installed and pending real-backend smoke validation

This audit records the evidence for the post-release structural refactor of the browser application (a mechanical restructuring: split, formatted, commented; no logic edits). Web Release v1.4.0 and Ruleset v4.2 are unchanged. Real Supabase smoke tests and the established release regression suite have **not** been rerun against the refactor (see section 13).

## 1. Status summary

| Item | Status |
|---|---|
| Valuation code, snapshot fields, backend contracts, release metadata | Unchanged (proved below) |
| Encoding scan of every changed file | Clean (section 2) |
| Files saved as UTF-8, no byte-order mark, LF line endings | Yes |
| Complete unified Git diff | Produced as a temporary review artifact (section 12); the permanent source diff is the Git commit history |
| Installed on `refactor/v1.4.0-code-cleanup`, integrated working-tree snapshot | Recorded in section 11 |
| Commit hash | **Pending initial refactor commit** (section 11) |
| Merged to `main` | No |

## 2. Encoding scan

Every changed file was decoded with a strict UTF-8 decoder (any invalid byte sequence is an error) and every non-ASCII character was counted by code point.

Characters searched for, by code point so that this audit itself contains no artifacts: U+00C2, U+00E2, U+00C3, U+FFFD, the Thai-script range U+0E00 to U+0E7F (the "malformed middle dot" appears as U+0E22 followed by U+0E17), and the sequences U+00C2 U+00B7 and U+00E2 U+20AC.

Result: **none found in any changed HTML, CSS or JavaScript file.**

- `admin.js` line 108 is the correct text `· Ruleset`. Its raw bytes are `c2 b7 20 52 75 6c 65 73 65 74`: `c2 b7` is the UTF-8 encoding of U+00B7 (middle dot), followed by a space and "Ruleset". No replacement was needed.
- The Thai pair U+0E22 U+0E17 is exactly what the two bytes `c2 b7` display as when a viewer or editor reads them as Windows-874 instead of UTF-8. If you see it in a copy of `admin.js`, that copy was opened or saved with the wrong encoding after leaving this package; re-copy the file from this package and open/save it as UTF-8.
- The uploaded original `index.html` contains no artifacts either.
- A previous version of this document contained literal artifact characters because it quoted the sequences it was scanning for. That was a defect in the report and is fixed here.
- The only non-ASCII characters in the code are intentional: · (U+00B7), ×, —, ’, “, ”, →, ≤, ▴, ▾.

Scan output for the source files (the report file itself is scanned the same way after it is written):

```text
admin.js             utf8: valid | BOM: no | CR: 0 | non-ASCII: U+00B7x1 | suspect: none 
calculator-ui.js     utf8: valid | BOM: no | CR: 0 | non-ASCII: U+00B7x3 U+2014x2 U+25B4x1 U+25BEx1 | suspect: none 
index.html           utf8: valid | BOM: no | CR: 0 | non-ASCII: U+00B7x6 U+00D7x1 U+2019x1 U+201Cx1 U+201Dx1 U+2264x2 U+25BEx1 | suspect: none 
styles.css           utf8: valid | BOM: no | CR: 0 | non-ASCII: none | suspect: none 
theme.js             utf8: valid | BOM: no | CR: 0 | non-ASCII: none | suspect: none 
trade-history.js     utf8: valid | BOM: no | CR: 0 | non-ASCII: U+00B7x5 U+2014x4 U+2192x1 | suspect: none 
valuation.js         utf8: valid | BOM: no | CR: 0 | non-ASCII: none | suspect: none 

CLEAN: all files valid UTF-8, no BOM, no artifacts
```

## 3. File inventory

| File | Lines | Bytes | SHA-256 (first 16) |
|---|---:|---:|---|
| `index.html` | 309 | 16574 | `4c79fea24d397ab5` |
| `styles.css` | 1105 | 17404 | `fed58f43b9ac3277` |
| `theme.js` | 49 | 1708 | `edbda97944435f7d` |
| `valuation.js` | 272 | 8079 | `01d82e83bf62b890` |
| `calculator-ui.js` | 361 | 15674 | `5fd34974689d27e0` |
| `trade-history.js` | 261 | 9320 | `229ccd2c102c8f1a` |
| `admin.js` | 447 | 13538 | `d8ef8389b9473c0c` |
| `REFACTOR_DIFF.txt` (temporary review artifact, not part of the intended commit) | 4829 | 159661 | `8059353d4ea0830d` |
| `docs/validation/REFACTOR_AUDIT_v1.4.0.md` | this file | | |

All files: UTF-8, no byte-order mark. The seven source files and this audit use LF line endings. `REFACTOR_DIFF.txt` contains 1980 carriage returns, one at the end of each line deleted from the CRLF original, because the diff reproduces those lines exactly; the added lines use LF. The uploaded original `index.html` is 71588 bytes with CRLF line endings; the line-ending normalization is why `index.html` shows as fully rewritten in the diff. `storage.js` and `supabase-config.js` were not provided and are not modified. The sizes and hashes above are those of the package files as validated. No file other than the seven above was changed by the refactor, and no migration was touched.

## 4. Function movement map

**Renamed: none.** Every function and variable keeps its original name.

**Moved:** all 85 top-level statements of the original inline script, listed by destination in load order. The hash is of the statement's syntax tree (source positions excluded). It was computed on the original and on the new files; the two sets of 85 hashes are identical, so no statement was altered in the move.

### `theme.js`

| Original order | Kind | Name | Syntax-tree hash (original = new) |
|---:|---|---|---|
| 12 | const | `THEME_KEY` | `bac99014d575` |
| 13 | function | `readStoredTheme` | `dfd893771cd8` |
| 14 | function | `applyTheme` | `bef3704e27b8` |
| 15 | statement run at load | `applyTheme(readStoredTheme()//'light',{persist:fal` | `8f2510213f87` |

### `valuation.js`

| Original order | Kind | Name | Syntax-tree hash (original = new) |
|---:|---|---|---|
| 0 | const | `PICK_VALUES` | `eadc0b129d7e` |
| 1 | const | `POS` | `bbb34c76257a` |
| 2 | const | `TIMING` | `27863d2b3a8b` |
| 3 | const | `CREDIT` | `3cdbe79d1350` |
| 4 | const | `DEV` | `abd82d3bb4f2` |
| 17 | function | `teamName` | `d8b0ff719796` |
| 19 | function | `ageBand` | `012cfcd608fd` |
| 20 | function | `capMult` | `cb4a3db0808e` |
| 21 | function | `control` | `7d5e1dcc1d9b` |
| 22 | function | `role` | `9120f52fbd63` |
| 23 | function | `early` | `258f5a88551c` |
| 24 | function | `aging` | `3f87ceca165d` |
| 25 | function | `scar` | `24c3ec9eb437` |
| 26 | function | `baseValue` | `b2e3f9a11fc5` |
| 27 | function | `qbage` | `79b91c6c1fcc` |
| 28 | function | `values` | `23cbb2c3f218` |
| 29 | function | `totals` | `1a29e9ccc807` |
| 30 | function | `protectionRank` | `650c7213e889` |
| 31 | function | `candidate` | `ade05be756e2` |
| 32 | const | `EPS` | `ca10d253421c` |
| 33 | function | `fallback` | `852d91be7b7b` |
| 34 | function | `verdict` | `cd70d2788f4c` |

### `calculator-ui.js`

| Original order | Kind | Name | Syntax-tree hash (original = new) |
|---:|---|---|---|
| 5 | let | `uid,state` | `6eaf9e46ec55` |
| 16 | const | `$,$$` | `c9d6d9b9d2a8` |
| 18 | function | `emptyAsset` | `5a8e370edb77` |
| 35 | function | `opts` | `a6a6d88a30ec` |
| 36 | function | `esc` | `01f76d6acc1e` |
| 37 | function | `card` | `5e1efa81c683` |
| 38 | function | `snapshotAsset` | `4247df763e51` |
| 39 | function | `tradeSnapshotKey` | `4bb096739017` |
| 40 | function | `buildTradeSnapshot` | `32340b33f1ff` |
| 41 | let | `loggingTrade` | `243ede7a3d15` |
| 42 | let | `lastLoggedSnapshotKey` | `b753af84e00b` |
| 43 | function | `render` | `991de96cb1c0` |
| 44 | function | `bindCards` | `7396cee2372a` |
| 45 | statement run at load | `$$('.add').forEach(b=>b.onclick=()=> {   let side=` | `d191e1c3e679` |
| 46 | statement run at load | `$('#acceptTrade').onclick=async()=> {   if(logging` | `8eaae90bc47b` |
| 56 | statement run at load | `$('#clear').onclick=()=> {   state={A:[],B:[]};   ` | `f9d81c03419a` |
| 57 | statement run at load | `$('#analysisBtn').onclick=()=> {   let a=$('#analy` | `973024c82cb1` |
| 80 | statement run at load | `$$('.tab').forEach(b=>b.onclick=async()=> {   $$('` | `05ef3f831e71` |
| 81 | let | `themeToggle` | `e7d15d4655c6` |
| 82 | statement run at load | `if(themeToggle) {   themeToggle.onclick=()=> {    ` | `68e3ce1b3c1d` |
| 83 | statement run at load | `$('#pickGrid').innerHTML=Object.entries(PICK_VALUE` | `f2e8c1c70706` |
| 84 | statement run at load | `render(); ` | `6d61fb436f5d` |

### `trade-history.js`

| Original order | Kind | Name | Syntax-tree hash (original = new) |
|---:|---|---|---|
| 58 | let | `historyLoaded` | `747710b7166e` |
| 59 | let | `historyRecords` | `92b390751e84` |
| 60 | function | `formatHistoryDate` | `506e210aeb0e` |
| 61 | function | `historyAssetLabel` | `4ffbb1d74108` |
| 62 | function | `historyPackageSummary` | `7a08570f05bb` |
| 63 | function | `historySummaryCard` | `687dcdc65a68` |
| 64 | function | `historyValue` | `8077d66bedae` |
| 65 | function | `historyAssetDetail` | `e4c3fc8dedb2` |
| 66 | function | `historyTradeDetail` | `71ae74d0e143` |
| 67 | function | `showHistoryTrade` | `36d51ddbc9a3` |
| 68 | function | `bindHistoryCards` | `75eb25159051` |
| 79 | async function | `loadTradeHistory` | `fbec4a92a84f` |

### `admin.js`

| Original order | Kind | Name | Syntax-tree hash (original = new) |
|---:|---|---|---|
| 6 | let | `adminSession` | `e42b1f448239` |
| 7 | let | `adminLoginPending` | `961e62b30095` |
| 8 | let | `adminTrades` | `582fd240dd1f` |
| 9 | let | `adminAuditEvents` | `c721b66079a2` |
| 10 | let | `adminDeletedTrades` | `91b0e44ff084` |
| 11 | let | `pendingDeleteTrade` | `873c0909210e` |
| 47 | let | `adminLoginForm` | `bd9a2318ae88` |
| 48 | statement run at load | `if(adminLoginForm) {   adminLoginForm.onsubmit=asy` | `c423e2ba47e3` |
| 49 | let | `lockAdminButton` | `2b01607c8a98` |
| 50 | statement run at load | `if(lockAdminButton) {   lockAdminButton.onclick=lo` | `ed691137d3a5` |
| 51 | let | `cancelDeleteButton` | `b3ffbb32efee` |
| 52 | statement run at load | `if(cancelDeleteButton) {   cancelDeleteButton.oncl` | `0d4f28b5d84e` |
| 53 | let | `adminDeleteForm` | `e6dfa87572b3` |
| 54 | statement run at load | `if(adminDeleteForm) {   adminDeleteForm.onsubmit=a` | `33d550cb1e6d` |
| 55 | statement run at load | `renderAdminState(); $('#clear').onclick=()=> {   s` | `0eaba3f65e38` |
| 69 | function | `adminSessionIsValid` | `5e795a4d6af7` |
| 70 | function | `adminTradeCard` | `1c7a6c40d34d` |
| 71 | async function | `loadAdminTrades` | `6d1b868b6de2` |
| 72 | function | `adminAuditCard` | `c3f47429b8f2` |
| 73 | async function | `loadAdminAuditLog` | `5e0706f4ceca` |
| 74 | function | `closeDeleteConfirmation` | `869d274cbeca` |
| 75 | function | `openDeleteConfirmation` | `ba7f428fae74` |
| 76 | function | `bindAdminTradeCards` | `5282dc182018` |
| 77 | function | `renderAdminState` | `8904cf4019e7` |
| 78 | function | `lockAdmin` | `53eb34320013` |

Two ordering effects of the split, each checked by test:
- `renderAdminState()` (touches only the Admin lock panel) now runs after the first `render()` (touches only the calculator panel); previously it ran just before it.
- The constant `EPS` sits with the other governed constants in `valuation.js` instead of between two functions. It is a numeric literal; no ordering effect.

## 5. Removed-code list

**Nothing was removed.** A scope-aware reference scan found every top-level function and variable referenced elsewhere, so there were no unused names, and no unreachable code was found or deleted.

Behavior-neutral text-only changes (no tokens added or removed):
- whitespace and line breaks; `}else{` written as `} else {`; a space before block `{`;
- CSS: one declaration per line, a space after each property colon, a `;` after the last declaration of each rule;
- long prose in HTML elements without an `id` wrapped at existing spaces;
- inline `<style>` replaced by one stylesheet link; inline `<script>` replaced by five script tags;
- header comments added to each JavaScript file (none inside any function).

## 6. Governed-constant comparison

Syntax-tree hash of each governed constant in the original script and in the new files:

| Constant | Original | New | Result |
|---|---|---|---|
| `PICK_VALUES` | `eadc0b129d7e` | `eadc0b129d7e` | identical |
| `POS` | `bbb34c76257a` | `bbb34c76257a` | identical |
| `TIMING` | `27863d2b3a8b` | `27863d2b3a8b` | identical |
| `CREDIT` | `3cdbe79d1350` | `3cdbe79d1350` | identical |
| `DEV` | `abd82d3bb4f2` | `abd82d3bb4f2` | identical |
| `EPS` | `ca10d253421c` | `ca10d253421c` | identical |

Package credits are `CREDIT = [1, .9, .75, .6, .5, .5]` (1.00, 0.90, 0.75, 0.60, 0.50, 0.50) in both.

The 16 valuation functions, which hold every multiplier and the 8%, 12% and 22% boundaries:

| Function | Original | New | Result |
|---|---|---|---|
| `teamName` | `d8b0ff719796` | `d8b0ff719796` | identical |
| `ageBand` | `012cfcd608fd` | `012cfcd608fd` | identical |
| `capMult` | `cb4a3db0808e` | `cb4a3db0808e` | identical |
| `control` | `7d5e1dcc1d9b` | `7d5e1dcc1d9b` | identical |
| `role` | `9120f52fbd63` | `9120f52fbd63` | identical |
| `early` | `258f5a88551c` | `258f5a88551c` | identical |
| `aging` | `3f87ceca165d` | `3f87ceca165d` | identical |
| `scar` | `24c3ec9eb437` | `24c3ec9eb437` | identical |
| `baseValue` | `b2e3f9a11fc5` | `b2e3f9a11fc5` | identical |
| `qbage` | `79b91c6c1fcc` | `79b91c6c1fcc` | identical |
| `values` | `23cbb2c3f218` | `23cbb2c3f218` | identical |
| `totals` | `1a29e9ccc807` | `1a29e9ccc807` | identical |
| `protectionRank` | `650c7213e889` | `650c7213e889` | identical |
| `candidate` | `ade05be756e2` | `ade05be756e2` | identical |
| `fallback` | `852d91be7b7b` | `852d91be7b7b` | identical |
| `verdict` | `cd70d2788f4c` | `cd70d2788f4c` | identical |

Numeric literals across those 16 functions: original 124, new 124, same sequence: **true**.

Release metadata (unchanged): `web_release:'v1.4.0'`, `ruleset_version:'v4.2'`, and the visible label "Web Release v1.4.0 · Ruleset v4.2".

## 7. Snapshot-schema comparison

Accepted-Trade snapshot builders, original vs new:

| Function | Original | New | Result |
|---|---|---|---|
| `snapshotAsset` | `4247df763e51` | `4247df763e51` | identical |
| `tradeSnapshotKey` | `4bb096739017` | `4bb096739017` | identical |
| `buildTradeSnapshot` | `32340b33f1ff` | `32340b33f1ff` | identical |

Property names defined in `buildTradeSnapshot` (original = new: **true**):

`adjusted_gap`, `cpu_adjusted_value`, `cpu_raw_value`, `cpu_team_assets`, `evaluation_mode`, `fair_maximum`, `label`, `protection_tier`, `required_target`, `ruleset_version`, `suggested_correction`, `trade_intelligence`, `user_adjusted_value`, `user_raw_value`, `user_team_assets`, `value`, `verdict`, `web_release`

Property names defined in `snapshotAsset` (original = new: **true**):

`age`, `cap`, `current`, `dev`, `id`, `league`, `name`, `ovr`, `pick`, `pos`, `projected`, `timing`, `type`, `value`, `years`

Backend call sites (name, argument count, argument syntax trees): 6 in the original, 6 in the new files, identical: **true**. Methods: `acceptTrade`, `adminLogin`, `deleteTrade` (`{ token, tradeId, administratorName, reason }`), `getActiveTrades`, `getAdminAuditLog`. Persisted field names and the request shapes the browser sends are therefore unchanged. The backend itself (function responses, tables, columns, migrations) was not provided and could not be compared.

## 8. Script load order

`index.html` loads, in this order, all as classic synchronous scripts:

1. `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`, `./supabase-config.js`, `./storage.js` (existing, unchanged order)
2. `./theme.js` - applies the stored Light/Dark preference at once. No dependencies.
3. `./valuation.js` - governed constants and valuation functions. Only defines things; at call time it reads the `state` object declared in the next file.
4. `./calculator-ui.js` - declares `$`, `$$` and `state`, builds the snapshot, defines `render`, registers calculator events, wires the theme toggle, and ends with the first `render()`. Everything `render()` needs is declared in this file or the two before it.
5. `./trade-history.js` - declares history state and functions; the Admin file resets its variables after a deletion.
6. `./admin.js` - declares Admin state and functions, registers Admin events, ends with `renderAdminState()`. It uses `$` from step 4, so it must load after it.

Why it works: classic scripts share one global scope, so top-level `let`, `const` and function declarations behave exactly as in the single inline script. Cross-file references happen only when functions run (after all files have loaded) or, for statements that run at load, only to names declared in an earlier file. A scope-aware checker verified this for all 85 statements; as a negative control, loading `admin.js` before `calculator-ui.js` is correctly reported as broken. Do not add `defer`, `async` or `type="module"` without re-testing, and do not reorder the tags.

## 9. Syntax and lint output

`node --check` on every changed JavaScript file:

```text
$ node --check out/theme.js
  exit 0 (no syntax errors)
$ node --check out/valuation.js
  exit 0 (no syntax errors)
$ node --check out/calculator-ui.js
  exit 0 (no syntax errors)
$ node --check out/trade-history.js
  exit 0 (no syntax errors)
$ node --check out/admin.js
  exit 0 (no syntax errors)
```

Static equivalence and load-order verification:

```text
1. statements: original 85, new 85; identical multiset of ASTs: true
2. load-order problems: none (every load-time use is declared in an earlier statement or earlier file)
3. governed constants identical: PICK_VALUES:true POS:true TIMING:true CREDIT:true DEV:true EPS:true
   numeric literals in the 16 valuation functions: original 124, new 124, identical sequence: true
4. snapshot builders identical: snapshotAsset:true tradeSnapshotKey:true buildTradeSnapshot:true
5. MaddenStorage call sites: 6 original, 6 new; identical: true -> acceptTrade, adminLogin, deleteTrade, getActiveTrades, getAdminAuditLog
```

TypeScript checker (allowJs and checkJs) over the five files as one global program, original single script vs refactored:

```text
original (single script): total diagnostics 11; undeclared-name / use-before-declare / syntax errors: 0
refactored (5 scripts as one global program): total diagnostics 11; undeclared-name / use-before-declare / syntax errors: 0
other diagnostic categories (type-inference noise, e.g. dynamic property access) - original vs refactored: {"2339":11} {"2339":11}
```

Code 2339 is the checker's note about reading properties off `window`; the identical 11 occur in the original, so none is introduced by the refactor. ESLint was not available offline and was **not run**. No TypeScript files exist in the package.

## 10. Automated tests executed

Run in headless Chromium against the uploaded original and the refactored build with identical inputs, using a mocked `window.MaddenStorage` (no real Supabase calls).

Rendering comparison, every element's position, size and text:

```text
compared 30 views (3 widths x 5 tabs x 2 themes), ~312 elements each: 0 differences
page errors original : []
page errors formatted: []
```

Behavior comparison (valuation fuzz, rendered UI, Accept & Log, History, Admin, theme):

```text
load errors  original: []  refactored: []
1. valuation fuzz: 6300 trades (totals, verdict incl. correction text, snapshot) -> 0 differences
   coverage: modes {"DIRECTIONAL":3757,"INCOMPLETE":2065,"NO_ELIGIBLE_PLAYER":170,"DRAFT_ONLY":86,"POSITIVE_PLAYER_TIE":222} | verdicts {"LEAGUE-BREAKING":3154,"ADD ASSETS":2065,"QUESTIONABLE":358,"UNFAIR":312,"FAIR":411}
2. rendered calculator UI (all 7 Trade Intelligence reads, cards, buttons, geometry): 300 trades -> 0 differences
3. Accept & Log flow (payload sent, duplicate protection, button/status text): identical
   acceptTrade calls made in original flow: 1 (second click on the disabled button did nothing)
4. History tab, Admin login (reject/accept), in-memory-only token, lock, theme toggle + localStorage contents: identical
   localStorage after session: {"madden-trade-theme":"dark"} (theme preference only; no token)
runtime errors during all tests  original: []  refactored: []
```

Encoding scan of the package: see section 2.

The automated tests above were executed on the package files before installation, in an environment that did not contain `storage.js`, `supabase-config.js` or `supabase/`; backend calls were mocked. They are not a substitute for real-backend smoke validation.

## 11. Repository installation, snapshot and commit hash

The structural-refactor package has been installed in the Madden League Trade
Calculator repository on:

`refactor/v1.4.0-code-cleanup`

A fresh integrated repository snapshot was generated from the working tree
after installation and pre-commit validation.

The snapshot confirms the integrated presence of:

- `index.html`
- `styles.css`
- `theme.js`
- `valuation.js`
- `calculator-ui.js`
- `trade-history.js`
- `admin.js`
- `storage.js`
- `supabase-config.js`

The refactor has not been merged into `main`.

The refactored browser source remains subject to real-backend smoke validation
and the final maintenance merge gate.

**Commit hash:** Pending initial refactor commit.

## 12. Diff for independent review

A complete unified Git diff (`git diff main refactor` format, with `diff --git` headers and blob hashes) from the uploaded monolithic `index.html` to the seven source files in section 3 was generated as `REFACTOR_DIFF.txt`. It was checked by applying it to a clean copy of the uploaded `index.html` with `git apply`; all seven resulting files were byte-for-byte identical to the package. The commits used to produce it were scratch commits and their hashes are not repository hashes.

That file is a **temporary review artifact** and is not part of the intended commit. The actual source diff is preserved by the repository's commit history, and this audit is the permanent evidence.

Because code moved between files, the source diff mostly shows relocation. For the JavaScript, the syntax-tree hash tables in sections 4, 6 and 7 are the efficient review method: any hash can be recomputed on both versions.

## 13. Tests that still require manual or external execution

1. Real Supabase round trips with the actual `storage.js` and `supabase-config.js`: Accept & Log, Trade History, Admin login, audit log, deletion.
2. Backend guarantees: server-side authorization and token expiry, logical deletion, atomic `TRADE_DELETED` audit write, row-level security, migrations (none inspected, none modified).
3. Your own valuation regression suite against the deployed build. The established release regression suite (24/24 regression, 17/17 parity) was **not** rerun against the refactor. Those figures belong to the released monolithic build and must not be presented as rerun unless they actually are.
4. Browsers other than Chromium (Safari, Firefox), real phones, and a screen-reader pass for the preserved ARIA attributes.
5. Deployment: publish all seven files together with `storage.js` and `supabase-config.js`; confirm the host serves `styles.css` and the five new scripts as UTF-8 (or with no charset, since the page declares UTF-8) and that no content-security policy blocks them.
6. Light/Dark first paint on a slow connection (theme is applied by the first script after the markup, as before).
7. Open the final files in your editor/CI as UTF-8 and confirm `git diff` shows no encoding changes.
8. Confirm the installed files match the package: the SHA-256 of each of the seven source files in the repository should begin with the 16 characters listed in section 3.
9. Real-backend smoke validation of the installed refactor (status: pending).

## 14. Items flagged for separate review (not changed)

1. Descriptive renames (`control`, `role`, `early`, `aging`, `scar`, `qbage`, `opts`, `esc`, `card`, `candidate`, `fallback`, `values`). They touch governed code, and `applyTheme` has a local `control` that shadows the global valuation function `control`; use a scope-aware tool plus a syntax-tree comparison.
2. Deeply nested ternaries (the Primary Read string in `render`, the Suggested Correction expression in `verdict`, the Trade Intelligence reads).
3. Duplicated logic: Primary Read and Trade Intelligence appear in both `render` and `buildTradeSnapshot`; the Accept-button enable expression appears in `render` and the accept handler. Consolidating risks drifting frozen snapshot wording.
4. Duplicate-state protection in the click handler only guards an in-flight request; after logging, protection comes from the disabled button. This is original behavior; the backend should be the authority.
5. The theme toggle wiring lives in `calculator-ui.js` because it uses the shared `$` helper declared there.
6. About 16 long lines remain (HTML template literals and ternary chains), left intact so generated markup is unchanged.
7. Optional hardening against the encoding problem: an `.editorconfig` with `charset = utf-8` and a `.gitattributes` entry. Not added, since that is a new repository file.

## Final Integrated Validation

Following installation of the modular source on
`refactor/v1.4.0-code-cleanup`, final integrated validation was completed.

- Real browser smoke: **PASS**
- Real Supabase Accept & Log: **PASS**
- Duplicate-state protection: **PASS**
- Public Trade History: **PASS**
- Frozen historical detail: **PASS**
- Admin authentication: **PASS**
- Active Trades: **PASS**
- Protected Audit Log: **PASS**
- Light/Dark Mode and preference persistence: **PASS**
- Browser console/runtime review: **PASS**
- Governed Ruleset v4.2 regression against modular `valuation.js`:
  **24 / 24 PASS**

No behavioral, persistence, administrative, or valuation regression was
identified.

**Final refactor validation decision: PASS**