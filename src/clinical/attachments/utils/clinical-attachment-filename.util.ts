import * as path from 'path';

const MAX_FILENAME_LENGTH = 255;

export function sanitizeClinicalAttachmentFilename(originalName: string): string {
  const base = path.basename(originalName.replace(/\0/g, '')).trim();
  if (!base || base === '.' || base === '..') {
    return 'attachment';
  }

  const sanitized = base.replace(/[/\\:*?"<>|]/g, '_');
  if (sanitized.length <= MAX_FILENAME_LENGTH) {
    return sanitized;
  }

  const ext = path.extname(sanitized);
  const stem = path.basename(sanitized, ext);
  const maxStem = MAX_FILENAME_LENGTH - ext.length;
  return `${stem.slice(0, Math.max(1, maxStem))}${ext}`;
}

export function contentDispositionAttachmentFilename(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
