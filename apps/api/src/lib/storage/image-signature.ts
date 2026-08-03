const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/**
 * True when `buffer` genuinely starts with a JPEG's magic bytes (`FF D8 FF`) — never trust a
 * client-declared content-type or a file extension for this; check the actual bytes.
 */
export function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= JPEG_SIGNATURE.length &&
    JPEG_SIGNATURE.every((byte, index) => buffer[index] === byte)
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * True when `buffer` genuinely starts with a PNG's magic bytes — never trust a client-declared
 * content-type or file extension for this; check the actual bytes. Same discipline as `isJpeg`.
 */
export function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)
  );
}
