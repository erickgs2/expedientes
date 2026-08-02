import { isJpeg } from './image-signature';

describe('isJpeg', () => {
  it('returns true for a buffer starting with the real JPEG signature', () => {
    expect(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe(true);
  });

  it('returns false for a PNG signature', () => {
    expect(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('returns false for an empty buffer', () => {
    expect(isJpeg(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for a buffer shorter than the signature', () => {
    expect(isJpeg(Buffer.from([0xff, 0xd8]))).toBe(false);
  });

  it('returns false when the third byte does not match the JPEG signature', () => {
    expect(isJpeg(Buffer.from([0xff, 0xd8, 0x00, 0x01]))).toBe(false);
  });

  it('returns false for arbitrary text content (e.g. an uploaded .html/.svg pretending to be a photo)', () => {
    expect(isJpeg(Buffer.from('<html></html>'))).toBe(false);
  });
});
