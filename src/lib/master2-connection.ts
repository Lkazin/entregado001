import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMaster1Signature(secret: string, mode: 'demo' | 'live', timestamp: string, body: string, signature: string) {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update('master1:master2-' + mode + ':' + timestamp + ':' + body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
