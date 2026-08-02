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
