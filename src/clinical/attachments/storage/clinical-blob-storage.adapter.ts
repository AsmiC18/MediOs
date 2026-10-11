import { Readable } from 'stream';

export type ClinicalBlobPutInput = {
  storageKey: string;
  contentType: string;
  body: Buffer;
};

export type ClinicalBlobGetResult = {
  stream: Readable;
  contentType: string;
  sizeBytes: number;
};

export interface ClinicalBlobStorageAdapter {
  put(input: ClinicalBlobPutInput): Promise<void>;
  get(storageKey: string): Promise<ClinicalBlobGetResult>;
  delete(storageKey: string): Promise<void>;
}

export const CLINICAL_BLOB_STORAGE_ADAPTER = Symbol(
  'CLINICAL_BLOB_STORAGE_ADAPTER',
);
