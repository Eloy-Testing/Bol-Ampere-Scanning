import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashPassword,
  sessionCookie,
  signSessionToken,
  verifyPassword,
  verifySignedSessionToken,
} from '../../server/security.mjs';

test('scrypt hashes are salted, versioned, and verified without accepting malformed input', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');
  assert.match(first, /^scrypt-v1\$N=16384,r=8,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('correct horse battery staple', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword('correct horse battery staple', 'not-a-hash'), false);
});

test('session signatures reject tampering and cookies carry the security contract', () => {
  const secret = 's'.repeat(32);
  const token = 'a'.repeat(43);
  const signed = signSessionToken(token, secret);
  assert.equal(verifySignedSessionToken(signed, secret), token);
  assert.equal(verifySignedSessionToken(`${signed.slice(0, -1)}x`, secret), null);
  const cookie = sessionCookie(signed, { maxAge: 3600, secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=3600/);
});
