import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, cleanClassName, generateJoinCode, normaliseJoinCode } from '../classes';
import { DEMO_JOIN_CODE } from '../demoAccounts';

describe('join codes', () => {
  it('generates 8 characters of Crockford base32 (no I, L, O, U), different every time', () => {
    expect(JOIN_CODE_ALPHABET).toHaveLength(32);
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[ILOU]/);
    const codes = new Set(Array.from({ length: 200 }, generateJoinCode));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect(normaliseJoinCode(code)).toBe(code);
    }
  });

  it('normalises what students type: spaces, dashes, case and look-alikes', () => {
    expect(normaliseJoinCode('maya-2026')).toBe('MAYA2026');
    expect(normaliseJoinCode('  MAYA 2026 ')).toBe('MAYA2026');
    expect(normaliseJoinCode('7kq2-m9xa')).toBe('7KQ2M9XA');
    // O → 0, I / L → 1 (Crockford).
    expect(normaliseJoinCode('ABCDOIL9')).toBe('ABCD0119');
    expect(normaliseJoinCode(DEMO_JOIN_CODE)).toBe(DEMO_JOIN_CODE);
  });

  it('rejects anything that cannot be a code', () => {
    for (const bad of ['', 'MAYA202', 'MAYA20266', 'MAYU2026', 'MAYA_026', '../admin', 42, null, undefined, 'x'.repeat(100)]) {
      expect(normaliseJoinCode(bad)).toBeNull();
    }
  });
});

describe('cleanClassName', () => {
  it('trims and collapses whitespace; refuses empty, too long or non-strings', () => {
    expect(cleanClassName('  Calculus   I  ')).toBe('Calculus I');
    expect(cleanClassName('')).toBeNull();
    expect(cleanClassName('   ')).toBeNull();
    expect(cleanClassName('x'.repeat(81))).toBeNull();
    expect(cleanClassName(7)).toBeNull();
  });
});
