import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { toViewModel } from '../src/presenter.js';

function gameWith(changes) {
  return { ...createGame(10_000), ...changes };
}

test('fresh view formats the main resource and click production', () => {
  const view = toViewModel(createGame(1_000));

  assert.equal(view.resources.moonlight.text, '0');
  assert.equal(view.resources.stars.text, '0');
  assert.equal(view.production.clickAmount, 1);
  assert.equal(view.production.clickAmountText, '+1 月光/クリック');
  assert.equal(view.generators.lantern.visible, true);
  assert.equal(view.generators.lantern.costText, '15 月光');
  assert.equal(view.generators.lantern.owned, 0);
  assert.equal(view.generators.lantern.affordable, false);
});

test('resource formatting shortens large Japanese currency values', () => {
  const view = toViewModel(gameWith({ moonlight: 123_456, runMoonEarned: 123_456 }));

  assert.equal(view.resources.moonlight.text, '12.35万');
  assert.equal(view.resources.runMoonEarned.text, '12.35万');
});

test('generator visibility follows earned progression and costs grow with owned count', () => {
  const locked = toViewModel(createGame(2_000));
  const unlocked = toViewModel(gameWith({
    moonlight: 60,
    runMoonEarned: 60,
    generators: { ...createGame(0).generators, lantern: 1 }
  }));

  assert.equal(locked.generators.observatory.visible, false);
  assert.equal(unlocked.generators.observatory.visible, true);
  assert.equal(unlocked.generators.lantern.cost, 18);
  assert.equal(unlocked.generators.lantern.costText, '18 月光');
  assert.equal(unlocked.generators.lantern.productionText, '+0.2 月光/秒');
});

test('star section and star upgrade stay hidden until their earned thresholds', () => {
  const beforeStarUnlock = toViewModel(gameWith({ moonlight: 4_999, runMoonEarned: 4_999 }));
  const starSection = toViewModel(gameWith({
    moonlight: 5_000,
    runMoonEarned: 5_000,
    stars: 10,
    runStarsEarned: 10
  }));

  assert.equal(beforeStarUnlock.starsVisible, false);
  assert.equal(beforeStarUnlock.generators.starCondenser.visible, false);
  assert.equal(starSection.starsVisible, true);
  assert.equal(starSection.generators.starCondenser.visible, true);
  assert.equal(starSection.upgrades.starBlessing.visible, true);
  assert.equal(starSection.upgrades.starBlessing.costText, '10 星屑');
});

test('production, affordability, and upgrade ownership are presented from game state', () => {
  const state = gameWith({
    moonlight: 200,
    runMoonEarned: 200,
    generators: { ...createGame(0).generators, lantern: 2 },
    upgrades: { ...createGame(0).upgrades, clickPower: true, moonlightProduction: true }
  });
  const view = toViewModel(state);

  assert.equal(view.production.moonlightPerSecond, 0.8);
  assert.equal(view.production.moonlightPerSecondText, '0.8 月光/秒');
  assert.equal(view.production.clickAmount, 2);
  assert.equal(view.generators.lantern.affordable, true);
  assert.equal(view.upgrades.clickPower.purchased, true);
  assert.equal(view.upgrades.moonlightProduction.purchased, true);
});

test('generator production text includes the active upgrade and permanent multipliers', () => {
  const initial = createGame(0);
  const state = gameWith({
    moonlight: 200,
    runMoonEarned: 200,
    lifetime: { memories: 4, prestiges: 2 },
    generators: { ...initial.generators, lantern: 1 },
    upgrades: { ...initial.upgrades, moonlightProduction: true }
  });
  const view = toViewModel(state);

  assert.equal(view.generators.lantern.productionPerSecond, 0.8);
  assert.equal(view.generators.lantern.productionText, '+0.8 月光/秒');
});

test('prestige preview explains reset and shows memory gain and next permanent multiplier', () => {
  const state = gameWith({
    moonlight: 250_000,
    stars: 25,
    runMoonEarned: 400_000,
    runStarsEarned: 25,
    lifetime: { memories: 4, prestiges: 2 }
  });
  const view = toViewModel(state);

  assert.equal(view.prestige.visible, true);
  assert.equal(view.prestige.ready, true);
  assert.equal(view.prestige.memoriesGained, 2);
  assert.equal(view.prestige.currentMultiplier, 2);
  assert.equal(view.prestige.nextMultiplier, 2.5);
  assert.equal(view.prestige.nextMultiplierText, '2.5倍');
  assert.match(view.prestige.lossText, /月光.*星屑.*設備.*強化/);
  assert.match(view.prestige.gainText, /記憶.*2/);
});

test('prestige stays unavailable when the star requirement has not been earned', () => {
  const state = gameWith({ moonlight: 150_000, runMoonEarned: 150_000, runStarsEarned: 24 });
  const view = toViewModel(state);

  assert.equal(view.prestige.visible, true);
  assert.equal(view.prestige.ready, false);
  assert.equal(view.prestige.requirements.starsMet, false);
});
