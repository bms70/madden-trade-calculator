# Madden League Trade Calculator

A free, single-page web calculator for grading trades in a Madden league. Enter what each team receives, and it values every asset, applies the league's trade rules, and returns a verdict with a plain-language explanation.

Version: **v3.3**
Live site: `https://bms70.github.io/madden-trade-calculator/`

## How to use it

1. Pick a tab (**Trade 1**, **Trade 2** or **Trade 3**) so you can compare up to three scenarios side by side.
2. Under **Team A receives** and **Team B receives**, add the assets each team is getting. Each side holds up to 9 assets.
3. For each asset, choose **Player** or **Draft Pick**.
   - **Player:** enter OVR, age, position, dev trait, cap hit ($M), years remaining, years in league, current role and projected role. A rookie is in **Year 0**.
   - **Draft Pick:** choose the pick and its timing (current draft, next year or two years away).
4. Watch the asset values, adjusted totals, verdict and explanation update as you type.

A player row needs OVR, age, position and dev trait before it counts toward the totals. Until then it shows a reminder and is left out.

Your entries are saved in your own browser, so they are still there when you come back. They are not shared with anyone else and are not stored on a server. **Clear this trade** resets the tab you are on.

## How trades are valued

**Players** start from (OVR − 60) and are multiplied by:

- Dev trait and age band
- Position scarcity (QB 1.40, EDGE 1.20, CB/WR 1.15, LT 1.10, DT 1.05, TE/S 1.00, LB 0.95, HB/IOL 0.90, FB/K/P 0.50)
- Cap-hit tier (separate QB and non-QB scales, from Great 1.15× to Very Expensive 0.80×)
- Franchise Cornerstone premium (age 26 or younger, 87+ OVR, Superstar or X-Factor): 1.25×
- Early-career premium: Year 0 1.50×, Year 1 1.30×, Year 2 1.15×, Year 3+ 1.00×
- Role change (Starter to Backup 0.85×, Backup to Starter 0.95×, Backup to Backup 0.75×)
- Aging-70s penalty for 70–79 OVR players aged 31 and older
- Contract control by years remaining (1.00× to 1.34×), reduced for Expensive contracts and removed for Very Expensive ones
- QB-versus-QB age comparison when both sides include a QB

**Draft picks** use a base value (for example 1.01–1.05 is 70) multiplied by timing: 1.00× current, 0.85× next year, 0.70× two years away. Future 1sts use Early, Mid, Late or Unknown base values.

**Package quality:** on each side, assets are ranked by value and receive 100%, 90%, 75%, 60%, then 50% credit. This stops a pile of small assets from matching a star.

## How the verdict works

- **FAIR** when each side's adjusted total meets the required return for the other side's premium assets (1.10× by default, 1.20× for a Franchise Cornerstone, 1.30× for an elite QB aged 26 or younger with 90+ OVR and Superstar or X-Factor).
- If not FAIR, the value difference sets the grade: under 12% is **QUESTIONABLE**, under 22% is **UNFAIR**, and 22% or more is **LEAGUE-BREAKING**.
- The explanation under the verdict names the main reason: elite QB protection, cornerstone protection, quantity-for-quality, or the size of the gap.

## Updating the calculator

This is a single file, `index.html`. All rule tables are at the top of the script section, so most rule changes mean editing a few numbers.

1. Open `index.html` in this repository and click the pencil icon.
2. Make the change and commit it.
3. The live site refreshes within a minute or two.

Every commit is saved in the repository history, so any earlier version can be viewed or restored.

## Version history

| Version | Summary |
| --- | --- |
| v3.3 | Trade explanations and elite-QB protection (1.30× required return); rebuilt as a web app |
| v3.1–v3.2 | Blockbuster protection, package quality, three calculators, documentation rebuild |
| v3.0 | Contract, rookie, role, aging and QB-age model |
| v2.x | Tighter verdict bands, current-year pick values, layout cleanup |
| v1.x | Original calculator, early-career premium |

## Hosting

The site is hosted on GitHub Pages from the `main` branch. There is no build step and nothing to install.

## Credits

Originally built as an Excel workbook, `Madden League Trade Calculator v3.3`, and ported here with the same rules.
