"use client";
import { useState, useRef, useEffect } from 'react';
import { Send, Bot } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AITutorProps {
  questionContext: any;
  chatHistory: Message[];
  onUpdateHistory: (newHistory: Message[]) => void;
}

export default function AITutor({ questionContext, chatHistory, onUpdateHistory }: AITutorProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages update or loading state changes
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
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
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
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Model Selector Bar */}
      <div className="p-2 bg-white border-b flex justify-end items-center">
        <select 
          value={selectedModel} 
          onChange={(e) => setSelectedModel(e.target.value)}
          className="text-xs border rounded p-1 bg-gray-50 outline-none text-gray-600"
        >
          <option value="gpt-4o-mini">⚡ Fast (GPT-4o-mini)</option>
          <option value="gpt-4o">🎯 Accurate (GPT-4o)</option>
          <option value="o1-mini">🧠 Deep Reasoning (o1-mini)</option>
        </select>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {chatHistory.length === 0 ? (
          <div className="text-center text-sm text-gray-400 mt-10">
            Ask me anything about this question, passage, or solution!
          </div>
        ) : (
          chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && <div className="mt-1"><Bot size={16} className="text-blue-600"/></div>}
              <div className={`p-3 max-w-[85%] text-sm shadow-sm ${
                msg.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm' : 'bg-white border text-gray-800 rounded-2xl rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isLoading && <div className="text-xs text-gray-400 animate-pulse pl-6">AI is thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a doubt..."
          className="flex-1 text-sm p-3 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button 
          onClick={handleSend}
          disabled={isLoading}
          className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}