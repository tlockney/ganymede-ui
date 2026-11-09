import { describe, expect, it } from 'vitest';
import { ownKeys } from './anywidget-module';

describe('ownKeys', () => {
  it('drops the keys that wire the model, which a frame may not set', () => {
    expect(
      ownKeys({
        count: 3,
        _view_name: 'HTMLView',
        _view_module: '@jupyter-widgets/controls',
        _model_name: 'X',
        _esm: 'export default {}',
        _css: '',
      }),
    ).toEqual({ count: 3 });
  });
});
