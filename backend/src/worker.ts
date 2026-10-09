import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Database } from './database';
import { deliveryRank } from './webhook';

@Injectable()
export class SendWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(SendWorker.name);
  constructor(private readonly db: Database) {}
  onModuleInit() {
    if (process.env.WORKER_ENABLED !== 'true') return;
    for (const key of ['META_GRAPH_VERSION', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_HOSPITAL_ID', 'WHATSAPP_BRANCH_ID']) {
      if (!process.env[key]) throw new Error(`${key} is required for the worker`);
    }
    if (!/^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION!)) throw new Error('Invalid Graph version');
    if (!/^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID!)) throw new Error('Invalid phone number ID');
    this.timer = setInterval(() => { void this.tick(); }, 1000);
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    // Allow the bounded provider request to finish before Prisma disconnects.
    while (this.running) await new Promise(resolve => setTimeout(resolve, 50));
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // A crashed worker may have submitted to Meta. Never blindly resend its lease.
      await this.db.$transaction(async tx => {
        const stale = await tx.sendJob.findMany({ where: { status: 'processing', claimedAt: { lt: new Date(Date.now() - 120000) }, message: { conversation: { hospitalId: process.env.WHATSAPP_HOSPITAL_ID!, branchId: process.env.WHATSAPP_BRANCH_ID! } } } });
        for (const job of stale) {
          const changed = await tx.sendJob.updateMany({ where: { id: job.id, status: 'processing', claimedAt: job.claimedAt }, data: { status: 'submit_uncertain', errorCode: 'WORKER_LEASE_EXPIRED' } });
          if (changed.count) await tx.message.updateMany({ where: { id: job.messageId, status: 'queued' }, data: { status: 'submit_uncertain' } });
        }
      });
      // Reconcile receipts that raced with persistence of Meta's send response.
      await this.db.$executeRaw`
        UPDATE "Message" m SET status = r.status
        FROM (
          SELECT DISTINCT ON ("providerId") "providerId", status,
            CASE status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END AS rank
          FROM "DeliveryReceipt"
          ORDER BY "providerId", rank DESC
        ) r, "Conversation" c
        WHERE m."providerId" = r."providerId" AND m.outgoing = true AND c.id = m."conversationId"
          AND c."hospitalId" = ${process.env.WHATSAPP_HOSPITAL_ID!}
          AND c."branchId" = ${process.env.WHATSAPP_BRANCH_ID!}
          AND r.rank > CASE m.status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END`;
      const jobs = await this.db.$queryRaw<{ id: string; messageId: string }[]>`
        UPDATE "SendJob" SET status = 'processing', "claimedAt" = NOW(), attempts = attempts + 1
        WHERE id IN (
          SELECT j.id FROM "SendJob" j
          JOIN "Message" m ON m.id = j."messageId"
          JOIN "Conversation" c ON c.id = m."conversationId"
          WHERE j.status = 'queued' AND j."runAt" <= NOW()
          AND c."hospitalId" = ${process.env.WHATSAPP_HOSPITAL_ID!}
          AND c."branchId" = ${process.env.WHATSAPP_BRANCH_ID!}
          ORDER BY j."runAt" FOR UPDATE OF j SKIP LOCKED LIMIT 1
        ) RETURNING id, "messageId"`;
      if (jobs[0]) await this.send(jobs[0]);
    } catch {
      // Do not log credentials, message bodies, provider payloads or patient identifiers.
      this.logger.error('WhatsApp worker cycle failed; inspect database/provider configuration');
    } finally { this.running = false; }
  }
  private async finish(job: { id: string; messageId: string }, status: string, errorCode?: string, providerId?: string) {
    await this.db.$transaction(async tx => {
      let messageStatus = status;
      if (providerId) {
        // Receipts can arrive before the send HTTP response is persisted.
        const receipts = await tx.deliveryReceipt.findMany({ where: { providerId } });
        for (const receipt of receipts) if ((deliveryRank[receipt.status] || 0) > (deliveryRank[messageStatus] || 0)) messageStatus = receipt.status;
      }
      await tx.message.update({ where: { id: job.messageId }, data: { status: messageStatus, ...(providerId ? { providerId } : {}) } });
      await tx.sendJob.update({ where: { id: job.id }, data: { status: status === 'sent' ? 'completed' : status, errorCode } });
    });
  }
  private async send(job: { id: string; messageId: string }) {
    const message = await this.db.message.findUniqueOrThrow({ where: { id: job.messageId }, include: { conversation: true } });
    const conversation = message.conversation;
    if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() >= 86400000) {
      await this.finish(job, 'failed', 'REPLY_WINDOW_CLOSED'); return;
    }
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: conversation.phone, type: 'text', text: { body: message.text } }),
      });
    } catch { await this.finish(job, 'submit_uncertain', 'NETWORK_OR_TIMEOUT'); return; }
    let data: any;
    try { data = await response.json(); }
    catch { await this.finish(job, 'submit_uncertain', 'INVALID_PROVIDER_RESPONSE'); return; }
    if (response.ok && typeof data.messages?.[0]?.id === 'string') {
      await this.finish(job, 'sent', undefined, data.messages[0].id); return;
    }
    if (response.status === 429 && data.error) {
      // Explicit rate-limit rejection is safe to retry; ambiguous 5xx is not.
      if ((await this.db.sendJob.findUniqueOrThrow({ where: { id: job.id } })).attempts < 5) {
        await this.db.sendJob.update({ where: { id: job.id }, data: { status: 'queued', runAt: new Date(Date.now() + 60000), errorCode: 'RATE_LIMITED' } });
        return;
      }
    }
    const rejected = response.status >= 400 && response.status < 500 && !!data.error;
    await this.finish(job, rejected ? 'failed' : 'submit_uncertain', `HTTP_${response.status}`);
  }
}
