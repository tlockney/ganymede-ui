import type { SaveAttentionDescription } from '../lib/room-recovery';

export type RecoveryBannerProps = {
  attention: SaveAttentionDescription;
  saving?: boolean;
  canRetrySave: boolean;
  canReview: boolean;
  onReview(): void;
  onRetrySave(): void;
  onDownload(): void;
};

/**
 * Persistent pane banner shown while a room's save failed or recovery copies
 * are waiting for review (#831).
 */
export function RecoveryBanner({
  attention,
  saving = false,
  canRetrySave,
  canReview,
  onReview,
  onRetrySave,
  onDownload,
}: RecoveryBannerProps) {
  const reviewLabel =
    attention.copiesCount > 1 ? `Review Copies (${attention.copiesCount})…` : 'Review Copy…';

  return (
    <div className="recovery-banner" role="status" aria-live="polite">
      <div className="recovery-banner-text">
        <span className="recovery-banner-title">{attention.headline}</span>
        {attention.detail && <span className="recovery-banner-detail">{attention.detail}</span>}
      </div>
      <div className="recovery-banner-actions">
        {canReview && (
          <button type="button" className="pane-notice-action" onClick={onReview} disabled={saving}>
            {reviewLabel}
          </button>
        )}
        {canRetrySave && (
          <button
            type="button"
            className="pane-notice-dismiss"
            onClick={onRetrySave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Retry Save'}
          </button>
        )}
        <button type="button" className="pane-notice-dismiss" onClick={onDownload}>
          Download Copy
        </button>
      </div>
    </div>
  );
}
