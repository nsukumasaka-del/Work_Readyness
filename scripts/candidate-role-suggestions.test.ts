import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateRoleSuggestions } from '../artifacts/api-server/src/lib/candidate-role-suggestions';

test('target roles and CV skills produce structured suggestions without fake vacancies', () => {
  const roles = candidateRoleSuggestions({ targetRole: 'Customer Services Agent | Imports Controller', location: 'Gauteng', skills: ['CRM', 'Office Administration', 'Freight'] });
  assert.ok(roles.length >= 5);
  assert.ok(roles.some(role => role.title === 'Administration Officer'));
  for (const role of roles) {
    assert.equal(role.kind, 'role-suggestion');
    assert.equal(role.isVerifiedVacancy, false);
    assert.equal(role.matchScore, null);
    assert.equal(role.location, 'Gauteng');
    assert.equal('company' in role, false);
    assert.equal('salary' in role, false);
    assert.equal('applyUrl' in role, false);
  }
});

test('suggestions handle malformed input and deduplicate experience roles', () => {
  assert.deepEqual(candidateRoleSuggestions(null), []);
  assert.deepEqual(candidateRoleSuggestions({ targetRole: {}, skills: 'invalid' }), []);
  const roles = candidateRoleSuggestions({ targetRole: 'Clerk', experienceRoles: [null, 'clerk', 'Receptionist'] });
  assert.equal(roles.length, 2);
  assert.equal(roles[0].basis, 'target-role');
  assert.equal(roles[1].basis, 'experience');
});
