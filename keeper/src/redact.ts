/**
 * Anything the Worker stores or serves can reach the public /status page, so error text is scrubbed first.
 * viem errors can quote the RPC URL (which carries an API key) and a failed call can echo request data.
 */
export function redact(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const secret of secrets) {
    const s = secret?.trim();
    if (!s || s.length < 6) continue;
    const variants = new Set([s, s.replace(/^0x/i, ""), `0x${s.replace(/^0x/i, "")}`]);
    // A URL secret: also hide its path and query on their own, in case only a piece of it is quoted.
    try {
      const u = new URL(s);
      for (const part of [...u.pathname.split("/"), ...u.search.slice(1).split(/[&=]/), u.username, u.password]) if (part.length >= 6) variants.add(part);
    } catch {
      /* not a URL */
    }
    for (const v of variants) out = out.split(v).join("[redacted]");
  }
  // Any URL keeps its host and loses the rest (path, query and fragment can hold keys).
  return out.replace(/(https?:\/\/[^\s/"'<>)]+)[^\s"'<>)]*/g, "$1/…");
}
