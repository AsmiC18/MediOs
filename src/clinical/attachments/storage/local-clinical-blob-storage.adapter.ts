import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReadStream, constants as fsConstants } from 'fs';
import { access, mkdir, rm, stat, writeFile } from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { getClinicalStorageLocalRoot } from '../clinical-attachment.config';
import {
  ClinicalBlobGetResult,
  ClinicalBlobPutInput,
  ClinicalBlobStorageAdapter,
} from './clinical-blob-storage.adapter';

@Injectable()
export class LocalClinicalBlobStorageAdapter implements ClinicalBlobStorageAdapter {
  private readonly logger = new Logger(LocalClinicalBlobStorageAdapter.name);

  private resolveAbsolutePath(storageKey: string): string {
    const root = path.resolve(getClinicalStorageLocalRoot());
    const normalizedKey = storageKey.replace(/\\/g, '/');
    if (
      normalizedKey.includes('..') ||
      normalizedKey.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalizedKey)
    ) {
      throw new Error('Invalid storage key');
    }

    const absolute = path.resolve(root, ...normalizedKey.split('/'));
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Storage key escapes local root');
    }

    return absolute;
  }

  async put(input: ClinicalBlobPutInput): Promise<void> {
    const absolutePath = this.resolveAbsolutePath(input.storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.body);
  }

  async get(storageKey: string): Promise<ClinicalBlobGetResult> {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    try {
      await access(absolutePath, fsConstants.R_OK);
    } catch {
      throw new NotFoundException('Clinical attachment blob not found');
    }

    const stream = createReadStream(absolutePath);
    const fileStat = await stat(absolutePath);

    return {
      stream,
      contentType: 'application/octet-stream',
      sizeBytes: Number(fileStat.size),
    };
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    try {
      await rm(absolutePath, { force: true });
    } catch (error) {
      this.logger.warn(
        `Failed to delete local clinical blob at storage key ${storageKey}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }
}
