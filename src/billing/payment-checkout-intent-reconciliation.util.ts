import {
  Payment,
  PaymentCheckoutIntentStatus,
  Prisma,
} from '@prisma/client';

export type CheckoutIntentReconcileOutcome =
  | 'updated'
  | 'already_terminal'
  | 'not_found'
  | 'ownership_mismatch';

export async function reconcileCheckoutIntentOnPaymentSuccess(
  tx: Prisma.TransactionClient,
  payment: Payment,
): Promise<CheckoutIntentReconcileOutcome> {
  const intent = await findCheckoutIntentForPayment(tx, payment);
  if (!intent) {
    return 'not_found';
  }
  if (!checkoutIntentMatchesPayment(intent, payment)) {
    return 'ownership_mismatch';
  }
  if (intent.status === PaymentCheckoutIntentStatus.PAID) {
    return 'already_terminal';
  }

  await tx.paymentCheckoutIntent.update({
    where: { id: intent.id },
    data: {
      status: PaymentCheckoutIntentStatus.PAID,
      paymentId: payment.id,
      lastError: null,
    },
  });
  return 'updated';
}

export async function reconcileCheckoutIntentOnPaymentFailure(
  tx: Prisma.TransactionClient,
  payment: Payment,
  lastError: string,
): Promise<CheckoutIntentReconcileOutcome> {
  const intent = await findCheckoutIntentForPayment(tx, payment);
  if (!intent) {
    return 'not_found';
  }
  if (!checkoutIntentMatchesPayment(intent, payment)) {
    return 'ownership_mismatch';
  }
  if (
    intent.status === PaymentCheckoutIntentStatus.PAID ||
    intent.status === PaymentCheckoutIntentStatus.FAILED
  ) {
    return 'already_terminal';
  }

  await tx.paymentCheckoutIntent.update({
    where: { id: intent.id },
    data: {
      status: PaymentCheckoutIntentStatus.FAILED,
      paymentId: payment.id,
      lastError: lastError.slice(0, 500),
    },
  });
  return 'updated';
}

export async function reconcileCheckoutIntentOnPaymentUncertain(
  tx: Prisma.TransactionClient,
  payment: Payment,
  reason: string,
): Promise<CheckoutIntentReconcileOutcome> {
  const intent = await findCheckoutIntentForPayment(tx, payment);
  if (!intent) {
    return 'not_found';
  }
  if (!checkoutIntentMatchesPayment(intent, payment)) {
    return 'ownership_mismatch';
  }
  if (intent.status === PaymentCheckoutIntentStatus.PAID) {
    return 'already_terminal';
  }

  await tx.paymentCheckoutIntent.update({
    where: { id: intent.id },
    data: {
      status: PaymentCheckoutIntentStatus.UNCERTAIN,
      paymentId: payment.id,
      lastError: reason.slice(0, 500),
    },
  });
  return 'updated';
}

async function findCheckoutIntentForPayment(
  tx: Prisma.TransactionClient,
  payment: Payment,
) {
  if (payment.providerOrderId) {
    const byOrder = await tx.paymentCheckoutIntent.findFirst({
      where: {
        hospitalId: payment.hospitalId,
        providerOrderId: payment.providerOrderId,
      },
    });
    if (byOrder) {
      return byOrder;
    }
  }

  return tx.paymentCheckoutIntent.findFirst({
    where: {
      hospitalId: payment.hospitalId,
      paymentId: payment.id,
    },
  });
}

function checkoutIntentMatchesPayment(
  intent: { hospitalId: string; invoiceId: string; amount: Prisma.Decimal },
  payment: Payment,
): boolean {
  return (
    intent.hospitalId === payment.hospitalId &&
    intent.invoiceId === payment.invoiceId &&
    intent.amount.equals(payment.amount)
  );
}
