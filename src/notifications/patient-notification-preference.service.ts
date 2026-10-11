import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PatientNotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Missing preference row means transactional WhatsApp is enabled (H6-A default).
   */
  async isWhatsAppTransactionalEnabled(
    hospitalId: string,
    patientId: string,
    client?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = client ?? this.prisma;
    const preference = await db.patientNotificationPreference.findUnique({
      where: {
        hospitalId_patientId: {
          hospitalId,
          patientId,
        },
      },
    });
    if (!preference) {
      return true;
    }
    return preference.whatsappTransactionalEnabled;
  }

  async upsertWhatsAppTransactionalEnabled(
    hospitalId: string,
    patientId: string,
    enabled: boolean,
    client?: Prisma.TransactionClient,
  ) {
    const db = client ?? this.prisma;
    return db.patientNotificationPreference.upsert({
      where: {
        hospitalId_patientId: {
          hospitalId,
          patientId,
        },
      },
      create: {
        hospitalId,
        patientId,
        whatsappTransactionalEnabled: enabled,
      },
      update: {
        whatsappTransactionalEnabled: enabled,
      },
    });
  }
}
