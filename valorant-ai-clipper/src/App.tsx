import React, { useState, useRef, useEffect } from 'react';
import { Upload, Scissors, Play, Download, Loader2, Video, CheckCircle2, AlertCircle } from 'lucide-react';
import { extractFrames, recordClip, formatTime } from './lib/videoUtils';
import { analyzeKills } from './lib/aiUtils';

type AppState = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

type Clip = {
  id: string;
  start: number;
  end: number;
  thumbnail?: string;
  isRecording?: boolean;
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [progress, setProgress] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClip, setActiveClip] = useState<Clip | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setAppState('extracting');
    setProgress(0);
    setErrorMsg('');

    try {
      // 1. Extract frames
      const frames = await extractFrames(file, 1, (p) => setProgress(p));
      
      // 2. Analyze frames with Gemini
      setAppState('analyzing');
      setProgress(0);
      
      // Get API key from environment
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is not configured.');
      }

      const killTimestamps = await analyzeKills(frames, apiKey, (p) => setProgress(p));
      
      // 3. Generate clips (10s before, 2s after)
      const newClips: Clip[] = killTimestamps.map((t, i) => {
        const start = Math.max(0, t - 10);
        const end = t + 2; // We'll cap this at video duration later if needed
        
        // Find a thumbnail frame (at the kill timestamp)
        const thumbFrame = frames.find(f => f.time === t) || frames.find(f => f.time >= start);
        
        return {
          id: `clip-${i + 1}`,
          start,
          end,
          thumbnail: thumbFrame ? `data:image/jpeg;base64,${thumbFrame.data}` : undefined
        };
      });

      setClips(newClips);
      if (newClips.length > 0) {
        setActiveClip(newClips[0]);
      }
      setAppState('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during processing.');
      setAppState('error');
    }
  };

  const handleDownload = async (clip: Clip) => {
    if (!videoFile) return;
    
    // Mark clip as recording
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, isRecording: true } : c));
    
    try {
      const blob = await recordClip(videoFile, clip.start, clip.end);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `valorant-kill-${clip.id}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download clip. Your browser might not support captureStream. Try right-clicking the video and saving it manually.');
    } finally {
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, isRecording: false } : c));
    }
  };

  // Handle looping the active clip
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= activeClip.end) {
        video.currentTime = activeClip.start;
        video.play();
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [activeClip]);

  useEffect(() => {
    if (videoRef.current && activeClip) {
      videoRef.current.currentTime = activeClip.start;
      videoRef.current.play().catch(e => console.log('Autoplay prevented', e));
    }
  }, [activeClip]);

  return (
    <div className="min-h-screen bg-[#0f1115] text-white font-sans selection:bg-red-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#16181d] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-red-500 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Valorant AI Clipper</h1>
        </div>
        <div className="text-xs font-mono text-gray-400">Powered by Edynix </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Upload Section */}
        {appState === 'idle' && (
          <div className="mt-12">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-bold tracking-tight mb-4">Turn your gameplay into highlights.</h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Upload your Valorant VOD. Our AI analyzes every frame to detect kill banners and automatically generates perfect clips (10s before, 2s after).
              </p>
            </div>

            <label className="block w-full max-w-2xl mx-auto aspect-video rounded-2xl border-2 border-dashed border-white/20 bg-[#16181d] hover:bg-[#1c1e24] hover:border-red-500/50 transition-all cursor-pointer group relative overflow-hidden">
              <input 
                type="file" 
                accept="video/mp4,video/webm,video/quicktime" 
                className="hidden" 
                onChange={handleFileUpload}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform group-hover:bg-red-500/20 group-hover:text-red-400">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Upload Gameplay Video</h3>
                <p className="text-sm text-gray-400">MP4, WebM, or MOV up to 1080p</p>
              </div>
            </label>
          </div>
        )}

        {/* Processing State */}
        {(appState === 'extracting' || appState === 'analyzing') && (
          <div className="mt-20 max-w-md mx-auto text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto">
              <svg className="animate-spin w-full h-full text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-mono font-bold">{Math.round(progress * 100)}%</span>
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-bold mb-2">
                {appState === 'extracting' ? 'Extracting Frames...' : 'AI Analyzing Gameplay...'}
              </h3>
              <p className="text-gray-400 text-sm">
                {appState === 'extracting' 
                  ? 'Scanning video to prepare for AI analysis.' 
                  : 'Gemini is looking for kill banners in your footage.'}
              </p>
            </div>
            
            <div className="h-2 w-full bg-[#16181d] rounded-full overflow-hidden">
              <div 
                className="h-full bg-red-500 transition-all duration-300 ease-out"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error State */}
        {appState === 'error' && (
          <div className="mt-20 max-w-md mx-auto text-center space-y-6 bg-red-500/10 border border-red-500/20 p-8 rounded-2xl">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <div>
              <h3 className="text-xl font-bold text-red-400 mb-2">Processing Failed</h3>
              <p className="text-gray-300 text-sm">{errorMsg}</p>
            </div>
            <button 
              onClick={() => setAppState('idle')}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results State */}
        {appState === 'done' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Player */}
            <div className="lg:col-span-2 space-y-4">
              <div className="aspect-video bg-black rounded-2xl overflow-hidden relative border border-white/10 shadow-2xl">
                {videoUrl && (
                  <video 
                    ref={videoRef}
                    src={videoUrl} 
                    className="w-full h-full object-contain"
                    controls
                    controlsList="nodownload"
                  />
                )}
                {activeClip && (
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono font-medium">Playing {activeClip.id}</span>
                  </div>
                )}
              </div>
              
              {activeClip && (
                <div className="flex items-center justify-between bg-[#16181d] p-4 rounded-xl border border-white/5">
                  <div>
                    <h3 className="font-semibold text-lg">Clip Details</h3>
                    <p className="text-sm text-gray-400 font-mono">
                      {formatTime(activeClip.start)} - {formatTime(activeClip.end)}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleDownload(activeClip)}
                    disabled={activeClip.isRecording}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white rounded-lg font-medium transition-colors"
                  >
                    {activeClip.isRecording ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Recording...</>
                    ) : (
                      <><Download className="w-4 h-4" /> Download Clip</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Clips List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Detected Kills</h2>
                <span className="px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium">
                  {clips.length} found
                </span>
              </div>
              
              {clips.length === 0 ? (
                <div className="p-8 text-center bg-[#16181d] rounded-2xl border border-white/5">
                  <Video className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400">No kills detected in this video.</p>
                  <button 
                    onClick={() => setAppState('idle')}
                    className="mt-4 text-sm text-red-400 hover:text-red-300 underline"
                  >
                    Upload another video
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {clips.map((clip, idx) => (
                    <div 
                      key={clip.id}
                      onClick={() => setActiveClip(clip)}
                      className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex gap-4 ${
                        activeClip?.id === clip.id 
                          ? 'bg-[#1c1e24] border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
                          : 'bg-[#16181d] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="w-24 aspect-video bg-black rounded-lg overflow-hidden relative flex-shrink-0">
                        {clip.thumbnail ? (
                          <img src={clip.thumbnail} alt="Thumbnail" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-5 h-5 text-gray-600" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                      
                      <div className="flex flex-col justify-center">
                        <h4 className="font-semibold text-sm mb-1">Kill #{idx + 1}</h4>
                        <div className="text-xs text-gray-400 font-mono flex items-center gap-1.5">
                          <span>{formatTime(clip.start)}</span>
                          <span>→</span>
                          <span>{formatTime(clip.end)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => setAppState('idle')}
                    className="w-full py-3 mt-4 border border-dashed border-white/20 rounded-xl text-sm text-gray-400 hover:text-white hover:border-white/40 transition-colors"
                  >
                    Upload Another Video
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

