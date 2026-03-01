import React, { useState, useRef, useEffect } from 'react';
import { 
  Eye, 
  Mic, 
  Map as MapIcon, 
  ShieldCheck, 
  Zap, 
  Coins, 
  ChevronRight,
  Loader2,
  Volume2,
  AlertCircle,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GeminiService } from './services/gemini';
import { ElevenLabsService } from './services/elevenlabs';
import { SnowflakeService, SpatialNode } from './services/snowflake';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastDescription, setLastDescription] = useState<string>("");
  const [lastSceneDescription, setLastSceneDescription] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [solanaBalance, setSolanaBalance] = useState(1.245);
  const [currentBuilding, setCurrentBuilding] = useState("UTM Campus Building");
  const [goldenPath, setGoldenPath] = useState<SpatialNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const [isSnowflakeConnected, setIsSnowflakeConnected] = useState<boolean | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState<string>("English");
  const currentLanguageRef = useRef<string>("English");
  const hazardAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Services
  const gemini = new GeminiService(process.env.GEMINI_API_KEY || "");
  const elevenLabs = new ElevenLabsService(
    process.env.ELEVENLABS_API_KEY || "", 
    process.env.ELEVENLABS_VOICE_ID || "pMs7uS297jtjz4kyM997" // Default to Serena UUID
  );
  const snowflake = new SnowflakeService();

  useEffect(() => {
    startCamera();
    loadSpatialData();
    setupSpeechRecognition();
  }, []);

  const languageKeywords: Record<string, string> = {
    "Spanish": "es-ES",
    "French": "fr-FR",
    "German": "de-DE",
    "Chinese": "zh-CN",
    "Japanese": "ja-JP",
    "Hindi": "hi-IN",
    "English": "en-US",
    "Portuguese": "pt-BR",
    "Italian": "it-IT"
  };

  const handleLanguageChange = (langName: string) => {
    setCurrentLanguage(langName);
    currentLanguageRef.current = langName;
    setupSpeechRecognition(languageKeywords[langName]);
    
    // Localized confirmations
    const confirmations: Record<string, string> = {
      "Spanish": "Idioma cambiado a español.",
      "French": "Langue réglée sur le français.",
      "German": "Sprache auf Deutsch eingestellt.",
      "Chinese": "语言已设置为中文。",
      "Japanese": "言語が日本語に設定されました。",
      "Hindi": "भाषा हिंदी में सेट की गई है।",
      "English": "Language set to English.",
      "Portuguese": "Idioma definido para português.",
      "Italian": "Lingua impostata su italiano."
    };
    
    playMessage(confirmations[langName] || `Language set to ${langName}.`);
  };

  const getSystemMessage = (key: string, param?: string) => {
    const messages: Record<string, Record<string, string>> = {
      "English": {
        "navigating": `Navigating to ${param}. I will guide you.`,
        "sign_hunting": `I'll look for signs for ${param}. Let's go.`,
        "pinned": "Location pinned to spatial registry. Awaiting audit.",
        "pin_failed": "Failed to save location to registry."
      },
      "Spanish": {
        "navigating": `Navegando hacia ${param}. Te guiaré.`,
        "sign_hunting": `Buscaré señales para ${param}. Vamos.`,
        "pinned": "Ubicación fijada en el registro espacial. Esperando auditoría.",
        "pin_failed": "Error al guardar la ubicación en el registro."
      },
      "French": {
        "navigating": `Navigation vers ${param}. Je vais vous guider.`,
        "sign_hunting": `Je vais chercher des panneaux pour ${param}. Allons-y.`,
        "pinned": "Emplacement épinglé dans le registre spatial. En attente d'audit.",
        "pin_failed": "Échec de l'enregistrement de l'emplacement."
      },
      "German": {
        "navigating": `Navigiere zu ${param}. Ich werde dich führen.`,
        "sign_hunting": `Ich werde nach Schildern für ${param} suchen. Los geht's.`,
        "pinned": "Standort im räumlichen Register markiert. Audit ausstehend.",
        "pin_failed": "Standort konnte nicht im Register gespeichert werden."
      },
      "Hindi": {
        "navigating": `${param} की ओर जा रहे हैं। मैं आपका मार्गदर्शन करूँगा।`,
        "sign_hunting": `मैं ${param} के लिए संकेतों की तलाश करूँगा। चलिए।`,
        "pinned": "स्थान स्थानिक रजिस्ट्री में पिन किया गया। ऑडिट की प्रतीक्षा है।",
        "pin_failed": "रजिस्ट्री में स्थान सहेजने में विफल।"
      }
      // Add more as needed
    };

    const langMessages = messages[currentLanguage] || messages["English"];
    return langMessages[key] || messages["English"][key];
  };

  const playMessage = async (text: string) => {
    console.log("Attempting to play message:", text);
    setIsAudioPlaying(true);
    try {
      // Stop any current speech synthesis
      window.speechSynthesis.cancel();

      // Try ElevenLabs first
      const voiceUrl = await elevenLabs.speak(text);
      console.log("ElevenLabs voice URL:", voiceUrl ? "Generated" : "FAILED (Falling back to native)");
      
      if (voiceUrl) {
        setAudioUrl(voiceUrl);
        if (audioRef.current) {
          // Stop current audio if it's playing
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          
          audioRef.current.src = voiceUrl;
          audioRef.current.load();
          
          // Handle the play promise to catch interruptions
          try {
            await audioRef.current.play();
            console.log("Audio playback started successfully");
          } catch (playErr: any) {
            if (playErr.name !== 'AbortError') {
              console.error("Audio play failed:", playErr);
              // Fallback if play() fails
              const utterance = new SpeechSynthesisUtterance(text);
              utterance.onend = () => setIsAudioPlaying(false);
              window.speechSynthesis.speak(utterance);
            } else {
              setIsAudioPlaying(false);
            }
          }
        }
      } else {
        // Fallback to Native TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = languageKeywords[currentLanguageRef.current] || 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.onend = () => setIsAudioPlaying(false);
        window.speechSynthesis.speak(utterance);
        console.log(`Native TTS started in ${utterance.lang}`);
      }
    } catch (err) {
      console.error("Audio playback failed:", err);
      // Last resort fallback
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = languageKeywords[currentLanguageRef.current] || 'en-US';
      utterance.onend = () => setIsAudioPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const playHazardAlert = () => {
    return new Promise<void>((resolve) => {
      if (!hazardAudioRef.current) {
        hazardAudioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      }
      hazardAudioRef.current.volume = 0.5;
      hazardAudioRef.current.onended = () => resolve();
      hazardAudioRef.current.play().catch(err => {
        console.error("Hazard sound failed", err);
        resolve();
      });
    });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const handleEnd = () => setIsAudioPlaying(false);
      audio.addEventListener('ended', handleEnd);
      return () => audio.removeEventListener('ended', handleEnd);
    }
  }, []);

  const setupSpeechRecognition = (lang: string = 'en-US') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = lang;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleUserQuestion(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const handleUserQuestion = async (question: string) => {
    if (!videoRef.current || !canvasRef.current || isLoading) return;
    
    setIsLoading(true);
    setLastDescription(`Listening: "${question}"`);

    const lowerQuestion = question.toLowerCase();

    // Language Detection Logic
    for (const [langName, langCode] of Object.entries(languageKeywords)) {
      const l = langName.toLowerCase();
      // More restrictive matching to avoid accidental switches
      if (
        lowerQuestion.includes(`speak in ${l}`) || 
        lowerQuestion.includes(`switch to ${l}`) ||
        lowerQuestion.includes(`talk in ${l}`) ||
        lowerQuestion.includes(`change language to ${l}`)
      ) {
        handleLanguageChange(langName);
        setIsLoading(false);
        return;
      }
    }

    // Detect pin intent
    const pinKeywords = ["pin this", "save this", "remember this", "pin location", "save location", "pin", "save"];
    const isPinIntent = pinKeywords.some(k => lowerQuestion.includes(k));

    if (isPinIntent) {
      await pinLocation();
      setIsLoading(false);
      return;
    }

    // Detect navigation intent
    const navKeywords = ["where is", "find", "navigate to", "go to", "looking for", "washroom", "toilet", "exit", "elevator", "restroom"];
    const isNavIntent = navKeywords.some(k => lowerQuestion.includes(k));

    let targetLangForThisRequest = currentLanguageRef.current;
    for (const langName of Object.keys(languageKeywords)) {
      if (lowerQuestion.includes(`translate to ${langName.toLowerCase()}`)) {
        targetLangForThisRequest = langName;
        break;
      }
    }

    // Capture current frame for context (High Quality)
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg', 1.0).split(',')[1];

    try {
      if (isNavIntent) {
        // Search Snowflake for relevant locations
        const locations = await snowflake.searchRegistry(question, "uni_library_main");
        if (locations.length > 0) {
          const target = locations[0].description;
          setNavigationTarget(target);
          await playMessage(getSystemMessage("navigating", target));
        } else {
          // If not in registry, let Gemini try to find it in the scene (Sign Hunting)
          setNavigationTarget(question);
          await playMessage(getSystemMessage("sign_hunting", question));
        }
      }

      // Ask Gemini with context
      const analysis = await gemini.describeScene(base64Image, question, navigationTarget || undefined, targetLangForThisRequest);
      setLastDescription(analysis.description);
      setLastSceneDescription(analysis.description);

      // Speak full response for mic questions
      await playMessage(analysis.description);
      
      if (analysis.navigation) {
        await playMessage(analysis.navigation);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Camera access denied", err);
    }
  };

  const loadSpatialData = async () => {
    try {
      const path = await snowflake.fetchGoldenPath("uni_library_main");
      setGoldenPath(path);
      setError(null);
      setIsSnowflakeConnected(true);
    } catch (err: any) {
      console.error("Failed to load spatial data:", err);
      setError(err.message);
      setIsSnowflakeConnected(false);
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isLoading) return;
    
    setIsLoading(true);
    setIsScanning(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // High Quality Capture
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    
    const base64Image = canvas.toDataURL('image/jpeg', 1.0).split(',')[1];

    try {
      // 1. Gemini "Sees"
      const analysis = await gemini.describeScene(base64Image, undefined, navigationTarget || undefined, currentLanguageRef.current);
      setLastDescription(analysis.description);
      setLastSceneDescription(analysis.description);

      // 2. Speak Hazards (Priority)
      if (analysis.hazard) {
        await playHazardAlert();
        await playMessage(`Warning: ${analysis.hazard}`);
      }
      
      // 3. Speak Navigation Guidance
      if (navigationTarget && analysis.navigation) {
        await playMessage(analysis.navigation);
      }

      // 4. Solana "Rewards" (Simulated PoN)
      setSolanaBalance(prev => prev + 0.005);

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  const pinLocation = async () => {
    const descriptionToPin = lastSceneDescription || lastDescription;
    if (!descriptionToPin || isLoading) return;
    
    setIsLoading(true);
    try {
      await snowflake.saveNewPath({
        buildingId: "uni_library_main",
        coordinates: { x: Math.random() * 100, y: Math.random() * 100 },
        description: descriptionToPin,
        isGoldenPath: false // Needs audit
      });
      
      setError(null);
      // Refresh path
      const path = await snowflake.fetchGoldenPath("uni_library_main");
      setGoldenPath(path);
      
      await playMessage(getSystemMessage("pinned"));
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      await playMessage(getSystemMessage("pin_failed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-emerald-100">
      {/* Header / Status Rail */}
      <header className="border-b border-stone-200 p-4 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
            <Eye className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-stone-900">Vision Buddy <span className="text-emerald-600 font-medium">v1.0</span></h1>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest font-semibold">Your Friendly Guide</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block relative group">
            <p className="text-[10px] text-stone-400 uppercase font-bold">Language</p>
            <select 
              value={currentLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="text-xs font-bold text-emerald-600 bg-transparent border-none focus:ring-0 cursor-pointer appearance-none"
            >
              {Object.keys(languageKeywords).map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-stone-400 uppercase font-bold">Buddy Points</p>
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm">
              <Coins className="w-3.5 h-3.5" />
              {solanaBalance.toFixed(3)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6 pb-32">
        {/* Viewport Card */}
        <section className="relative aspect-[4/3] rounded-3xl overflow-hidden border border-stone-200 bg-stone-200 shadow-xl group">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Scanning Overlay */}
          <AnimatePresence>
            {isScanning && (
              <motion.div 
                initial={{ top: 0 }}
                animate={{ top: '100%' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: "linear" }}
                className="absolute left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)] z-10"
              />
            )}
          </AnimatePresence>

          {/* HUD Elements */}
          <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
            <div className="flex justify-between items-start">
              <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-stone-200 text-[10px] font-bold text-emerald-600 flex items-center gap-2 shadow-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                BUDDY VISION
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 shadow-sm flex items-center gap-2">
                  <Volume2 className="w-3 h-3 text-emerald-500" />
                  {currentLanguage.toUpperCase()}
                </div>
                <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 shadow-sm">
                  {currentBuilding.toUpperCase()}
                </div>
                {navigationTarget && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-emerald-500 backdrop-blur-sm px-3 py-1.5 rounded-full border border-emerald-400 text-[10px] font-bold text-white flex items-center gap-2 shadow-lg"
                  >
                    <MapPin className="w-3 h-3" />
                    TO: {navigationTarget.toUpperCase()}
                    {!goldenPath.some(n => n.description.toLowerCase().includes(navigationTarget.toLowerCase())) && (
                      <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-[8px] animate-pulse">HUNTING SIGNS</span>
                    )}
                    <button 
                      onClick={() => setNavigationTarget(null)}
                      className="ml-1 hover:scale-125 transition-transform pointer-events-auto"
                    >
                      ×
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
            
            <div className="flex justify-center">
               {isLoading && (
                 <div className="bg-white text-emerald-600 px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-3 shadow-xl border border-emerald-100 animate-bounce">
                   <Loader2 className="w-4 h-4 animate-spin" />
                   BUDDY IS THINKING...
                 </div>
               )}
            </div>
          </div>
        </section>

        {/* Guidance Card */}
        <section className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div className="flex items-center gap-2 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
              <ShieldCheck className={cn("w-4 h-4", isSnowflakeConnected === true ? "text-emerald-500" : isSnowflakeConnected === false ? "text-red-500" : "text-stone-300")} />
              Memory Status: {isSnowflakeConnected === true ? "ACTIVE" : isSnowflakeConnected === false ? "ERROR" : "CHECKING..."}
            </div>
            {isSnowflakeConnected === false && (
              <button 
                onClick={() => loadSpatialData()}
                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest"
              >
                RETRY
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Oops! Something happened</p>
                  <p className="text-xs text-red-700 whitespace-pre-wrap leading-relaxed">{error}</p>
                </div>
              </div>
              
              {error.includes("404") && (
                <div className="mt-4 p-4 bg-white rounded-xl border border-red-100 space-y-3 shadow-sm">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Diagnostic Tool</p>
                  <div className="space-y-2">
                    <p className="text-[11px] text-stone-600">The app is trying to reach:</p>
                    <code className="block p-2 bg-stone-50 rounded text-[10px] text-emerald-700 break-all border border-stone-100">
                      https://{process.env.SNOWFLAKE_ACCOUNT || "UF75979"}.snowflakecomputing.com
                    </code>
                    <a 
                      href={`https://${process.env.SNOWFLAKE_ACCOUNT || "UF75979"}.snowflakecomputing.com`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-[10px] font-bold text-emerald-600 hover:text-emerald-500 transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      TEST THIS URL IN BROWSER
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-stone-400 text-[10px] font-bold uppercase tracking-widest">
              <Volume2 className={cn("w-4 h-4", isAudioPlaying && "text-emerald-500 animate-pulse")} />
              Voice Guide
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => playMessage("Hi! I'm Vision Buddy. I'm ready to help you navigate.")}
                className="text-[10px] font-bold text-stone-400 hover:text-stone-600 bg-stone-100 px-3 py-1 rounded-full transition-colors"
              >
                TEST VOICE
              </button>
              {lastDescription && (
                <button 
                  onClick={() => playMessage(lastDescription)}
                  className="p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 transition-colors"
                  title="Repeat"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
              {audioUrl && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  READY
                </span>
              )}
            </div>
          </div>

          <div className="min-h-[100px] flex flex-col justify-center bg-stone-50 rounded-2xl p-4 border border-stone-100">
            {lastDescription ? (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg font-medium leading-relaxed text-stone-800 italic"
              >
                "{lastDescription}"
              </motion.p>
            ) : (
              <p className="text-stone-400 text-sm text-center">Tap the big green button to see what's around you!</p>
            )}
          </div>

          <audio ref={audioRef} className="hidden" />
        </section>

        {/* Spatial Memory (Snowflake) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-stone-400 text-[10px] font-bold uppercase tracking-[0.2em]">
            <MapIcon className="w-3 h-3" />
            Saved Places
          </div>
          
          <div className="grid gap-3">
            {goldenPath.length > 0 ? goldenPath.map((node, i) => (
              <motion.div 
                key={node.id} 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setNavigationTarget(node.description);
                  playMessage(`Navigating to ${node.description}`);
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xs font-bold text-emerald-600">
                  {i+1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-stone-800">{node.description}</p>
                  <p className="text-[10px] text-stone-400 font-semibold uppercase mt-0.5">Verified Location</p>
                </div>
                <ChevronRight className="w-5 h-5 text-stone-300" />
              </motion.div>
            )) : (
              <div className="bg-white/50 border border-dashed border-stone-200 rounded-2xl p-8 text-center">
                <p className="text-stone-400 text-xs font-medium">No places saved yet. Pin your first location!</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-stone-50 via-stone-50/95 to-transparent">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <button 
            onClick={captureAndAnalyze}
            disabled={isLoading}
            className={cn(
              "flex-1 h-16 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg transition-all active:scale-95 shadow-lg",
              isLoading 
                ? "bg-stone-200 text-stone-400 cursor-not-allowed" 
                : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200"
            )}
          >
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Eye className="w-6 h-6" />}
            LOOK AROUND
          </button>
          
          <button 
            onClick={pinLocation}
            disabled={!lastDescription || isLoading}
            className={cn(
              "w-16 h-16 rounded-2xl bg-white border border-stone-200 flex items-center justify-center transition-all active:scale-95 shadow-sm",
              (!lastDescription || isLoading) ? "opacity-30 cursor-not-allowed" : "hover:bg-stone-50 text-stone-600"
            )}
            title="Save this place"
          >
            <MapPin className="w-6 h-6" />
          </button>

          <button 
            onClick={toggleListening}
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-sm",
              isListening 
                ? "bg-red-500 text-white animate-pulse shadow-red-200" 
                : "bg-white border border-stone-200 hover:bg-stone-50 text-stone-600"
            )}
            title="Ask a question"
          >
            <Mic className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Error Toast Simulation */}
      {(!process.env.GEMINI_API_KEY || !process.env.ELEVENLABS_API_KEY) && (
        <div className="fixed top-20 left-4 right-4 z-[100]">
          <div className="bg-red-50 border border-red-100 backdrop-blur-md p-4 rounded-2xl flex items-start gap-3 shadow-xl">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-600">Setup Required</p>
              <p className="text-xs text-red-500/80 mt-1">
                Please add your API keys to the environment to start using Vision Buddy.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
