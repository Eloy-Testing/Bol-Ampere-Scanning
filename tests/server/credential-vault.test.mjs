import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CredentialVault,
  parseCredentialEncryptionKey,
  validateBolAccountKey,
  validateBolAccountLabel,
  validateBolCredentials,
} from '../../server/credential-vault.mjs';

const encryptionKey = Buffer.alloc(32, 17).toString('base64url');

test('credential vault seals Bol credentials with account-bound authenticated encryption', () => {
  const vault = new CredentialVault(encryptionKey);
  const credentials = {
    clientId: 'a033c265-df2e-4bf2-88cd-0a6b977d6baf',
    clientSecret: 'fixture-secret-with-symbols!@#$%^&*()',
  };
  const envelope = vault.seal('primary', credentials);
  assert.deepEqual(vault.open('primary', envelope), credentials);
  assert.equal(envelope.envelopeVersion, 1);
  assert.doesNotMatch(JSON.stringify(envelope), new RegExp(credentials.clientId.replaceAll('-', '\\-')));
  assert.doesNotMatch(JSON.stringify(envelope), /fixture-secret/);
  assert.equal(vault.fingerprint(credentials.clientId), envelope.credentialFingerprint);
  assert.equal(vault.fingerprint(credentials.clientId.toUpperCase()), envelope.credentialFingerprint);
});

test('credential vault fails closed on tampering, wrong account binding, and wrong encryption key', () => {
  const vault = new CredentialVault(encryptionKey);
  const envelope = vault.seal('primary', { clientId: 'client-one', clientSecret: 'secret-one' });
  const first = envelope.credentialCiphertext[0] === 'A' ? 'B' : 'A';
  const tampered = { ...envelope, credentialCiphertext: `${first}${envelope.credentialCiphertext.slice(1)}` };
  for (const action of [
    () => vault.open('secondary', envelope),
    () => vault.open('primary', tampered),
    () => new CredentialVault(Buffer.alloc(32, 18).toString('base64url')).open('primary', envelope),
  ]) {
    assert.throws(action, (error) => {
      assert.equal(error.code, 'credential_store_unavailable');
      assert.doesNotMatch(error.message, /client-one|secret-one/i);
      return true;
    });
  }
});

test('credential and account input validation is narrow and deterministic', () => {
  assert.equal(parseCredentialEncryptionKey(encryptionKey).length, 32);
  assert.equal(validateBolAccountKey(`acct_${'a'.repeat(22)}`), `acct_${'a'.repeat(22)}`);
  assert.equal(validateBolAccountLabel('  Muisstil   NL  '), 'Muisstil NL');
  assert.deepEqual(validateBolCredentials({ clientId: 'valid-client:1', clientSecret: 'eight-or-more' }), {
    clientId: 'valid-client:1', clientSecret: 'eight-or-more',
  });
  assert.throws(() => parseCredentialEncryptionKey('not-a-key'), { name: 'ConfigurationError' });
  assert.throws(() => validateBolAccountKey('client-label-as-key'), { name: 'ValidationError' });
  assert.throws(() => validateBolAccountLabel('<script>'), { name: 'ValidationError' });
  assert.throws(() => validateBolCredentials({ clientId: ' has-space', clientSecret: 'eight-or-more' }), { name: 'ValidationError' });
  assert.throws(() => validateBolCredentials({ clientId: 'valid-client', clientSecret: 'short' }), { name: 'ValidationError' });
});
