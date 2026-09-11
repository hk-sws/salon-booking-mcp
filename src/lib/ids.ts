// Dependency-free id + reference generators.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomString(len: number, alphabet = ALPHABET): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** e.g. bkg_7fa2c1 */
export function id(prefix: string): string {
  return `${prefix}_${randomString(6)}`;
}

/** Short, human-sayable booking reference, e.g. "B729". */
export function bookingReference(): string {
  return 'B' + randomString(3, '0123456789');
}
