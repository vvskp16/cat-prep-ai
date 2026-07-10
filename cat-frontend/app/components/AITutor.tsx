"use client";
import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import MathRenderer from './MathRenderer';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AITutorProps {
  questionContext: any;
  chatHistory: Message[];
  onUpdateHistory: (newHistory: Message[]) => void;
  onClose: () => void;
}

const formatAIResponse = (text: string) => {
  if (!text) return "";
  let formatted = text;
  formatted = formatted.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
  formatted = formatted.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  formatted = formatted.replace(/\\n/g, '\n');
  return formatted;
};

export default function AITutor({ questionContext, chatHistory, onUpdateHistory, onClose }: AITutorProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-5.4-mini');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isLoading]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: 'user', content: input };
    const newHistory = [...chatHistory, userMsg];
    onUpdateHistory(newHistory); 
    setInput('');
    setIsLoading(true);

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.0.113:8000';
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_context: questionContext,
          messages: newHistory,
          model: selectedModel
        })
      });

      const data = await response.json();
      onUpdateHistory([...newHistory, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      console.error("Chat error:", error);
      onUpdateHistory([...newHistory, { role: 'assistant', content: "Sorry, I encountered an error connecting to the AI." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white font-sans text-gray-800 overflow-hidden">
      
      {/* Unified, Minimalist Header */}
      <div className="px-5 py-3 bg-white border-b border-gray-100 flex justify-between items-center shrink-0 z-10">
        <div className="flex items-center gap-2 text-gray-600">
          <Sparkles size={16} />
          <span className="text-sm font-semibold tracking-wide">AI Tutor</span>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs bg-gray-50 border-transparent rounded-md py-1.5 px-2 text-gray-500 outline-none cursor-pointer hover:bg-gray-100 transition-colors focus:ring-0"
          >
            <option value="gpt-5.4-mini">gpt-5.4-mini (Fast)</option>
            <option value="gpt-4o">gpt-4o (Accurate)</option>
            <option value="o1-mini">o1-mini (Reasoning)</option>
          </select>
          <button 
            onClick={onClose} 
            className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div 
        className="flex-1 overflow-y-auto min-h-0 px-5 pt-0 pb-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full transition-colors"
        style={{ 
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 1rem), transparent)',
          maskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 1rem), transparent)'
        }}
      >
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 p-8">
            <Sparkles size={28} className="mb-3 text-gray-300" />
            <p className="text-sm">How can I help you with this question?</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={idx === 0 ? "pt-4" : ""}> 
                {msg.role === 'user' ? (
                  <div className="flex justify-end w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-gray-100 text-gray-800 px-4 py-3 rounded-2xl max-w-[85%] text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4 w-full animate-in fade-in duration-300">
                    <div className="shrink-0 mt-0.5">
                      <Sparkles size={18} className="text-gray-400" />
                    </div>
                    {/* Explicitly added text-sm to match user chat bubble sizing perfectly */}
                    <div className="flex-1 min-w-0 prose prose-sm max-w-none text-sm text-gray-800 leading-relaxed">
                      <MathRenderer content={formatAIResponse(msg.content)} />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-4 w-full animate-pulse">
                <div className="shrink-0 mt-0.5">
                  <Sparkles size={18} className="text-indigo-400" />
                </div>
                <div className="flex-1 text-sm text-gray-400 mt-0.5">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-1 shrink-0" />
          </div>
        )}
      </div>

      {/* Input Area (Text removed, padding adjusted to py-4 for balance) */}
      <div className="px-5 py-4 bg-white shrink-0 z-10">
        <div className="relative flex items-center shadow-[0_0_15px_rgba(0,0,0,0.03)] rounded-xl border border-gray-200 bg-gray-50/50 focus-within:bg-white focus-within:border-gray-300 focus-within:shadow-[0_0_20px_rgba(0,0,0,0.06)] transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a doubt..."
            className="w-full resize-none text-sm p-3.5 pr-12 bg-transparent outline-none min-h-[48px] max-h-32 text-gray-700"
            rows={1}
            style={{ overflow: 'hidden' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 bottom-2 p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}