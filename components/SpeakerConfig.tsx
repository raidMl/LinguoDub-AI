import React from 'react';
import { Speaker, GEMINI_VOICES } from '../types';

interface SpeakerConfigProps {
  speakers: Speaker[];
  onUpdateSpeaker: (speakerId: string, voiceName: string) => void;
  onContinue: () => void;
}

const SpeakerConfig: React.FC<SpeakerConfigProps> = ({ speakers, onUpdateSpeaker, onContinue }) => {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Voice Casting</h2>
        <p className="text-slate-400">Assign a unique AI voice to each detected speaker.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {speakers.map((speaker, idx) => (
          <div key={speaker.id} className="bg-slate-800 border border-slate-700 rounded-xl p-6 flex flex-col gap-4 shadow-lg">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold
                ${idx % 2 === 0 ? 'bg-gradient-to-br from-primary-500 to-purple-600' : 'bg-gradient-to-br from-accent-500 to-orange-500'}`}>
                {speaker.id.split(' ')[1] || 'S'}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{speaker.name}</h3>
                <p className="text-xs text-slate-400">Detected Speaker</p>
              </div>
            </div>

            <div className="mt-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Assigned Voice</label>
              <div className="grid grid-cols-1 gap-2">
                {GEMINI_VOICES.map((voice) => (
                  <button
                    key={voice.name}
                    onClick={() => onUpdateSpeaker(speaker.id, voice.name)}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
                      speaker.assignedVoice === voice.name
                        ? 'bg-primary-600/20 border-primary-500 ring-1 ring-primary-500'
                        : 'bg-slate-900/50 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span className={`font-medium ${speaker.assignedVoice === voice.name ? 'text-primary-400' : 'text-slate-200'}`}>
                        {voice.name}
                      </span>
                      <span className="text-xs text-slate-500">{voice.gender} • {voice.style}</span>
                    </div>
                    {speaker.assignedVoice === voice.name && (
                      <i className="fas fa-check-circle text-primary-500"></i>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onContinue}
          className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-bold rounded-full shadow-lg shadow-primary-500/20 transform transition hover:scale-105 active:scale-95 flex items-center gap-2"
        >
          <i className="fas fa-magic"></i>
          Start Dubbing
        </button>
      </div>
    </div>
  );
};

export default SpeakerConfig;