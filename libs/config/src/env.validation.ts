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
  AI_SERVICE_PORT: Joi.number().integer().default(3010),
  CONTRACTOR_SERVICE_PORT: Joi.number().integer().default(3006),
  MATERIAL_SERVICE_PORT: Joi.number().integer().default(3007),
  NOTIFICATION_SERVICE_PORT: Joi.number().integer().default(3008),
  QUOTATION_SERVICE_PORT: Joi.number().integer().default(3009),

  AI_PROVIDER: Joi.string().valid('openrouter', 'openai').optional(),
  AI_MODEL: Joi.string().optional(),
  AI_API_KEY: Joi.string().optional(),
  AI_MAX_CONTEXT_CHUNKS: Joi.number().integer().min(1).max(20).optional(),
  AI_MAX_PROMPT_TOKENS: Joi.number().integer().min(500).optional(),
  OPENROUTER_HTTP_REFERER: Joi.string().uri().optional(),
  OPENROUTER_APP_TITLE: Joi.string().optional(),
  EMBEDDING_PROVIDER: Joi.string().optional(),
  EMBEDDING_MODEL: Joi.string().optional(),
  EMBEDDING_API_KEY: Joi.string().optional(),
  RAG_TOP_K: Joi.number().integer().min(1).max(20).optional(),
  RAG_SIMILARITY_THRESHOLD: Joi.number().min(0).max(1).optional(),
});
