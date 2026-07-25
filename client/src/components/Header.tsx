import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="brand-badge">
        <span className="dot"></span>
        <span>AI Engine v2.0</span>
      </div>
      <h1>Video Caption Generator</h1>
      <p>Generate stunning, hard-coded subtitles automatically.</p>
    </header>
  );
};
