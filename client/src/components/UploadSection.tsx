import React, { useState, useRef } from 'react';

interface UploadSectionProps {
  onUpload: (file: File) => void;
  onError: (msg: string) => void;
}

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

export const UploadSection: React.FC<UploadSectionProps> = ({ onUpload, onError }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (file: File) => {
    if (!file.name.match(/\.(mp4|mkv|webm|avi|mov)$/i)) {
      onError("Unsupported format. Please upload MP4, MKV, WebM, AVI, or MOV.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      onError("File is too large. Maximum size is 30MB.");
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleStartUpload = () => {
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  return (
    <section className="state-section">
      <div
        className={`drop-zone ${isDragOver ? 'dragover' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="video/*"
          hidden
          onChange={handleFileChange}
        />

        <div className="upload-icon-container">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <h3>Drag & drop your video</h3>
        <p className="file-limit">MP4, MOV, WEBM up to 30MB</p>

        {selectedFile && (
          <div className="selected-file-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
          </div>
        )}

        <div className="button-group">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? 'Change File' : 'Browse Files'}
          </button>

          {selectedFile && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStartUpload}
            >
              Generate Captions
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
