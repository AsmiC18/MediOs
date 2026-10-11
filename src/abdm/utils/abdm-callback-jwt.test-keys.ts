import { generateKeyPairSync, sign } from 'crypto';

export type AbdmCallbackJwtTestKeyPair = {
  publicKeyPem: string;
  privateKeyPem: string;
};

export function createAbdmCallbackJwtTestKeyPair(): AbdmCallbackJwtTestKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function signAbdmCallbackTestJwt(
  privateKeyPem: string,
  payload: Record<string, unknown>,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = sign(
    'RSA-SHA256',
    Buffer.from(signingInput),
    privateKeyPem,
  ).toString('base64url');

  return `${signingInput}.${signature}`;
}
