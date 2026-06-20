// app/page.tsx
"use client";
import React, { useState } from 'react';

export default function ExtractionTester() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

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
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("http://localhost:8000/api/test-extraction", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Updaters for nested and flat state
  const updateQuestion = (idx: number, field: string, value: any) => {
    const newQs = [...questions];
    newQs[idx] = { ...newQs[idx], [field]: value };
    setQuestions(newQs);
  };

  const updateMetadata = (idx: number, field: string, value: any) => {
    const newQs = [...questions];
    newQs[idx] = { 
      ...newQs[idx], 
      metadata_hooks: { ...newQs[idx].metadata_hooks, [field]: value } 
    };
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
        alert(`${targetQuestion.id} successfully saved to chroma_ready_docs/`);
        // Remove approved question from UI
        setQuestions(questions.filter((_, index) => index !== idx));
      }
    } catch (error) {
      console.error("Failed to approve:", error);
      alert("Failed to save document.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans flex gap-8">
      
      {/* LEFT PANEL: Media View */}
      <div className="w-1/3 flex flex-col gap-6 h-screen sticky top-0 overflow-y-auto">
        <h1 className="text-2xl font-bold text-teal-400">PoC: Visual Extraction</h1>
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-lg">
          <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-teal-900 file:text-teal-300 hover:file:bg-teal-800" />
        </div>
        {previewUrl && (
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-lg">
            <img src={previewUrl} alt="Preview" className="w-full h-auto rounded border border-slate-600 mb-4" />
            <button onClick={handleUpload} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded shadow-md">
              {loading ? "Analyzing via LLM..." : "Extract Data"}
            </button>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Editable Forms */}
      <div className="w-2/3 bg-slate-950 p-6 rounded-lg border border-slate-700 overflow-y-auto">
        <h2 className="text-xl font-bold text-amber-400 mb-6 border-b border-slate-800 pb-2">Staging & Validation Engine</h2>
        
        {loading && <div className="text-slate-400 animate-pulse text-lg">Parsing payload...</div>}
        {questions.length === 0 && !loading && <div className="text-slate-500">Awaiting visual extraction.</div>}

        {questions.map((q, idx) => (
          <div key={q.id} className="bg-slate-800 rounded-xl p-6 border border-slate-600 mb-8 shadow-lg">
            
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
              <span className="text-lg font-mono font-bold text-teal-300">{q.id}</span>
              <button onClick={() => handleApprove(idx)} className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded font-bold transition">
                Approve & Queue Vector
              </button>
            </div>

            {/* TOP METADATA LOVs (Drop-downs) */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Subject</label>
                <select value={q.subject} onChange={(e) => updateQuestion(idx, 'subject', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400">
                  <option value="Quant">Quant</option><option value="DILR">DILR</option><option value="VARC">VARC</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Type</label>
                <select value={q.question_type} onChange={(e) => updateQuestion(idx, 'question_type', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400">
                  <option value="MCQ">MCQ</option><option value="TITA">TITA</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Difficulty</label>
                <select value={q.metadata_hooks.difficulty} onChange={(e) => updateMetadata(idx, 'difficulty', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400">
                  <option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Calculation Intensity</label>
                <select value={q.metadata_hooks.calculation_intensity} onChange={(e) => updateMetadata(idx, 'calculation_intensity', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm focus:outline-none focus:border-teal-400">
                  <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                </select>
              </div>
            </div>

            {/* TEXT FIELDS */}
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

            <div className="mb-4">
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Question Prompt</label>
              <textarea value={q.question_text} onChange={(e) => updateQuestion(idx, 'question_text', e.target.value)} className="w-full h-24 font-mono bg-slate-900 border border-slate-600 rounded p-3 text-sm focus:outline-none focus:border-teal-400"/>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
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
            
            <div className="mb-2">
              <label className="block text-xs text-slate-400 uppercase font-bold mb-1">Solution Derivation (Optional)</label>
              <textarea value={q.solution_text || ''} onChange={(e) => updateQuestion(idx, 'solution_text', e.target.value)} className="w-full h-16 font-mono bg-slate-900 border border-slate-600 rounded p-3 text-sm focus:outline-none focus:border-teal-400"/>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}