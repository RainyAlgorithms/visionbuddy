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
  AlertCircle
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [solanaBalance, setSolanaBalance] = useState(1.245);
  const [currentBuilding, setCurrentBuilding] = useState("University Library");
  const [goldenPath, setGoldenPath] = useState<SpatialNode[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Services
  const gemini = new GeminiService(process.env.GEMINI_API_KEY || "");
  const elevenLabs = new ElevenLabsService(
    import.meta.env.VITE_ELEVENLABS_API_KEY || "", 
    import.meta.env.VITE_ELEVENLABS_VOICE_ID || "pMs7uS297jtjz4kyM997" // Default to Serena UUID
  );
  const snowflake = new SnowflakeService();

  useEffect(() => {
    startCamera();
    loadSpatialData();
    setupSpeechRecognition();
  }, []);

  const playMessage = async (text: string) => {
    try {
      // Try ElevenLabs first
      const voiceUrl = await elevenLabs.speak(text);
      
      if (voiceUrl) {
        setAudioUrl(voiceUrl);
        if (audioRef.current) {
          audioRef.current.src = voiceUrl;
          audioRef.current.load();
          await audioRef.current.play();
        }
      } else {
        // Fallback to Native TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      console.error("Audio playback failed:", err);
      // Last resort fallback
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const setupSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

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

    // Capture current frame for context
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    try {
      // Ask Gemini with context
      const response = await gemini.describeScene(base64Image, question);
      setLastDescription(response);

      // Speak response
      await playMessage(response);
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
    const path = await snowflake.fetchGoldenPath("uni_library_main");
    setGoldenPath(path);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isLoading) return;
    
    setIsLoading(true);
    setIsScanning(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    try {
      // 1. Gemini "Sees"
      const description = await gemini.describeScene(base64Image);
      setLastDescription(description);

      // 2. Speak response
      await playMessage(description);

      // 3. Solana "Rewards" (Simulated PoN)
      setSolanaBalance(prev => prev + 0.005);

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-emerald-500/30">
      {/* Header / Status Rail */}
      <header className="border-b border-white/10 p-4 flex items-center justify-between bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">Ghostwriter <span className="text-emerald-500">v1.0</span></h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Spatial Navigation Engine</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] text-white/40 uppercase font-mono">PoN Rewards</p>
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-sm">
              <Coins className="w-3.5 h-3.5" />
              {solanaBalance.toFixed(3)} SOL
            </div>
          </div>
          <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6 pb-32">
        {/* Viewport Card */}
        <section className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 shadow-2xl group">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover opacity-60 grayscale group-hover:grayscale-0 transition-all duration-700"
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
                className="absolute left-0 right-0 h-0.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)] z-10"
              />
            )}
          </AnimatePresence>

          {/* HUD Elements */}
          <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
            <div className="flex justify-between items-start">
              <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded border border-white/10 text-[10px] font-mono text-emerald-400 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE_FEED_01
              </div>
              <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded border border-white/10 text-[10px] font-mono text-white/60">
                {currentBuilding.toUpperCase()}
              </div>
            </div>
            
            <div className="flex justify-center">
               {isLoading && (
                 <div className="bg-emerald-500 text-black px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 animate-bounce">
                   <Loader2 className="w-3 h-3 animate-spin" />
                   GEMINI REASONING...
                 </div>
               )}
            </div>
          </div>
        </section>

        {/* Guidance Card */}
        <section className="bg-zinc-900/50 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white/60 text-xs font-medium uppercase tracking-wider">
              <Volume2 className="w-4 h-4" />
              Audio Guidance
            </div>
            {audioUrl && (
              <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                READY
              </span>
            )}
          </div>

          <div className="min-h-[80px] flex flex-col justify-center">
            {lastDescription ? (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg font-medium leading-relaxed text-white/90 italic"
              >
                "{lastDescription}"
              </motion.p>
            ) : (
              <p className="text-white/30 text-sm">Tap the scan button to analyze your surroundings.</p>
            )}
          </div>

          <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
        </section>

        {/* Spatial Memory (Snowflake) */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">
            <MapIcon className="w-3 h-3" />
            Snowflake Spatial Registry
          </div>
          
          <div className="space-y-2">
            {goldenPath.map((node, i) => (
              <div key={node.id} className="bg-zinc-900 border border-white/5 rounded-xl p-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-mono text-white/40">
                  0{i+1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-white/80">{node.description}</p>
                  <p className="text-[10px] text-white/30 uppercase mt-1">Golden Path Verified</p>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <button 
            onClick={captureAndAnalyze}
            disabled={isLoading}
            className={cn(
              "flex-1 h-16 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg transition-all active:scale-95",
              isLoading 
                ? "bg-zinc-800 text-white/20 cursor-not-allowed" 
                : "bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
            )}
          >
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Eye className="w-6 h-6" />}
            SCAN SPACE
          </button>
          
          <button 
            onClick={toggleListening}
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-all active:scale-95",
              isListening 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-zinc-900 border border-white/10 hover:bg-zinc-800"
            )}
          >
            <Mic className={cn("w-6 h-6", isListening ? "text-white" : "text-white/60")} />
          </button>
        </div>
      </div>

      {/* Error Toast Simulation */}
      {(!process.env.GEMINI_API_KEY || !import.meta.env.VITE_ELEVENLABS_API_KEY) && (
        <div className="fixed top-20 left-4 right-4 z-[100]">
          <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-md p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-500">API Configuration Required</p>
              <p className="text-xs text-red-400/80 mt-1">
                Please add GEMINI_API_KEY, VITE_ELEVENLABS_API_KEY, and VITE_ELEVENLABS_VOICE_ID to your environment.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
