#!/usr/bin/env node

import 'dotenv/config';

const DEFAULT_DOMAIN = 'predictagol.com';
const DEFAULT_AZURE_HOSTNAME = 'blue-plant-0287c640f.7.azurestaticapps.net';

const args = parseArgs(process.argv.slice(2));
const domain = args.domain || process.env.CLOUDFLARE_ZONE_NAME || DEFAULT_DOMAIN;
const azureHostname = args.azureHostname || process.env.AZURE_STATIC_WEBAPP_HOSTNAME || DEFAULT_AZURE_HOSTNAME;
const validationToken = args.validationToken || args._[0] || process.env.AZURE_STATIC_WEBAPP_VALIDATION_TOKEN;
const apexProxied = parseBoolean(args.apexProxied ?? process.env.CLOUDFLARE_APEX_PROXIED ?? 'true');
const includeWww = parseBoolean(args.www ?? 'true');

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const configuredZoneId = process.env.CLOUDFLARE_ZONE_ID;

if (!apiToken) {
  fail('Missing CLOUDFLARE_API_TOKEN in .env.');
}

if (!validationToken) {
  fail('Missing Azure validation token. Pass --validation-token <token> or set AZURE_STATIC_WEBAPP_VALIDATION_TOKEN in .env.');
}

const zoneId = configuredZoneId || (await findZoneId(domain));
if (!zoneId) {
  fail(`Could not find a Cloudflare zone for ${domain}. Set CLOUDFLARE_ZONE_ID in .env.`);
}

await upsertRecord({
  zoneId,
  type: 'TXT',
  name: `asuid.${domain}`,
  content: validationToken,
  ttl: 300,
});

await upsertRecord({
  zoneId,
  type: 'CNAME',
  name: domain,
  content: azureHostname,
  ttl: 1,
  proxied: apexProxied,
});

if (includeWww) {
  await upsertRecord({
    zoneId,
    type: 'CNAME',
    name: `www.${domain}`,
    content: azureHostname,
    ttl: 1,
    proxied: true,
  });
}

console.log(`Cloudflare DNS updated for ${domain}.`);
console.log(`- TXT asuid.${domain} -> ${validationToken}`);
console.log(`- CNAME ${domain} -> ${azureHostname} (${apexProxied ? 'proxied' : 'DNS only'})`);
if (includeWww) {
  console.log(`- CNAME www.${domain} -> ${azureHostname} (proxied)`);
}

function parseArgs(values) {
  const parsed = { _: [] };
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) {
      parsed._.push(value);
      continue;
    }
    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const nextValue = values[i + 1];
    parsed[key] = inlineValue ?? (nextValue && !nextValue.startsWith('--') ? nextValue : 'true');
    if (inlineValue === undefined && values[i + 1] && !values[i + 1].startsWith('--')) {
      i += 1;
    }
  }
  return parsed;
}

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function findZoneId(name) {
  const response = await cloudflareFetch(`/zones?name=${encodeURIComponent(name)}&status=active`);
  return response.result?.[0]?.id;
}

async function upsertRecord(record) {
  const existingRecords = await listRecords(record.zoneId, record.type, record.name);
  const body = {
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl,
    ...(record.proxied === undefined ? {} : { proxied: record.proxied }),
  };

  if (existingRecords.length > 0) {
    for (const existingRecord of existingRecords) {
      await cloudflareFetch(`/zones/${record.zoneId}/dns_records/${existingRecord.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    }
    console.log(`Updated ${record.type} ${record.name}`);
    return;
  }

  await cloudflareFetch(`/zones/${record.zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log(`Created ${record.type} ${record.name}`);
}

async function listRecords(zoneId, type, name) {
  const response = await cloudflareFetch(
    `/zones/${zoneId}/dns_records?type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`
  );
  return response.result || [];
}

async function cloudflareFetch(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const messages = payload.errors?.map((error) => error.message).join('; ') || response.statusText;
    fail(`Cloudflare API request failed: ${messages}`);
  }
  return payload;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
