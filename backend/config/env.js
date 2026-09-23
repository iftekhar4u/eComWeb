import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().min(1).optional(),
  MONGO_DEV_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/aurelia_dev'),
  MONGO_TEST_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/aurelia_test'),
  SESSION_SECRET: z.string().min(32).optional(),
  MFA_ENCRYPTION_KEY: z.string().min(32).optional(),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  GOOGLE_AUTH_ENABLED: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
})

export function getConfig(env = process.env) {
  const parsed = envSchema.parse(env)
  if (parsed.NODE_ENV === 'development') {
    if (parsed.MONGO_URI) parsed.MONGO_DEV_URI = parsed.MONGO_URI
    parsed.MONGO_URI = parsed.MONGO_DEV_URI
  }
  if (parsed.NODE_ENV === 'test') parsed.MONGO_URI = parsed.MONGO_TEST_URI
  if (parsed.NODE_ENV === 'production' && (!parsed.MONGO_URI || !parsed.SESSION_SECRET || !parsed.MFA_ENCRYPTION_KEY)) {
    throw new Error('MONGO_URI, SESSION_SECRET, and MFA_ENCRYPTION_KEY are required in production')
  }
  if (parsed.NODE_ENV !== 'test' && !parsed.MONGO_URI) {
    throw new Error('MONGO_URI is required outside the test environment')
  }
  if (parsed.GOOGLE_AUTH_ENABLED && (!parsed.GOOGLE_CLIENT_ID || !parsed.GOOGLE_CLIENT_SECRET || !parsed.GOOGLE_CALLBACK_URL)) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL are required when Google auth is enabled')
  }
  return parsed
}

export function getMongoUri(config, environment = config.NODE_ENV) {
  if (environment === 'production') throw new Error('Production database access is disabled by local project scripts')
  return environment === 'test' ? config.MONGO_TEST_URI : config.MONGO_DEV_URI
}
