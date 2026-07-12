export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Segment {
  id: number;
  sentence: string;
  words: Word[];
}

export interface RomanizedWord {
  text: string;
}

export interface RomanizedSegment {
  id: number;
  words: RomanizedWord[];
}
