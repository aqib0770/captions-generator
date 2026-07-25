import React from 'react';

export type ProcessingStage =
  | 'extracting'
  | 'transcribing'
  | 'romanizing'
  | 'generating'
  | 'burning'
  | 'complete';

interface ProcessingStepperProps {
  currentStage: ProcessingStage;
}

interface StepConfig {
  key: ProcessingStage;
  title: string;
  desc: string;
}

const STEPS: StepConfig[] = [
  { key: 'extracting', title: 'Extracting Audio', desc: 'Separating audio track from video' },
  { key: 'transcribing', title: 'Transcribing', desc: 'Running Whisper AI model' },
  { key: 'romanizing', title: 'Romanizing', desc: 'Converting text for subtitles' },
  { key: 'generating', title: 'Generating Subtitles', desc: 'Aligning text with timestamps' },
  { key: 'burning', title: 'Burning into Video', desc: 'Rendering final video' },
  { key: 'complete', title: 'Complete', desc: 'Ready for download' },
];

export const ProcessingStepper: React.FC<ProcessingStepperProps> = ({ currentStage }) => {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStage);

  return (
    <div className="stepper-container">
      <div className="stepper-header">
        <h3 className="stepper-title">Processing Video</h3>
        <p className="stepper-subtitle">Please wait while the AI generates your subtitles...</p>
      </div>

      {STEPS.map((step, idx) => {
        let status: 'completed' | 'active' | 'pending' = 'pending';
        if (idx < currentIdx) {
          status = 'completed';
        } else if (idx === currentIdx) {
          status = 'active';
        }

        return (
          <div key={step.key} className={`step-item ${status}`}>
            <div className="step-node">
              {status === 'completed' && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {status === 'active' && (
                <svg className="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              )}
              {status === 'pending' && (
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{idx + 1}</span>
              )}
            </div>

            <div className="step-content">
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
