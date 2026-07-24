document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const selectedFileDiv = document.getElementById('selected-file');
    
    // States
    const uploadState = document.getElementById('upload-state');
    const processingState = document.getElementById('processing-state');
    const completeState = document.getElementById('complete-state');
    const errorState = document.getElementById('error-state');
    
    // Process UI elements
    const steps = document.querySelectorAll('.step');
    const downloadBtn = document.getElementById('download-btn');
    const startOverBtn = document.getElementById('start-over-btn');
    const retryBtn = document.getElementById('retry-btn');
    const errorMessage = document.getElementById('error-message');

    let currentFile = null;

    // Constants
    const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
    const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

    // --- Drag and Drop Handlers ---
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }, false);

    // --- File Selection Handlers ---

    browseBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        
        if (!file.name.match(/\.(mp4|mkv|webm|avi|mov)$/i)) {
            showError("Unsupported format. Please upload MP4, MKV, WebM, AVI, or MOV.");
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showError("File is too large. Maximum size is 30MB.");
            return;
        }

        currentFile = file;
        selectedFileDiv.textContent = file.name;
        selectedFileDiv.style.display = 'block';
        browseBtn.style.display = 'none';
        uploadBtn.style.display = 'inline-flex';
    }

    // --- State Management ---
    
    function switchState(stateElement) {
        [uploadState, processingState, completeState, errorState].forEach(el => {
            el.style.display = 'none';
        });
        stateElement.style.display = 'block';
    }

    function updateStep(stage) {
        let foundCurrent = false;
        steps.forEach(step => {
            const stepName = step.getAttribute('data-step');
            if (stepName === stage) {
                step.classList.remove('completed');
                step.classList.add('active');
                foundCurrent = true;
            } else if (!foundCurrent) {
                step.classList.remove('active');
                step.classList.add('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        switchState(errorState);
    }

    function resetApp() {
        currentFile = null;
        fileInput.value = '';
        selectedFileDiv.style.display = 'none';
        selectedFileDiv.textContent = '';
        browseBtn.style.display = 'inline-flex';
        uploadBtn.style.display = 'none';
        uploadBtn.disabled = false;
        
        steps.forEach(step => {
            step.classList.remove('active', 'completed');
        });
        
        switchState(uploadState);
    }

    startOverBtn.addEventListener('click', resetApp);
    retryBtn.addEventListener('click', resetApp);

    // --- Upload and SSE Processing ---

    uploadBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
        
        const formData = new FormData();
        formData.append('video', currentFile);

        try {
            switchState(processingState);
            updateStep('extracting');

            const response = await fetch('/api/caption', {
                method: 'POST',
                body: formData
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
                throw new Error('ReadableStream not supported in this browser.');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                
                // Keep the last part in buffer if it's incomplete
                buffer = parts.pop();
                
                for (const part of parts) {
                    if (!part.trim()) continue;
                    
                    const lines = part.split('\n');
                    let eventType = 'message';
                    let data = null;

                    for (const line of lines) {
                        if (line.startsWith('event:')) {
                            eventType = line.substring(6).trim();
                        } else if (line.startsWith('data:')) {
                            const dataStr = line.substring(5).trim();
                            try {
                                data = JSON.parse(dataStr);
                            } catch (e) {
                                // Ignore parse errors for simple strings
                            }
                        }
                    }

                    if (eventType === 'progress' && data && data.stage) {
                        updateStep(data.stage);
                    } else if (eventType === 'done' && data && data.downloadUrl) {
                        updateStep('complete');
                        downloadBtn.href = data.downloadUrl;
                        setTimeout(() => {
                            switchState(completeState);
                        }, 1000);
                    } else if (eventType === 'error' && data) {
                        throw new Error(data.message || 'An error occurred during processing.');
                    }
                }
            }
        } catch (error) {
            console.error('Upload Error:', error);
            showError(error.message || 'Failed to process the video. Please try again.');
        }
    });
});
