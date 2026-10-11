/** Minimal shape from NestJS FileInterceptor / multer memory storage. */
export type ClinicalUploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};
