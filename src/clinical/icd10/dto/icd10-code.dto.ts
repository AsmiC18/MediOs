export type Icd10CodeDto = {
  code: string;
  description: string;
  isActive: boolean;
};

export type Icd10SearchResponseDto = {
  data: Icd10CodeDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
