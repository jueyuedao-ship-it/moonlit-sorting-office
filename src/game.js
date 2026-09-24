export const GAME_VERSION = 1;
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
const GENERATOR_PRICE_GROWTH = 1.15;

const unlockByMoonlight = (value) => Object.freeze({ resource: 'runMoonEarned', value });
const unlockByStars = (value) => Object.freeze({ resource: 'runStarsEarned', value });

export const GENERATOR_CATALOG = Object.freeze({
  lantern: Object.freeze({
    id: 'lantern',
    name: 'ランタン',
    currency: 'moonlight',
    baseCost: 15,
    costGrowth: GENERATOR_PRICE_GROWTH,
    outputResource: 'moonlight',
    productionPerSecond: 0.2,
    unlockAt: unlockByMoonlight(0),
    description: '月光をゆっくり集めます'
  }),
  observatory: Object.freeze({
    id: 'observatory',
    name: '観測机',
    currency: 'moonlight',
    baseCost: 180,
    costGrowth: GENERATOR_PRICE_GROWTH,
    outputResource: 'moonlight',
    productionPerSecond: 2.5,
    unlockAt: unlockByMoonlight(60),
    description: '月光の流れを観測します'
  }),
  moonring: Object.freeze({
    id: 'moonring',
    name: '月輪塔',
    currency: 'moonlight',
    baseCost: 2_400,
    costGrowth: GENERATOR_PRICE_GROWTH,
    outputResource: 'moonlight',
    productionPerSecond: 30,
    unlockAt: unlockByMoonlight(750),
    description: '塔に月光を巡らせます'
  }),
  garden: Object.freeze({
    id: 'garden',
    name: '夜空庭園',
    currency: 'moonlight',
    baseCost: 36_000,
    costGrowth: GENERATOR_PRICE_GROWTH,
    outputResource: 'moonlight',
    productionPerSecond: 400,
    unlockAt: unlockByMoonlight(9_000),
    description: '夜空から月光を育てます'
  }),
  starCondenser: Object.freeze({
    id: 'starCondenser',
    name: '星屑凝縮器',
    currency: 'moonlight',
    baseCost: 10_000,
    costGrowth: GENERATOR_PRICE_GROWTH,
    outputResource: 'stars',
    productionPerSecond: 0.05,
    unlockAt: unlockByMoonlight(5_000),
    description: '月光から星屑を集めます'
  })
});

export const UPGRADE_CATALOG = Object.freeze({
  clickPower: Object.freeze({
    id: 'clickPower',
    name: '月光の手ほどき',
    currency: 'moonlight',
    cost: 25,
    unlockAt: unlockByMoonlight(15),
    clickMultiplier: 2,
    description: 'クリックで得る月光が2倍になります'
  }),
  moonlightProduction: Object.freeze({
    id: 'moonlightProduction',
    name: '月光の調律',
    currency: 'moonlight',
    cost: 180,
    unlockAt: unlockByMoonlight(60),
    moonlightProductionMultiplier: 2,
    description: '月光設備の生産が2倍になります'
  }),
  starBlessing: Object.freeze({
    id: 'starBlessing',
    name: '星屑の祝福',
    currency: 'stars',
    cost: 10,
    unlockAt: unlockByStars(10),
    moonlightProductionMultiplier: 2,
    description: '星屑10個で月光設備の生産が2倍になります'
  })
});

const GENERATOR_IDS = Object.freeze(Object.keys(GENERATOR_CATALOG));
const UPGRADE_IDS = Object.freeze(Object.keys(UPGRADE_CATALOG));
const RUN_PRESTIGE_MOONLIGHT = 100_000;
const RUN_PRESTIGE_STARS = 25;
const MAX_STORED_RESOURCE = Number.MAX_VALUE;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function finiteNonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function freshRun(now) {
  return {
    version: GAME_VERSION,
    moonlight: 0,
    stars: 0,
    runMoonEarned: 0,
    runStarsEarned: 0,
    lifetime: { memories: 0, prestiges: 0 },
    generators: Object.fromEntries(GENERATOR_IDS.map((id) => [id, 0])),
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, false])),
    lastUpdatedAt: now
  };
}

export function createGame(now = Date.now()) {
  const timestamp = Number.isFinite(now) ? now : Date.now();
  return freshRun(timestamp);
}

export function isGameState(value) {
  if (!hasExactKeys(value, [
    'version', 'moonlight', 'stars', 'runMoonEarned', 'runStarsEarned',
    'lifetime', 'generators', 'upgrades', 'lastUpdatedAt'
  ])) return false;

  return value.version === GAME_VERSION
    && finiteNonnegative(value.moonlight)
    && finiteNonnegative(value.stars)
    && finiteNonnegative(value.runMoonEarned)
    && finiteNonnegative(value.runStarsEarned)
    && value.moonlight <= value.runMoonEarned
    && value.stars <= value.runStarsEarned
    && Number.isFinite(value.lastUpdatedAt)
    && hasExactKeys(value.lifetime, ['memories', 'prestiges'])
    && Number.isSafeInteger(value.lifetime.memories)
    && value.lifetime.memories >= 0
    && Number.isSafeInteger(value.lifetime.prestiges)
    && value.lifetime.prestiges >= 0
    && value.lifetime.memories >= value.lifetime.prestiges
    && hasExactKeys(value.generators, GENERATOR_IDS)
    && GENERATOR_IDS.every((id) => Number.isSafeInteger(value.generators[id]) && value.generators[id] >= 0)
    && hasExactKeys(value.upgrades, UPGRADE_IDS)
    && UPGRADE_IDS.every((id) => typeof value.upgrades[id] === 'boolean');
}

