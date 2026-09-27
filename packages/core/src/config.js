// Shared constants — single source of truth for all apps.

export const SUPPORTED_EXTENSIONS = [".mp4", ".mkv", ".webm", ".avi", ".mov"];

export const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_CHANNELS = 1;

export const MAX_WORDS_PER_CUE = 3;
export const MAX_CHARS_PER_CUE = 20;

export const PIPELINE_STAGES = [
  "extracting",
  "transcribing",
  "romanizing",
  "generating",
  "burning",
  "complete",
];
