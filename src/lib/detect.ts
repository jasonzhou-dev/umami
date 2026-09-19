import path from "node:path";
import ipaddr from "ipaddr.js";
import IP2Region from "ip2region";
import isLocalhost from "is-localhost-ip";
import maxmind from "maxmind";
import { UAParser } from "ua-parser-js";
import { getIpAddress, stripPort } from "@/lib/ip";
import { safeDecodeURIComponent } from "@/lib/url";

const MAXMIND = "maxmind";
const IP2REGION_KEY = "ip2region";

const PROVIDER_HEADERS = [
  // Umami custom headers (cloud mode only)
  ...(process.env.CLOUD_MODE
    ? [
        {
          countryHeader: "x-umami-client-country",
          regionHeader: "x-umami-client-region",
          cityHeader: "x-umami-client-city",
        },
      ]
    : []),
  // Cloudflare headers
  {
    countryHeader: "cf-ipcountry",
    regionHeader: "cf-region-code",
    cityHeader: "cf-ipcity",
  },
  // Vercel headers
  {
    countryHeader: "x-vercel-ip-country",
    regionHeader: "x-vercel-ip-country-region",
    cityHeader: "x-vercel-ip-city",
  },
  // CloudFront headers
  {
    countryHeader: "cloudfront-viewer-country",
    regionHeader: "cloudfront-viewer-country-region",
    cityHeader: "cloudfront-viewer-city",
  },
  // EdgeOne headers (requires custom request headers in Rule Priorities, see: https://edgeone.ai/document/46151)
  {
    countryHeader: "eo-ipcountry",
    regionHeader: "eo-region-code",
    cityHeader: "eo-ipcity",
  },
];

export function getDevice(ua: ReturnType<typeof UAParser>) {
  const { device } = ua;
  return device?.type || "desktop";
}

export function getBrowser(ua: ReturnType<typeof UAParser>): string {
  return ua.browser?.name || "";
}

export function getOS(ua: ReturnType<typeof UAParser>): string {
  const name = ua.os?.name || "";
  const version = ua.os?.version;

  if (!name) return "";

  if (name === "Windows" && version) {
    const majorVersion = version.split(".")[0];
    return `Windows ${majorVersion}`;
  }

  return name;
}

function getRegionCode(country: string, region: string) {
  if (!country || !region) {
    return undefined;
  }

  return region.includes("-") ? region : `${country}-${region}`;
}

function decodeHeader(s: string | undefined | null): string | undefined | null {
  if (s === undefined || s === null) {
    return s;
  }

  return Buffer.from(s, "latin1").toString("utf-8");
}

async function isLocalIp(ip: string) {
  try {
    return await isLocalhost(ip);
  } catch {
    return false;
  }
}

export async function getLocation(
  ip: string = "",
  headers: Headers,
  skipHeaders: boolean,
) {
  const cleanIp = stripPort(ip);

  // Ignore local or invalid ips
  if (!cleanIp || !ipaddr.isValid(cleanIp) || (await isLocalIp(cleanIp))) {
    return null;
  }

  let country: string | undefined;
  let region: string | undefined;
  let city: string | undefined;

  // 1. CDN proxy headers (fast path, no DB lookup needed for country/region/city)
  if (!skipHeaders && !process.env.SKIP_LOCATION_HEADERS) {
    for (const provider of PROVIDER_HEADERS) {
      const countryHeader = headers.get(provider.countryHeader);
      if (countryHeader) {
        country = decodeHeader(countryHeader);
        region = decodeHeader(headers.get(provider.regionHeader));
        city = decodeHeader(headers.get(provider.cityHeader));
        break;
      }
    }
  }

  // 2. GeoLite2 fallback (if CDN headers didn't provide country)
  if (!country) {
    if (!globalThis[MAXMIND]) {
      const dir = path.join(process.cwd(), "geo");

      globalThis[MAXMIND] = await maxmind.open(
        process.env.GEOLITE_DB_PATH || path.resolve(dir, "GeoLite2-City.mmdb"),
      );
    }

    const mmResult = globalThis[MAXMIND]?.get(cleanIp);
    if (mmResult) {
      country =
        mmResult.country?.iso_code ?? mmResult?.registered_country?.iso_code;
      region = mmResult.subdivisions?.[0]?.iso_code;
      city = mmResult.city?.names?.en;
    }
  }

  // 3. ip2region (always run for Chinese province/ISP, even behind CDN)
  let province: string | undefined;
  let isp: string | undefined;

  try {
    if (!globalThis[IP2REGION_KEY]) {
      const dir = path.join(process.cwd(), "geo");
      globalThis[IP2REGION_KEY] = new IP2Region({
        ipv4db:
          process.env.IP2REGION_DB_PATH || path.resolve(dir, "ip2region.db"),
        ipv6db: process.env.IPV6WRY_DB_PATH || path.resolve(dir, "ipv6wry.db"),
      });
    }

    const ip2rResult = globalThis[IP2REGION_KEY]?.search(cleanIp);
    if (ip2rResult) {
      if (ip2rResult.province) {
        province = ip2rResult.province;
      }
      if (ip2rResult.isp) {
        isp = ip2rResult.isp;
      }
      if (ip2rResult.city && !city) {
        city = ip2rResult.city;
      }
      if (!country && ip2rResult.country) {
        if (ip2rResult.country === "中国") {
          country = "CN";
        }
      }
    }
  } catch {
    // ip2region lookup failed silently
  }

  return {
    country,
    region: getRegionCode(country, region),
    city,
    province,
    isp,
  };
}

export async function getClientInfo(
  request: Request,
  payload: Record<string, any>,
) {
  const userAgent = payload?.userAgent || request.headers.get("user-agent");
  const ip = payload?.ip || getIpAddress(request.headers);
  const location = await getLocation(ip, request.headers, !!payload?.ip);
  const country = safeDecodeURIComponent(location?.country);
  const region = safeDecodeURIComponent(location?.region);
  const city = safeDecodeURIComponent(location?.city);
  const province = safeDecodeURIComponent(location?.province);
  const isp = safeDecodeURIComponent(location?.isp);
  const ua = UAParser(userAgent);
  const browser = payload?.browser ?? getBrowser(ua);
  const os = payload?.os ?? getOS(ua);
  const device = payload?.device ?? getDevice(ua);

  return {
    userAgent,
    browser,
    os,
    ip,
    country,
    region,
    city,
    province,
    isp,
    device,
  };
}

export function hasBlockedIp(clientIp: string) {
  const ignoreIps = process.env.IGNORE_IP;

  if (!clientIp || !ignoreIps) {
    return false;
  }

  const ips = ignoreIps.split(",").map((n) => n.trim());

  return ips.some((ip) => {
    if (ip === clientIp) {
      return true;
    }

    // CIDR notation
    if (ip.indexOf("/") > 0) {
      try {
        const addr = ipaddr.parse(clientIp);
        const range = ipaddr.parseCIDR(ip);

        if (addr.kind() === range[0].kind() && addr.match(range)) {
          return true;
        }
      } catch {
        // Ignore parsing errors
      }
    }

    return false;
  });
}