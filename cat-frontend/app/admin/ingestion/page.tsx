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
        <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</label>

        <div className="flex bg-gray-100 rounded-lg border border-gray-200 text-[11px] font-semibold overflow-hidden">
          <button
            onClick={() => setMode('preview')}
            className={`px-3 py-1.5 transition-colors ${mode === 'preview' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            Preview
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`px-3 py-1.5 transition-colors ${mode === 'edit' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            Edit Raw
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-32 font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs focus:outline-none focus:border-gray-300 focus:bg-white transition-all"
          placeholder="Enter text with $inline math$ or $$block math$$..."
        />
      ) : (
        <div className="w-full min-h-[8rem] bg-white border border-gray-200 rounded-lg p-4 text-sm text-gray-700 overflow-y-auto prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:text-gray-900 prose-strong:text-gray-900 prose-pre:bg-gray-50">
          {value ? (
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <span className="text-gray-400 italic">No content provided...</span>
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
  const unprocessedItems = questions.length;

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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-end border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Ingestion Hub</h1>
            <p className="text-sm text-gray-500 mt-1">Review, format, and push extracted CAT data to ChromaDB.</p>
          </div>
          <div className="bg-white border border-gray-200 px-3 py-1.5 rounded-md text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Queue: {unprocessedItems} Items
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <div className="flex-1 flex overflow-hidden gap-4" ref={containerRef}>
            <div style={{ width: `${leftWidth}%` }} className="flex flex-col h-full overflow-y-auto pr-2 scrollbar-hide">
              <div className="flex justify-between items-center mb-6 shrink-0">
                <h1 className="text-xl font-semibold text-gray-900">Extraction</h1>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg p-2 text-sm text-gray-700 focus:outline-none focus:border-gray-300"
                >
                  {Object.keys(pricingConfig.models).map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg shrink-0 mb-6">
                <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-900 file:text-white hover:file:bg-gray-800 mb-4" />
                <p className="text-xs text-gray-500 text-center border-t border-gray-200 pt-4">
                  Or click anywhere and press <strong>CTRL+V</strong> to paste.
                </p>
              </div>

              {previewUrl && (
                <div className="bg-white border border-gray-200 p-4 rounded-lg flex flex-col min-h-0 flex-1 shadow-sm">
                  <div className="flex-1 overflow-auto border border-gray-200 bg-gray-50 rounded-lg mb-4 custom-scrollbar flex items-center justify-center p-2">
                    <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded" />
                  </div>
                  <button onClick={handleUpload} disabled={loading} className="w-full shrink-0 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-semibold py-2.5 px-4 rounded-lg transition">
                    {loading ? `Analyzing via ${selectedModel}...` : "Extract Data"}
                  </button>
                </div>
              )}
            </div>

            <div
              onMouseDown={startResizing}
              className="w-2 cursor-col-resize bg-gray-200 hover:bg-gray-300 transition mx-2 rounded-full flex-shrink-0 flex items-center justify-center group"
              title="Drag to resize panels"
            >
              <div className="h-12 w-1 bg-gray-400 group-hover:bg-gray-500 rounded-full"></div>
            </div>

            <div style={{ width: `${100 - leftWidth}%` }} className="h-full bg-gray-50 border border-gray-200 rounded-lg p-6 overflow-y-auto">
              <h2 className="text-lg font-semibold text-gray-900 mb-6 border-b border-gray-200 pb-2">Staging & Validation Engine</h2>

              {loading && <div className="text-gray-600 animate-pulse text-sm">Parsing multi-modal payload...</div>}
              {questions.length === 0 && !loading && <div className="text-gray-500 italic">Awaiting visual extraction...</div>}

              {questions.map((q, idx) => (
                <div key={q.id} className="bg-white rounded-xl p-6 border border-gray-200 mb-8 shadow-sm">
                  <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <span className="text-sm font-semibold text-gray-700">{q.id}</span>
                    <button onClick={() => handleApprove(idx)} className="px-4 py-2 text-xs font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors shadow-sm">
                      Approve & Queue Vector
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-5 bg-gray-50 border border-gray-100 rounded-lg mb-6">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Subject</label>
                      <select value={q.subject} onChange={(e) => updateQuestion(idx, 'subject', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all">
                        <option value="Quant">Quant</option>
                        <option value="DILR">DILR</option>
                        <option value="VARC">VARC</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Q. Type</label>
                      <select value={q.question_type} onChange={(e) => updateQuestion(idx, 'question_type', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all">
                        <option value="MCQ">MCQ</option>
                        <option value="TITA">TITA</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Difficulty</label>
                      <div className={`w-full border rounded-lg p-2.5 text-xs font-semibold text-center transition-colors ${
                        !q.metadata_hooks.difficulty_level ? "bg-white border-gray-200 text-gray-400" :
                        q.metadata_hooks.difficulty_level < 4.0 ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                        q.metadata_hooks.difficulty_level < 7.0 ? "bg-amber-50 border-amber-200 text-amber-600" :
                        "bg-rose-50 border-rose-200 text-rose-600"
                      }`}>
                        {!q.metadata_hooks.difficulty_level ? "N/A" :
                         q.metadata_hooks.difficulty_level < 4.0 ? "Easy" :
                         q.metadata_hooks.difficulty_level < 7.0 ? "Medium" : "Hard"}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Diff Level (1-10)</label>
                      <input
                        type="text"
                        value={q.metadata_hooks.difficulty_level ?? ''}
                        onChange={(e) => {
                          const rawValue = e.target.value;

                          setQuestions(prevQs => {
                            const newQs = [...prevQs];
                            const currentHooks = newQs[idx].metadata_hooks;

                            if (rawValue === '') {
                              newQs[idx] = {
                                ...newQs[idx],
                                metadata_hooks: { ...currentHooks, difficulty_level: '', difficulty: 'N/A' }
                              };
                              return newQs;
                            }

                            if (/^\d*\.?\d*$/.test(rawValue)) {
                              const val = parseFloat(rawValue);
                              const cat = isNaN(val) ? currentHooks.difficulty : (val < 4.0 ? "Easy" : val < 7.0 ? "Medium" : "Hard");

                              newQs[idx] = {
                                ...newQs[idx],
                                metadata_hooks: { ...currentHooks, difficulty_level: rawValue, difficulty: cat }
                              };
                              return newQs;
                            }

                            return newQs;
                          });
                        }}
                        className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"
                        placeholder="1-10"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Calc Intensity</label>
                      <select value={q.metadata_hooks.calculation_intensity} onChange={(e) => updateMetadata(idx, 'calculation_intensity', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all">
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Topic</label>
                      <input value={q.topic} onChange={(e) => updateQuestion(idx, 'topic', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"/>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Sub Topic</label>
                      <input value={q.sub_topic} onChange={(e) => updateQuestion(idx, 'sub_topic', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"/>
                    </div>
                  </div>

                  <MarkdownEditor
                    label="Question Prompt"
                    value={q.question_text || ''}
                    onChange={(val) => updateQuestion(idx, 'question_text', val)}
                  />

                  {q.question_type === "MCQ" && (
                    <div className="mb-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 block">Multiple Choice Options</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['A', 'B', 'C', 'D'].map((optKey) => (
                          <div key={optKey} className="flex items-center gap-3">
                            <span className="text-xs font-semibold bg-white px-3 py-2 rounded-lg border border-gray-200 text-gray-700">
                              {optKey}
                            </span>
                            <input
                              value={q.options?.[optKey] || ''}
                              onChange={(e) => {
                                const newQs = [...questions];
                                const currentOptions = newQs[idx].options || { A: "", B: "", C: "", D: "" };
                                newQs[idx] = {
                                  ...newQs[idx],
                                  options: { ...currentOptions, [optKey]: e.target.value }
                                };
                                setQuestions(newQs);
                              }}
                              className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"
                              placeholder={`Option ${optKey} text...`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 mt-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Correct Answer</label>
                      <input value={q.correct_answer || ''} onChange={(e) => updateQuestion(idx, 'correct_answer', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"/>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Target Trap Type</label>
                      <input value={q.metadata_hooks.trap_type} onChange={(e) => updateMetadata(idx, 'trap_type', e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"/>
                    </div>
                  </div>

                  <div className="mb-4 space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Semantic Keywords (Comma Separated)</label>
                    <input
                      value={q.semantic_keywords ? q.semantic_keywords.join(', ') : ''}
                      onChange={(e) => updateQuestion(idx, 'semantic_keywords', e.target.value.split(',').map(s => s.trim()))}
                      className="w-full text-xs p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 block">Question/Passage Image Descriptions (Inline Vector Context)</label>
                    <textarea
                      value={q.image_descriptions ? q.image_descriptions.join('\n') : ''}
                      onChange={(e) => updateQuestion(idx, 'image_descriptions', e.target.value.split('\n').filter(s => s.trim() !== ''))}
                      className="w-full h-24 text-xs p-3 rounded-lg bg-gray-50 border border-gray-200 focus:bg-white focus:border-gray-300 outline-none transition-all resize-y"
                      placeholder="Enter descriptions for images shown in the question or passage only..."
                    />
                    <p className="mt-2 text-xs text-gray-500">These descriptions are included inline in the combined embedding text for retrieval. Do not include solution-only image descriptions.</p>
                  </div>

                  <div className="mt-4 p-4 border border-blue-100 bg-blue-50/30 rounded-lg">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-2 block">
                      AI Generated Image Descriptions (Context Engine)
                    </label>
                    <textarea
                      value={q.image_descriptions ? q.image_descriptions.join('\n') : ''}
                      onChange={(e) => updateQuestion(idx, 'image_descriptions', e.target.value.split('\n').filter(s => s.trim() !== ''))}
                      className="w-full text-xs p-3 rounded-lg bg-white border border-blue-200 focus:border-blue-400 outline-none transition-all"
                      rows={3}
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

          <div className="bg-white border-t border-gray-200 px-6 py-3 flex justify-between items-center text-xs shadow-sm shrink-0 z-50 -mx-6 -mb-6 mt-6">
            <div className="flex gap-6 text-gray-500">
              <span><strong className="text-gray-700">Selected Model:</strong> {selectedModel}</span>
              <span><strong className="text-gray-700">Status:</strong> {loading ? "Processing via OpenAI..." : "Idle"}</span>
            </div>
            <div className="flex gap-6 text-gray-600">
              <span><strong className="text-gray-500">Input Tokens:</strong> {tokenStats.input.toLocaleString()}</span>
              <span><strong className="text-gray-500">Output Tokens:</strong> {tokenStats.output.toLocaleString()}</span>
              <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-1 rounded">Cost: ₹{costInr.toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
