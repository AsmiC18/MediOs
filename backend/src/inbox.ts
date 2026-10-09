import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Injectable, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Database } from './database';
import { Identity, Permission, StaffGuard, StaffRequest } from './auth';
import { PageQuery, SendText, UpdateConversation } from './dto';

@Injectable()
export class InboxService {
  constructor(private readonly db: Database) {}
  scope(user: Identity) { return { hospitalId: user.hospitalId, branchId: user.branchId }; }
  async audit(user: Identity, action: string, resourceId?: string) {
    await this.db.auditEntry.create({ data: { ...this.scope(user), actorId: user.sub, action, resourceId } });
  }
  async conversation(user: Identity, id: string) {
    const result = await this.db.conversation.findFirst({ where: { id, ...this.scope(user) } });
    if (!result) throw new NotFoundException('Conversation not found');
    return result;
  }
  async send(user: Identity, id: string, text: string, key?: string) {
    const conversation = await this.conversation(user, id);
    if (!text.trim()) throw new BadRequestException('Message cannot be blank');
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new BadRequestException('Supply a stable Idempotency-Key (16-128 characters)');
    const scopedKey = createHash('sha256').update(JSON.stringify([user.hospitalId, user.branchId, user.sub, key])).digest('hex');
    const prior = await this.db.message.findUnique({ where: { idempotencyKey: scopedKey } });
    if (prior) {
      if (prior.conversationId !== id || prior.text !== text.trim()) throw new ConflictException('Idempotency key already used for a different request');
      return prior;
    }
    if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() >= 24 * 3600000) {
      throw new ConflictException('Text reply window closed. An approved template is required.');
    }
    try {
      return await this.db.$transaction(async tx => {
        const message = await tx.message.create({ data: {
          conversationId: id, outgoing: true, text: text.trim(), status: 'queued', idempotencyKey: scopedKey,
          job: { create: {} },
        } });
        await tx.conversation.update({ where: { id }, data: { lastMessageAt: message.at, status: 'open' } });
        await tx.auditEntry.create({ data: { ...this.scope(user), actorId: user.sub, action: 'whatsapp.message.queue', resourceId: message.id } });
        return message;
      });
    } catch (error: any) {
      if (error.code !== 'P2002') throw error;
      const existing = await this.db.message.findUnique({ where: { idempotencyKey: scopedKey } });
      if (!existing || existing.conversationId !== id || existing.text !== text.trim()) throw new ConflictException('Idempotency conflict');
      return existing;
    }
  }
}

@Controller('whatsapp/session')
@UseGuards(StaffGuard)
export class SessionController {
  @Get() @Permission('whatsapp.inbox.view')
  session(@Req() req: StaffRequest) {
    const { sub, hospitalId, branchId, permissions } = req.identity;
    return { sub, hospitalId, branchId, permissions };
  }
}

@Controller('whatsapp/conversations')
@UseGuards(StaffGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService, private readonly db: Database) {}
  @Get() @Permission('whatsapp.inbox.view')
  async list(@Req() req: StaffRequest, @Query() page: PageQuery) {
    await this.inbox.audit(req.identity, 'whatsapp.conversations.list');
    const where = this.inbox.scope(req.identity);
    const [items, total] = await this.db.$transaction([
      this.db.conversation.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }], skip: page.offset, take: page.limit }),
      this.db.conversation.count({ where }),
    ]);
    return { items, total, offset: page.offset, limit: page.limit };
  }
  @Get(':id') @Permission('whatsapp.inbox.view')
  async detail(@Req() req: StaffRequest, @Param('id') id: string) {
    const conversation = await this.inbox.conversation(req.identity, id);
    await this.inbox.audit(req.identity, 'whatsapp.conversation.read', id);
    return conversation;
  }
  @Get(':id/messages') @Permission('whatsapp.inbox.view')
  async messages(@Req() req: StaffRequest, @Param('id') id: string, @Query() page: PageQuery) {
    await this.inbox.conversation(req.identity, id);
    await this.inbox.audit(req.identity, 'whatsapp.messages.read', id);
    const where = { conversationId: id };
    const [items, total] = await this.db.$transaction([
      this.db.message.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'asc' }], skip: page.offset, take: page.limit }),
      this.db.message.count({ where }),
    ]);
    return { items, total, offset: page.offset, limit: page.limit };
  }
  @Post(':id/messages') @Permission('whatsapp.inbox.reply')
  send(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: SendText, @Headers('idempotency-key') key?: string) {
    return this.inbox.send(req.identity, id, body.text, key);
  }
  @Patch(':id/read') @Permission('whatsapp.inbox.view')
  async read(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: UpdateConversation) {
    if (body.status !== undefined || body.unreadCount === undefined) throw new BadRequestException('Only unreadCount is accepted');
    return this.update(req.identity, id, { unreadCount: body.unreadCount });
  }
  @Patch(':id/status') @Permission('whatsapp.inbox.resolve')
  async status(@Req() req: StaffRequest, @Param('id') id: string, @Body() body: UpdateConversation) {
    if (body.unreadCount !== undefined || !body.status) throw new BadRequestException('Only status is accepted');
    return this.update(req.identity, id, { status: body.status });
  }
  private async update(user: Identity, id: string, data: UpdateConversation) {
    await this.inbox.conversation(user, id);
    return this.db.$transaction(async tx => {
      const result = await tx.conversation.update({ where: { id }, data });
      await tx.auditEntry.create({ data: { ...this.inbox.scope(user), actorId: user.sub, action: 'whatsapp.conversation.update', resourceId: id } });
      return result;
    });
  }
}
