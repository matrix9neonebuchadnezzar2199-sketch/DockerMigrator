import React from 'react';

/** エクスポート中断・失敗時に Import からの再開を案内する帯。 */
export const ResumeHintBanner: React.FC<{
  message: string | null;
  onDismiss: () => void;
}> = ({ message, onDismiss }) => {
  if (!message) return null;
  return (
    <div className="resume-hint-banner" role="status">
      <span className="resume-hint-banner-text">{message}</span>
      <button type="button" className="resume-hint-banner-dismiss" onClick={onDismiss}>
        閉じる
      </button>
    </div>
  );
};
