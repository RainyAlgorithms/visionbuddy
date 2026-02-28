import { GoogleGenAI } from "@google/genai";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async describeScene(base64Image: string, question?: string): Promise<string> {
    const prompt = question 
      ? `The user is asking: "${question}". Based on the image, provide a precise spatial answer.`
      : "You are the 'Ghostwriter' AI guide for a visually impaired person. Describe the scene ahead with extreme spatial precision. Use clock-face positions (e.g., 'Obstacle at 11 o'clock'). Focus on floor texture, potential hazards, and clear paths. Keep it concise and comforting.";

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
          ],
        },
      ],
    });

    return response.text || "I'm having trouble seeing the path right now. Please hold steady.";
  }
}
