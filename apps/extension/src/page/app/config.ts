export const stateMaxAgeSeconds = 180;
export const videoExpiredSeconds = 10;

const defaultHost = "http://127.0.0.1:5001";

export function getServiceHost(): string {
  const configuredHost = import.meta.env.VITE_VIDEOTOGETHER_LITE_HOST;
  const host = typeof configuredHost === "string" && configuredHost.length > 0
    ? configuredHost
    : defaultHost;

  return host.replace(/\/+$/, "");
}
