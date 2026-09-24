import {
  GENERATOR_CATALOG,
  UPGRADE_CATALOG,
  canPrestige,
  createGame,
  getGeneratorCost,
  getProduction,
  isGameState,
  isGeneratorUnlocked,
  isUpgradeUnlocked
} from './game.js';

const RESOURCE_LABELS = Object.freeze({ moonlight: '月光', stars: '星屑' });
const NUMBER_FORMAT = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });
const LARGE_NUMBER_UNITS = Object.freeze([
  [1e32, '溝'],
  [1e28, '穣'],
  [1e24, '秭'],
  [1e20, '垓'],
  [1e16, '京'],
  [1e12, '兆'],
  [1e8, '億'],
  [1e4, '万']
]);
const PRESTIGE_MOONLIGHT_REQUIREMENT = 100_000;
const PRESTIGE_STARS_REQUIREMENT = 25;

function formatNumber(value) {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value >= 1e36) {
    const exponent = Math.floor(Math.log10(value));
    const coefficient = Number((value / (10 ** exponent)).toFixed(2));
    return `${coefficient}e${exponent}`;
  }

  for (const [limit, suffix] of LARGE_NUMBER_UNITS) {
    if (value >= limit) {
      return `${NUMBER_FORMAT.format(value / limit)}${suffix}`;
    }
  }
  return NUMBER_FORMAT.format(value);
}

function resourceView(amount, label) {
  return { amount, text: formatNumber(amount), label };
}

function presentGenerator(state, [id, generator]) {
  const cost = getGeneratorCost(state, id);
  const visible = isGeneratorUnlocked(state, id);
  const affordable = state[generator.currency] >= cost;
  const outputLabel = RESOURCE_LABELS[generator.outputResource];
  const currencyLabel = RESOURCE_LABELS[generator.currency];

  return {
    id,
    name: generator.name,
    description: generator.description,
    currency: generator.currency,
    outputResource: generator.outputResource,
    owned: state.generators[id],
    cost,
    costText: `${formatNumber(cost)} ${currencyLabel}`,
    productionPerSecond: generator.productionPerSecond,
    productionText: `+${formatNumber(generator.productionPerSecond)} ${outputLabel}/秒`,
    visible,
    affordable,
    buyDisabled: !visible || !affordable
  };
}

function presentUpgrade(state, [id, upgrade]) {
  const visible = isUpgradeUnlocked(state, id);
  const purchased = state.upgrades[id];
  const currencyLabel = RESOURCE_LABELS[upgrade.currency];
  const affordable = visible && !purchased && state[upgrade.currency] >= upgrade.cost;

  return {
    id,
    name: upgrade.name,
    description: upgrade.description,
    currency: upgrade.currency,
    cost: upgrade.cost,
    costText: `${formatNumber(upgrade.cost)} ${currencyLabel}`,
    visible,
    purchased,
    affordable,
    buyDisabled: !affordable
  };
}

function presentPrestige(state, production) {
  const moonlightMet = state.runMoonEarned >= PRESTIGE_MOONLIGHT_REQUIREMENT;
  const starsMet = state.runStarsEarned >= PRESTIGE_STARS_REQUIREMENT;
  const visible = moonlightMet;
  const memoriesGained = visible
    ? Math.max(1, Math.floor(Math.sqrt(state.runMoonEarned / PRESTIGE_MOONLIGHT_REQUIREMENT)))
    : 0;
  const nextMultiplier = production.permanentMultiplier + (0.25 * memoriesGained);

  return {
    visible,
    ready: canPrestige(state),
    requirements: {
      moonlightMet,
      starsMet,
      moonlightText: `${formatNumber(state.runMoonEarned)} / 10万 月光`,
      starsText: `${formatNumber(state.runStarsEarned)} / 25 星屑`
    },
    memoriesGained,
    currentMultiplier: production.permanentMultiplier,
    nextMultiplier,
    currentMultiplierText: `${formatNumber(production.permanentMultiplier)}倍`,
    nextMultiplierText: `${formatNumber(nextMultiplier)}倍`,
    lossText: '月光、星屑、設備、強化、周回累計はリセットされます。',
    gainText: visible
      ? `記憶を${formatNumber(memoriesGained)}獲得し、恒久倍率が${formatNumber(nextMultiplier)}倍になります。`
      : '条件を満たすと記憶を獲得し、恒久倍率が上がります。'
  };
}

export function toViewModel(game) {
  const state = isGameState(game) ? game : createGame(0);
  const production = getProduction(state);

  return {
    resources: {
      moonlight: resourceView(state.moonlight, '月光'),
      stars: resourceView(state.stars, '星屑'),
      runMoonEarned: resourceView(state.runMoonEarned, '周回累計月光'),
      runStarsEarned: resourceView(state.runStarsEarned, '周回累計星屑')
    },
    production: {
      moonlightPerSecond: production.moonlightPerSecond,
      moonlightPerSecondText: `${formatNumber(production.moonlightPerSecond)} 月光/秒`,
      starsPerSecond: production.starsPerSecond,
      starsPerSecondText: `${formatNumber(production.starsPerSecond)} 星屑/秒`,
      clickAmount: production.clickAmount,
      clickAmountText: `+${formatNumber(production.clickAmount)} 月光/クリック`,
      permanentMultiplier: production.permanentMultiplier,
      permanentMultiplierText: `${formatNumber(production.permanentMultiplier)}倍`
    },
    generators: Object.fromEntries(
      Object.entries(GENERATOR_CATALOG).map((entry) => [entry[0], presentGenerator(state, entry)])
    ),
    upgrades: Object.fromEntries(
      Object.entries(UPGRADE_CATALOG).map((entry) => [entry[0], presentUpgrade(state, entry)])
    ),
    starsVisible: isGeneratorUnlocked(state, 'starCondenser'),
    prestige: presentPrestige(state, production)
  };
}
