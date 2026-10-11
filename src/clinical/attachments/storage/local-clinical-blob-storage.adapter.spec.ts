import { NotFoundException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { LocalClinicalBlobStorageAdapter } from './local-clinical-blob-storage.adapter';

describe('LocalClinicalBlobStorageAdapter', () => {
  let tempRoot: string;
  let adapter: LocalClinicalBlobStorageAdapter;
  const originalRoot = process.env.CLINICAL_STORAGE_LOCAL_ROOT;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'medios-clinical-storage-'));
    process.env.CLINICAL_STORAGE_LOCAL_ROOT = tempRoot;
    adapter = new LocalClinicalBlobStorageAdapter();
  });

  afterEach(async () => {
    process.env.CLINICAL_STORAGE_LOCAL_ROOT = originalRoot;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('put, get, and delete round-trip blob content', async () => {
    const storageKey =
      'hospital/h1/clinical/encounters/e1/attachments/a1';
    const body = Buffer.from('%PDF-1.4 test');

    await adapter.put({
      storageKey,
      contentType: 'application/pdf',
      body,
    });

    const onDisk = await readFile(
      path.join(tempRoot, ...storageKey.split('/')),
    );
    expect(onDisk.equals(body)).toBe(true);

    const got = await adapter.get(storageKey);
    expect(got.sizeBytes).toBe(body.length);

    await adapter.delete(storageKey);
    await expect(adapter.get(storageKey)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('get throws NotFoundException for missing object', async () => {
    await expect(
      adapter.get('hospital/h1/clinical/encounters/e1/attachments/missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects path traversal in storage key', async () => {
    await expect(
      adapter.put({
        storageKey: '../outside',
        contentType: 'text/plain',
        body: Buffer.from('x'),
      }),
    ).rejects.toThrow('Invalid storage key');

    await expect(
      adapter.put({
        storageKey: 'hospital/h1/../../etc/passwd',
        contentType: 'text/plain',
        body: Buffer.from('x'),
      }),
    ).rejects.toThrow('Invalid storage key');
  });

  it('uses server-generated key segments without trusting original filenames', async () => {
    const storageKey =
      'hospital/uuid/clinical/encounters/uuid/attachments/uuid';
    await adapter.put({
      storageKey,
      contentType: 'application/pdf',
      body: Buffer.from('data'),
    });

    const exists = await readFile(
      path.join(tempRoot, 'hospital', 'uuid', 'clinical', 'encounters', 'uuid', 'attachments', 'uuid'),
    );
    expect(exists.toString()).toBe('data');
  });
});
