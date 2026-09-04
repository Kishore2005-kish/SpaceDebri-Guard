// Environment variable validation.
// Call validateEnv() at startup to catch missing config early.

export interface EnvConfig {
  DATABASE_URL: string;
  valid: boolean;
  errors: string[];
}

let cachedEnv: EnvConfig | null = null;

export function validateEnv(): EnvConfig {
  if (cachedEnv) return cachedEnv;

  const errors: string[] = [];
  const DATABASE_URL = process.env.DATABASE_URL ?? '';

  if (!DATABASE_URL) {
    errors.push('DATABASE_URL is not set. Add it to .env');
  }

  cachedEnv = {
    DATABASE_URL,
    valid: errors.length === 0,
    errors,
  };
  return cachedEnv;
}

export function getEnv(): EnvConfig {
  if (!cachedEnv) return validateEnv();
  return cachedEnv;
}
