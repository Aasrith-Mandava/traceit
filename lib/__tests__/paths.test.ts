import { describe, expect, it } from 'vitest';
import { dataDirSetting, dbPathSetting, ttsDirSetting, uploadDirSetting } from '../paths';
import { isDemoMode } from '../demoMode';

describe('lib/paths', () => {
  it('keeps the local defaults under data/', () => {
    expect(dataDirSetting({})).toBe('data');
    expect(dbPathSetting({}, () => false)).toBe('data/traceit.db');
    expect(uploadDirSetting({})).toBe('data/uploads');
    expect(ttsDirSetting({})).toBe('data/tts');
  });

  it('moves everything under TRACEIT_DATA_DIR (a Railway volume at /data)', () => {
    const env = { TRACEIT_DATA_DIR: '/data' };
    expect(dbPathSetting(env)).toBe('/data/traceit.db');
    expect(uploadDirSetting(env)).toBe('/data/uploads');
    expect(ttsDirSetting(env)).toBe('/data/tts');
  });

  it('still reads the pre-rename INKLING_* variables, with TRACEIT_* winning', () => {
    expect(dataDirSetting({ INKLING_DATA_DIR: '/data' })).toBe('/data');
    expect(dataDirSetting({ INKLING_DATA_DIR: '/old', TRACEIT_DATA_DIR: '/new' })).toBe('/new');
    expect(dbPathSetting({ INKLING_DB_PATH: 'data/old.db' })).toBe('data/old.db');
    expect(uploadDirSetting({ INKLING_UPLOAD_DIR: '/up' })).toBe('/up');
    expect(ttsDirSetting({ TRACEIT_TTS_DIR: ' ', INKLING_TTS_DIR: '/tts' })).toBe('/tts');
  });

  it('keeps using an existing inkling.db until a traceit.db exists', () => {
    const only = (...paths: string[]) => (p: string) => paths.includes(p);
    expect(dbPathSetting({ TRACEIT_DATA_DIR: '/data' }, only('/data/inkling.db'))).toBe('/data/inkling.db');
    expect(dbPathSetting({ TRACEIT_DATA_DIR: '/data' }, only('/data/inkling.db', '/data/traceit.db'))).toBe('/data/traceit.db');
    expect(dbPathSetting({ TRACEIT_DATA_DIR: '/data' }, only())).toBe('/data/traceit.db');
  });

  it('lets the per-item variables win, and ignores blank values', () => {
    const env = { TRACEIT_DATA_DIR: '/data', TRACEIT_DB_PATH: 'data/e2e.db', TRACEIT_UPLOAD_DIR: ' ', TRACEIT_TTS_DIR: '/tmp/tts' };
    expect(dbPathSetting(env)).toBe('data/e2e.db');
    expect(uploadDirSetting(env)).toBe('/data/uploads');
    expect(ttsDirSetting(env)).toBe('/tmp/tts');
  });
});

describe('isDemoMode', () => {
  it('accepts the usual truthy spellings only', () => {
    for (const v of ['1', 'true', 'YES', ' on ']) expect(isDemoMode({ DEMO_MODE: v })).toBe(true);
    for (const v of [undefined, '', '0', 'false', 'demo']) expect(isDemoMode({ DEMO_MODE: v })).toBe(false);
  });
});
