import { stampRegion } from "../server/stamp.js";

// Cloudflare Pages Function: runs in front of every request to the site.
// HTML pages get the visitor's country (request.cf.country) stamped on <html>; everything else passes through.
export const onRequest: PagesFunction = async ({ request, next }) => {
  const res = await next();
  if (res.status !== 200 || !(res.headers.get("content-type") ?? "").includes("text/html")) return res;

  const country = (request.cf as { country?: string } | undefined)?.country;
  const headers = new Headers(res.headers);
  // The page now differs per visitor: never let a shared cache hand one country's page to another.
  headers.set("cache-control", "private, no-store");
  headers.delete("etag");
  headers.delete("content-length");
  return new Response(stampRegion(await res.text(), country), { status: 200, headers });
};
