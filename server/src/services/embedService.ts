import { unfurl } from 'unfurl.js';
import net from 'net';
import { logger } from '../lib/logger.js';

const URL_REGEX = /https?:\/\/[^\s<>]+/gi;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
const MAX_URLS = 5;
const TIMEOUT_MS = 3000;

interface EmbedData {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  favicon: string | null;
}

function isPrivateUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return true; // Reject unparseable URLs
  }

  // Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return true;
  }

  const hostname = parsed.hostname;

  // Check for IP addresses
  if (net.isIPv4(hostname)) {
    const parts = hostname.split('.').map(Number);
    // Loopback 127.0.0.0/8
    if (parts[0] === 127) return true;
    // Private 10.0.0.0/8
    if (parts[0] === 10) return true;
    // Private 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // Private 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // Link-local 169.254.0.0/16 (includes cloud metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0
    if (parts[0] === 0) return true;
    return false;
  }

  if (net.isIPv6(hostname) || hostname.startsWith('[')) {
    const clean = hostname.replace(/^\[|\]$/g, '');
    // ::1 loopback
    if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
    // fe80::/10 link-local
    if (clean.toLowerCase().startsWith('fe80')) return true;
    // fc00::/7 unique local
    if (clean.toLowerCase().startsWith('fc') || clean.toLowerCase().startsWith('fd')) return true;
    return true; // Block all IPv6 to be safe
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;

  return false;
}

export async function extractAndFetchEmbeds(content: string): Promise<EmbedData[]> {
  const urls = content.match(URL_REGEX);
  if (!urls) return [];

  const unique = [...new Set(urls)]
    .filter((u) => !/^https?:\/\/(media\d*\.giphy\.com|i\.giphy\.com)\//i.test(u))
    .slice(0, MAX_URLS);
  const results: EmbedData[] = [];

  for (const url of unique) {
    // SSRF check: reject private/internal URLs
    if (isPrivateUrl(url)) {
      logger.debug({ url }, 'Blocked SSRF attempt: private URL');
      continue;
    }

    // Direct image URLs
    if (IMAGE_EXTENSIONS.test(url)) {
      results.push({
        url,
        title: null,
        description: null,
        imageUrl: url,
        siteName: null,
        favicon: null,
      });
      continue;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const metadata = await unfurl(url, {
        timeout: TIMEOUT_MS,
        follow: 3,
      });

      clearTimeout(timer);

      const og = metadata.open_graph || {};
      const title = og.title || metadata.title || null;
      const description = og.description || metadata.description || null;

      if (!title && !description) continue;

      results.push({
        url,
        title,
        description,
        imageUrl: og.images?.[0]?.url || null,
        siteName: og.site_name || null,
        favicon: metadata.favicon || null,
      });
    } catch (err) {
      logger.debug({ url, err }, 'Failed to unfurl URL');
    }
  }

  return results;
}
