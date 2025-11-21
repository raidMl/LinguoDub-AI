import { GoogleGenAI, Type } from "@google/genai";
import { ScriptLine, GEMINI_VOICES } from "../types";

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize Gemini
// NOTE: In a real production app, do not expose keys on frontend. 
// We assume process.env.API_KEY is available as per instructions.
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Analyzes the media (video/audio) to identify speakers and generate a translated script.
 */
export const analyzeVideoScript = async (
  mediaBase64: string,
  mimeType: string,
  targetLanguage: string
): Promise<{ script: ScriptLine[]; speakers: string[] }> => {
  const ai = getAiClient();

  const prompt = `
    Listen to the audio track of this file carefully.
    1. Identify all distinct speakers based on voice characteristics (e.g., Speaker A, Speaker B).
    2. Transcribe every line of spoken dialogue.
    3. Translate the spoken dialogue into ${targetLanguage}.
    4. Provide precise start and end timestamps (in seconds) for each line.
    
    Important: Focus ONLY on the spoken audio. Ignore any on-screen text or visual context unless it is spoken.
    
    Return the data in a strictly structured JSON format matching the schema.
    Ensure the translation captures the nuance and tone of the original speaker.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: mediaBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction: "You are an expert dubbing director and audio translator.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            script: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  speakerId: { type: Type.STRING, description: "Unique identifier for the speaker (e.g., Speaker 1)" },
                  startTime: { type: Type.NUMBER, description: "Start time in seconds" },
                  endTime: { type: Type.NUMBER, description: "End time in seconds" },
                  originalText: { type: Type.STRING, description: "Original language transcription" },
                  translatedText: { type: Type.STRING, description: `Translation in ${targetLanguage}` },
                },
                required: ["speakerId", "startTime", "endTime", "originalText", "translatedText"],
              },
            },
            speakers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of unique speaker IDs found",
            },
          },
          required: ["script", "speakers"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Empty response from Gemini analysis.");
    }

    const data = JSON.parse(response.text);
    
    // Add unique IDs to script lines for React keys
    const processedScript = data.script.map((line: any, index: number) => ({
      ...line,
      id: `line-${index}-${Date.now()}`,
      audioData: null
    }));

    return {
      script: processedScript,
      speakers: data.speakers
    };

  } catch (error) {
    console.error("Analysis Failed:", error);
    throw error;
  }
};

/**
 * Generates speech audio for a specific line of text using Gemini TTS.
 */
export const generateSpeechForLine = async (
  text: string,
  voiceName: string
): Promise<string> => {
  const ai = getAiClient();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }],
      },
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName,
            },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (audioPart && audioPart.inlineData && audioPart.inlineData.data) {
      return audioPart.inlineData.data;
    }
    
    throw new Error("No audio data returned.");

  } catch (error) {
    console.error("TTS Failed:", error);
    // Return empty string on failure to allow continuing, but log it
    return ""; 
  }
};

/**
 * Converts a File object to Base64 string
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:video/mp4;base64,")
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};