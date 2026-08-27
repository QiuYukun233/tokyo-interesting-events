import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, applyGate, gateDecision } from './gate.mjs';

const candidate = (extra = {}) => ({ id: 'a', state: 'pending', source: 'Tokyo Big Sight', audience: '一般', ...extra });

test('trade-only admission is rejected, with the rule named as the author', () => {
  const decision = gateDecision(candidate({ audience: '商談' }));
  assert.equal(decision.state, 'rejected');
  assert.equal(decision.decidedBy, 'rule:trade_only_admission');
  assert.match(decision.reason, /§5\.2/);
});

test('a show admitting both audiences stays pending for a person', () => {
  // Plan §5.2 is explicit that a 商談展 can still be worth going to; the gate
  // must not repeat the old heuristic that swept all of them aside.
  assert.equal(gateDecision(candidate({ audience: '商談・一般' })), null);
  assert.equal(gateDecision(candidate({ audience: '一般' })), null);
  assert.equal(gateDecision(candidate({ audience: '不明' })), null);
  assert.equal(gateDecision(candidate({ audience: undefined })), null);
});

test('the gate never touches a candidate that has already been decided', () => {
  for (const state of ['published', 'rejected']) {
    assert.equal(gateDecision(candidate({ audience: '商談', state })), null, state);
  }
});

test('applyGate returns one decision per matching candidate and skips the rest', () => {
  const decisions = applyGate([
    candidate({ id: 'trade', audience: '商談' }),
    candidate({ id: 'public', audience: '一般' }),
    candidate({ id: 'both', audience: '商談・一般' }),
    candidate({ id: 'decided', audience: '商談', state: 'published' }),
  ]);
  assert.deepEqual(decisions.map((decision) => decision.id), ['trade']);
});

test('every rule declares a name, a legal state and a reason', () => {
  for (const rule of RULES) {
    assert.ok(rule.name, 'rule needs a name for decidedBy');
    assert.ok(['published', 'rejected'].includes(rule.state), rule.name);
    assert.ok(rule.reason, rule.name);
    assert.equal(typeof rule.matches, 'function', rule.name);
  }
});

test('an empty rule set leaves everything pending', () => {
  assert.deepEqual(applyGate([candidate({ audience: '商談' })], []), []);
});
