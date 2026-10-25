import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRYPT, DUMMY_HASH, TEST_SCRYPT, hashPassword, verifyPassword } from '../auth/password';

describe('password hashing (scrypt)', () => {
  it('hashes with a fresh salt and verifies only the right password', async () => {
    const a = await hashPassword('hunter2 hunter2', TEST_SCRYPT);
    const b = await hashPassword('hunter2 hunter2', TEST_SCRYPT);
    expect(a).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('hunter2 hunter2', a)).toBe(true);
    expect(await verifyPassword('hunter2 hunter3', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
  });

  it('uses the production cost by default outside tests, and stores it per hash', async () => {
    expect(DEFAULT_SCRYPT).toEqual({ N: 131072, r: 8, p: 1 });
    expect(DUMMY_HASH.startsWith('scrypt$131072$8$1$')).toBe(true);
    const h = await hashPassword('production cost', DEFAULT_SCRYPT);
    expect(h.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(await verifyPassword('production cost', h)).toBe(true);
  }, 20_000);

  it('never matches the dummy hash and rejects malformed or abusive stored values without throwing', async () => {
    expect(await verifyPassword('password', DUMMY_HASH)).toBe(false);
    const good = await hashPassword('pw-for-format-tests', TEST_SCRYPT);
    const [, , r, p, salt, key] = good.split('$');
    for (const bad of [
      '',
      'plain',
      'bcrypt$1$2$3$4$5',
      `scrypt$1000$${r}$${p}$${salt}$${key}`, // N not a power of two
      `scrypt$${2 ** 24}$${r}$${p}$${salt}$${key}`, // too costly
      `scrypt$1024$999$${p}$${salt}$${key}`,
      `scrypt$1024$${r}$${p}$$${key}`,
      `scrypt$1024$${r}$${p}$${salt}$`,
    ]) {
      expect(await verifyPassword('pw-for-format-tests', bad)).toBe(false);
    }
  });

  it('normalises Unicode so the same password typed differently still matches', async () => {
    const h = await hashPassword('café-password', TEST_SCRYPT);
    expect(await verifyPassword('café-password', h)).toBe(true);
  });
});
