/** The page's own kernelspec name (cdp-kernel's browser kernel); kept here so light code can name it. */
export const CDP_KERNEL_NAME = 'cdp-browser';

/**
 * The metadata key `MixedKernelSpecClient` sets on a kernel spec that runs
 * in the page, with `kernels: 'both'`: the server's spec of the same name
 * wins, so the name alone doesn't say where a kernel runs (#801).
 */
export const PAGE_SPEC_KEY = 'ganymede_page_kernel';

/** Whether a kernel spec is one that runs in this page (see {@link PAGE_SPEC_KEY}). */
export function isPageSpec(spec: { metadata?: Record<string, unknown> } | undefined): boolean {
  return spec?.metadata?.[PAGE_SPEC_KEY] === true;
}

/** The mark the kernel picker puts after a kernel that offers `device`. */
export const DEVICE_MARK = '◆';

/** What the mark means: the accessible label and the option's tooltip. */
export const DEVICE_LABEL = 'offers the device API';

/**
 * Whether a kernelspec declares the `device` API (#648): the app's
 * in-process kernel registers `metadata: { capabilities: { device: true } }`
 * (`AppKernels.spec`). A capability is `true` or something more specific
 * (an object, such as a namespace's methods). Anything else is false: no
 * `metadata`, a `capabilities` of another shape, or a `device` that is
 * false, a string, an array or null, so such servers see no change.
 */
export function offersDevice(spec: { metadata?: unknown } | null | undefined): boolean {
  const metadata = spec?.metadata;
  if (typeof metadata !== 'object' || metadata === null) return false;
  const capabilities = (metadata as { capabilities?: unknown }).capabilities;
  if (typeof capabilities !== 'object' || capabilities === null) return false;
  const device = (capabilities as { device?: unknown }).device;
  return (
    device === true || (typeof device === 'object' && device !== null && !Array.isArray(device))
  );
}

/** A kernel's name in the picker: its display name, marked when it offers `device`. */
export function pickerLabel(spec: { display_name: string; metadata?: unknown }): {
  text: string;
  label: string;
} {
  return offersDevice(spec)
    ? {
        text: `${spec.display_name} ${DEVICE_MARK}`,
        label: `${spec.display_name}, ${DEVICE_LABEL}`,
      }
    : { text: spec.display_name, label: spec.display_name };
}
