/**
 * Shared JSDoc typedefs. Import for editor autocomplete only — no runtime code.
 *
 * @typedef {Object} Word
 * @property {string} text
 * @property {number} start - seconds
 * @property {number} end - seconds
 *
 * @typedef {Object} Segment
 * @property {number} id
 * @property {string} sentence
 * @property {Word[]} words
 *
 * @typedef {"extracting"|"transcribing"|"romanizing"|"generating"|"burning"|"complete"} PipelineStage
 *
 * @typedef {Object} PipelineOptions
 * @property {string} inputPath
 * @property {string} outputPath
 * @property {(stage: PipelineStage, message: string) => void} [onProgress]
 * @property {(audioPath: string) => Promise<Segment[]>} transcribe
 * @property {(words: string[]) => Promise<string[]>} transliterate
 */

export const __types = true;
