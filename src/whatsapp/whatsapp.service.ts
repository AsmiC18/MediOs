import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  InvoiceStatus,
  Patient,
  Prisma,
  WhatsAppConversation,
  WhatsAppConversationState,
  WhatsAppMessage,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsAppMessageQueryDto } from './dto/whatsapp-message-query.dto';
import { MetaWhatsAppService } from './meta-whatsapp.service';
import {
  assertUniquePatientPhoneLookup,
  toWhatsAppRecipientId,
} from '../common/utils/phone.util';
import {
  inboundWaIdToCanonicalPhone,
  truncateMessageContent,
} from './utils/phone.util';
import { checkOutboundRateLimit } from './utils/rate-limiter.util';
import { validateTemplateRequest } from './utils/template-allowlist';
import { verifyWhatsAppWebhookSignature } from './utils/webhook-signature.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          phone_number_id?: string;
        };
        messages?: Array<{
          from?: string;
          id?: string;
          type?: string;
          text?: {
            body?: string;
          };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          errors?: Array<{
            code?: number;
            title?: string;
            message?: string;
          }>;
        }>;
      };
    }>;
  }>;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MENU_TRIGGERS = new Set(['hi', 'hello', 'menu']);

const STATUS_RANK: Record<WhatsAppMessageStatus, number> = {
  [WhatsAppMessageStatus.QUEUED]: 0,
  [WhatsAppMessageStatus.SENT]: 1,
  [WhatsAppMessageStatus.DELIVERED]: 2,
  [WhatsAppMessageStatus.READ]: 3,
  [WhatsAppMessageStatus.FAILED]: 99,
};

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
  ) {}

  private getConfiguredHospitalId(): string {
    const hospitalId = process.env.WHATSAPP_HOSPITAL_ID?.trim();

    if (!hospitalId) {
      throw new BadRequestException('WhatsApp hospital mapping is not configured');
    }

    return hospitalId;
  }

  private getConfiguredPhoneNumberId(): string {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!phoneNumberId) {
      throw new BadRequestException('WhatsApp phone number ID is not configured');
    }

    return phoneNumberId;
  }

  private getRateLimitPerMinute(): number {
    const configured = Number(process.env.WHATSAPP_RATE_LIMIT_PER_MINUTE ?? 20);
    return Number.isFinite(configured) && configured > 0 ? configured : 20;
  }

  private assertOutboundRateLimit(hospitalId: string): void {
    if (!checkOutboundRateLimit(hospitalId, this.getRateLimitPerMinute())) {
      throw new HttpException(
        'WhatsApp outbound rate limit exceeded for this hospital',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async findOwnedPatient(
    user: AuthenticatedUser,
    patientId: string,
  ): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        hospitalId: user.hospitalId,
        mergedIntoPatientId: null,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  async findPatientByPhone(
    hospitalId: string,
    waId: string,
  ): Promise<Patient | null> {
    const canonicalPhone = inboundWaIdToCanonicalPhone(waId);

    if (!canonicalPhone) {
      return null;
    }

    const matches = await this.prisma.patient.findMany({
      where: {
        hospitalId,
        mergedIntoPatientId: null,
        phone: canonicalPhone,
      },
    });

    return assertUniquePatientPhoneLookup(matches, canonicalPhone);
  }

  private resolveRecipientPhone(patient: Patient): string {
    try {
      return toWhatsAppRecipientId(patient.phone);
    } catch {
      throw new BadRequestException('Patient phone number is invalid for WhatsApp');
    }
  }

  private formatMessageResponse(message: WhatsAppMessage) {
    return {
      messageId: message.id,
      conversationId: message.conversationId,
      status: message.status,
      providerMessageId: message.providerMessageId,
      type: message.messageType.toLowerCase(),
      direction: message.direction,
      content: message.content,
      templateName: message.templateName,
      createdAt: message.createdAt,
    };
  }

  private async getOrCreateConversation(
    patient: Patient,
  ): Promise<WhatsAppConversation> {
    const existing = await this.prisma.whatsAppConversation.findUnique({
      where: {
        hospitalId_patientId: {
          hospitalId: patient.hospitalId,
          patientId: patient.id,
        },
      },
    });

    if (existing) {
      if (existing.state === WhatsAppConversationState.CLOSED) {
        return this.prisma.whatsAppConversation.update({
          where: { id: existing.id },
          data: {
            state: WhatsAppConversationState.IDLE,
            closedAt: null,
            contextJson: Prisma.JsonNull,
          },
        });
      }

      return existing;
    }

    return this.prisma.whatsAppConversation.create({
      data: {
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        patientId: patient.id,
        state: WhatsAppConversationState.IDLE,
      },
    });
  }

  async sendMessage(
    user: AuthenticatedUser,
    patientId: string,
    dto: SendWhatsAppMessageDto,
  ) {
    const patient = await this.findOwnedPatient(user, patientId);
    this.assertOutboundRateLimit(user.hospitalId);

    const conversation = await this.getOrCreateConversation(patient);
    const recipientPhone = this.resolveRecipientPhone(patient);
    const now = new Date();

    if (dto.type === 'text') {
      const content = truncateMessageContent(dto.text!.trim());

      const message = await this.prisma.whatsAppMessage.create({
        data: {
          hospitalId: user.hospitalId,
          branchId: patient.branchId,
          patientId: patient.id,
          conversationId: conversation.id,
          direction: WhatsAppMessageDirection.OUTBOUND,
          messageType: WhatsAppMessageType.TEXT,
          status: WhatsAppMessageStatus.QUEUED,
          content,
        },
      });

      await this.auditService.log({
        action: 'WHATSAPP_MESSAGE_INITIATED',
        entity: 'WhatsAppMessage',
        entityId: message.id,
        hospitalId: user.hospitalId,
        branchId: patient.branchId,
        userId: user.sub,
        metadata: {
          patientId: patient.id,
          conversationId: conversation.id,
          messageType: WhatsAppMessageType.TEXT,
        },
      });

      try {
        const providerResult = await this.metaWhatsAppService.sendText({
          toPhone: recipientPhone,
          text: content,
          mockFail: content === 'MOCK_SEND_FAIL',
        });

        const updated = await this.prisma.whatsAppMessage.update({
          where: { id: message.id },
          data: {
            status: WhatsAppMessageStatus.SENT,
            providerMessageId: providerResult.providerMessageId,
            sentAt: now,
          },
        });

        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: now },
        });

        await this.auditService.log({
          action: 'WHATSAPP_MESSAGE_SENT',
          entity: 'WhatsAppMessage',
          entityId: updated.id,
          hospitalId: user.hospitalId,
          branchId: patient.branchId,
          userId: user.sub,
          metadata: {
            patientId: patient.id,
            conversationId: conversation.id,
            providerMessageId: updated.providerMessageId,
            messageType: WhatsAppMessageType.TEXT,
            status: updated.status,
          },
        });

        return this.formatMessageResponse(updated);
      } catch (error) {
        const failureReason = this.sanitizeErrorMessage(
          error instanceof Error ? error.message : 'WhatsApp send failed',
        );

        const failed = await this.prisma.whatsAppMessage.update({
          where: { id: message.id },
          data: {
            status: WhatsAppMessageStatus.FAILED,
            errorMessage: failureReason,
            failedAt: now,
          },
        });

        await this.auditService.log({
          action: 'WHATSAPP_MESSAGE_FAILED',
          entity: 'WhatsAppMessage',
          entityId: failed.id,
          hospitalId: user.hospitalId,
          branchId: patient.branchId,
          userId: user.sub,
          metadata: {
            patientId: patient.id,
            conversationId: conversation.id,
            messageType: WhatsAppMessageType.TEXT,
            failureReason,
          },
        });

        throw new InternalServerErrorException('Failed to send WhatsApp message');
      }
    }

    try {
      validateTemplateRequest({
        templateName: dto.templateName!,
        languageCode: dto.languageCode!,
        parameters: dto.parameters ?? [],
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid template request',
      );
    }

    const parameterSummary = truncateMessageContent(
      (dto.parameters ?? []).join(' | '),
    );

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        hospitalId: user.hospitalId,
        branchId: patient.branchId,
        patientId: patient.id,
        conversationId: conversation.id,
        direction: WhatsAppMessageDirection.OUTBOUND,
        messageType: WhatsAppMessageType.TEMPLATE,
        status: WhatsAppMessageStatus.QUEUED,
        templateName: dto.templateName,
        templateLanguage: dto.languageCode,
        content: parameterSummary,
      },
    });

    await this.auditService.log({
      action: 'WHATSAPP_MESSAGE_INITIATED',
      entity: 'WhatsAppMessage',
      entityId: message.id,
      hospitalId: user.hospitalId,
      branchId: patient.branchId,
      userId: user.sub,
      metadata: {
        patientId: patient.id,
        conversationId: conversation.id,
        messageType: WhatsAppMessageType.TEMPLATE,
        templateName: dto.templateName,
      },
    });

    try {
      const providerResult = await this.metaWhatsAppService.sendTemplate({
        toPhone: recipientPhone,
        templateName: dto.templateName!,
        languageCode: dto.languageCode!,
        parameters: dto.parameters ?? [],
        mockFail: dto.templateName === 'MOCK_SEND_FAIL',
      });

      const updated = await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.SENT,
          providerMessageId: providerResult.providerMessageId,
          sentAt: now,
        },
      });

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now },
      });

      await this.auditService.log({
        action: 'WHATSAPP_MESSAGE_SENT',
        entity: 'WhatsAppMessage',
        entityId: updated.id,
        hospitalId: user.hospitalId,
        branchId: patient.branchId,
        userId: user.sub,
        metadata: {
          patientId: patient.id,
          conversationId: conversation.id,
          providerMessageId: updated.providerMessageId,
          messageType: WhatsAppMessageType.TEMPLATE,
          templateName: dto.templateName,
          status: updated.status,
        },
      });

      return this.formatMessageResponse(updated);
    } catch (error) {
      const failureReason = this.sanitizeErrorMessage(
        error instanceof Error ? error.message : 'WhatsApp template send failed',
      );

      const failed = await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.FAILED,
          errorMessage: failureReason,
          failedAt: now,
        },
      });

      await this.auditService.log({
        action: 'WHATSAPP_MESSAGE_FAILED',
        entity: 'WhatsAppMessage',
        entityId: failed.id,
        hospitalId: user.hospitalId,
        branchId: patient.branchId,
        userId: user.sub,
        metadata: {
          patientId: patient.id,
          conversationId: conversation.id,
          messageType: WhatsAppMessageType.TEMPLATE,
          templateName: dto.templateName,
          failureReason,
        },
      });

      throw new InternalServerErrorException(
        'Failed to send WhatsApp template message',
      );
    }
  }

  async listMessages(
    user: AuthenticatedUser,
    patientId: string,
    query: WhatsAppMessageQueryDto = {},
  ) {
    await this.findOwnedPatient(user, patientId);

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where = {
      hospitalId: user.hospitalId,
      patientId,
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.count({ where }),
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: data.map((message) => this.formatMessageResponse(message)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getConversation(user: AuthenticatedUser, patientId: string) {
    await this.findOwnedPatient(user, patientId);

    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: {
        hospitalId_patientId: {
          hospitalId: user.hospitalId,
          patientId,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('WhatsApp conversation not found');
    }

    return {
      conversationId: conversation.id,
      state: conversation.state,
      lastMessageAt: conversation.lastMessageAt,
      closedAt: conversation.closedAt,
      context: conversation.contextJson,
    };
  }

  verifyWebhook(mode?: string, verifyToken?: string, challenge?: string) {
    const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

    if (!configuredToken) {
      throw new BadRequestException('WhatsApp verify token is not configured');
    }

    if (mode === 'subscribe' && verifyToken === configuredToken && challenge) {
      return challenge;
    }

    throw new ForbiddenException('Invalid WhatsApp webhook verification');
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();

    if (!appSecret) {
      throw new BadRequestException('WhatsApp app secret is not configured');
    }

    if (!verifyWhatsAppWebhookSignature(rawBody, signature, appSecret)) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }

    let payload: MetaWebhookPayload;

    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MetaWebhookPayload;
    } catch {
      throw new BadRequestException('Invalid WhatsApp webhook payload');
    }

    const changes = payload.entry?.flatMap((entry) => entry.changes ?? []) ?? [];

    for (const change of changes) {
      const value = change.value;

      if (!value) {
        continue;
      }

      const phoneNumberId = value.metadata?.phone_number_id;

      if (!phoneNumberId || phoneNumberId !== this.getConfiguredPhoneNumberId()) {
        throw new ForbiddenException('Unexpected WhatsApp phone number ID');
      }

      for (const inbound of value.messages ?? []) {
        await this.processInboundMessage(inbound);
      }

      for (const status of value.statuses ?? []) {
        await this.processStatusUpdate(status);
      }
    }

    return { processed: true };
  }

  private async processInboundMessage(message: {
    from?: string;
    id?: string;
    type?: string;
    text?: { body?: string };
  }) {
    const providerMessageId = message.id;
    const waId = message.from;

    if (!providerMessageId || !waId) {
      return;
    }

    const providerEventId = providerMessageId;
    const duplicate = await this.isDuplicateWebhookEvent(providerEventId);

    if (duplicate) {
      return;
    }

    const hospitalId = this.getConfiguredHospitalId();
    const patient = await this.findPatientByPhone(hospitalId, waId);

    if (!patient) {
      await this.recordWebhookEvent(providerEventId);
      await this.auditService.log({
        action: 'WHATSAPP_INBOUND_RECEIVED',
        entity: 'WhatsAppMessage',
        hospitalId,
        metadata: {
          unknownPatient: true,
          providerMessageId,
        },
      });
      return;
    }

    if (message.type !== 'text' || !message.text?.body) {
      await this.recordWebhookEvent(providerEventId);
      return;
    }

    const content = truncateMessageContent(message.text.body.trim());
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.whatsAppWebhookEvent.create({
          data: {
            providerEventId,
          },
        });

        const conversation = await this.getOrCreateConversationInTx(tx, patient);

        await tx.whatsAppMessage.create({
          data: {
            hospitalId,
            branchId: patient.branchId,
            patientId: patient.id,
            conversationId: conversation.id,
            direction: WhatsAppMessageDirection.INBOUND,
            messageType: WhatsAppMessageType.TEXT,
            status: WhatsAppMessageStatus.DELIVERED,
            providerMessageId,
            content,
            deliveredAt: now,
          },
        });

        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: now },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }

      throw error;
    }

    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: {
        hospitalId_patientId: {
          hospitalId,
          patientId: patient.id,
        },
      },
    });

    if (!conversation) {
      return;
    }

    await this.auditService.log({
      action: 'WHATSAPP_INBOUND_RECEIVED',
      entity: 'WhatsAppMessage',
      entityId: providerMessageId,
      hospitalId,
      branchId: patient.branchId,
      metadata: {
        patientId: patient.id,
        conversationId: conversation.id,
        providerMessageId,
        messageType: WhatsAppMessageType.TEXT,
      },
    });

    await this.handleConversationFlow(conversation, patient, content);
  }

  private async getOrCreateConversationInTx(
    tx: Prisma.TransactionClient,
    patient: Patient,
  ): Promise<WhatsAppConversation> {
    const existing = await tx.whatsAppConversation.findUnique({
      where: {
        hospitalId_patientId: {
          hospitalId: patient.hospitalId,
          patientId: patient.id,
        },
      },
    });

    if (existing) {
      if (existing.state === WhatsAppConversationState.CLOSED) {
        return tx.whatsAppConversation.update({
          where: { id: existing.id },
          data: {
            state: WhatsAppConversationState.IDLE,
            closedAt: null,
            contextJson: Prisma.JsonNull,
          },
        });
      }

      return existing;
    }

    return tx.whatsAppConversation.create({
      data: {
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        patientId: patient.id,
        state: WhatsAppConversationState.IDLE,
      },
    });
  }

  private async handleConversationFlow(
    conversation: WhatsAppConversation,
    patient: Patient,
    inboundText: string,
  ) {
    const normalizedInput = inboundText.trim().toLowerCase();
    let replyText: string | null = null;
    let nextState = conversation.state;
    let nextContext: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      conversation.contextJson === null
        ? Prisma.JsonNull
        : (conversation.contextJson as Prisma.InputJsonValue);

    if (
      conversation.state === WhatsAppConversationState.IDLE &&
      MENU_TRIGGERS.has(normalizedInput)
    ) {
      replyText = 'Reply 1 for appointments, 2 for billing';
      nextState = WhatsAppConversationState.AWAITING_INPUT;
      nextContext = {
        flow: 'MAIN_MENU',
        step: 'AWAITING_OPTION',
      };
    } else if (
      conversation.state === WhatsAppConversationState.AWAITING_INPUT &&
      normalizedInput === '1'
    ) {
      replyText = await this.buildAppointmentReply(patient.id, patient.hospitalId);
      nextState = WhatsAppConversationState.ACTIVE;
      nextContext = {
        flow: 'MAIN_MENU',
        step: 'APPOINTMENTS',
      };
    } else if (
      conversation.state === WhatsAppConversationState.AWAITING_INPUT &&
      normalizedInput === '2'
    ) {
      replyText = await this.buildBillingReply(patient.id, patient.hospitalId);
      nextState = WhatsAppConversationState.ACTIVE;
      nextContext = {
        flow: 'MAIN_MENU',
        step: 'BILLING',
      };
    } else if (conversation.state === WhatsAppConversationState.AWAITING_INPUT) {
      replyText = 'Please reply 1 for appointments or 2 for billing.';
      nextState = WhatsAppConversationState.AWAITING_INPUT;
    }

    if (!replyText) {
      return;
    }

    let updatedConversation = await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        state: nextState,
        contextJson: nextContext,
        closedAt:
          nextState === WhatsAppConversationState.CLOSED ? new Date() : null,
      },
    });

    await this.auditService.log({
      action: 'WHATSAPP_CONVERSATION_UPDATED',
      entity: 'WhatsAppConversation',
      entityId: updatedConversation.id,
      hospitalId: patient.hospitalId,
      branchId: patient.branchId,
      metadata: {
        patientId: patient.id,
        from: conversation.state,
        to: nextState,
      },
    });

    await this.sendInternalTextReply(patient, updatedConversation.id, replyText);

    if (nextState === WhatsAppConversationState.ACTIVE) {
      updatedConversation = await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          state: WhatsAppConversationState.CLOSED,
          closedAt: new Date(),
          contextJson: Prisma.JsonNull,
        },
      });

      await this.auditService.log({
        action: 'WHATSAPP_CONVERSATION_UPDATED',
        entity: 'WhatsAppConversation',
        entityId: updatedConversation.id,
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        metadata: {
          patientId: patient.id,
          from: WhatsAppConversationState.ACTIVE,
          to: WhatsAppConversationState.CLOSED,
        },
      });
    }
  }

  private async buildAppointmentReply(
    patientId: string,
    hospitalId: string,
  ): Promise<string> {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        hospitalId,
        status: AppointmentStatus.SCHEDULED,
        startAt: {
          gte: new Date(),
        },
      },
      orderBy: {
        startAt: 'asc',
      },
    });

    if (!appointment) {
      return 'You have no upcoming scheduled appointments.';
    }

    return `Your next appointment is on ${appointment.startAt.toISOString().slice(0, 10)}.`;
  }

  private async buildBillingReply(
    patientId: string,
    hospitalId: string,
  ): Promise<string> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        patientId,
        hospitalId,
        status: {
          in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!invoice) {
      return 'No recent billing records were found.';
    }

    return `Your latest invoice ${invoice.invoiceNumber} is ${invoice.status}. Total: INR ${invoice.totalAmount.toFixed(2)}.`;
  }

  private async sendInternalTextReply(
    patient: Patient,
    conversationId: string,
    text: string,
  ) {
    try {
      this.assertOutboundRateLimit(patient.hospitalId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        return;
      }

      throw error;
    }

    const content = truncateMessageContent(text);
    const now = new Date();
    const recipientPhone = this.resolveRecipientPhone(patient);

    const message = await this.prisma.whatsAppMessage.create({
      data: {
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        patientId: patient.id,
        conversationId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        messageType: WhatsAppMessageType.TEXT,
        status: WhatsAppMessageStatus.QUEUED,
        content,
      },
    });

    await this.auditService.log({
      action: 'WHATSAPP_MESSAGE_INITIATED',
      entity: 'WhatsAppMessage',
      entityId: message.id,
      hospitalId: patient.hospitalId,
      branchId: patient.branchId,
      metadata: {
        patientId: patient.id,
        conversationId,
        messageType: WhatsAppMessageType.TEXT,
        automated: true,
      },
    });

    try {
      const providerResult = await this.metaWhatsAppService.sendText({
        toPhone: recipientPhone,
        text: content,
      });

      const updated = await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.SENT,
          providerMessageId: providerResult.providerMessageId,
          sentAt: now,
        },
      });

      await this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      });

      await this.auditService.log({
        action: 'WHATSAPP_MESSAGE_SENT',
        entity: 'WhatsAppMessage',
        entityId: updated.id,
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        metadata: {
          patientId: patient.id,
          conversationId,
          providerMessageId: updated.providerMessageId,
          messageType: WhatsAppMessageType.TEXT,
          automated: true,
        },
      });
    } catch (error) {
      const failureReason = this.sanitizeErrorMessage(
        error instanceof Error ? error.message : 'Automated WhatsApp send failed',
      );

      await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: WhatsAppMessageStatus.FAILED,
          errorMessage: failureReason,
          failedAt: now,
        },
      });

      await this.auditService.log({
        action: 'WHATSAPP_MESSAGE_FAILED',
        entity: 'WhatsAppMessage',
        entityId: message.id,
        hospitalId: patient.hospitalId,
        branchId: patient.branchId,
        metadata: {
          patientId: patient.id,
          conversationId,
          failureReason,
          automated: true,
        },
      });
    }
  }

  private async processStatusUpdate(status: {
    id?: string;
    status?: string;
    timestamp?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
  }) {
    const providerMessageId = status.id;
    const providerStatus = status.status?.toLowerCase();

    if (!providerMessageId || !providerStatus) {
      return;
    }

    const providerEventId = `${providerMessageId}:${providerStatus}:${status.timestamp ?? '0'}`;
    const duplicate = await this.isDuplicateWebhookEvent(providerEventId);

    if (duplicate) {
      return;
    }

    const message = await this.prisma.whatsAppMessage.findUnique({
      where: { providerMessageId },
    });

    if (!message) {
      await this.recordWebhookEvent(providerEventId);
      return;
    }

    const mappedStatus = this.mapProviderStatus(providerStatus);

    if (!mappedStatus) {
      await this.recordWebhookEvent(providerEventId, message.id);
      return;
    }

    if (!this.canTransition(message.status, mappedStatus)) {
      await this.recordWebhookEvent(providerEventId, message.id);
      return;
    }

    const now = new Date();
    const updateData: Prisma.WhatsAppMessageUpdateInput = {
      status: mappedStatus,
    };

    if (mappedStatus === WhatsAppMessageStatus.SENT) {
      updateData.sentAt = message.sentAt ?? now;
    }

    if (mappedStatus === WhatsAppMessageStatus.DELIVERED) {
      updateData.deliveredAt = message.deliveredAt ?? now;
    }

    if (mappedStatus === WhatsAppMessageStatus.READ) {
      updateData.readAt = message.readAt ?? now;
    }

    if (mappedStatus === WhatsAppMessageStatus.FAILED) {
      const providerError = status.errors?.[0];
      updateData.failedAt = message.failedAt ?? now;
      updateData.errorCode = providerError?.code?.toString() ?? null;
      updateData.errorMessage = this.sanitizeErrorMessage(
        providerError?.message ?? providerError?.title ?? 'Delivery failed',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.whatsAppWebhookEvent.create({
        data: {
          providerEventId,
          messageId: message.id,
        },
      });

      await tx.whatsAppMessage.update({
        where: { id: message.id },
        data: updateData,
      });
    });

    const auditAction = this.statusAuditAction(mappedStatus);

    if (auditAction) {
      await this.auditService.log({
        action: auditAction,
        entity: 'WhatsAppMessage',
        entityId: message.id,
        hospitalId: message.hospitalId,
        branchId: message.branchId,
        metadata: {
          patientId: message.patientId,
          conversationId: message.conversationId,
          providerMessageId,
          status: mappedStatus,
        },
      });
    }
  }

  private mapProviderStatus(
    providerStatus: string,
  ): WhatsAppMessageStatus | null {
    switch (providerStatus) {
      case 'sent':
        return WhatsAppMessageStatus.SENT;
      case 'delivered':
        return WhatsAppMessageStatus.DELIVERED;
      case 'read':
        return WhatsAppMessageStatus.READ;
      case 'failed':
        return WhatsAppMessageStatus.FAILED;
      default:
        return null;
    }
  }

  private canTransition(
    current: WhatsAppMessageStatus,
    next: WhatsAppMessageStatus,
  ): boolean {
    if (current === WhatsAppMessageStatus.FAILED) {
      return false;
    }

    if (next === WhatsAppMessageStatus.FAILED) {
      return (
        current === WhatsAppMessageStatus.QUEUED ||
        current === WhatsAppMessageStatus.SENT
      );
    }

    return STATUS_RANK[next] > STATUS_RANK[current];
  }

  private statusAuditAction(
    status: WhatsAppMessageStatus,
  ): string | null {
    switch (status) {
      case WhatsAppMessageStatus.SENT:
        return 'WHATSAPP_MESSAGE_SENT';
      case WhatsAppMessageStatus.DELIVERED:
        return 'WHATSAPP_MESSAGE_DELIVERED';
      case WhatsAppMessageStatus.READ:
        return 'WHATSAPP_MESSAGE_READ';
      case WhatsAppMessageStatus.FAILED:
        return 'WHATSAPP_MESSAGE_FAILED';
      default:
        return null;
    }
  }

  private async isDuplicateWebhookEvent(
    providerEventId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.whatsAppWebhookEvent.findUnique({
      where: { providerEventId },
    });

    return Boolean(existing);
  }

  private async recordWebhookEvent(
    providerEventId: string,
    messageId?: string,
  ): Promise<void> {
    try {
      await this.prisma.whatsAppWebhookEvent.create({
        data: {
          providerEventId,
          messageId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }

      throw error;
    }
  }

  private sanitizeErrorMessage(message: string): string {
    return message.slice(0, 500);
  }
}