function getUnlockValue(state, rule) {
  if (rule.resource === 'runMoonEarned' || rule.resource === 'runStarsEarned') {
    return state[rule.resource];
  }
  return -1;
}

function meetsUnlock(state, rule) {
  return isRecord(rule)
    && typeof rule.resource === 'string'
    && finiteNonnegative(rule.value)
    && getUnlockValue(state, rule) >= rule.value;
}

export function isGeneratorUnlocked(state, id) {
  const generator = GENERATOR_CATALOG[id];
  return isGameState(state) && generator !== undefined && meetsUnlock(state, generator.unlockAt);
}

export function isUpgradeUnlocked(state, id) {
  const upgrade = UPGRADE_CATALOG[id];
  return isGameState(state) && upgrade !== undefined && meetsUnlock(state, upgrade.unlockAt);
}

export function getGeneratorCost(state, id) {
  const generator = GENERATOR_CATALOG[id];
  if (!isGameState(state) || generator === undefined) return null;

  const rawCost = generator.baseCost * (generator.costGrowth ** state.generators[id]);
  if (!Number.isFinite(rawCost)) return MAX_STORED_RESOURCE;
  return Math.ceil(rawCost);
}

function getPermanentMultiplier(state) {
  return 1 + (0.25 * state.lifetime.memories);
}

export function getProduction(state) {
  if (!isGameState(state)) {
    return { moonlightPerSecond: 0, starsPerSecond: 0, clickAmount: 0, permanentMultiplier: 1 };
  }

  const permanentMultiplier = getPermanentMultiplier(state);
  let baseMoonlight = 0;
  for (const id of GENERATOR_IDS) {
    const generator = GENERATOR_CATALOG[id];
    if (generator.outputResource === 'moonlight') {
      baseMoonlight += state.generators[id] * generator.productionPerSecond;
    }
  }

  const upgradeMultiplier = (state.upgrades.moonlightProduction ? 2 : 1)
    * (state.upgrades.starBlessing ? 2 : 1);
  return {
    moonlightPerSecond: baseMoonlight * upgradeMultiplier * permanentMultiplier,
    starsPerSecond: state.generators.starCondenser * GENERATOR_CATALOG.starCondenser.productionPerSecond,
    clickAmount: (state.upgrades.clickPower ? UPGRADE_CATALOG.clickPower.clickMultiplier : 1)
      * permanentMultiplier,
    permanentMultiplier
  };
}

export function click(state) {
  if (!isGameState(state)) return state;
  const gain = getProduction(state).clickAmount;
  const moonlight = state.moonlight + gain;
  const runMoonEarned = state.runMoonEarned + gain;
  if (!finiteNonnegative(moonlight) || !finiteNonnegative(runMoonEarned)) return state;
  return { ...state, moonlight, runMoonEarned };
}

export function buyGenerator(state, id) {
  if (!isGameState(state) || !isGeneratorUnlocked(state, id)) return state;
  const generator = GENERATOR_CATALOG[id];
  const cost = getGeneratorCost(state, id);
  if (cost === null || state[generator.currency] < cost) return state;
  const nextCount = state.generators[id] + 1;
  if (!Number.isSafeInteger(nextCount)) return state;

  return {
    ...state,
    [generator.currency]: state[generator.currency] - cost,
    generators: { ...state.generators, [id]: nextCount }
  };
}

export function buyUpgrade(state, id) {
  if (!isGameState(state) || !isUpgradeUnlocked(state, id)) return state;
  const upgrade = UPGRADE_CATALOG[id];
  if (state.upgrades[id] || state[upgrade.currency] < upgrade.cost) return state;

  return {
    ...state,
    [upgrade.currency]: state[upgrade.currency] - upgrade.cost,
    upgrades: { ...state.upgrades, [id]: true }
  };
}

export function advance(state, now) {
  if (!isGameState(state) || !Number.isFinite(now) || now <= state.lastUpdatedAt) return state;

  const elapsedSeconds = Math.min((now - state.lastUpdatedAt) / 1_000, MAX_OFFLINE_SECONDS);
  const production = getProduction(state);
  const moonlightGain = production.moonlightPerSecond * elapsedSeconds;
  const starGain = production.starsPerSecond * elapsedSeconds;
  const moonlight = state.moonlight + moonlightGain;
  const stars = state.stars + starGain;
  const runMoonEarned = state.runMoonEarned + moonlightGain;
  const runStarsEarned = state.runStarsEarned + starGain;
  if (![moonlight, stars, runMoonEarned, runStarsEarned].every(finiteNonnegative)) return state;

  return { ...state, moonlight, stars, runMoonEarned, runStarsEarned, lastUpdatedAt: now };
}

export function canPrestige(state) {
  return isGameState(state)
    && state.runMoonEarned >= RUN_PRESTIGE_MOONLIGHT
    && state.runStarsEarned >= RUN_PRESTIGE_STARS;
}

export function prestige(state) {
  if (!canPrestige(state)) return state;
  const memoriesGained = Math.max(1, Math.floor(Math.sqrt(state.runMoonEarned / RUN_PRESTIGE_MOONLIGHT)));
  const memories = state.lifetime.memories + memoriesGained;
  const prestiges = state.lifetime.prestiges + 1;
  if (!Number.isSafeInteger(memories) || !Number.isSafeInteger(prestiges)) return state;

  return {
    ...freshRun(state.lastUpdatedAt),
    lifetime: { memories, prestiges }
  };
}
