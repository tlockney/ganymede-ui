import { askMessage, type DevicePromptState } from '../lib/device-remote';

/**
 * A cell on a server kernel asked for something a browser allows only
 * after a click, such as the clipboard (ganymede-device's browser
 * fallback): one button runs it, Dismiss turns it down.
 */
export function DevicePrompt({ prompt }: { prompt: DevicePromptState }) {
  return (
    <div className="pane-notice device-prompt" role="alert">
      <div className="pane-notice-text">
        <span className="pane-notice-message">{askMessage(prompt.asker)}</span>
      </div>
      <div className="pane-notice-actions">
        <button type="button" className="pane-notice-action" onClick={() => prompt.accept()}>
          {prompt.label}
        </button>
        <button type="button" className="pane-notice-dismiss" onClick={() => prompt.dismiss()}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
