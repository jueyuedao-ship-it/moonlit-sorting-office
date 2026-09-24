# Task 1: Game Engine and Balance Report

Date: 2026-09-23

## Scope

Replaced `src/game.js` with the pure incremental-game engine and replaced the old sorting tests with `tests/game.test.js`. Added `tests/balance.test.js` for a deterministic two-cycle progression simulation. No storage, presenter, application UI, PWA, or release files were changed.

The shared game state is:

```text
{
  version,
  moonlight,
  stars,
  runMoonEarned,
  runStarsEarned,
  lifetime: { memories, prestiges },
  generators: { lantern, observatory, moonring, garden, starCondenser },
  upgrades: { clickPower, moonlightProduction, starBlessing },
  lastUpdatedAt
}
```

`runStarsEarned` is separate from current `stars`, so spending stars cannot reverse prestige progress. The required interface is exported along with `GENERATOR_CATALOG`, `UPGRADE_CATALOG`, `GAME_VERSION`, and `MAX_OFFLINE_SECONDS`. `getProduction` returns `moonlightPerSecond`, `starsPerSecond`, `clickAmount`, and the derived `permanentMultiplier`.

## Test-Driven Development Record

Tests were written before changing `src/game.js`.

RED command:

```text
node --test tests/game.test.js tests/balance.test.js
```

Result: 17 tests failed, 0 passed. The failures were assertion failures because the new interface was absent, starting with `advance must be exported by the game engine`; there were no import or runtime errors.

After implementing the engine, the same command passed all 17 tests. It was run again after adding the concrete catalog assertions and the simulation diagnostic; all 17 still passed. The balance test reports the simulated times described below.

## Implemented Behavior

- A fresh click grants 1 moonlight. Generator production is calculated from owned units and the defined production multipliers.
- The four moonlight generators use IDs `lantern`, `observatory`, `moonring`, and `garden`, with the specified base costs and rates. Their next-unit price is `ceil(baseCost * 1.15 ** ownedCount)`.
- The star condenser uses ID `starCondenser`, unlocks at 5,000 run moonlight, costs 10,000 moonlight for its first unit, and produces 0.05 stars per second. Additional condensers use the same 1.15 cost growth curve.
- Moonlight upgrade costs are 25 for doubled click power and 180 for doubled equipment production. The 10-star blessing doubles moonlight equipment production. Upgrade and generator unlock thresholds are catalog data.
- Prestige requires at least 100,000 run moonlight and 25 run stars earned. It awards `max(1, floor(sqrt(runMoonEarned / 100000)))` memories, resets the run, preserves lifetime totals, and applies `1 + 0.25 * memories` to clicks and moonlight equipment.
- `advance` calculates elapsed time from `lastUpdatedAt`, caps each accrual interval at eight hours, and advances the timestamp so the same interval cannot be paid twice.
- State validation rejects malformed versions, negative or non-finite resources, invalid generator counts, and non-boolean upgrade flags. All state-changing operations return new objects and leave their input unchanged; invalid or unaffordable actions return the original state.

## Balance Simulation

The deterministic strategy clicks once per simulated second, collects one second of production, then buys one affordable upgrade or the highest-tier affordable generator. It buys one star condenser as soon as that unit is unlocked and affordable. The same strategy is used after the first prestige.

- First prestige: 1,713 simulated seconds (28 minutes 33 seconds).
- Second prestige: 1,085 simulated seconds (18 minutes 5 seconds).
- Improvement: 628 seconds, or about 36.7% faster.

Both cycles reached the requirements within the test's two-hour limit.

## Verification Results

Focused engine and balance command:

```text
node --test tests/game.test.js tests/balance.test.js
17 passed, 0 failed
```

The requested full-suite run was performed once with `npm test`:

```text
32 tests total, 30 passed, 2 failed
```

The two expected cross-task failures are:

- `tests/presenter.test.js`: its sorting-era import requests `DESTINATIONS` from `src/game.js`, which Task 1 replaced.
- `tests/storage.test.js`: its sorting-era import also requests `DESTINATIONS` and the old classification functions.

Both fail during module import, before their assertions run. They belong to the storage/presenter integration boundary and are expected to be replaced under Task 2. The new engine/balance tests, header-status test, and PWA tests passed in the full run.

## Self-Review and Remaining Decisions

- The engine is deterministic for a supplied timestamp and has no browser, storage, or external dependencies.
- Resource gains are checked for finiteness before a transition is returned. Offline earnings cannot exceed eight hours per advance.
- Stable IDs and catalog data are available for downstream storage and presentation.
- The design specified base prices, production rates, and prestige thresholds, but not every unlock threshold or upgrade price. This implementation uses observatory / moonring / garden unlocks at 60 / 750 / 9,000 run moonlight, click / equipment upgrades at 25 / 180 moonlight, and a 10-star equipment blessing. These are explicit catalog choices and can be tuned without changing state-transition interfaces.
- The design gives the star condenser's initial 10,000-moonlight price but does not explicitly define later-unit pricing. This implementation applies the same 1.15 growth curve to later units; that is the main balance assumption to revisit if the UI should encourage multiple condensers differently.
- The full suite still includes sorting-specific storage and presenter consumers. They need the planned Task 2 replacement before the repository suite can be fully green.
