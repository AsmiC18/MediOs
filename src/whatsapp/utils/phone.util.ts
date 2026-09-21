export {
  canonicalizePatientPhone,
  inboundWaIdToCanonicalPhone,
  toWhatsAppRecipientId,
  tryCanonicalizePatientPhone,
} from '../../common/utils/phone.util';

export function truncateMessageContent(
  content: string,
  maxLength = 4096,
): string {
  if (content.length <= maxLength) {
    return content;
  }

  return content.slice(0, maxLength);
}
