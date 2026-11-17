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
