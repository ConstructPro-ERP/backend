import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  DATABASE_URL: Joi.string().uri().required(),
  DIRECT_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  API_GATEWAY_PORT: Joi.number().integer().default(3000),
  AUTH_SERVICE_PORT: Joi.number().integer().default(3001),
  USER_SERVICE_PORT: Joi.number().integer().default(3002),
  PROJECT_SERVICE_PORT: Joi.number().integer().default(3003),
  TASK_SERVICE_PORT: Joi.number().integer().default(3004),
  PAYMENT_SERVICE_PORT: Joi.number().integer().default(3005),
  CONTRACTOR_SERVICE_PORT: Joi.number().integer().default(3006),
  MATERIAL_SERVICE_PORT: Joi.number().integer().default(3007),
  NOTIFICATION_SERVICE_PORT: Joi.number().integer().default(3008),
  QUOTATION_SERVICE_PORT: Joi.number().integer().default(3009),
});
