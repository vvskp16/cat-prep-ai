"use client";
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // CRITICAL: Required for math to render beautifully
import pricingConfig from '../../../model_pricing.json'; // Adjust path if needed

// app/page.tsx
import MathRenderer from '../../components/MathRenderer';

// --- NEW COMPONENT: Self-contained Edit/Preview Toggle ---
const MarkdownEditor = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
  // Default to 'preview' so the user sees clean math immediately
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-xs text-slate-400 uppercase font-bold">{label}</label>
        
        {/* Toggle Controls */}
        <div className="flex bg-slate-900 rounded overflow-hidden border border-slate-700 text-xs font-bold shadow-sm">
          <button
            onClick={() => setMode('preview')}
            className={`px-3 py-1 transition-colors ${mode === 'preview' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
          >
            Preview
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`px-3 py-1 transition-colors ${mode === 'edit' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
          >
            Edit Raw
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <textarea 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          className="w-full h-32 font-mono bg-slate-900 border border-amber-600/50 rounded p-3 text-sm focus:outline-none focus:border-amber-400 shadow-inner"
          placeholder="Enter text with $inline math$ or $$block math$$..."
        />
      ) : (
        <div className="w-full min-h-[8rem] bg-slate-900/50 border border-slate-600 rounded p-4 text-sm text-slate-200 overflow-y-auto prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800">
          {value ? (
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[rehypeKatex]}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <span className="text-slate-600 italic">No content provided...</span>
          )}
        </div>
      )}
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function ExtractionTester() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  // Token, Cost & Model Selection State
  const [tokenStats, setTokenStats] = useState({ input: 0, output: 0 });
  const [costInr, setCostInr] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5.4-mini");

  // Panel Resizing State
  const [leftWidth, setLeftWidth] = useState(35); // Initial percentage
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout Resizer Logic
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newLeftWidth = ((moveEvent.clientX - containerRect.left) / containerRect.width) * 100;
        
        // Lock resizing bounds between 20% and 80%
        if (newLeftWidth > 20 && newLeftWidth < 80) {
          setLeftWidth(newLeftWidth);
        }
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Global Clipboard Paste Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste as any);
    return () => window.removeEventListener("paste", handlePaste as any);
  }, []);

  // Live Cost Recalculator
  useEffect(() => {
    const modelRates = pricingConfig.models[selectedModel as keyof typeof pricingConfig.models] || pricingConfig.models["gpt-5.4-mini"];
    const inputCostUsd = (tokenStats.input / 1000000) * modelRates.input_cost_per_1m;
    const outputCostUsd = (tokenStats.output / 1000000) * modelRates.output_cost_per_1m;
    
    setCostInr((inputCostUsd + outputCostUsd) * pricingConfig.exchange_rate_usd_to_inr);
  }, [tokenStats, selectedModel]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setTokenStats({ input: 0, output: 0 });
    
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("model", selectedModel);

    try {
      const response = await fetch("http://localhost:8000/api/test-extraction", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      setQuestions(data.questions || []);

      if (data.usage) {
        setTokenStats({ 
          input: data.usage.prompt_tokens, 
          output: data.usage.completion_tokens 
        });
      }
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // State Updaters
  const updateQuestion = (idx: number, field: string, value: any) => {
    const newQs = [...questions];
    newQs[idx] = { ...newQs[idx], [field]: value };
    setQuestions(newQs);
  };
  const updateMetadata = (idx: number, field: string, value: any) => {
    const newQs = [...questions];
    newQs[idx] = { ...newQs[idx], metadata_hooks: { ...newQs[idx].metadata_hooks, [field]: value } };
    setQuestions(newQs);
  };

  const handleApprove = async (idx: number) => {
    const targetQuestion = questions[idx];
    try {
      const response = await fetch("http://localhost:8000/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetQuestion),
      });
      if (response.ok) {
        alert(`${targetQuestion.id} successfully saved!`);
        setQuestions(questions.filter((_, index) => index !== idx));
      }
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden">
      <div className="flex-1 flex overflow-hidden p-6 gap-2" ref={containerRef}>
        
        {/* LEFT PANEL: Media View */}
        <div style={{ width: `${leftWidth}%` }} className="flex flex-col h-full overflow-y-auto pr-4 scrollbar-hide">
          <div className="flex justify-between items-center mb-6 shrink-0">
             <h1 className="text-2xl font-bold text-teal-400">Extraction</h1>
             <select 
               value={selectedModel} 
               onChange={(e) => setSelectedModel(e.target.value)}
               className="bg-slate-800 border border-slate-600 rounded p-2 text-sm text-slate-300 focus:outline-none focus:border-teal-400"
             >
               {Object.keys(pricingConfig.models).map((model) => (
                 <option key={model} value={model}>{model}</option>
               ))}
             </select>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg shrink-0 mb-6">
            <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-teal-900 file:text-teal-300 hover:file:bg-teal-800 mb-4" />
            <p className="text-xs text-slate-500 text-center border-t border-slate-700 pt-4">
              Or click anywhere and press <strong>CTRL+V</strong> to paste.
            </p>
          </div>
          
          {previewUrl && (
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-lg flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-auto border border-slate-600 bg-slate-900 rounded mb-4 custom-scrollbar flex items-center justify-center p-2">
                 <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded" />
              </div>
              <button onClick={handleUpload} disabled={loading} className="w-full shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded shadow-md transition">
                {loading ? `Analyzing via ${selectedModel}...` : "Extract Data"}
              </button>
            </div>
          )}
        </div>

        {/* DRAGGABLE DIVIDER */}
        <div 
          onMouseDown={startResizing}
          className="w-2 cursor-col-resize bg-slate-800 hover:bg-teal-500 transition mx-2 rounded-full flex-shrink-0 flex items-center justify-center group"
          title="Drag to resize panels"
        >
          <div className="h-12 w-1 bg-slate-600 group-hover:bg-teal-200 rounded-full"></div>
        </div>

        {/* RIGHT PANEL: Editable Forms */}
        <div style={{ width: `${100 - leftWidth}%` }} className="h-full bg-slate-950 p-6 rounded-lg border border-slate-700 overflow-y-auto">
          <h2 className="text-xl font-bold text-amber-400 mb-6 border-b border-slate-800 pb-2">Staging & Validation Engine</h2>
          
          {loading && <div className="text-teal-400 animate-pulse text-lg font-mono">Parsing multi-modal payload...</div>}
          {questions.length === 0 && !loading && <div className="text-slate-500 italic">Awaiting visual extraction...</div>}
          
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-slate-800 rounded-xl p-6 border border-slate-600 mb-8 shadow-lg">
              
              <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <span className="text-lg font-mono font-bold text-teal-300">{q.id}</span>
                <button onClick={() => handleApprove(idx)} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded font-bold transition">
                  Approve & Queue Vector
                </button>
              </div>

              {/* TOP METADATA LOVs */}
              <div className="grid grid-cols-5 gap-4 mb-4">
                
                {/* 1. Subject */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Subject</label>
                  <select value={q.subject} onChange={(e) => updateQuestion(idx, 'subject', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400">
                    <option value="Quant">Quant</option><option value="DILR">DILR</option><option value="VARC">VARC</option>
                  </select>
                </div>
                
                {/* 2. Reactive Deterministic Difficulty Badge */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Difficulty</label>
                  <div className={`w-full border rounded p-2 text-sm font-bold text-center transition-colors ${
                    !q.metadata_hooks.difficulty_level ? "bg-slate-900 border-slate-600 text-slate-500" :
                    q.metadata_hooks.difficulty_level < 4.0 ? "bg-emerald-900/30 border-emerald-500/50 text-emerald-400" :
                    q.metadata_hooks.difficulty_level < 7.0 ? "bg-amber-900/30 border-amber-500/50 text-amber-400" :
                    "bg-rose-900/30 border-rose-500/50 text-rose-400"
                  }`}>
                    {!q.metadata_hooks.difficulty_level ? "N/A" :
                     q.metadata_hooks.difficulty_level < 4.0 ? "Easy" :
                     q.metadata_hooks.difficulty_level < 7.0 ? "Medium" : "Hard"}
                  </div>
                </div>
                
                {/* 3. Text-Editable Float Input (No Spinners) */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Diff Level (1-10)</label>
                  <input 
                    type="text" 
                    value={q.metadata_hooks.difficulty_level ?? ''} 
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      
                      // Safely update multiple state fields simultaneously to prevent overwriting
                      setQuestions(prevQs => {
                        const newQs = [...prevQs];
                        const currentHooks = newQs[idx].metadata_hooks;

                        // Case A: User clears the input entirely
                        if (rawValue === '') {
                          newQs[idx] = { 
                            ...newQs[idx], 
                            metadata_hooks: { ...currentHooks, difficulty_level: '', difficulty: 'N/A' } 
                          };
                          return newQs;
                        }

                        // Case B: User types a valid number or decimal
                        if (/^\d*\.?\d*$/.test(rawValue)) {
                          const val = parseFloat(rawValue);
                          // Determine the text category, or keep the current one if they just typed a lone decimal point "."
                          const cat = isNaN(val) ? currentHooks.difficulty : (val < 4.0 ? "Easy" : val < 7.0 ? "Medium" : "Hard");

                          newQs[idx] = { 
                            ...newQs[idx], 
                            metadata_hooks: { ...currentHooks, difficulty_level: rawValue, difficulty: cat } 
                          };
                          return newQs;
                        }

                        // Case C: Invalid input (e.g. letters), ignore keystroke
                        return newQs;
                      });
                    }} 
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400"
                    placeholder="1-10 with increments of 0.1"
                  />
                </div>

                {/* 4. Calc Intensity */}
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Calc Intensity</label>
                  <select value={q.metadata_hooks.calculation_intensity} onChange={(e) => updateMetadata(idx, 'calculation_intensity', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400">
                    <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                  </select>
                </div>
                
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Topic</label>
                  <input value={q.topic} onChange={(e) => updateQuestion(idx, 'topic', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Sub Topic</label>
                  <input value={q.sub_topic} onChange={(e) => updateQuestion(idx, 'sub_topic', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400"/>
                </div>
              </div>

              <MarkdownEditor 
                label="Question Prompt" 
                value={q.question_text || ''} 
                onChange={(val) => updateQuestion(idx, 'question_text', val)} 
              />

              {/* OPTIONS GRID (Only visible for MCQs) */}
              {q.question_type === "MCQ" && (
                <div className="mb-4 bg-slate-900/40 p-4 rounded-lg border border-slate-700/50">
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-3">Multiple Choice Options</label>
                  <div className="grid grid-cols-2 gap-4">
                    {['A', 'B', 'C', 'D'].map((optKey) => (
                      <div key={optKey} className="flex items-center gap-3">
                        <span className="text-amber-500 font-bold bg-slate-950 px-3 py-2 rounded border border-slate-700 shadow-inner">
                          {optKey}
                        </span>
                        <input
                          value={q.options?.[optKey] || ''}
                          onChange={(e) => {
                            const newQs = [...questions];
                            // Ensure options object exists to prevent null reference errors
                            const currentOptions = newQs[idx].options || { A: "", B: "", C: "", D: "" };
                            newQs[idx] = { 
                              ...newQs[idx], 
                              options: { ...currentOptions, [optKey]: e.target.value } 
                            };
                            setQuestions(newQs);
                          }}
                          className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400"
                          placeholder={`Option ${optKey} text...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-4 mt-4">
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Correct Answer</label>
                  <input value={q.correct_answer || ''} onChange={(e) => updateQuestion(idx, 'correct_answer', e.target.value)} className="w-full bg-slate-900 border border-emerald-600/50 rounded p-2 text-sm focus:outline-none focus:border-teal-400"/>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Target Trap Type</label>
                  <input value={q.metadata_hooks.trap_type} onChange={(e) => updateMetadata(idx, 'trap_type', e.target.value)} className="w-full bg-slate-900 border border-rose-600/50 rounded p-2 text-sm focus:outline-none focus:border-teal-400"/>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Semantic Keywords (Comma Separated)</label>
                <input 
                  value={q.semantic_keywords ? q.semantic_keywords.join(', ') : ''} 
                  onChange={(e) => updateQuestion(idx, 'semantic_keywords', e.target.value.split(',').map(s => s.trim()))} 
                  className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400"
                />
              </div>

              <MarkdownEditor 
                label="Solution Derivation (Optional)" 
                value={q.solution_text || ''} 
                onChange={(val) => updateQuestion(idx, 'solution_text', val)} 
              />

            </div>
          ))}
        </div>
      </div>

      {/* FIXED BOTTOM STATUS BAR */}
      <div className="bg-slate-950 border-t border-slate-800 px-6 py-3 flex justify-between items-center text-xs font-mono shadow-2xl shrink-0 z-50">
        <div className="flex gap-6 text-slate-400">
          <span><strong className="text-teal-500">Selected Model:</strong> {selectedModel}</span>
          <span><strong className="text-teal-500">Status:</strong> {loading ? "Processing via OpenAI..." : "Idle"}</span>
        </div>
        <div className="flex gap-6 text-slate-300">
          <span><strong className="text-slate-500">Input Tokens:</strong> {tokenStats.input.toLocaleString()}</span>
          <span><strong className="text-slate-500">Output Tokens:</strong> {tokenStats.output.toLocaleString()}</span>
          <span className="text-emerald-400 font-bold bg-emerald-900/30 px-2 py-1 rounded">Cost: ₹{costInr.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}
