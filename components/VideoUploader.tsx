import React, { useCallback, useState } from 'react';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileSelect }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateAndUpload = (file: File) => {
    // Simple validation for demo purposes
    // 20MB limit to prevent browser crash on base64 conversion
    if (file.size > 20 * 1024 * 1024) {
      setError("For this demo, please use files under 20MB.");
      return;
    }
    
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (!isVideo && !isAudio) {
      setError("Please upload a valid video or audio file.");
      return;
    }
    setError(null);
    onFileSelect(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div 
        className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl transition-all duration-300 ${
          dragActive 
            ? 'border-primary-500 bg-primary-500/10 scale-[1.02]' 
            : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <div className={`mb-4 p-4 rounded-full ${dragActive ? 'bg-primary-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
             <div className="flex gap-2">
                <i className="fas fa-video text-2xl"></i>
                <i className="fas fa-music text-2xl"></i>
             </div>
          </div>
          <p className="mb-2 text-xl font-semibold text-slate-200">
            Drop video or audio here
          </p>
          <p className="mb-4 text-sm text-slate-400">
            MP4, MOV, MP3, WAV (Max 20MB)
          </p>
          <label className="cursor-pointer group">
            <span className="relative inline-flex items-center justify-center px-8 py-3 overflow-hidden font-medium text-white transition duration-300 ease-out border-2 border-primary-500 rounded-full shadow-md group-hover:bg-primary-500">
              <span className="absolute inset-0 flex items-center justify-center w-full h-full text-white duration-300 -translate-x-full bg-primary-500 group-hover:translate-x-0 ease">
                <i className="fas fa-arrow-right"></i>
              </span>
              <span className="absolute flex items-center justify-center w-full h-full text-primary-500 transition-all duration-300 transform group-hover:translate-x-full ease group-hover:text-white">
                Select Media
              </span>
              <span className="relative invisible">Select Media</span>
            </span>
            <input 
              type="file" 
              className="hidden" 
              accept="video/*,audio/*" 
              onChange={handleChange}
            />
          </label>
        </div>
      </div>
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <i className="fas fa-exclamation-circle"></i>
          {error}
        </div>
      )}
    </div>
  );
};

export default VideoUploader;