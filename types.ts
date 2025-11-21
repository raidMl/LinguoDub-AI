export enum ProcessingStep {
  UPLOAD = 'UPLOAD',
  ANALYZING = 'ANALYZING',
  CONFIG = 'CONFIG',
  GENERATING = 'GENERATING',
  PLAYBACK = 'PLAYBACK',
}

export interface ScriptLine {
  id: string;
  speakerId: string;
  startTime: number;
  endTime: number;
  originalText: string;
  translatedText: string;
  audioData?: string | null; // Base64 audio data
}

export interface Speaker {
  id: string;
  name: string;
  assignedVoice: string; // Name of the Gemini Voice
  originalSample?: string; // Placeholder for future features
}

export interface DubbingProject {
  videoFile: File | null;
  videoDataUrl: string | null;
  targetLanguage: string;
  script: ScriptLine[];
  speakers: Speaker[];
}

export interface VoiceOption {
  name: string;
  gender: 'Male' | 'Female';
  style: string;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'en', name: 'English' },
];

export const GEMINI_VOICES: VoiceOption[] = [
  { name: 'Puck', gender: 'Male', style: 'Energetic' },
  { name: 'Charon', gender: 'Male', style: 'Deep & Authoritative' },
  { name: 'Kore', gender: 'Female', style: 'Calm & Soothing' },
  { name: 'Fenrir', gender: 'Male', style: 'Rough & Intense' },
  { name: 'Zephyr', gender: 'Female', style: 'Bright & Cheerful' },
];