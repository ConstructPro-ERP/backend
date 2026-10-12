export const config = {
  crons:
    process.env.DEPLOY_APP === 'document-service'
      ? [
          {
            path: '/internal/cron/documents/reconcile',
            schedule: '0 2 * * *',
          },
        ]
      : [],
};
