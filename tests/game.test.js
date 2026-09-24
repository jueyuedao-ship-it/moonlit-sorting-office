import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/game.js';

const {
  GAME_VERSION,
  GENERATOR_CATALOG,
  UPGRADE_CATALOG,
  advance,
  buyGenerator,
  buyUpgrade,
  canPrestige,
  click,
  createGame,
  getGeneratorCost,
  getProduction,
  isGameState,
  isGeneratorUnlocked,
  isUpgradeUnlocked,
  prestige
} = engine;

function assertEngineApi() {
  for (const name of [
    'advance', 'buyGenerator', 'buyUpgrade', 'canPrestige', 'click', 'createGame',
    'getGeneratorCost', 'getProduction', 'isGameState', 'isGeneratorUnlocked',
    'isUpgradeUnlocked', 'prestige'
  ]) {
    assert.equal(typeof engine[name], 'function', `${name} must be exported by the game engine`);
  }
  for (const name of ['GAME_VERSION', 'GENERATOR_CATALOG', 'MAX_OFFLINE_SECONDS', 'UPGRADE_CATALOG']) {
    assert.ok(engine[name] !== undefined, `${name} must be exported by the game engine`);
  }
}

function gameTest(name, body) {
  test(name, () => {
    assertEngineApi();
    body();
  });
}

function earnClicks(state, count) {
  let next = state;
  for (let index = 0; index < count; index += 1) next = click(next);
  return next;
}

function withProgress(state, changes) {
  const next = { ...state, ...changes };
  assert.equal(isGameState(next), true, 'the fixture must be a valid save state');
  return next;
}

gameTest('a fresh game starts at zero and the first click earns one moonlight', () => {
  const state = createGame(1_000);
  const next = click(state);

  assert.equal(state.moonlight, 0);
  assert.equal(next.moonlight, 1);
  assert.equal(next.runMoonEarned, 1);
  assert.equal(next.lastUpdatedAt, 1_000);
  assert.equal(isGameState(next), true);
});

gameTest('the next generator price rises by the documented 15 percent rule', () => {
  let state = earnClicks(createGame(0), 15);
  assert.equal(getGeneratorCost(state, 'lantern'), 15);

  state = buyGenerator(state, 'lantern');
  assert.equal(state.generators.lantern, 1);
  assert.equal(getGeneratorCost(state, 'lantern'), 18);

  state = earnClicks(state, 18);
  state = buyGenerator(state, 'lantern');
  assert.equal(state.generators.lantern, 2);
  assert.equal(getGeneratorCost(state, 'lantern'), 20);
});

gameTest('an unaffordable or unknown generator purchase leaves the state unchanged', () => {
  const state = createGame(0);
  assert.equal(buyGenerator(state, 'lantern'), state);
  assert.equal(buyGenerator(state, 'unknown'), state);
  assert.equal(state.generators.lantern, 0);
  assert.equal(getGeneratorCost(state, 'unknown'), null);
});

gameTest('buying a generator at the maximum safe count leaves the valid state unchanged', () => {
  const state = withProgress(createGame(0), {
    moonlight: Number.MAX_VALUE,
    runMoonEarned: Number.MAX_VALUE,
    generators: { ...createGame(0).generators, lantern: Number.MAX_SAFE_INTEGER }
  });

  assert.equal(getGeneratorCost(state, 'lantern'), Number.MAX_VALUE);
  assert.equal(buyGenerator(state, 'lantern'), state);
  assert.equal(state.generators.lantern, Number.MAX_SAFE_INTEGER);
  assert.equal(state.moonlight, Number.MAX_VALUE);
  assert.equal(isGameState(state), true);
});

gameTest('a lantern produces 0.2 moonlight per second and accrual counts as run earnings', () => {
  let state = earnClicks(createGame(0), 15);
  state = buyGenerator(state, 'lantern');

  const next = advance(state, 5_000);
  assert.equal(next.moonlight, 1);
  assert.equal(next.runMoonEarned, 16);
  assert.equal(getProduction(next).moonlightPerSecond, 0.2);
  assert.equal(state.moonlight, 0);
});

