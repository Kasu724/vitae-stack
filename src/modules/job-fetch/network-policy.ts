import { isIP } from "node:net";

export class UnsafeJobUrlError extends Error {
  public constructor(public readonly code: string) {
    super("The URL cannot be fetched under the public-network policy.");
    this.name = "UnsafeJobUrlError";
  }
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return null;
  return (
    ((octets[0]! << 24) >>> 0) +
    (octets[1]! << 16) +
    (octets[2]! << 8) +
    octets[3]!
  );
}

function inV4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, prefix]) =>
    inV4Range(value, ipv4Number(base)!, prefix),
  );
}

function ipv6Segments(address: string): number[] | null {
  const withoutZone = address.split("%")[0]!;
  if (withoutZone !== address) return null;
  const mapped = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/u.exec(withoutZone);
  let candidate = withoutZone;
  if (mapped) {
    const value = ipv4Number(mapped[2]!);
    if (value === null) return null;
    candidate = `${mapped[1]}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = candidate.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const zeros = 8 - left.length - right.length;
  if (zeros < (halves.length === 2 ? 1 : 0)) return null;
  const parts = [
    ...left,
    ...Array.from({ length: zeros }, () => "0"),
    ...right,
  ];
  if (
    parts.length !== 8 ||
    parts.some((part) => !/^[0-9a-f]{1,4}$/iu.test(part))
  )
    return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

export function isPublicIpv6(address: string): boolean {
  const segments = ipv6Segments(address);
  if (!segments) return false;
  if (
    segments.slice(0, 5).every((part) => part === 0) &&
    segments[5] === 0xffff
  )
    return isPublicIpv4(
      `${segments[6]! >>> 8}.${segments[6]! & 255}.${segments[7]! >>> 8}.${segments[7]! & 255}`,
    );
  const first = segments[0]!;
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && segments[1] === 0x0db8) return false;
  if (first === 0x2001 && segments[1] === 0x0000) return false;
  if (first === 0x2001 && (segments[1]! & 0xfff0) === 0x0010) return false;
  if (first === 0x2001 && (segments[1]! & 0xfff0) === 0x0020) return false;
  if (first === 0x2002 || (first === 0x0064 && segments[1] === 0xff9b))
    return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? isPublicIpv4(address)
    : family === 6
      ? isPublicIpv6(address)
      : false;
}

export function validatePublicJobUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeJobUrlError("INVALID_URL");
  }
  if (url.protocol !== "https:") throw new UnsafeJobUrlError("HTTPS_REQUIRED");
  if (url.username || url.password)
    throw new UnsafeJobUrlError("CREDENTIALS_NOT_ALLOWED");
  if (url.port && url.port !== "443")
    throw new UnsafeJobUrlError("PORT_NOT_ALLOWED");
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (!hostname || isIP(hostname))
    throw new UnsafeJobUrlError("IP_LITERAL_NOT_ALLOWED");
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new UnsafeJobUrlError("HOST_NOT_ALLOWED");
  url.hash = "";
  return url;
}
