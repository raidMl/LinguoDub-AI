import React, { useState } from 'react';
import VideoUploader from './components/VideoUploader';
import SpeakerConfig from './components/SpeakerConfig';
import DubbingPlayer from './components/DubbingPlayer';
import { analyzeVideoScript, generateSpeechForLine, fileToBase64 } from './services/geminiService';
import { ProcessingStep, DubbingProject, SUPPORTED_LANGUAGES, GEMINI_VOICES, Speaker } from './types';

const App: React.FC = () => {
  const [step, setStep] = useState<ProcessingStep>(ProcessingStep.UPLOAD);
  const [project, setProject] = useState<DubbingProject>({
    videoFile: null,
    videoDataUrl: null,
    targetLanguage: 'es', // default Spanish
    script: [],
    speakers: []
  });
  const [loadingMessage, setLoadingMessage] = useState<string>("");

  const handleFileSelect = async (file: File) => {
    setLoadingMessage("Preprocessing media file...");
    setStep(ProcessingStep.ANALYZING);
    
    try {
      const base64Data = await fileToBase64(file);
      const isAudio = file.type.startsWith('audio/');
      // For audio, we can still use the data URL
      const mediaDataUrl = `data:${file.type};base64,${base64Data}`;
      
      setProject(prev => ({
        ...prev,
        videoFile: file,
        videoDataUrl: mediaDataUrl
      }));

      setLoadingMessage(isAudio 
        ? "Gemini is listening to the audio, identifying speakers, and transcribing..."
        : "Gemini is watching the video, identifying speakers, and transcribing..."
      );
      
      const { script, speakers: speakerIds } = await analyzeVideoScript(
        base64Data, 
        file.type, 
        SUPPORTED_LANGUAGES.find(l => l.code === project.targetLanguage)?.name || 'Spanish'
      );

      // Initialize speaker objects with default voices
      const speakerObjects: Speaker[] = speakerIds.map((id, index) => ({
        id,
        name: id, // Initial name is same as ID
        assignedVoice: GEMINI_VOICES[index % GEMINI_VOICES.length].name // Round robin assignment
      }));

      setProject(prev => ({
        ...prev,
        script,
        speakers: speakerObjects
      }));

      setStep(ProcessingStep.CONFIG);
    } catch (error) {
      console.error(error);
      alert("Analysis failed. Please try a shorter clip or check your API key.");
      setStep(ProcessingStep.UPLOAD);
    }
  };

  const handleSpeakerUpdate = (speakerId: string, voiceName: string) => {
    setProject(prev => ({
      ...prev,
      speakers: prev.speakers.map(s => s.id === speakerId ? { ...s, assignedVoice: voiceName } : s)
    }));
  };

  const startGeneration = async () => {
    setStep(ProcessingStep.GENERATING);
    const totalLines = project.script.length;
    let processedLines = 0;

    const newScript = [...project.script];

    // Process lines sequentially to avoid rate limits or parallel chaos, 
    // though Gemini is fast.
    for (let i = 0; i < newScript.length; i++) {
      const line = newScript[i];
      const speaker = project.speakers.find(s => s.id === line.speakerId);
      const voice = speaker?.assignedVoice || 'Puck';
      
      setLoadingMessage(`Dubbing Line ${i + 1} of ${totalLines} (${voice})...`);
      
      try {
        const audioData = await generateSpeechForLine(line.translatedText, voice);
        newScript[i].audioData = audioData;
      } catch (e) {
        console.error(`Failed to dub line ${i}`, e);
      }
      processedLines++;
    }

    setProject(prev => ({
      ...prev,
      script: newScript
    }));
    
    setStep(ProcessingStep.PLAYBACK);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setProject(prev => ({ ...prev, targetLanguage: e.target.value }));
  };

  const resetApp = () => {
    setStep(ProcessingStep.UPLOAD);
    setProject(prev => ({...prev, videoFile: null, videoDataUrl: null, script: [], speakers: []}));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      {/* Header */}
      <header className="w-full py-6 px-8 border-b border-slate-800/50 bg-slate-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={resetApp}>
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
              <i className="fas fa-wave-square text-white text-lg"></i>
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Linguo<span className="text-primary-500">Dub</span> AI
            </h1>
          </div>

          {step === ProcessingStep.PLAYBACK && (
             <button onClick={resetApp} className="text-sm text-slate-400 hover:text-white transition">
                New Project
             </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col items-center">
        
        {/* Wizard Progress (Simple) */}
        <div className="flex gap-2 mb-12">
            {[ProcessingStep.UPLOAD, ProcessingStep.ANALYZING, ProcessingStep.CONFIG, ProcessingStep.GENERATING, ProcessingStep.PLAYBACK].map((s, idx) => {
                 const steps = [ProcessingStep.UPLOAD, ProcessingStep.ANALYZING, ProcessingStep.CONFIG, ProcessingStep.GENERATING, ProcessingStep.PLAYBACK];
                 const currentIndex = steps.indexOf(step);
                 const thisIndex = steps.indexOf(s);
                 const isCompleted = thisIndex < currentIndex;
                 const isCurrent = thisIndex === currentIndex;

                 if (s === ProcessingStep.ANALYZING || s === ProcessingStep.GENERATING) return null; // Hide loading steps from nav

                 return (
                   <div key={s} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full transition-all duration-500 ${isCurrent ? 'bg-primary-500 scale-125' : isCompleted ? 'bg-slate-600' : 'bg-slate-800'}`}></div>
                      {idx < steps.length - 1 && idx !== 1 && idx !== 3 && <div className="w-8 h-0.5 bg-slate-800"></div>}
                   </div>
                 )
            })}
        </div>

        {step === ProcessingStep.UPLOAD && (
          <div className="w-full animate-in fade-in zoom-in duration-500">
            <div className="text-center mb-10">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Media Dubbing, <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">Reimagined with AI.</span>
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-8">
                Upload a video or audio clip. We'll identify the speakers, translate their lines, and re-voice them.
              </p>

              {/* Language Selector */}
              <div className="flex flex-col items-center justify-center gap-3 mb-8">
                  <label className="text-slate-300 font-medium">Convert Audio To:</label>
                  <div className="relative">
                    <select
                      value={project.targetLanguage}
                      onChange={handleLanguageChange}
                      className="appearance-none bg-slate-800 border border-slate-700 hover:border-primary-500 text-white text-lg py-3 pl-6 pr-12 rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all cursor-pointer min-w-[240px]"
                    >
                      {SUPPORTED_LANGUAGES.map(lang => (
                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                      <i className="fas fa-chevron-down"></i>
                    </div>
                  </div>
              </div>
            </div>
            <VideoUploader onFileSelect={handleFileSelect} />
          </div>
        )}

        {(step === ProcessingStep.ANALYZING || step === ProcessingStep.GENERATING) && (
          <div className="flex flex-col items-center justify-center h-64 animate-in fade-in duration-500">
             <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                <div className="absolute inset-0 border-t-4 border-primary-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className="fas fa-robot text-3xl text-primary-500 animate-pulse"></i>
                </div>
             </div>
             <h3 className="text-2xl font-semibold text-white mb-2">{step === ProcessingStep.ANALYZING ? 'Analyzing Media' : 'Synthesizing Voices'}</h3>
             <p className="text-slate-400 animate-pulse-slow text-center max-w-md">{loadingMessage}</p>
          </div>
        )}

        {step === ProcessingStep.CONFIG && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SpeakerConfig 
              speakers={project.speakers} 
              onUpdateSpeaker={handleSpeakerUpdate}
              onContinue={startGeneration}
            />
          </div>
        )}

        {step === ProcessingStep.PLAYBACK && project.videoDataUrl && (
           <div className="w-full animate-in fade-in zoom-in duration-500">
              <div className="text-center mb-8">
                 <h2 className="text-3xl font-bold text-white">Your Dubbed Media</h2>
                 <p className="text-slate-400">Translated to {SUPPORTED_LANGUAGES.find(l => l.code === project.targetLanguage)?.name}</p>
              </div>
              <DubbingPlayer 
                videoDataUrl={project.videoDataUrl}
                script={project.script}
                speakers={project.speakers}
              />
           </div>
        )}
      </main>

      <footer className="py-6 text-center text-slate-600 text-sm border-t border-slate-900 bg-slate-950">
        <p>Powered by Google Gemini 2.5 Flash & 2.5 Flash TTS</p>
      </footer>
    </div>
  );
};

export default App;