gameTest('generator cards unlock from run progress, including the star condenser at 5,000', () => {
  const initial = createGame(0);
  assert.equal(isGeneratorUnlocked(initial, 'lantern'), true);
  assert.equal(isGeneratorUnlocked(initial, 'observatory'), false);
  assert.equal(isGeneratorUnlocked(initial, 'starCondenser'), false);

  const observatoryReady = withProgress(initial, { moonlight: 60, runMoonEarned: 60 });
  assert.equal(isGeneratorUnlocked(observatoryReady, 'observatory'), true);

  const justBeforeStars = withProgress(initial, { moonlight: 4_999, runMoonEarned: 4_999 });
  const starsUnlocked = withProgress(initial, { moonlight: 5_000, runMoonEarned: 5_000 });
  assert.equal(isGeneratorUnlocked(justBeforeStars, 'starCondenser'), false);
  assert.equal(isGeneratorUnlocked(starsUnlocked, 'starCondenser'), true);
});

gameTest('the star condenser costs 10,000 moonlight and produces 0.05 stars per second', () => {
  const funded = withProgress(createGame(0), { moonlight: 10_000, runMoonEarned: 10_000 });
  assert.equal(getGeneratorCost(funded, 'starCondenser'), 10_000);

  const bought = buyGenerator(funded, 'starCondenser');
  assert.equal(bought.moonlight, 0);
  assert.equal(bought.generators.starCondenser, 1);

  const next = advance(bought, 20_000);
  assert.equal(next.stars, 1);
  assert.equal(next.runStarsEarned, 1);
  assert.equal(getProduction(next).starsPerSecond, 0.05);
});

gameTest('moonlight upgrades unlock from progress and the click upgrade doubles the next click', () => {
  let state = earnClicks(createGame(0), 25);
  assert.equal(isUpgradeUnlocked(state, 'clickPower'), true);
  assert.equal(state.moonlight, UPGRADE_CATALOG.clickPower.cost);

  state = buyUpgrade(state, 'clickPower');
  assert.equal(state.moonlight, 0);
  assert.equal(state.upgrades.clickPower, true);

  state = click(state);
  assert.equal(state.moonlight, 2);
  assert.equal(state.runMoonEarned, 27);
});

gameTest('the moonlight production upgrade doubles equipment production', () => {
  let state = earnClicks(createGame(0), 195);
  state = buyGenerator(state, 'lantern');
  assert.equal(state.moonlight, 180);
  assert.equal(getProduction(state).moonlightPerSecond, 0.2);

  state = buyUpgrade(state, 'moonlightProduction');
  assert.equal(state.moonlight, 0);
  assert.equal(getProduction(state).moonlightPerSecond, 0.4);
});

gameTest('a 10-star blessing doubles moonlight equipment and spending stars preserves run progress', () => {
  let state = withProgress(createGame(0), {
    moonlight: 10_025,
    runMoonEarned: 10_025
  });
  state = buyGenerator(state, 'lantern');
  state = buyGenerator(state, 'starCondenser');
  state = advance(state, 200_000);

  assert.equal(state.stars, 10);
  assert.equal(state.runStarsEarned, 10);
  assert.equal(getProduction(state).moonlightPerSecond, 0.2);

  state = buyUpgrade(state, 'starBlessing');
  assert.equal(state.stars, 0);
  assert.equal(state.runStarsEarned, 10);
  assert.equal(getProduction(state).moonlightPerSecond, 0.4);
});

gameTest('prestige requires 100,000 run moonlight and 25 run stars, even after stars are spent', () => {
  const initial = createGame(0);
  const moonlightShort = withProgress(initial, {
    moonlight: 99_999,
    runMoonEarned: 99_999,
    stars: 25,
    runStarsEarned: 25
  });
  const starsShort = withProgress(initial, {
    moonlight: 100_000,
    runMoonEarned: 100_000,
    stars: 0,
    runStarsEarned: 24
  });
  const eligibleAfterSpending = withProgress(initial, {
    moonlight: 100_000,
    runMoonEarned: 100_000,
    stars: 0,
    runStarsEarned: 25
  });

  assert.equal(canPrestige(moonlightShort), false);
  assert.equal(canPrestige(starsShort), false);
  assert.equal(canPrestige(eligibleAfterSpending), true);
  assert.equal(prestige(moonlightShort), moonlightShort);
});

