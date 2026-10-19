export const config = {
  // Only deploy the current production branch.
  // Prevent feature, fix, main, and other branches
  // from creating unnecessary Preview deployments.
  git: {
    deploymentEnabled: {
      '**': false,
      develop: true,
    },
  },

  // Include Swagger UI assets in the shared Vercel serverless function.
  // Without these files, /docs may load while its CSS and JS return 404.
  functions: {
    'server.ts': {
      includeFiles: 'node_modules/swagger-ui-dist/**/*',
    },
  },

  // Only the Document Service needs the reconciliation cron job.
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
