export type SoapVersionItemDto = {
  version: number;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  createdByUserId: string;
  createdAt: Date;
};

export type SoapVersionListResponseDto = {
  data: SoapVersionItemDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
