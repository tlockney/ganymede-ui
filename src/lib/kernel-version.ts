/**
 * The runtime in a kernel's banner, when it names one the way cdp-kernel
 * does ("cdp-kernel on node 24.11.0 (V8 …)"): `node 24.11.0`; a date or
 * other dotted or dashed version ("on workerd 2026-10-15 (V8)") stays whole.
 */
function bannerRuntime(banner: unknown): string | undefined {
  if (typeof banner !== 'string') return undefined;
  const m = /\bon ([A-Za-z][\w.-]*) v?(\d[\w.-]*)/.exec(banner);
  return m ? `${m[1]} ${m[2]}` : undefined;
}

/** A non-empty trimmed string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The line that says which kernel is running, from its `kernel_info_reply`
 * (#693): "cdp-kernel 0.14.0 · node 24.11.0", or "ipython 8.20.0" for a
 * kernel whose banner names no runtime. The implementation's name alone
 * when it reports no version. Undefined when the reply has no
 * `implementation`, so nothing shows rather than a version without a name.
 */
export function kernelVersionLine(reply: unknown): string | undefined {
  // An error reply, or none, has none of these fields.
  const info = (typeof reply === 'object' && reply ? reply : {}) as Record<string, unknown>;
  const name = text(info.implementation);
  if (!name) return undefined;
  const version = text(info.implementation_version);
  const runtime = bannerRuntime(info.banner);
  return [version ? `${name} ${version}` : name, runtime].filter(Boolean).join(' · ');
}
