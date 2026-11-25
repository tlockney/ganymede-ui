import { describe, expect, it } from 'vitest';
import {
  DEVICE_LABEL,
  DEVICE_MARK,
  isPageSpec,
  offersDevice,
  PAGE_SPEC_KEY,
  pickerLabel,
} from './kernel-device';

describe('offersDevice', () => {
  it('is true for the shape the app registers', () => {
    expect(offersDevice({ metadata: { capabilities: { device: true } } })).toBe(true);
    expect(offersDevice({ metadata: { capabilities: { device: true, other: 1 } } })).toBe(true);
  });

  it('is true for a more specific capability, an object', () => {
    expect(offersDevice({ metadata: { capabilities: { device: {} } } })).toBe(true);
    expect(offersDevice({ metadata: { capabilities: { device: { methods: ['pick'] } } } })).toBe(
      true,
    );
  });

  it.each([
    ['no spec', undefined],
    ['null spec', null],
    ['no metadata', {}],
    ['null metadata', { metadata: null }],
    ['string metadata', { metadata: 'x' }],
    ['array metadata', { metadata: [] }],
    ['no capabilities', { metadata: { debugger: true } }],
    ['null capabilities', { metadata: { capabilities: null } }],
    ['list capabilities', { metadata: { capabilities: ['device'] } }],
    ['string capabilities', { metadata: { capabilities: 'device' } }],
    ['no device', { metadata: { capabilities: {} } }],
    ['device false', { metadata: { capabilities: { device: false } } }],
    ['device a string', { metadata: { capabilities: { device: 'true' } } }],
    ['device null', { metadata: { capabilities: { device: null } } }],
    ['device an array', { metadata: { capabilities: { device: ['pick'] } } }],
  ])('is false for %s', (_, spec) => {
    expect(offersDevice(spec)).toBe(false);
  });
});

describe('pickerLabel', () => {
  it('marks a kernel that offers device, with an accessible label', () => {
    expect(
      pickerLabel({
        display_name: 'TypeScript (cdp-kernel, in app)',
        metadata: { capabilities: { device: true } },
      }),
    ).toEqual({
      text: `TypeScript (cdp-kernel, in app) ${DEVICE_MARK}`,
      label: `TypeScript (cdp-kernel, in app), ${DEVICE_LABEL}`,
    });
  });

  it('leaves other kernels as they were', () => {
    expect(pickerLabel({ display_name: 'Python 3' })).toEqual({
      text: 'Python 3',
      label: 'Python 3',
    });
  });
});

describe('isPageSpec', () => {
  it("is true only for a spec the mixed client marked as the page's", () => {
    expect(isPageSpec({ metadata: { [PAGE_SPEC_KEY]: true } })).toBe(true);
    expect(isPageSpec({ metadata: {} })).toBe(false);
    expect(isPageSpec({})).toBe(false);
    expect(isPageSpec(undefined)).toBe(false);
  });
});
