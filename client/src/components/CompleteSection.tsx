import React from 'react';

interface CompleteSectionProps {
  downloadUrl: string;
  onReset: () => void;
}

export const CompleteSection: React.FC<CompleteSectionProps> = ({ downloadUrl, onReset }) => {
  return (
    <div className="status-container">
      <div className="status-icon-wrapper">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>

      <h2>Video Ready!</h2>
      <p>Your hard-coded captions have been successfully rendered and burned into the video file.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '320px', marginTop: '0.5rem' }}>
        <a
          href={downloadUrl}
          className="btn btn-primary btn-download"
          download
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Video</span>
        </a>

        <button
          type="button"
          className="btn btn-outline"
          onClick={onReset}
        >
          Caption Another Video
        </button>
      </div>
    </div>
  );
};
