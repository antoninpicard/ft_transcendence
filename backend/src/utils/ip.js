import { isIPv4, isIPv6 } from 'node:net';

const IPV4_MAPPED = /^::ffff:(.+)$/i;

export function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  const mapped = IPV4_MAPPED.exec(ip);
  if (mapped && isIPv4(mapped[1])) return mapped[1];
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return null;
  try {
    return new URL(`http://[${ip}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

export function splitIpList(raw) {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseIpList(raw) {
  return new Set(splitIpList(raw).map(normalizeIp).filter(Boolean));
}
