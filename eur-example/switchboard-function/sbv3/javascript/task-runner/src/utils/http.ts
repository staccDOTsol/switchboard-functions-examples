import { HostnameDisabled } from "../errors.js";

import ipaddr from "ipaddr.js";
import { Agent } from "undici";

export const BLACKLISTED_HOSTNAMES = ["ftx.com", "ftx.us"];

function localhostEnabled(): boolean {
  switch ((process.env.ALLOW_LOCALHOST ?? "").toLowerCase()) {
    case "1":
    case "on":
    case "enabled":
    case "true":
    case "yes": {
      return true;
    }
  }

  return false;
}

export function verifyUrl(url: string): URL {
  if (!url) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();

  if (!localhostEnabled()) {
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      throw new HostnameDisabled(parsedUrl.hostname);
    }

    if (
      ipaddr.isValid(hostname) &&
      ipaddr.parse(hostname).range() === "private"
    ) {
      throw new HostnameDisabled(parsedUrl.hostname);
    }
  }

  if (BLACKLISTED_HOSTNAMES.includes(hostname)) {
    throw new HostnameDisabled(parsedUrl.hostname);
  }

  return parsedUrl;
}

// Enforce a max response timeout of 5000 ms
export const httpResponseTimeout: number = process.env
  .HTTP_TASK_RESPONSE_TIMEOUT
  ? (() => {
      try {
        const timeout = Number.parseInt(process.env.HTTP_TASK_RESPONSE_TIMEOUT);
        return Math.min(5000, timeout);
      } catch {
        return 7500;
      }
    })()
  : 7500;

// Enforce a max response size of 10000 bytes by default
export const maxResponseSizeAgent = new Agent({
  maxResponseSize: process.env.ENABLE_HTTP_TASK_RESPONSE_SIZE_LIMIT
    ? 10000
    : -1,
});
