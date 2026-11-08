import { withSecurityHeaders } from "../server/headers.js";
import { stampRegion } from "../server/stamp.js";

// Cloudflare Pages Function: runs in front of every request to the site.
// Every response gets the security headers. HTML pages also get the visitor's country (request.cf.country) stamped on <html>.
export const onRequest: PagesFunction = async ({ request, next }) => {
  const res = await next();
  if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html")) {
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: withSecurityHeaders(res.headers) });
  }

  const country = (request.cf as { country?: string } | undefined)?.country;
  const headers = withSecurityHeaders(res.headers);
  // The page now differs per visitor: never let a shared cache hand one country's page to another.
  headers.set("cache-control", "private, no-store");
  headers.delete("etag");
  headers.delete("content-length");
  return new Response(stampRegion(await res.text(), country), { status: 200, headers });
};
