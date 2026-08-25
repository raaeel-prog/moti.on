import { encodeUtf8 } from "./utf8.js";

const ROUND_CONSTANTS = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function paddedMessage(bytes: Uint8Array): Uint8Array {
  const zeroPadding = (64 - ((bytes.length + 9) % 64)) % 64;
  const padded = new Uint8Array(bytes.length + 1 + zeroPadding + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const high = Math.floor(bytes.length / 0x20000000);
  const low = (bytes.length << 3) >>> 0;
  const offset = padded.length - 8;
  padded[offset] = (high >>> 24) & 0xff;
  padded[offset + 1] = (high >>> 16) & 0xff;
  padded[offset + 2] = (high >>> 8) & 0xff;
  padded[offset + 3] = high & 0xff;
  padded[offset + 4] = (low >>> 24) & 0xff;
  padded[offset + 5] = (low >>> 16) & 0xff;
  padded[offset + 6] = (low >>> 8) & 0xff;
  padded[offset + 7] = low & 0xff;
  return padded;
}

function toHex(value: number): string {
  return value.toString(16).padStart(8, "0");
}

/** SHA-256 síncrono e puro para runtimes sem `node:crypto` ou WebCrypto. */
export function sha256Hex(value: string): string {
  const message = paddedMessage(encodeUtf8(value));
  const words = new Uint32Array(64);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const position = offset + (index * 4);
      words[index] = ((message[position] ?? 0) << 24)
        | ((message[position + 1] ?? 0) << 16)
        | ((message[position + 2] ?? 0) << 8)
        | (message[position + 3] ?? 0);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15] ?? 0;
      const previous2 = words[index - 2] ?? 0;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0
        + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + (ROUND_CONSTANTS[index] ?? 0)
        + (words[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}`
    + `${toHex(h4)}${toHex(h5)}${toHex(h6)}${toHex(h7)}`;
}
