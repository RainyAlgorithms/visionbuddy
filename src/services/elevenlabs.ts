export class ElevenLabsService {
  private apiKey: string;
  private voiceId: string;

  constructor(apiKey: string, voiceId: string) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  async speak(text: string): Promise<string | null> {
    if (!this.apiKey || !this.voiceId || this.apiKey === "MY_ELEVENLABS_KEY") {
      console.warn("ElevenLabs credentials missing. Falling back to native TTS.");
      return null;
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("ElevenLabs API Error:", errorData);
        return null;
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("ElevenLabs Network Error:", error);
      return null;
    }
  }
}
