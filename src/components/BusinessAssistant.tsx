import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, AlertCircle, CheckCircle2, ShoppingBag, TrendingUp, MessageSquare, X, Receipt, Mic, MicOff, Volume2, Trash2 } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: any;
  audio?: string; // Base64 audio data
}

export function BusinessAssistant({ 
  user, 
  ownerId,
  onSaleCreate,
  isFloating = false,
  onClose
}: { 
  user: FirebaseUser; 
  ownerId: string;
  onSaleCreate?: (items: any[]) => void;
  isFloating?: boolean;
  onClose?: () => void;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Namaste! Main aapka smart business assistant hoon. Main aapke business ki growth mein madad kar sakta hoon. \n\nKya aap aaj ke insights dekhna chahenge ya koi naya bill banana hai?"
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupport, setSpeechSupport] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'hi-IN'; // Set to Hindi/English

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        // Auto-send after a short delay to let the user see the text
        setTimeout(() => {
          handleSend(transcript);
        }, 500);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: "Maaf kijiye, microphone permission nahi mili. Please settings mein permission allow karein." 
          }]);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setSpeechSupport(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setIsListening(true);
      recognitionRef.current?.start();
    }
  };

  const playAudio = (base64Data: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(`data:audio/mp3;base64,${base64Data}`);
    audioRef.current = audio;
    setIsSpeaking(true);
    audio.play();
    audio.onended = () => setIsSpeaking(false);
  };

  const generateSpeech = async (text: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say in a friendly Indian shopkeeper tone: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore is a good voice
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return base64Audio;
    } catch (error) {
      console.error("TTS Error:", error);
      return null;
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const userMessage = overrideInput || input.trim();
    if (!userMessage || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }]
          }
        ],
        config: {
          systemInstruction: `You are a smart business assistant for small shopkeepers in India.
Your job is to help manage inventory, billing, and udhaar (credit).

Rules:
1. Understand simple Hindi/English mixed input (Hinglish).
2. If the user describes a product to add to inventory, extract details into this JSON format:
   {
     "type": "product_extraction",
     "data": {
       "name": "string",
       "quantity": number,
       "cost_price": number,
       "selling_price": number,
       "category": "string"
     },
     "missing_fields": ["list", "of", "missing", "fields"]
   }
3. If the user wants to create a sale/bill, extract items into this JSON format:
   {
     "type": "sale_extraction",
     "items": [
       {
         "name": "string",
         "quantity": number,
         "price": number
       }
     ]
   }
   - Use the EXACT product name mentioned by the user if possible.
   - If price is missing, use 0.
   - If quantity is missing, use 1.
4. If the user asks about business advice, give clear, actionable, practical advice for a small Indian shopkeeper. Keep it short.
5. If the user mentions udhaar or credit recovery, suggest a polite but firm WhatsApp reminder message.
6. Always focus on saving time and increasing profit.
7. Avoid long explanations. Keep responses practical and short.
8. If extracting a product or sale, also provide a short confirmation text in Hinglish.`,
          responseMimeType: "application/json"
        }
      });

      const result = await model;
      const responseText = result.text;
      
      try {
        const parsed = JSON.parse(responseText);
        let assistantContent = "";
        let audioData = undefined;
        
        if (parsed.type === 'product_extraction') {
          const { data, missing_fields } = parsed;
          assistantContent = `Theek hai! Maine product details nikaal liye hain.`;
          if (missing_fields && missing_fields.length > 0) {
            assistantContent += `\nKuch details missing hain: ${missing_fields.join(', ')}. Maine default values suggest kiye hain.`;
          }
        } else if (parsed.type === 'sale_extraction') {
          assistantContent = `Sale details ready hain! Kya main bill create karoon?`;
        } else {
          assistantContent = parsed.message || responseText;
        }

        // Generate speech for the assistant's response
        audioData = await generateSpeech(assistantContent);
        if (audioData) playAudio(audioData);

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: assistantContent,
          data: parsed,
          audio: audioData
        }]);

      } catch (e) {
        const audioData = await generateSpeech(responseText);
        if (audioData) playAudio(audioData);
        setMessages(prev => [...prev, { role: 'assistant', content: responseText, audio: audioData }]);
      }

    } catch (error) {
      console.error("Assistant Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Maaf kijiye, kuch error aa gaya. Dobara try karein." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const addProductToInventory = async (data: any) => {
    try {
      await addDoc(collection(db, 'products'), {
        userId: ownerId,
        name: data.name || 'Unknown Product',
        sku: `AI-${Date.now()}`,
        costPrice: Number(data.cost_price) || 0,
        price: Number(data.selling_price) || 0,
        stock: Number(data.quantity) || 0,
        primaryUnit: 'Unit',
        category: data.category || 'General',
        minStock: 5,
        updatedAt: Date.now(),
        trackInventory: true
      });
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `✅ ${data.name} inventory mein add ho gaya hai!` 
      }]);
    } catch (error) {
      console.error("Add Product Error:", error);
      alert("Product add karne mein dikkat hui.");
    }
  };

  const handleCreateSale = (items: any[]) => {
    if (onSaleCreate) {
      onSaleCreate(items);
      if (onClose) onClose();
    }
  };

  return (
    <div className={cn(
      "flex flex-col bg-white border border-slate-200 shadow-xl overflow-hidden",
      isFloating ? "h-[500px] w-[350px] rounded-2xl" : "h-[calc(100vh-12rem)] rounded-3xl shadow-sm"
    )}>
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 rounded-xl text-white">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Smart Assistant</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Powered by Gemini</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMessages([{
              role: 'assistant',
              content: "Namaste! Main aapka smart business assistant hoon. Inventory, billing ya udhaar ke baare mein kuch bhi puchiye. \n\nExample: 'Add 10kg sugar cost 40 sell 50' ya 'Create sale for 2kg rice and 1L oil'."
            }])}
            className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-colors"
            title="Clear Chat"
          >
            <Trash2 size={16} />
          </button>
          <Sparkles size={18} className="text-amber-500" />
          {isFloating && onClose && (
            <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg text-slate-400">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-3 max-w-[85%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              msg.role === 'user' ? "bg-slate-200 text-slate-600" : "bg-slate-900 text-white"
            )}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className="space-y-3">
              <div className={cn(
                "p-3 rounded-2xl text-sm leading-relaxed relative group",
                msg.role === 'user' 
                  ? "bg-slate-900 text-white rounded-tr-none" 
                  : "bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm"
              )}>
                {msg.content.split('\n').map((line, j) => (
                  <p key={j}>{line}</p>
                ))}
                
                {msg.role === 'assistant' && msg.audio && (
                  <button 
                    onClick={() => playAudio(msg.audio!)}
                    className="absolute -right-10 top-0 p-2 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-slate-900 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                  >
                    <Volume2 size={14} />
                  </button>
                )}
              </div>

              {msg.role === 'assistant' && i === messages.length - 1 && !isLoading && (
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => handleSend("Show business insights")}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-100 transition-colors flex items-center gap-1.5 border border-indigo-100"
                  >
                    <TrendingUp size={12} />
                    Show Insights
                  </button>
                  <button 
                    onClick={() => handleSend("Create new bill")}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-100 transition-colors flex items-center gap-1.5 border border-emerald-100"
                  >
                    <Receipt size={12} />
                    New Bill
                  </button>
                </div>
              )}

              {msg.data && msg.data.type === 'product_extraction' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-md space-y-4"
                >
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                    <ShoppingBag size={14} />
                    Product Details
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Name</p>
                      <p className="text-sm font-bold text-slate-900 truncate">{msg.data.data.name}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Qty</p>
                      <p className="text-sm font-bold text-slate-900">{msg.data.data.quantity}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Cost</p>
                      <p className="text-sm font-bold text-slate-900">₹{msg.data.data.cost_price}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Sell</p>
                      <p className="text-sm font-bold text-slate-900">₹{msg.data.data.selling_price}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => addProductToInventory(msg.data.data)}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={14} />
                    Add to Inventory
                  </button>
                </motion.div>
              )}

              {msg.data && msg.data.type === 'sale_extraction' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-md space-y-4"
                >
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                    <Receipt size={14} />
                    Sale Items
                  </div>
                  <div className="space-y-2">
                    {msg.data.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-xs font-bold text-slate-700">{item.name} x {item.quantity}</div>
                        <div className="text-xs font-bold text-slate-900">₹{item.price * item.quantity}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleCreateSale(msg.data.items)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={14} />
                    Create Bill
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        {isSpeaking && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold w-fit mx-auto animate-pulse">
            <Volume2 size={12} />
            Assistant is speaking...
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex gap-2">
          {speechSupport && (
            <button
              onClick={toggleListening}
              className={cn(
                "p-3 rounded-2xl transition-all shadow-lg",
                isListening 
                  ? "bg-red-500 text-white animate-pulse" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isListening ? "Listening..." : "Type or use voice..."}
            className="flex-1 bg-slate-50 border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-900 transition-all"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-50 shadow-lg shadow-slate-200"
          >
            <Send size={20} />
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { icon: ShoppingBag, text: "Add product" },
            { icon: TrendingUp, text: "Business tips" },
            { icon: MessageSquare, text: "Udhaar reminder" }
          ].map((chip, i) => (
            <button
              key={i}
              onClick={() => setInput(chip.text)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold whitespace-nowrap transition-all"
            >
              <chip.icon size={12} />
              {chip.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
