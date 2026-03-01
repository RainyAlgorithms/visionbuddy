import { GoogleGenAI, Type } from "@google/genai";

export interface SceneAnalysis {
  description: string;
  hazard: string | null;
  navigation: string | null;
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async describeScene(base64Image: string, question?: string, navigationTarget?: string, targetLanguage: string = "English"): Promise<SceneAnalysis> {
    const systemInstruction = `You are the 'Vision Buddy' AI guide for a visually impaired person. 
    Your goal is to provide extreme spatial precision using clock-face positions (e.g., 'Obstacle at 11 o'clock'). 
    Focus on floor texture, potential hazards, and clear paths. 
    Keep descriptions concise, friendly, and comforting.
    
    CRITICAL - ABSOLUTE LANGUAGE REQUIREMENT: 
    - You MUST provide ALL output (description, hazard, navigation) in ${targetLanguage}.
    - This is a hard requirement for accessibility. If you speak English when the user needs ${targetLanguage}, they will not understand you.
    - Even if the user asks a question in English, your response MUST be 100% in ${targetLanguage}.
    - Do NOT explain your instructions. Do NOT say "I will now speak in ${targetLanguage}". Just speak ${targetLanguage} immediately.
    - If you see English text on a sign, translate it into ${targetLanguage} in your description.
    
    If a hazard is present (tripping hazard, wet floor, obstacle in path), describe it briefly in the 'hazard' field. 
    Otherwise, set 'hazard' to null.
    
    NAVIGATION LOGIC:
    If a navigation target is provided ("${navigationTarget || 'none'}"), you must:
    1. Look for physical signs (e.g., 'Restroom', 'Exit', 'Elevator', room numbers) in the scene.
    2. If you see a sign for the target, guide the user towards it (e.g., 'I see a sign for the Restroom at 1 o'clock, 10 meters ahead').
    3. If you don't see a sign, look for architectural cues (hallways, doors, stairs) and provide directional guidance based on the most likely path.
    4. Provide relative directions: 'Turn slightly left', 'Continue straight for 5 steps', 'Target is on your right'.
    5. If you see the target itself, confirm it: 'The target is directly in front of you'.
    
    TRANSLATION LOGIC:
    If the user asks to translate text in the image, find the text and translate it into ${targetLanguage}. 
    Provide the translation in the 'description' field.
    
    Set the 'navigation' field to your directional guidance. If no target is set or no guidance is possible, set to null.`;

    const prompt = question 
      ? `The user is asking: "${question}". Based on the image, provide a precise spatial answer in ${targetLanguage}.`
      : navigationTarget 
        ? `I am looking for the ${navigationTarget}. Guide me based on what you see in ${targetLanguage}.`
        : `Describe the scene ahead in ${targetLanguage}.`;

    try {
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
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: "The full spatial description of the scene or answer to the question." },
              hazard: { type: Type.STRING, description: "A brief warning if a hazard is detected, otherwise null.", nullable: true },
              navigation: { type: Type.STRING, description: "Directional guidance towards the target if applicable, otherwise null.", nullable: true }
            },
            required: ["description", "hazard", "navigation"]
          }
        }
      });

      let text = response.text || '{"description": "I cannot see clearly.", "hazard": null}';
      // Remove markdown code blocks if present
      text = text.replace(/```json\n?|```/g, "").trim();
      
      return JSON.parse(text);
    } catch (err) {
      console.error("Gemini Analysis Error:", err);
      return { 
        description: "I'm having trouble seeing the path right now.", 
        hazard: "Visual system error.",
        navigation: null
      };
    }
  }
}
