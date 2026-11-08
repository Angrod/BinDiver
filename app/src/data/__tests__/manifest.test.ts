import { parseManifest } from '../manifest';

const valid = {
  phone_format: 1,
  price_date: '2026-11-06',
  file: 'cards-phone-2026-11-06.zip',
  zip_bytes: 1000,
  db_bytes: 5000,
  sha256: 'a'.repeat(64),
};

describe('parseManifest', () => {
  it('round-trips a valid manifest', () => {
    expect(parseManifest(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });
  it('throws on a missing field', () => {
    const { sha256, ...rest } = valid;
    expect(() => parseManifest(rest)).toThrow('bad manifest');
  });
  it('throws on a path-like file name', () => {
    expect(() => parseManifest({ ...valid, file: '../x.zip' })).toThrow('bad manifest');
  });
  it('throws on a 63-character sha256', () => {
    expect(() => parseManifest({ ...valid, sha256: 'a'.repeat(63) })).toThrow('bad manifest');
  });
  it('throws on a string phone_format', () => {
    expect(() => parseManifest({ ...valid, phone_format: '1' })).toThrow('bad manifest');
  });
  it('throws on non-objects', () => {
    expect(() => parseManifest(null)).toThrow('bad manifest');
  });
});
