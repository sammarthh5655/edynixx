export async function extractFrames(
  file: File,
  fps: number = 1,
  onProgress?: (progress: number) => void
): Promise<{ time: number; data: string }[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const canvas = document.createElement('canvas');
      // 480p resolution to save bandwidth but keep enough detail for the kill banner
      canvas.width = 854;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      const frames: { time: number; data: string }[] = [];
      const totalFrames = Math.floor(duration * fps);
      let currentFrame = 0;

      for (let time = 0; time < duration; time += 1 / fps) {
        video.currentTime = time;
        await new Promise((r) => {
          video.onseeked = r;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        frames.push({ time: Math.floor(time), data });
        
        currentFrame++;
        if (onProgress) {
          onProgress(currentFrame / totalFrames);
        }
      }

      URL.revokeObjectURL(video.src);
      resolve(frames);
    };

    video.onerror = () => {
      reject(new Error('Error loading video'));
    };
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
    video.muted = false;
    video.currentTime = start;

    video.onloadedmetadata = () => {
      try {
        // @ts-ignore
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        if (!stream) {
          throw new Error('captureStream not supported in this browser');
        }
        
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        
        recorder.onstop = () => {
          URL.revokeObjectURL(video.src);
          resolve(new Blob(chunks, { type: 'video/webm' }));
        };

        recorder.start();
        video.play();

        setTimeout(() => {
          recorder.stop();
          video.pause();
        }, (end - start) * 1000);
      } catch (err) {
        reject(err);
      }
    };
    
    video.onerror = () => reject(new Error('Error loading video for recording'));
  });
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
