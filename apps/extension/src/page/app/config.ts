export const stateMaxAgeSeconds = 60;
export const videoExpiredSeconds = 10;

const defaultHost = "https://vt.panghair.com:5000";

export function getServiceHost(): string {
  const configuredHost = import.meta.env.VITE_VT_HOST;
  const host = typeof configuredHost === "string" && configuredHost.length > 0
    ? configuredHost
    : defaultHost;

  return host.replace(/\/+$/, "");
}
