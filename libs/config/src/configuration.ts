export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    url: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
  },
  services: {
    apiGateway: { port: Number(process.env.API_GATEWAY_PORT ?? 3000) },
    auth: { port: Number(process.env.AUTH_SERVICE_PORT ?? 3001) },
    user: { port: Number(process.env.USER_SERVICE_PORT ?? 3002) },
    project: { port: Number(process.env.PROJECT_SERVICE_PORT ?? 3003) },
    task: { port: Number(process.env.TASK_SERVICE_PORT ?? 3004) },
    payment: { port: Number(process.env.PAYMENT_SERVICE_PORT ?? 3005) },
    contractor: { port: Number(process.env.CONTRACTOR_SERVICE_PORT ?? 3006) },
    material: { port: Number(process.env.MATERIAL_SERVICE_PORT ?? 3007) },
    notification: {
      port: Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3008),
    },
    quotation: { port: Number(process.env.QUOTATION_SERVICE_PORT ?? 3009) },
  },
});
