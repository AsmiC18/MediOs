/** Trusted tenant context for background jobs (no JWT). */
export type SystemJobExecutionContext = {
  jobId: string;
  jobType: string;
  workerId: string;
  hospitalId: string;
  branchId?: string | null;
};
