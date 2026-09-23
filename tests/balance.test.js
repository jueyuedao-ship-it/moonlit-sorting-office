import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/game.js';

function assertEngineApi() {
  for (const name of [
    'advance', 'buyGenerator', 'buyUpgrade', 'canPrestige', 'click', 'createGame',
    'getGeneratorCost', 'isGeneratorUnlocked', 'isUpgradeUnlocked', 'prestige'
  ]) {
    assert.equal(typeof engine[name], 'function', `${name} must be exported by the game engine`);
  }
}

function buyOneUsefulThing(state) {
  for (const id of ['clickPower', 'moonlightProduction', 'starBlessing']) {
    if (state.upgrades[id] || !engine.isUpgradeUnlocked(state, id)) continue;
    const next = engine.buyUpgrade(state, id);
    if (next !== state) return next;
  }

  if (state.generators.starCondenser === 0
      && engine.isGeneratorUnlocked(state, 'starCondenser')) {
    const next = engine.buyGenerator(state, 'starCondenser');
    if (next !== state) return next;
  }

  for (const id of ['garden', 'moonring', 'observatory', 'lantern']) {
    if (!engine.isGeneratorUnlocked(state, id)) continue;
    const next = engine.buyGenerator(state, id);
    if (next !== state) return next;
  }
  return state;
}

// Strategy: click once per simulated second, collect one second of production,
// then buy one affordable upgrade or the highest-tier affordable generator.
function simulateUntilPrestige(start, limitSeconds = 7_200) {
  let state = start;
  let elapsedSeconds = 0;

  while (!engine.canPrestige(state) && elapsedSeconds < limitSeconds) {
    state = engine.click(state);
    elapsedSeconds += 1;
    state = engine.advance(state, state.lastUpdatedAt + 1_000);
    state = buyOneUsefulThing(state);
  }
  return { state, elapsedSeconds };
}

test('one-click-per-second purchasing reaches prestige and the permanent bonus speeds up the next run', (t) => {
  assertEngineApi();

  const first = simulateUntilPrestige(engine.createGame(0));
  assert.equal(engine.canPrestige(first.state), true, 'the first cycle should finish within two simulated hours');
  assert.ok(first.elapsedSeconds < 7_200);

  const secondStart = engine.prestige(first.state);
  const second = simulateUntilPrestige(secondStart);
  assert.equal(engine.canPrestige(second.state), true, 'the second cycle should also reach prestige');
  assert.ok(second.elapsedSeconds < first.elapsedSeconds,
    `the second cycle (${second.elapsedSeconds}s) should beat the first (${first.elapsedSeconds}s)`);
  t.diagnostic(`First prestige: ${first.elapsedSeconds}s; second prestige: ${second.elapsedSeconds}s.`);
});
