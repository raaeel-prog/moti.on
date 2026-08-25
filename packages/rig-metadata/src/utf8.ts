import { fail } from "./errors.js";

function assertValidUtf16(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        fail("INVALID_UTF8", "A string contém um high surrogate sem par.");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail("INVALID_UTF8", "A string contém um low surrogate sem par.");
    }
  }
}

/** Codificador UTF-8 independente de Buffer, TextEncoder, DOM ou APIs de host. */
export function encodeUtf8(value: string): Uint8Array {
  assertValidUtf16(value);
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
      index += 1;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >>> 12));
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >>> 18));
      bytes.push(0x80 | ((codePoint >>> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >>> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }

  return Uint8Array.from(bytes);
}

function continuation(byte: number | undefined): number {
  if (byte === undefined || (byte & 0xc0) !== 0x80) {
    fail("INVALID_UTF8", "A sequência UTF-8 está truncada ou possui continuation byte inválido.");
  }
  return byte;
}

/** Decodificador estrito: recusa overlong, surrogate code points e valores fora do Unicode. */
export function decodeUtf8(bytes: Uint8Array): string {
  let result = "";

  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];
    if (first === undefined) {
      fail("INVALID_UTF8", "A sequência UTF-8 terminou inesperadamente.");
    }

    let codePoint: number;
    if (first <= 0x7f) {
      codePoint = first;
    } else if (first >= 0xc2 && first <= 0xdf) {
      const second = continuation(bytes[index + 1]);
      codePoint = ((first & 0x1f) << 6) | (second & 0x3f);
      index += 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      const second = continuation(bytes[index + 1]);
      const third = continuation(bytes[index + 2]);
      if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second >= 0xa0)) {
        fail("INVALID_UTF8", "A sequência UTF-8 de três bytes não é canônica.");
      }
      codePoint = ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
      index += 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      const second = continuation(bytes[index + 1]);
      const third = continuation(bytes[index + 2]);
      const fourth = continuation(bytes[index + 3]);
      if ((first === 0xf0 && second < 0x90) || (first === 0xf4 && second >= 0x90)) {
        fail("INVALID_UTF8", "A sequência UTF-8 de quatro bytes está fora do intervalo Unicode.");
      }
      codePoint = ((first & 0x07) << 18)
        | ((second & 0x3f) << 12)
        | ((third & 0x3f) << 6)
        | (fourth & 0x3f);
      index += 3;
    } else {
      fail("INVALID_UTF8", "A sequência contém um byte inicial UTF-8 inválido.");
    }

    if (codePoint <= 0xffff) {
      result += String.fromCharCode(codePoint);
    } else {
      const adjusted = codePoint - 0x10000;
      result += String.fromCharCode(0xd800 + (adjusted >>> 10));
      result += String.fromCharCode(0xdc00 + (adjusted & 0x3ff));
    }
  }

  return result;
}

export function utf8ByteLength(value: string): number {
  return encodeUtf8(value).length;
}
