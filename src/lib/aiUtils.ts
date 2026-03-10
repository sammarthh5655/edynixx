import { GoogleGenAI, Type } from '@google/genai';

export async function analyzeKills(
  frames: { time: number; data: string }[],
  apiKey: string,
  game: string = 'Valorant',
  onProgress?: (progress: number) => void
): Promise<number[]> {
  const ai = new GoogleGenAI({ apiKey });
  
  const CHUNK_SIZE = 100; // 100 frames per request for efficiency
  const chunks = [];
  for (let i = 0; i < frames.length; i += CHUNK_SIZE) {
    chunks.push(frames.slice(i, i + CHUNK_SIZE));
  }

  const prompts: Record<string, string> = {
    'Valorant': "Identify the exact seconds where the player gets a kill. Look for the kill banner (skull/weapon icon) at the bottom center. Return a JSON array of the first second each banner appears. Return [] if none.",
    'Free Fire': "Identify the exact seconds where the player gets a kill. Look for the kill icon (skull/kneeling figure). Return a JSON array of the first second each icon appears. Return [] if none.",
    'Fortnite': "Identify the exact seconds where the player gets a kill. Look for the 'Eliminated' notification or the red 'X' icon that appears when a player is downed or eliminated. Return a JSON array of the first second each appears. Return [] if none.",
    'COD': "Identify the exact seconds where the player gets a kill. Look for the 'Kill' or 'Headshot' medals and text that appear in the center of the screen. Return a JSON array of the first second each appears. Return [] if none."
  };

  const systemPrompt = prompts[game] || prompts['Valorant'];
  const results: number[][] = new Array(chunks.length);
  let completedChunks = 0;

  // Process chunks in parallel with a concurrency limit
  const CONCURRENCY = 3;
  const chunkTasks = chunks.map((chunk, index) => ({ chunk, index }));

  const worker = async () => {
    while (chunkTasks.length > 0) {
      const task = chunkTasks.shift();
      if (!task) break;

      const { chunk, index } = task;
      const parts: any[] = [{ text: systemPrompt }];

      for (const frame of chunk) {
        parts.push({ text: `T:${frame.time}s` });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: frame.data,
          },
        });
      }

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: { role: 'user', parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
            },
            temperature: 0.1,
          },
        });

        if (response.text) {
          const timestamps = JSON.parse(response.text);
          results[index] = timestamps;
        } else {
          results[index] = [];
        }
      } catch (error) {
        console.error(`Error analyzing chunk ${index}:`, error);
        results[index] = [];
      } finally {
        completedChunks++;
        if (onProgress) {
          onProgress(completedChunks / chunks.length);
        }
      }
    }
  };

  // Start parallel workers
  await Promise.all(Array(CONCURRENCY).fill(null).map(worker));

  const allKills = results.flat();

  // Deduplicate and sort
  const uniqueKills = Array.from(new Set(allKills)).sort((a, b) => a - b);
  
  // Filter out kills that are too close to each other (e.g., within 5 seconds)
  // because a single kill banner might be detected multiple times if it stays on screen
  const filteredKills: number[] = [];
  for (const kill of uniqueKills) {
    if (filteredKills.length === 0 || kill - filteredKills[filteredKills.length - 1] > 5) {
      filteredKills.push(kill);
    }
  }

  return filteredKills;
}
