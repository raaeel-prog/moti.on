import { fail } from "./errors.js";
import { decodeUtf8, encodeUtf8 } from "./utf8.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeBase64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];

    encoded += ALPHABET[(first >>> 2) & 0x3f];
    encoded += ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >>> 4)];
    if (second !== undefined) {
      encoded += ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >>> 6)];
    }
    if (third !== undefined) {
      encoded += ALPHABET[third & 0x3f];
    }
  }
  return encoded;
}

function alphabetValue(character: string | undefined): number {
  if (character === undefined) {
    fail("INVALID_BASE64URL", "O payload base64url está truncado.");
  }
  const value = ALPHABET.indexOf(character);
  if (value < 0) {
    fail("INVALID_BASE64URL", "O payload usa caractere ou padding proibido em base64url.");
  }
  return value;
}

export function decodeBase64Url(encoded: string): Uint8Array {
  if (encoded.length === 0 || encoded.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    fail("INVALID_BASE64URL", "O payload não é base64url sem padding válido.");
  }

  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 4) {
    const first = alphabetValue(encoded[index]);
    const second = alphabetValue(encoded[index + 1]);
    const thirdCharacter = encoded[index + 2];
    const fourthCharacter = encoded[index + 3];
    const third = thirdCharacter === undefined ? 0 : alphabetValue(thirdCharacter);
    const fourth = fourthCharacter === undefined ? 0 : alphabetValue(fourthCharacter);

    bytes.push((first << 2) | (second >>> 4));
    if (thirdCharacter !== undefined) {
      bytes.push(((second & 0x0f) << 4) | (third >>> 2));
    }
    if (fourthCharacter !== undefined) {
      bytes.push(((third & 0x03) << 6) | fourth);
    }
  }

  const result = Uint8Array.from(bytes);
  if (encodeBase64Url(result) !== encoded) {
    fail("INVALID_BASE64URL", "O payload base64url possui pad bits não canônicos.");
  }
  return result;
}

export function encodeBase64UrlUtf8(value: string): string {
  return encodeBase64Url(encodeUtf8(value));
}

export function decodeBase64UrlUtf8(value: string): string {
  return decodeUtf8(decodeBase64Url(value));
}
