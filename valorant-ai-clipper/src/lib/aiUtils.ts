import { GoogleGenAI, Type } from '@google/genai';

export async function analyzeKills(
  frames: { time: number; data: string }[],
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<number[]> {
  const ai = new GoogleGenAI({ apiKey });
  const allKills: number[] = [];
  
  const CHUNK_SIZE = 60; // 60 frames per request to avoid payload limits
  const chunks = [];
  for (let i = 0; i < frames.length; i += CHUNK_SIZE) {
    chunks.push(frames.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const parts: any[] = [
      {
        text: "You are an expert Valorant gameplay analyzer. I am providing you with a sequence of frames from a Valorant video. Your task is to identify the exact seconds where the player gets a kill.\n\nLook for the 'kill banner' which appears in the bottom center of the screen when the player gets a kill. It usually has a skull or weapon icon inside a circle or banner. \n\nReturn a JSON array of the timestamps (in seconds) where a kill banner is clearly visible. If a banner spans multiple seconds, just return the first second it appears. Only return the JSON array of numbers. If there are no kills, return an empty array [].",
      },
    ];

    for (const frame of chunk) {
      parts.push({ text: `Time: ${frame.time}s` });
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
        allKills.push(...timestamps);
      }
    } catch (error) {
      console.error('Error analyzing chunk:', error);
      // Continue with other chunks even if one fails
    }
    
    if (onProgress) {
      onProgress((i + 1) / chunks.length);
    }
  }

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
