import React, { useEffect, useRef, useState } from 'react';
import { ScriptLine, Speaker } from '../types';

interface DubbingPlayerProps {
  videoDataUrl: string;
  script: ScriptLine[];
  speakers: Speaker[];
}

const DubbingPlayer: React.FC<DubbingPlayerProps> = ({ videoDataUrl, script, speakers }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentLine, setCurrentLine] = useState<ScriptLine | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  
  const isAudioFile = videoDataUrl.startsWith('data:audio');

  // Helper to find speaker details
  const getSpeaker = (id: string) => speakers.find(s => s.id === id);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    // Create a master gain node to route all audio through
    // This is crucial for capturing the audio stream during export
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    return () => {
      ctx.close();
    };
  }, []);

  // Helper to decode raw PCM from Gemini
  // Gemini TTS returns 24kHz mono 16-bit PCM
  const decodeAudioData = (base64Data: string, audioContext: AudioContext): AudioBuffer => {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create Int16Array view to read 16-bit samples
    const int16Data = new Int16Array(bytes.buffer);
    const sampleRate = 24000;
    const channels = 1;
    
    const audioBuffer = audioContext.createBuffer(channels, int16Data.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Normalize 16-bit integer to float [-1.0, 1.0]
    for (let i = 0; i < int16Data.length; i++) {
      channelData[i] = int16Data[i] / 32768.0;
    }
    
    return audioBuffer;
  };

  const playAudioForLine = (line: ScriptLine) => {
    if (!line.audioData || !audioContextRef.current || !masterGainRef.current) return;
    
    // Avoid overlapping plays of same line if user scrubs
    if (activeSourcesRef.current.has(line.id)) return;

    try {
      // Manual PCM Decoding
      const audioBuffer = decodeAudioData(line.audioData, audioContextRef.current);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect to gain node for volume control
      const lineGain = audioContextRef.current.createGain();
      lineGain.gain.value = 1.0; // Full volume
      
      source.connect(lineGain);
      // Connect to master gain instead of destination directly
      lineGain.connect(masterGainRef.current);
      
      source.start(0);
      activeSourcesRef.current.set(line.id, source);
      
      source.onended = () => {
        activeSourcesRef.current.delete(line.id);
      };

    } catch (e) {
      console.error("Error playing audio segment", e);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Find the current active line for subtitle display
    const activeLine = script.find(line => time >= line.startTime && time <= line.endTime);
    setCurrentLine(activeLine || null);

    // Check for audio triggers
    // We look for lines that just started (within a small window)
    script.forEach(line => {
        const timeDiff = time - line.startTime;
        // If we are within 0.25s of the start time and the line has audio
        // When exporting, we increase tolerance slightly to ensure no drops
        const tolerance = isExporting ? 0.3 : 0.25;
        if (timeDiff >= 0 && timeDiff < tolerance && (isPlaying || isExporting)) {
           playAudioForLine(line);
        }
    });
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
        // Stop all current audio
        activeSourcesRef.current.forEach(source => source.stop());
        activeSourcesRef.current.clear();
      }
    }
  };

  // Sync scrub
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
      // Stop current audio on seek
      activeSourcesRef.current.forEach(source => source.stop());
      activeSourcesRef.current.clear();
    }
  };

  const handleExport = async () => {
    if (!videoRef.current || !audioContextRef.current || !masterGainRef.current) return;
    
    setIsExporting(true);
    // Ensure audio context is running
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    // 1. Setup Recording Streams
    const streamDestination = audioContextRef.current.createMediaStreamDestination();
    masterGainRef.current.connect(streamDestination);

    // Get video stream (handling cross-browser prefixes)
    const videoEl = videoRef.current as any;
    const videoStream = videoEl.captureStream ? videoEl.captureStream() : videoEl.mozCaptureStream ? videoEl.mozCaptureStream() : null;

    if (!videoStream) {
      alert("Video export is not supported in your browser. Please try Chrome or Edge.");
      setIsExporting(false);
      masterGainRef.current.disconnect(streamDestination);
      return;
    }

    // Combine Video + Audio
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...streamDestination.stream.getAudioTracks()
    ]);

    // 2. Setup MediaRecorder
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const validMime = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || "";

    if (!validMime) {
       alert("No supported recording formats found.");
       setIsExporting(false);
       return;
    }

    const recorder = new MediaRecorder(combinedStream, { mimeType: validMime });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: validMime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dubbed_video_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Cleanup
      masterGainRef.current?.disconnect(streamDestination);
      setIsExporting(false);
      setIsPlaying(false);
      // Reset video to start
      videoRef.current!.currentTime = 0;
    };

    // 3. Start Process
    // Move to start
    videoRef.current.currentTime = 0;
    // Wait a tiny bit for seek
    await new Promise(r => setTimeout(r, 100));

    recorder.start();
    videoRef.current.play();
    setIsPlaying(true);

    // Stop when video ends
    videoRef.current.onended = () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
      // Restore normal onended behavior
      videoRef.current!.onended = () => setIsPlaying(false);
    };
  };

  return (
    <div className="w-full max-w-5xl mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 relative">
      
      {/* Export Overlay */}
      {isExporting && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 border-4 border-slate-700 border-t-primary-500 rounded-full animate-spin mb-6"></div>
          <h3 className="text-2xl font-bold text-white mb-2">Rendering Video...</h3>
          <p className="text-slate-400 max-w-md">
            We are recording the dubbed playback in real-time to ensure synchronization. 
            <br/><span className="text-yellow-500">Please do not close this tab.</span>
          </p>
        </div>
      )}

      <div className="relative aspect-video bg-black group">
        {/* Audio Visualization Background (if audio file) */}
        {isAudioFile && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className={`flex items-center gap-2 ${isPlaying ? 'opacity-100' : 'opacity-50'}`}>
               <div className={`w-3 h-16 bg-primary-500 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{animationDelay: '0s'}}></div>
               <div className={`w-3 h-24 bg-accent-500 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{animationDelay: '0.1s'}}></div>
               <div className={`w-3 h-12 bg-primary-500 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{animationDelay: '0.2s'}}></div>
               <div className={`w-3 h-20 bg-accent-500 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{animationDelay: '0.3s'}}></div>
               <div className={`w-3 h-14 bg-primary-500 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{animationDelay: '0.4s'}}></div>
            </div>
            <div className="absolute bottom-8 text-slate-500 font-mono text-sm">AUDIO ONLY PREVIEW</div>
          </div>
        )}

        {/* Video Element - MUTED because we play dubbed audio */}
        <video
          ref={videoRef}
          src={videoDataUrl}
          className={`w-full h-full object-contain ${isAudioFile ? 'invisible' : ''}`}
          muted
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
              if(!isExporting) setIsPlaying(false);
          }}
          crossOrigin="anonymous"
        />

        {/* Subtitle Overlay */}
        {currentLine && (
           <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none px-4 z-20">
             <div className="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-lg text-center max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-200">
               <p className="text-yellow-400 text-sm font-bold mb-1 uppercase tracking-wider">
                 {getSpeaker(currentLine.speakerId)?.name}
               </p>
               <p className="text-white text-lg md:text-xl font-medium leading-relaxed drop-shadow-md">
                 {currentLine.translatedText}
               </p>
             </div>
           </div>
        )}

        {/* Controls Overlay (Visible on hover or paused) */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6 z-30 ${!isPlaying ? 'opacity-100' : ''}`}>
            
            {/* Progress Bar */}
            <div className="w-full mb-4 flex items-center gap-3">
                <span className="text-xs font-mono text-slate-300 w-12 text-right">
                    {currentTime.toFixed(1)}s
                </span>
                <input
                    type="range"
                    min="0"
                    max={videoRef.current?.duration || 0}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    disabled={isExporting}
                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:h-2 transition-all disabled:opacity-50"
                />
                <span className="text-xs font-mono text-slate-300 w-12">
                    {videoRef.current?.duration.toFixed(1) || '0.0'}s
                </span>
            </div>

            {/* Buttons */}
            <div className="flex justify-between items-center">
                <div className="w-20"></div> {/* Spacer to center play button */}
                
                <button 
                    onClick={togglePlay}
                    disabled={isExporting}
                    className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition transform shadow-lg disabled:opacity-50 disabled:hover:scale-100"
                >
                    <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-play'} text-xl ml-1`}></i>
                </button>

                {/* Download Button */}
                <div className="w-20 flex justify-end">
                    <button 
                      onClick={handleExport}
                      disabled={isExporting}
                      className="group relative w-10 h-10 flex items-center justify-center rounded-full bg-slate-800/80 hover:bg-primary-500 text-white transition-all"
                      title="Export Video"
                    >
                      <i className="fas fa-download"></i>
                      <span className="absolute right-0 -top-10 bg-white text-slate-900 text-xs font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                         Download Video
                      </span>
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Script view below */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 h-64 overflow-y-auto">
          <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4 sticky top-0 bg-slate-900 py-2 z-10">Dubbing Script</h3>
          <div className="space-y-3">
              {script.map((line) => (
                  <div 
                    key={line.id} 
                    className={`p-3 rounded-lg transition-colors duration-300 flex gap-4 ${
                        currentLine?.id === line.id ? 'bg-slate-800 border-l-4 border-primary-500' : 'bg-transparent border-l-4 border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                      <div className="text-xs font-mono text-slate-500 pt-1 w-16 shrink-0">
                          {line.startTime.toFixed(1)}s
                      </div>
                      <div>
                          <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                                  {getSpeaker(line.speakerId)?.name}
                              </span>
                              <span className="text-xs text-slate-500 italic">
                                  {getSpeaker(line.speakerId)?.assignedVoice}
                              </span>
                          </div>
                          <p className="text-slate-200 text-sm">{line.translatedText}</p>
                          <p className="text-slate-500 text-xs mt-1">{line.originalText}</p>
                      </div>
                  </div>
              ))}
          </div>
      </div>
    </div>
  );
};

export default DubbingPlayer;