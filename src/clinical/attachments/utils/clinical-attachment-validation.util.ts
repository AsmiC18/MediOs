import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { getClinicalStorageMaxFileSizeBytes } from '../clinical-attachment.config';
import { sanitizeClinicalAttachmentFilename } from './clinical-attachment-filename.util';

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.sh',
  '.ps1',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.vbs',
  '.scr',
  '.msi',
]);

const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'image/',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
];

export type ValidatedClinicalUpload = {
  buffer: Buffer;
  contentType: string;
  originalFileName: string;
  checksumSha256: string;
  sizeBytes: bigint;
};

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0) {
    return '';
  }
  return filename.slice(idx).toLowerCase();
}

function assertMagicBytesMatch(contentType: string, buffer: Buffer): void {
  if (buffer.length < 4) {
    return;
  }

  const pdf = buffer.subarray(0, 4).toString('ascii') === '%PDF';
  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  if (contentType === 'application/pdf' && !pdf) {
    throw new BadRequestException('File content does not match declared PDF type');
  }
  if (contentType === 'image/png' && !png) {
    throw new BadRequestException('File content does not match declared PNG type');
  }
  if (contentType === 'image/jpeg' && !jpeg) {
    throw new BadRequestException('File content does not match declared JPEG type');
  }
}

export function validateClinicalUploadFile(input: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}): ValidatedClinicalUpload {
  if (!input.buffer || input.size === 0) {
    throw new BadRequestException('Empty files are not allowed');
  }

  const maxBytes = getClinicalStorageMaxFileSizeBytes();
  if (input.size > maxBytes) {
    throw new BadRequestException(
      `File exceeds maximum allowed size of ${maxBytes} bytes`,
    );
  }

  const originalFileName = sanitizeClinicalAttachmentFilename(input.originalname);
  const ext = extensionOf(originalFileName);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new BadRequestException('File extension is not allowed');
  }

  const contentType = (input.mimetype || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (
    contentType !== 'application/octet-stream' &&
    !ALLOWED_MIME_PREFIXES.some((prefix) => contentType.startsWith(prefix))
  ) {
    throw new BadRequestException('Content type is not allowed');
  }

  assertMagicBytesMatch(contentType, input.buffer);

  const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');

  return {
    buffer: input.buffer,
    contentType,
    originalFileName,
    checksumSha256,
    sizeBytes: BigInt(input.size),
  };
}
