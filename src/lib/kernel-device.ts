/** The mark the kernel picker puts after a kernel that offers `device`. */
export const DEVICE_MARK = '◆';

/** What the mark means, for assistive technology and tooltips. */
export const DEVICE_LABEL = 'offers the device API';

/**
 * Whether a kernelspec declares the `device` API (#648): the app's
 * in-process kernel registers `metadata: { capabilities: { device: true } }`
 * (`AppKernels.spec`). Anything else is false, including a server that sends
 * no `metadata` or a `capabilities` of another shape, so such servers see no
 * change.
 */
export function offersDevice(spec: { metadata?: unknown } | null | undefined): boolean {
  const metadata = spec?.metadata;
  if (typeof metadata !== 'object' || metadata === null) return false;
  const capabilities = (metadata as { capabilities?: unknown }).capabilities;
  if (typeof capabilities !== 'object' || capabilities === null) return false;
  return (capabilities as { device?: unknown }).device === true;
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
