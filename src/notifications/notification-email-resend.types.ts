export type NotificationEmailResendResponse = {
  notificationId: string;
  jobId: string;
  status: 'queued';
};

export type NotificationEmailResendUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};
