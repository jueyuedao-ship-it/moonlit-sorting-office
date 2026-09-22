import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATIONS, createGame, classifyTicket, getCheckpointDistrict,
  submitChoice, isGameState
} from '../src/game.js';

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
  let state = { ...createGame(8), status: 'playing', mistakes: 2 };
  const expected = classifyTicket(state.tickets[0], getCheckpointDistrict(0)).destination;
  const wrong = ['express', 'review', 'regular'].find((value) => value !== expected);
  state = submitChoice(state, wrong);
  assert.equal(state.status, 'failed');
  assert.equal(state.mistakes, 3);
  assert.equal(submitChoice(state, expected), state);
});

test('eighteenth processed ticket wins and streak bonus is capped', () => {
  let state = { ...createGame(9), status: 'playing', cursor: 17, streak: 14, bestStreak: 14, score: 1000 };
  const expected = classifyTicket(state.tickets[17], getCheckpointDistrict(17)).destination;
  state = submitChoice(state, expected);
  assert.equal(state.status, 'won');
  assert.equal(state.cursor, 18);
  assert.equal(state.score, 1200);
  assert.equal(state.bestStreak, 15);
});

test('invalid destinations and internally inconsistent states are rejected', () => {
  const state = { ...createGame(10), status: 'playing' };
  assert.equal(submitChoice(state, 'unknown'), state);
  assert.equal(isGameState(state), true);
  assert.equal(isGameState({ ...state, cursor: 19 }), false);
  assert.equal(isGameState({ ...state, tickets: [] }), false);
  assert.equal(isGameState({ ...state, score: -1 }), false);
});
