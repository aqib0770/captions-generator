import React, { useState } from 'react';
import { Header } from './components/Header';
import { UploadSection } from './components/UploadSection';
import { ProcessingStepper, type ProcessingStage } from './components/ProcessingStepper';
import { CompleteSection } from './components/CompleteSection';
import { ErrorSection } from './components/ErrorSection';

type AppState = 'upload' | 'processing' | 'complete' | 'error';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('upload');
  const [stage, setStage] = useState<ProcessingStage>('extracting');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setAppState('error');
  };

  const handleReset = () => {
    setAppState('upload');
    setStage('extracting');
    setDownloadUrl('');
    setErrorMsg('');
  };

  const handleUpload = async (file: File) => {
    setAppState('processing');
    setStage('extracting');

    const formData = new FormData();
    formData.append('video', file);

    try {
      const apiUrl = (import.meta.env.VITE_API_URL || '') + '/api/caption';
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Server returned ${response.status}`);
        }
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream is not supported in this browser environment.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');

        // Keep the last unparsed part in buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;

          const lines = part.split('\n');
          let eventType = 'message';
          let data: any = null;

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              const dataStr = line.substring(5).trim();
              try {
                data = JSON.parse(dataStr);
              } catch (e) {
                // Ignore parse errors for raw strings
              }
            }
          }

          if (eventType === 'progress' && data && data.stage) {
            setStage(data.stage as ProcessingStage);
          } else if (eventType === 'done' && data && data.downloadUrl) {
            setStage('complete');
            setDownloadUrl(data.downloadUrl);
            setTimeout(() => {
              setAppState('complete');
            }, 800);
          } else if (eventType === 'error' && data) {
            throw new Error(data.message || 'An error occurred during processing.');
          }
        }
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      let message = err.message || 'Failed to process the video. Please try again.';
      if (err.name === 'TypeError' && (message.includes('fetch') || message.includes('NetworkError'))) {
        message = 'Backend server is unreachable. Please ensure the server is running on port 3000 (run "npm start" or "npm run dev" inside the server directory).';
      }
      handleError(message);
    }
  };

  return (
    <div className="app-container">
      <Header />

      <main className="app-card">
        {appState === 'upload' && (
          <UploadSection onUpload={handleUpload} onError={handleError} />
        )}

        {appState === 'processing' && (
          <ProcessingStepper currentStage={stage} />
        )}

        {appState === 'complete' && (
          <CompleteSection downloadUrl={downloadUrl} onReset={handleReset} />
        )}

        {appState === 'error' && (
          <ErrorSection message={errorMsg} onRetry={handleReset} />
        )}
      </main>

      <footer className="app-footer">
        <p>Rate limit: 3 uploads/hour • Powered by Groq</p>
      </footer>
    </div>
  );
};

export default App;
