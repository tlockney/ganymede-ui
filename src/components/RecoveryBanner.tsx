import type { SaveAttentionDescription } from '../lib/room-recovery';

export type RecoveryBannerProps = {
  attention: SaveAttentionDescription;
  saving?: boolean;
  canRetrySave: boolean;
  canReview: boolean;
  canDiscard?: boolean;
  discarding?: boolean;
  localOnly?: boolean;
  onReview(): void;
  onRetrySave(): void;
  onDownload(): void;
  onDiscard?(): void;
};

/**
 * Persistent pane banner shown while a room's save failed, server recovery
 * copies are waiting for review (#831), or a local unsaved recovery copy is
 * available in this browser (#808).
 */
export function RecoveryBanner({
  attention,
  saving = false,
  canRetrySave,
  canReview,
  canDiscard = false,
  discarding = false,
  localOnly = false,
  onReview,
  onRetrySave,
  onDownload,
  onDiscard,
}: RecoveryBannerProps) {
  const reviewLabel =
    attention.copiesCount > 1 ? `Review Copies (${attention.copiesCount})…` : 'Review Copy…';
  const busy = saving || discarding;

  return (
    <div
      className={`recovery-banner${localOnly ? ' is-local' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="recovery-banner-text">
        <span className="recovery-banner-title">{attention.headline}</span>
        {attention.detail && <span className="recovery-banner-detail">{attention.detail}</span>}
      </div>
      <div className="recovery-banner-actions">
        {canReview && (
          <button type="button" className="pane-notice-action" onClick={onReview} disabled={busy}>
            {reviewLabel}
          </button>
        )}
        {canRetrySave && (
          <button
            type="button"
            className="pane-notice-dismiss"
            onClick={onRetrySave}
            disabled={busy}
          >
            {saving ? 'Saving…' : 'Retry Save'}
          </button>
        )}
        <button type="button" className="pane-notice-dismiss" onClick={onDownload} disabled={busy}>
          Download Copy
        </button>
        {canDiscard && onDiscard && (
          <button type="button" className="pane-notice-dismiss" onClick={onDiscard} disabled={busy}>
            {discarding ? 'Discarding…' : 'Discard'}
          </button>
        )}
      </div>
    </div>
  );
}
