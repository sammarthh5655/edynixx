export async function extractFrames(
  file: File,
  fps: number = 1,
  onProgress?: (progress: number) => void
): Promise<{ time: number; data: string }[]> {
  let duration = 0;
  
  // First, get the duration
  await new Promise((resolve, reject) => {
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      duration = tempVideo.duration;
      URL.revokeObjectURL(tempVideo.src);
      resolve(null);
    };
    tempVideo.onerror = () => reject(new Error('Failed to load video metadata'));
    tempVideo.src = URL.createObjectURL(file);
  });

  if (!duration || isNaN(duration)) {
    throw new Error('Could not determine video duration');
  }

  // Parallel processing configuration
  const SEGMENT_DURATION = 5; 
  const CONCURRENCY = 4; // Reduced from 8 to 4 for better browser stability
  
  const segmentTasks: { start: number; end: number; index: number }[] = [];
  for (let start = 0, i = 0; start < duration; start += SEGMENT_DURATION, i++) {
    segmentTasks.push({ 
      start, 
      end: Math.min(start + SEGMENT_DURATION, duration),
      index: i
    });
  }

  const results: { time: number; data: string }[][] = new Array(segmentTasks.length);
  let completedCount = 0;
  const totalSegments = segmentTasks.length;

  // Worker function
  const worker = async () => {
    while (segmentTasks.length > 0) {
      const task = segmentTasks.shift();
      if (!task) break;

      try {
        // Add a global timeout for the entire segment to prevent hanging
        const chunk = await Promise.race([
          extractFrameChunk(file, task.start, task.end, fps),
          new Promise<{ time: number; data: string }[]>((_, reject) => 
            setTimeout(() => reject(new Error('Segment processing timed out')), 30000)
          )
        ]);
        results[task.index] = chunk;
      } catch (err) {
        console.warn(`Skipping segment ${task.start}s - ${task.end}s due to hang or error`, err);
        results[task.index] = [];
      } finally {
        completedCount++;
        if (onProgress) {
          // Ensure we don't get stuck at 99% if segments are skipped
          onProgress(completedCount / totalSegments);
        }
      }
    }
  };

  // Start workers
  await Promise.all(Array(CONCURRENCY).fill(null).map(worker));

  // Flatten and sort results
  const allFrames = results.flat().sort((a, b) => a.time - b.time);
  
  if (onProgress) onProgress(1);
  return allFrames;
}

async function extractFrameChunk(
  file: File,
  startTime: number,
  endTime: number,
  fps: number
): Promise<{ time: number; data: string }[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.volume = 0;
    
    const frames: { time: number; data: string }[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = 480; // Further reduced resolution for even faster scanning
    canvas.height = 270;
    const ctx = canvas.getContext('2d', { 
      alpha: false, 
      desynchronized: true,
      willReadFrequently: false 
    });
    
    if (!ctx) {
      reject(new Error('Canvas context unavailable'));
      return;
    }

    const cleanup = () => {
      video.onseeked = null;
      video.onerror = null;
      video.onloadedmetadata = null;
      if (video.src) URL.revokeObjectURL(video.src);
      video.remove();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(video.error?.message || 'Decoder crash'));
    };

    video.onloadedmetadata = async () => {
      try {
        for (let t = startTime; t < endTime; t += 1 / fps) {
          if (video.error) throw new Error(video.error.message);
          
          video.currentTime = t;
          
          await new Promise((res, rej) => {
            const tId = setTimeout(() => rej(new Error('Seek timeout')), 5000);
            video.onseeked = () => {
              clearTimeout(tId);
              res(null);
            };
          });

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          // 0.3 quality is plenty for AI to detect killfeed/UI elements
          const data = canvas.toDataURL('image/jpeg', 0.3).split(',')[1];
          frames.push({ time: Math.floor(t), data });
        }
        cleanup();
        resolve(frames);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.src = URL.createObjectURL(file);
    video.load();
  });
}

export async function recordClip(
  file: File,
  start: number,
  end: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true; // Must be muted for high playback rate stability
    video.playsInline = true;
    
    // Hidden container to ensure video is "active" in some browsers
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.overflow = 'hidden';
    container.appendChild(video);
    document.body.appendChild(container);

    video.onloadedmetadata = () => {
      try {
        video.currentTime = start;
        
        // @ts-ignore
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        if (!stream) {
          throw new Error('captureStream not supported in this browser');
        }
        
        const recorder = new MediaRecorder(stream, { 
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 5000000 // 5Mbps for good quality
        });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
          URL.revokeObjectURL(video.src);
          document.body.removeChild(container);
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };

        // Speed up recording 4x if possible
        video.playbackRate = 4;
        
        recorder.start();
        video.play().catch(reject);

        const duration = (end - start) / video.playbackRate;
        setTimeout(() => {
          recorder.stop();
          video.pause();
        }, duration * 1000 + 500); // Add small buffer
      } catch (err) {
        document.body.removeChild(container);
        reject(err);
      }
    };
    
    video.onerror = () => {
      document.body.removeChild(container);
      reject(new Error(`Error loading video for recording: ${video.error?.message || 'Unknown error'}`));
    };

    video.load();
  });
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
