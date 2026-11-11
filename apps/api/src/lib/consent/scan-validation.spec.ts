import {
  MAX_SCAN_PAGES,
  validateScanItemIds,
  validateScanPages,
  validateSignedDate,
} from './scan-validation';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000)]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(2000),
]);

describe('validateScanPages', () => {
  it('accepts JPEG and PNG pages and reports the extension by the real bytes', () => {
    expect(validateScanPages([jpeg, png])).toEqual({
      ok: true,
      pages: [
        { buffer: jpeg, extension: 'jpg' },
        { buffer: png, extension: 'png' },
      ],
    });
  });

  it('rejects no pages', () => {
    expect(validateScanPages([])).toMatchObject({ ok: false });
  });

  it('rejects more than MAX_SCAN_PAGES pages', () => {
    expect(validateScanPages(Array(MAX_SCAN_PAGES + 1).fill(jpeg))).toMatchObject({ ok: false });
  });

  it('rejects a PDF even when it is named like an image', () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(2000)]);
    expect(validateScanPages([pdf])).toMatchObject({ ok: false });
  });

  it('rejects a page that is too small', () => {
    expect(validateScanPages([Buffer.from([0xff, 0xd8, 0xff])])).toMatchObject({ ok: false });
  });

  it('rejects a page that is too large', () => {
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10 * 1024 * 1024)]);
    expect(validateScanPages([huge])).toMatchObject({ ok: false });
  });
});

describe('validateSignedDate', () => {
  it('accepts a real past or current date', () => {
    expect(validateSignedDate('2026-11-10', '2026-11-11')).toBeNull();
    expect(validateSignedDate('2026-11-11', '2026-11-11')).toBeNull();
  });

  it.each(['2026-02-30', '2026-13-01', '11/11/2026', '', 'hoy'])('rejects %s', (v) => {
    expect(validateSignedDate(v, '2026-11-11')).not.toBeNull();
  });

  it('rejects a future date', () => {
    expect(validateSignedDate('2026-11-12', '2026-11-11')).not.toBeNull();
  });
});

describe('validateScanItemIds', () => {
  it('accepts unsigned items of the treatment', () => {
    expect(validateScanItemIds(['a', 'b'], ['a', 'b', 'c'], [])).toEqual({ ok: true });
  });

  it('rejects an empty list', () => {
    expect(validateScanItemIds([], ['a'], [])).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects a repeated id', () => {
    expect(validateScanItemIds(['a', 'a'], ['a'], [])).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
  });

  it('rejects an item that belongs to another treatment', () => {
    expect(validateScanItemIds(['x'], ['a'], [])).toMatchObject({
      ok: false,
      code: 'NOT_IN_TREATMENT',
    });
  });

  it('rejects an item that already has a signed consent', () => {
    expect(validateScanItemIds(['a'], ['a'], ['a'])).toMatchObject({
      ok: false,
      code: 'ALREADY_SIGNED',
    });
  });
});
