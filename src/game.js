export const DESTINATIONS = Object.freeze({
  EXPRESS: 'express',
  REVIEW: 'review',
  REGULAR: 'regular'
});

export const DISTRICTS = Object.freeze(['月見町', '星川', '霧ヶ丘', '港通り']);
export const SHIFT_SIZE = 18;
export const MAX_MISTAKES = 3;

const VERSION = 1;
const GROUP_SIZE = 6;
const CHECKPOINTS = Object.freeze(['月見町', '霧ヶ丘', '港通り']);
const SEALS = Object.freeze(['red', 'blue', 'none']);
const WEIGHTS = Object.freeze(['light', 'heavy']);
const VALID_STATUSES = new Set(['ready', 'playing', 'won', 'failed']);
const VALID_DESTINATIONS = new Set(Object.values(DESTINATIONS));

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function shuffle(random, values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function ticket(id, seal, district, weight) {
  return { id, seal, district, weight };
}

function createGroup(random, groupIndex) {
  const checkpoint = CHECKPOINTS[groupIndex];
  const alternateDistricts = DISTRICTS.filter((district) => district !== checkpoint);
  const otherDistrict = alternateDistricts[groupIndex % alternateDistricts.length];
  const regularDistrict = alternateDistricts[(groupIndex + 1) % alternateDistricts.length];

  return shuffle(random, [
    ticket('', 'red', otherDistrict, 'light'),
    ticket('', 'blue', checkpoint, 'light'),
    ticket('', 'none', regularDistrict, 'heavy'),
    ticket('', 'blue', otherDistrict, 'light'),
    ticket('', pick(random, SEALS), pick(random, DISTRICTS), pick(random, WEIGHTS)),
    ticket('', pick(random, SEALS), pick(random, DISTRICTS), pick(random, WEIGHTS))
  ]);
}

function createTickets(seed) {
  const random = createRandom(seed);
  const tickets = [];
  for (let groupIndex = 0; groupIndex < SHIFT_SIZE / GROUP_SIZE; groupIndex += 1) {
    tickets.push(...createGroup(random, groupIndex));
  }
  return tickets.map((value, index) => ({ ...value, id: `ticket-${String(index + 1).padStart(2, '0')}` }));
}

export function getCheckpointDistrict(cursor) {
  return CHECKPOINTS[Math.min(2, Math.floor(Math.max(0, cursor) / GROUP_SIZE))];
}

export function classifyTicket(ticketToClassify, checkpointDistrict) {
  if (ticketToClassify.seal === 'red') {
    return { destination: DESTINATIONS.EXPRESS, reason: '赤印は最優先です' };
  }
  if (ticketToClassify.district === checkpointDistrict) {
    return { destination: DESTINATIONS.REVIEW, reason: `${checkpointDistrict}は現在の要確認地区です` };
  }
  if (ticketToClassify.weight === 'heavy') {
    return { destination: DESTINATIONS.REVIEW, reason: '重量郵便は確認が必要です' };
  }
  return { destination: DESTINATIONS.REGULAR, reason: '特急・確認条件に該当しません' };
}

export function createGame(seed) {
  const normalizedSeed = Number.isInteger(seed) ? (seed >>> 0) : 0;
  return {
    version: VERSION,
    seed: normalizedSeed,
    status: 'ready',
    tickets: createTickets(normalizedSeed),
    cursor: 0,
    score: 0,
    mistakes: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    lastFeedback: null
  };
}

function isIntegerInRange(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isTicket(value, index) {
  return value !== null
    && typeof value === 'object'
    && value.id === `ticket-${String(index + 1).padStart(2, '0')}`
    && SEALS.includes(value.seal)
    && DISTRICTS.includes(value.district)
    && WEIGHTS.includes(value.weight);
}

function isFeedback(value) {
  return value === null || (
    value !== null
    && typeof value === 'object'
    && typeof value.correct === 'boolean'
    && typeof value.chosen === 'string'
    && VALID_DESTINATIONS.has(value.chosen)
    && typeof value.expected === 'string'
    && VALID_DESTINATIONS.has(value.expected)
    && typeof value.reason === 'string'
  );
}

export function isGameState(value) {
  return value !== null
    && typeof value === 'object'
    && value.version === VERSION
    && VALID_STATUSES.has(value.status)
    && isIntegerInRange(value.seed, 0, 0xffffffff)
    && Array.isArray(value.tickets)
    && value.tickets.length === SHIFT_SIZE
    && value.tickets.every(isTicket)
    && isIntegerInRange(value.cursor, 0, SHIFT_SIZE)
    && isIntegerInRange(value.score)
    && isIntegerInRange(value.mistakes, 0, MAX_MISTAKES)
    && isIntegerInRange(value.streak)
    && isIntegerInRange(value.bestStreak)
    && value.bestStreak >= value.streak
    && isIntegerInRange(value.correct, 0, SHIFT_SIZE)
    && value.correct <= value.cursor
    && isFeedback(value.lastFeedback);
}

export function submitChoice(state, destination) {
  if (!isGameState(state) || state.status !== 'playing' || !VALID_DESTINATIONS.has(destination)) {
    return state;
  }

  const ticketToClassify = state.tickets[state.cursor];
  const result = classifyTicket(ticketToClassify, getCheckpointDistrict(state.cursor));
  const correct = destination === result.destination;
  const nextStreak = correct ? state.streak + 1 : 0;
  const nextMistakes = correct ? state.mistakes : state.mistakes + 1;
  const nextCursor = state.cursor + 1;
  const nextStatus = !correct && nextMistakes >= MAX_MISTAKES
    ? 'failed'
    : nextCursor >= SHIFT_SIZE
      ? 'won'
      : 'playing';

  return {
    ...state,
    status: nextStatus,
    cursor: nextCursor,
    score: correct ? state.score + 100 + Math.min(nextStreak * 10, 100) : state.score,
    mistakes: nextMistakes,
    streak: nextStreak,
    bestStreak: Math.max(state.bestStreak, nextStreak),
    correct: state.correct + (correct ? 1 : 0),
    lastFeedback: {
      correct,
      chosen: destination,
      expected: result.destination,
      reason: result.reason
    }
  };
}
