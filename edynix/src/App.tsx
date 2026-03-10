import React, { useState, useRef, useEffect } from 'react';
import { Upload, Scissors, Play, Download, Loader2, Video, CheckCircle2, AlertCircle } from 'lucide-react';
import { extractFrames, recordClip, formatTime } from './lib/videoUtils';
import { analyzeKills } from './lib/aiUtils';
import { GAME_CONFIGS, WEBSITE_LOGO } from './constants';

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

  // Get selected game from window (set by index.html)
  const [game, setGame] = useState<string>(() => {
    const g = (window as any).selectedGame || 'Valorant';
    return GAME_CONFIGS[g] ? g : 'Valorant';
  });

  useEffect(() => {
    const checkGame = () => {
      const g = (window as any).selectedGame;
      if (g && g !== game && GAME_CONFIGS[g]) setGame(g);
    };
    const interval = setInterval(checkGame, 500);
    return () => clearInterval(interval);
  }, [game]);

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
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is not configured.');
      }

      const killTimestamps = await analyzeKills(frames, apiKey, game, (p) => setProgress(p));
      
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
      a.download = `${game.toLowerCase()}-kill-${clip.id}.webm`;
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
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <img src={WEBSITE_LOGO} alt="Edynix Logo" className="w-10 h-10 rounded-lg object-cover border border-white/10 shadow-lg" onError={(e) => e.currentTarget.style.display = 'none'} />
            <span className="text-xl font-extrabold tracking-tight uppercase">Edynix</span>
            <div className="h-8 w-px bg-white/10 mx-2" />
          </div>
          <div className="flex items-center gap-3">
            <img src={GAME_CONFIGS[game]?.logo} alt={game} className="w-8 h-8 object-contain" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.style.display = 'none'} />
            <h1 className="text-lg font-bold uppercase tracking-wider text-gray-300">{game} Clipper</h1>
          </div>
        </div>
        <div className="text-xs font-mono text-gray-400 hidden sm:block uppercase tracking-widest">Powered by Gemini 3.0</div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8 relative z-10">
        {/* Upload Section */}
        {appState === 'idle' && (
          <div className="mt-12">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-extrabold tracking-tight mb-4 uppercase">Turn your {game} gameplay into highlights.</h2>
              <p className="text-gray-400 max-w-xl mx-auto text-lg">
                Upload your {game} VOD. Our AI analyzes every frame to detect kill banners and automatically generates perfect clips (10s before, 2s after).
              </p>
            </div>

            <label className="block w-full max-w-2xl mx-auto aspect-video border-2 border-dashed border-white/40 bg-transparent hover:bg-white/5 hover:border-white transition-all cursor-pointer group relative overflow-hidden">
              <input 
                type="file" 
                accept="video/mp4,video/webm,video/quicktime" 
                className="hidden" 
                onChange={handleFileUpload}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <div className="w-20 h-20 rounded-full border border-white/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-white group-hover:text-black">
                  <Upload className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold mb-2 uppercase tracking-wider">Upload Gameplay Video</h3>
                <p className="text-sm text-gray-400 uppercase tracking-widest">MP4, WebM, or MOV up to 1080p</p>
              </div>
            </label>
          </div>
        )}

        {/* Processing State */}
        {(appState === 'extracting' || appState === 'analyzing') && (
          <div className="mt-20 max-w-md mx-auto text-center space-y-6">
            <div className="relative w-24 h-24 mx-auto">
              <svg className="animate-spin w-full h-full text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-mono font-bold">{Math.round(progress * 100)}%</span>
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-bold mb-2 uppercase tracking-wider">
                {appState === 'extracting' ? 'Extracting Frames...' : 'AI Analyzing Gameplay...'}
              </h3>
              <p className="text-gray-400 text-sm uppercase tracking-widest">
                {appState === 'extracting' 
                  ? 'Scanning video to prepare for AI analysis.' 
                  : 'Gemini is looking for kill banners in your footage.'}
              </p>
            </div>
            
            <div className="h-2 w-full bg-white/10 rounded-none overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-300 ease-out"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error State */}
        {appState === 'error' && (
          <div className="mt-20 max-w-md mx-auto text-center space-y-6 bg-white/5 border border-white/20 p-8 rounded-none">
            <AlertCircle className="w-12 h-12 text-white mx-auto" />
            <div>
              <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-wider">Processing Failed</h3>
              <p className="text-gray-300 text-sm mb-4">{errorMsg}</p>
              <div className="text-xs text-gray-400 bg-black/50 p-4 border border-white/10 text-left uppercase tracking-widest">
                <p className="font-bold mb-2 text-white">💡 Tips for success:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>Use MP4 or WebM format</li>
                  <li>Ensure the video is not corrupted</li>
                  <li>Try a shorter or lower resolution clip if the file is very large</li>
                  <li>Check your internet connection if using a remote API</li>
                  <li>If you see "PIPELINE_ERROR_DECODE", try re-encoding your video to H.264 MP4 using a tool like <a href="https://handbrake.fr/" target="_blank" rel="noopener noreferrer" className="text-white hover:underline font-bold">Handbrake</a></li>
                </ul>
              </div>
            </div>
            <button 
              onClick={() => setAppState('idle')}
              className="px-8 py-3 border-2 border-white bg-transparent hover:bg-white hover:text-black font-bold uppercase tracking-widest transition-all"
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
              <div className="aspect-video bg-black rounded-none overflow-hidden relative border border-white/20 shadow-2xl">
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
                  <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-4 py-2 border border-white/20 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-xs font-mono font-bold uppercase tracking-widest">Playing {activeClip.id}</span>
                  </div>
                )}
              </div>
              
              {activeClip && (
                <div className="flex items-center justify-between bg-black/50 p-6 border border-white/20 backdrop-blur-sm">
                  <div>
                    <h3 className="font-bold text-lg uppercase tracking-wider mb-1">Clip Details</h3>
                    <p className="text-sm text-gray-400 font-mono">
                      {formatTime(activeClip.start)} - {formatTime(activeClip.end)}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleDownload(activeClip)}
                    disabled={activeClip.isRecording}
                    className="flex items-center gap-3 px-6 py-3 border-2 border-white bg-white text-black hover:bg-transparent hover:text-white disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-black font-bold uppercase tracking-widest transition-all"
                  >
                    {activeClip.isRecording ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Recording...</>
                    ) : (
                      <><Download className="w-5 h-5" /> Download Clip</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Clips List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/20 pb-4">
                <h2 className="text-xl font-bold uppercase tracking-wider">Detected Kills</h2>
                <span className="px-3 py-1 border border-white/20 text-xs font-bold uppercase tracking-widest">
                  {clips.length} found
                </span>
              </div>
              
              {clips.length === 0 ? (
                <div className="p-8 text-center bg-black/50 border border-white/20">
                  <Video className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 uppercase tracking-widest text-sm">No kills detected in this video.</p>
                  <button 
                    onClick={() => setAppState('idle')}
                    className="mt-6 text-sm text-white hover:text-gray-300 underline uppercase tracking-widest font-bold"
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
                      className={`group relative p-4 border transition-all cursor-pointer flex gap-4 ${
                        activeClip?.id === clip.id 
                          ? 'bg-white/10 border-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' 
                          : 'bg-black/50 border-white/20 hover:border-white/50'
                      }`}
                    >
                      <div className="w-24 aspect-video bg-black border border-white/10 overflow-hidden relative flex-shrink-0">
                        {clip.thumbnail ? (
                          <img src={clip.thumbnail} alt="Thumbnail" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-5 h-5 text-gray-600" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                      
                      <div className="flex flex-col justify-center">
                        <h4 className="font-bold text-sm mb-1 uppercase tracking-wider">Kill #{idx + 1}</h4>
                        <div className="text-xs text-gray-400 font-mono flex items-center gap-2 uppercase tracking-widest">
                          <span>{formatTime(clip.start)}</span>
                          <span>→</span>
                          <span>{formatTime(clip.end)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => setAppState('idle')}
                    className="w-full py-4 mt-6 border-2 border-dashed border-white/20 text-sm text-gray-400 hover:text-white hover:border-white transition-colors font-bold uppercase tracking-widest"
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

