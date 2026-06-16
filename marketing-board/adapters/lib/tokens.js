export function isForcedDryRun() {
  return process.env.ADAPTERS_DRY_RUN === 'true';
}

export function envFlag(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
}

export function readPlatformEnv(platform, required = [], optional = []) {
  const values = {};
  for (const key of [...required, ...optional]) values[key] = process.env[key];
  const missing = required.filter((key) => !process.env[key]);
  const dryRun = isForcedDryRun() || missing.length > 0;
  return { platform, values, missing, dryRun };
}

export function requirePlatformEnv(platform, required = [], optional = []) {
  const env = readPlatformEnv(platform, required, optional);
  if (env.missing.length) {
    throw new Error(`${platform} missing required env var(s): ${env.missing.join(', ')}`);
  }
  return env.values;
}

export function dryRunReason(env) {
  if (isForcedDryRun()) return 'ADAPTERS_DRY_RUN=true';
  if (env.missing?.length) return `missing env: ${env.missing.join(', ')}`;
  return 'dry run';
}
