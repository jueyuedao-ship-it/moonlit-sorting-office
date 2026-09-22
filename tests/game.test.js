import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATIONS, createGame, classifyTicket, getCheckpointDistrict,
  submitChoice, isGameState
} from '../src/game.js';

function startGame(seed) {
  return { ...createGame(seed), status: 'playing' };
}

function expectedDestination(state) {
  return classifyTicket(state.tickets[state.cursor], getCheckpointDistrict(state.cursor)).destination;
}

function wrongDestination(state) {
  const expected = expectedDestination(state);
  return [DESTINATIONS.EXPRESS, DESTINATIONS.REVIEW, DESTINATIONS.REGULAR]
    .find((destination) => destination !== expected);
}

function finishWon(seed) {
  let state = startGame(seed);
  while (state.status === 'playing') {
    state = submitChoice(state, expectedDestination(state));
  }
  return state;
}

function finishFailed(seed) {
  let state = startGame(seed);
  while (state.status === 'playing') {
    state = submitChoice(state, wrongDestination(state));
  }
  return state;
}

test('same seed creates the same constrained 18-ticket shift', () => {
  const first = createGame(12345);
  const second = createGame(12345);
  assert.deepEqual(first.tickets, second.tickets);
  assert.equal(first.tickets.length, 18);
  for (let start = 0; start < 18; start += 6) {
    const group = first.tickets.slice(start, start + 6);
    const checkpoint = getCheckpointDistrict(start);
    const outcomes = new Set(group.map((ticket) => classifyTicket(ticket, checkpoint).destination));
    assert.deepEqual([...outcomes].sort(), ['express', 'regular', 'review']);
  }
});

test('red seal wins over checkpoint district and heavy weight', () => {
  const result = classifyTicket(
    { id: 'x', seal: 'red', district: '月見町', weight: 'heavy' },
    '月見町'
  );
  assert.deepEqual(result, { destination: DESTINATIONS.EXPRESS, reason: '赤印は最優先です' });
});

test('checkpoint or heavy mail goes to review and the rest goes regular', () => {
  assert.equal(classifyTicket({ id: 'a', seal: 'blue', district: '星川', weight: 'light' }, '星川').destination, 'review');
  assert.equal(classifyTicket({ id: 'b', seal: 'none', district: '港通り', weight: 'heavy' }, '星川').destination, 'review');
  assert.equal(classifyTicket({ id: 'c', seal: 'blue', district: '港通り', weight: 'light' }, '星川').destination, 'regular');
});

test('correct answer advances and scores from the new streak', () => {
  const ready = createGame(7);
  const playing = { ...ready, status: 'playing' };
  const expected = classifyTicket(playing.tickets[0], getCheckpointDistrict(0));
  const next = submitChoice(playing, expected.destination);
  assert.equal(next.cursor, 1);
  assert.equal(next.correct, 1);
  assert.equal(next.streak, 1);
  assert.equal(next.score, 110);
  assert.equal(playing.cursor, 0);
  assert.equal(next.lastFeedback.correct, true);
});

test('third mistake fails immediately and later input is ignored', () => {
  let state = startGame(8);
  state = submitChoice(state, wrongDestination(state));
  state = submitChoice(state, wrongDestination(state));
  const expected = expectedDestination(state);
  state = submitChoice(state, wrongDestination(state));
  assert.equal(state.status, 'failed');
  assert.equal(state.mistakes, 3);
  assert.equal(submitChoice(state, expected), state);
});

test('eighteenth processed ticket wins and streak bonus is capped', () => {
  const state = finishWon(9);
  assert.equal(state.status, 'won');
  assert.equal(state.cursor, 18);
  assert.equal(state.score, 3150);
  assert.equal(state.bestStreak, 18);
});

test('invalid destinations and internally inconsistent states are rejected', () => {
  const state = { ...createGame(10), status: 'playing' };
  assert.equal(submitChoice(state, 'unknown'), state);
  assert.equal(isGameState(state), true);
  assert.equal(isGameState({ ...state, cursor: 19 }), false);
  assert.equal(isGameState({ ...state, tickets: [] }), false);
  assert.equal(isGameState({ ...state, score: -1 }), false);
});

test('terminal status relationships are required for a game state', () => {
  const won = finishWon(11);
  const failed = finishFailed(12);
  assert.equal(isGameState({ ...won, cursor: 17 }), false);
  assert.equal(isGameState({ ...won, mistakes: 3 }), false);
  assert.equal(isGameState({ ...failed, mistakes: 2 }), false);
  assert.equal(isGameState(won), true);
  assert.equal(isGameState(failed), true);
});

test('a terminal-looking playing state is ignored instead of crashing on a missing ticket', () => {
  const state = { ...createGame(13), status: 'playing', cursor: 18 };
  assert.doesNotThrow(() => submitChoice(state, DESTINATIONS.REGULAR));
  assert.equal(isGameState(state), false);
  assert.equal(submitChoice(state, DESTINATIONS.REGULAR), state);
});

test('game state cursor is exactly the sum of correct answers and mistakes', () => {
  const playing = startGame(14);
  assert.equal(isGameState({ ...playing, cursor: 1 }), false);
  assert.equal(isGameState({ ...playing, cursor: 1, mistakes: 1 }), true);
  assert.equal(isGameState({ ...playing, cursor: 1, correct: 1 }), true);
});

test('ready state has no counters, score, or feedback', () => {
  const ready = createGame(15);
  assert.equal(isGameState(ready), true);
  assert.equal(isGameState({ ...ready, score: 1 }), false);
  assert.equal(isGameState({ ...ready, mistakes: 1 }), false);
  assert.equal(isGameState({ ...ready, streak: 1 }), false);
  assert.equal(isGameState({ ...ready, bestStreak: 1 }), false);
  assert.equal(isGameState({ ...ready, correct: 1 }), false);
  assert.equal(isGameState({ ...ready, lastFeedback: { correct: true, chosen: 'regular', expected: 'regular', reason: 'ok' } }), false);
});

test('best streak cannot exceed correct answers and streak cannot exceed best streak', () => {
  const playing = startGame(16);
  assert.equal(isGameState({ ...playing, bestStreak: 1 }), false);
  assert.equal(isGameState({ ...playing, streak: 1, bestStreak: 0 }), false);
});
