## 2026-11-01, Saved widgets without a kernel (#150)

A notebook saved with widget state shows its widgets before any kernel runs. No new dependency: `@jupyter-widgets/html-manager` (the issue's suggestion) is a `ManagerBase` whose `_get_comm_info` answers `{}`, and jupyterlab-manager's `LabWidgetManager` does the same job with that one override and a `kernel` of `null`, with the module registrations and `WidgetRenderer` the app already has.

Notes:

- `ManagerBase.set_state` makes a model without a comm when `_get_comm_info` doesn't list it, so the saved-state manager never calls `_create_comm`; it throws if anything does.
- `WidgetRenderer` waits for the manager's `restored` signal when a model isn't there yet, so the saved-state manager emits it after `set_state`, as the kernel manager does after a restore.
- `attachWidgets` now runs before `notebook.model` is set. Outputs render when the model arrives, and an output rendered before the widget-view factory was in rendermime stays as text.
- When a kernel starts, the outputs already rendered keep their saved-state views; the kernel's manager takes new outputs and loads the saved models the kernel doesn't have after each restore (`filterExistingModelState`), as JupyterLab's notebook `WidgetManager._loadFromNotebook` does. Without that, saving after a run that made no widgets would have dropped the file's widget state.
- The widget-view factory stays `safe: false`, so an untrusted file shows text until trusted. HTML, HTMLMath, and `description_allow_html` labels put model values into the page as HTML, so rendering them from any file would let a notebook script the app. nbviewer can render everything because it has no app to protect.