gameTest('prestige resets the run, grants square-root memories, and applies the permanent multiplier', () => {
  const initial = createGame(123);
  const eligible = withProgress(initial, {
    moonlight: 2_000,
    stars: 30,
    runMoonEarned: 400_000,
    runStarsEarned: 40,
    lifetime: { memories: 2, prestiges: 2 },
    generators: { ...initial.generators, lantern: 2, observatory: 1, starCondenser: 1 },
    upgrades: { ...initial.upgrades, clickPower: true, moonlightProduction: true, starBlessing: true }
  });

  const next = prestige(eligible);
  assert.equal(next.moonlight, 0);
  assert.equal(next.stars, 0);
  assert.equal(next.runMoonEarned, 0);
  assert.equal(next.runStarsEarned, 0);
  assert.deepEqual(next.generators, {
    lantern: 0,
    observatory: 0,
    moonring: 0,
    garden: 0,
    starCondenser: 0
  });
  assert.deepEqual(next.upgrades, { clickPower: false, moonlightProduction: false, starBlessing: false });
  assert.deepEqual(next.lifetime, { memories: 4, prestiges: 3 });
  assert.equal(getProduction(next).permanentMultiplier, 2);
  assert.equal(click(next).moonlight, 2);
  assert.equal(eligible.moonlight, 2_000);
});

gameTest('offline accrual is capped at eight hours and the same timestamp cannot pay twice', () => {
  let state = earnClicks(createGame(0), 15);
  state = buyGenerator(state, 'lantern');

  const resumedAt = 8 * 60 * 60 * 1_000 + 10_000;
  state = advance(state, resumedAt);
  assert.equal(state.moonlight, 5_760);
  assert.equal(state.lastUpdatedAt, resumedAt);

  const repeated = advance(state, resumedAt);
  assert.equal(repeated, state);
});

gameTest('time going backwards and invalid timestamps do not mutate a game', () => {
  const state = createGame(5_000);
  assert.equal(advance(state, 4_000), state);
  assert.equal(advance(state, Number.NaN), state);
  assert.equal(advance(state, Number.POSITIVE_INFINITY), state);
});

gameTest('game state validation rejects non-finite resources and malformed save fields', () => {
  const state = createGame(0);
  assert.equal(isGameState(state), true);
  assert.equal(isGameState({ ...state, moonlight: Number.NaN }), false);
  assert.equal(isGameState({ ...state, stars: -1 }), false);
  assert.equal(isGameState({ ...state, runMoonEarned: Number.POSITIVE_INFINITY }), false);
  assert.equal(isGameState({ ...state, version: GAME_VERSION + 1 }), false);
  assert.equal(isGameState({ ...state, generators: { ...state.generators, lantern: 0.5 } }), false);
  assert.equal(isGameState({ ...state, upgrades: { ...state.upgrades, clickPower: 1 } }), false);
});

gameTest('invalid states are rejected by every transition without mutation', () => {
  const invalid = { ...createGame(0), moonlight: Number.NaN };
  assert.equal(click(invalid), invalid);
  assert.equal(buyGenerator(invalid, 'lantern'), invalid);
  assert.equal(buyUpgrade(invalid, 'clickPower'), invalid);
  assert.equal(advance(invalid, 1_000), invalid);
  assert.equal(prestige(invalid), invalid);
  assert.equal(isGeneratorUnlocked(invalid, 'lantern'), false);
  assert.equal(isUpgradeUnlocked(invalid, 'clickPower'), false);
});

gameTest('catalogs expose all four moonlight generators and the second-resource generator', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(GENERATOR_CATALOG).map(([id, generator]) => [id, {
      baseCost: generator.baseCost,
      outputResource: generator.outputResource,
      productionPerSecond: generator.productionPerSecond
    }])),
    {
      lantern: { baseCost: 15, outputResource: 'moonlight', productionPerSecond: 0.2 },
      observatory: { baseCost: 180, outputResource: 'moonlight', productionPerSecond: 2.5 },
      moonring: { baseCost: 2_400, outputResource: 'moonlight', productionPerSecond: 30 },
      garden: { baseCost: 36_000, outputResource: 'moonlight', productionPerSecond: 400 },
      starCondenser: { baseCost: 10_000, outputResource: 'stars', productionPerSecond: 0.05 }
    }
  );
  assert.deepEqual(Object.keys(UPGRADE_CATALOG), [
    'clickPower', 'moonlightProduction', 'starBlessing'
  ]);
  assert.equal(GAME_VERSION, 1);
});
