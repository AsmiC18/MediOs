import { BadRequestException, Controller, Get, HttpCode, Post, Query, RawBodyRequest, Req, Res, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Database } from './database';

export const deliveryRank: Record<string, number> = { sent: 1, failed: 2, delivered: 3, read: 4 };

@Controller('webhooks/whatsapp')
export class WebhookController {
  constructor(private readonly db: Database) {}
  @Get()
  verify(@Query() query: Record<string, string>, @Res() res: Response) {
    const expected = process.env.META_VERIFY_TOKEN;
    if (!expected) throw new ServiceUnavailableException('Webhook is not configured');
    if (query['hub.mode'] !== 'subscribe' || query['hub.verify_token'] !== expected || !query['hub.challenge']) throw new UnauthorizedException();
    res.type('text/plain').send(query['hub.challenge']);
  }
  @Post() @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>) {
    const secret = process.env.META_APP_SECRET;
    if (!secret) throw new ServiceUnavailableException('Webhook is not configured');
    const signature = req.headers['x-hub-signature-256'];
    if (typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/.test(signature) || !req.rawBody) throw new UnauthorizedException();
    const expected = createHmac('sha256', secret).update(req.rawBody).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new UnauthorizedException();
    if (req.body?.object !== 'whatsapp_business_account' || !Array.isArray(req.body.entry)) throw new BadRequestException('Invalid webhook');
    for (const entry of req.body.entry) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        // Route using Meta's signed business-number metadata, never sender phone alone.
        if (value?.metadata?.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
        const hospitalId = process.env.WHATSAPP_HOSPITAL_ID;
        const branchId = process.env.WHATSAPP_BRANCH_ID;
        if (!hospitalId || !branchId) throw new ServiceUnavailableException('Business number mapping is missing');
        for (const message of value.messages || []) {
          if (typeof message.id !== 'string' || !/^\d{7,15}$/.test(message.from) || !/^\d+$/.test(message.timestamp)) throw new BadRequestException('Invalid inbound message');
          const at = new Date(Number(message.timestamp) * 1000);
          if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 60000) throw new BadRequestException('Invalid timestamp');
          const text = message.type === 'text' ? message.text?.body : `[${String(message.type).slice(0, 40)} message: media download not implemented]`;
          if (typeof text !== 'string' || text.length > 10000) throw new BadRequestException('Invalid message text');
          const name = value.contacts?.find((c: any) => c.wa_id === message.from)?.profile?.name;
          await this.db.$transaction(async tx => {
            const event = await tx.webhookEvent.createMany({ data: [{ key: `${hospitalId}:${branchId}:inbound:${message.id}` }], skipDuplicates: true });
            if (!event.count) return;
            const conversation = await tx.conversation.upsert({
              where: { hospitalId_branchId_phone: { hospitalId, branchId, phone: message.from } },
              create: { hospitalId, branchId, phone: message.from, displayName: typeof name === 'string' ? name.slice(0, 200) : message.from, lastInboundAt: at, lastMessageAt: at, unreadCount: 1 },
              update: { unreadCount: { increment: 1 }, status: 'open' },
            });
            // Delayed webhook deliveries must not regress the customer-service window.
            await tx.conversation.updateMany({ where: { id: conversation.id, OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: at } }] }, data: { lastInboundAt: at } });
            await tx.conversation.updateMany({ where: { id: conversation.id, lastMessageAt: { lt: at } }, data: { lastMessageAt: at } });
            await tx.message.create({ data: { conversationId: conversation.id, providerId: message.id, outgoing: false, text, at, status: 'received' } });
          });
        }
        for (const receipt of value.statuses || []) {
          if (typeof receipt.id !== 'string' || !deliveryRank[receipt.status] || !/^\d+$/.test(receipt.timestamp)) continue;
          const at = new Date(Number(receipt.timestamp) * 1000);
          if (!Number.isFinite(at.getTime())) continue;
          await this.db.$transaction(async tx => {
            await tx.deliveryReceipt.createMany({ data: [{ key: `${hospitalId}:${branchId}:${receipt.id}:${receipt.status}:${receipt.timestamp}`, providerId: receipt.id, status: receipt.status, at }], skipDuplicates: true });
            // Match only messages belonging to this business number's tenant and branch.
            const message = await tx.message.findFirst({ where: { providerId: receipt.id, outgoing: true, conversation: { hospitalId, branchId } } });
            if (message && (deliveryRank[message.status] || 0) < deliveryRank[receipt.status]) {
              await tx.message.updateMany({ where: { id: message.id, status: message.status }, data: { status: receipt.status } });
            }
          });
        }
      }
    }
    // Acknowledge only after durable persistence. DB failures return a retryable 5xx.
    return { received: true };
  }
}
