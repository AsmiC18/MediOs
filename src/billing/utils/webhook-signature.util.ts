import { createHmac, timingSafeEqual } from 'crypto';

export function verifyRazorpayWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  webhookSecret: string,
): boolean {
  if (!signature) {
    return false;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody, 'utf8');
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(bodyBuffer)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
