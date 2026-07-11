"use client";
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Braces, CheckCircle, SkipForward, Layers, Tags } from 'lucide-react';

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
  const [questions, setQuestions] = useState<any[]>([]);

  const queue = questions;
  const currentQuestion = questions[0] ?? {
    id: 'No item selected',
    subject: 'Quant',
    question_type: 'MCQ',
    topic: '',
    sub_topic: '',
    question_text: '',
    solution_text: '',
    semantic_keywords: [],
    image_descriptions: [],
    metadata_hooks: {
      difficulty: 'Medium',
      difficulty_level: 5,
      calculation_intensity: 'Medium',
      trap_type: '',
    },
  };
  const [jsonString, setJsonString] = useState<string>('');
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (questions.length > 0) {
      setJsonString(JSON.stringify(questions[0], null, 2));
      setIsValid(true);
    } else {
      setJsonString('');
      setIsValid(true);
    }
  }, [questions]);

  const handleJsonChange = (value: string) => {
    setJsonString(value);

    try {
      const parsed = JSON.parse(value);
      setIsValid(true);

      setQuestions(prev => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[0] = { ...next[0], ...parsed };
        return next;
      });
    } catch {
      setIsValid(false);
    }
  };

  const handleSkip = () => {
    setQuestions(prev => prev.slice(1));
  };

  const updateField = (field: string, value: any) => {
    setQuestions(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { ...next[0], [field]: value };
      return next;
    });
  };

  const updateCurrentMetadata = (field: string, value: any) => {
    setQuestions(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const current = next[0];
      next[0] = {
        ...current,
        metadata_hooks: { ...(current.metadata_hooks || {}), [field]: value },
      };
      return next;
    });
  };

  const handleApprove = async () => {
    const targetQuestion = questions[0];
    if (!targetQuestion) return;

    try {
      const response = await fetch('http://localhost:8000/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetQuestion),
      });
      if (response.ok) {
        alert(`${targetQuestion.id} successfully saved!`);
        setQuestions(prev => prev.slice(1));
      }
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden font-sans w-full">
      <div className="w-[55%] flex flex-col border-r border-gray-200 bg-[#0d1117] shadow-2xl z-20">
        <div className="flex justify-between items-center px-5 py-3 bg-[#161b22] border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Braces size={16} className="text-blue-400" />
            <span className="text-[11px] font-bold text-gray-300 uppercase tracking-widest">Raw JSON Payload</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${isValid ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {isValid ? 'Valid Schema' : 'Invalid Schema'}
            </span>
            <span className="text-[11px] font-bold bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-md border border-blue-500/20">
              {queue.length} Remaining
            </span>
          </div>
        </div>

        <textarea
          value={jsonString}
          onChange={(e) => handleJsonChange(e.target.value)}
          className="flex-1 w-full bg-transparent p-6 font-mono text-[13px] leading-relaxed text-gray-300 outline-none resize-none focus:ring-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600"
          spellCheck={false}
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50/50">
        <div className="px-8 py-5 bg-white border-b border-gray-200 flex justify-between items-center shrink-0 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] z-10">
          <div>
            <h2 className="text-xl font-extrabold text-gray-800 tracking-tight">{currentQuestion.id || 'Unknown ID'}</h2>
            <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-widest">{currentQuestion.question_type || 'Type'}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2.5 bg-white border border-gray-300 text-gray-600 font-bold text-sm rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2 shadow-sm"
            >
              <SkipForward size={16} /> Skip
            </button>
            <button
              onClick={handleApprove}
              disabled={!isValid}
              className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-[0_2px_10px_-3px_rgba(79,70,229,0.5)] flex items-center gap-2"
            >
              <CheckCircle size={16} /> Approve & Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 pb-24 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 hover:[&::-webkit-scrollbar-thumb]:bg-gray-400">
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Layers size={14} /> Taxonomy Matrix
              </h3>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 border-b border-gray-100">
                  <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors">
                    <label htmlFor="subject-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Subject</label>
                    <select
                      id="subject-field"
                      value={currentQuestion.subject}
                      onChange={(e) => updateField('subject', e.target.value)}
                      className="w-full text-sm font-semibold text-gray-800 outline-none cursor-pointer bg-transparent"
                    >
                      <option value="Quant">Quant</option>
                      <option value="DILR">DILR</option>
                      <option value="VARC">VARC</option>
                    </select>
                  </div>

                  <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors">
                    <label htmlFor="topic-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Topic</label>
                    <input
                      id="topic-field"
                      value={currentQuestion.topic || ''}
                      onChange={(e) => updateField('topic', e.target.value)}
                      className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent placeholder-gray-300"
                      placeholder="e.g., Arithmetic"
                    />
                  </div>
                </div>

                <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors">
                  <label htmlFor="sub-topic-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Sub-Topic</label>
                  <input
                    id="sub-topic-field"
                    value={currentQuestion.sub_topic || ''}
                    onChange={(e) => updateField('sub_topic', e.target.value)}
                    className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent placeholder-gray-300"
                    placeholder="e.g., Time Speed Distance"
                  />
                </div>
              </div>
            </section>

            {currentQuestion.metadata_hooks && (
              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Tags size={14} /> Metadata Hooks
                </h3>
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
                    <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors border-b border-gray-100">
                      <label htmlFor="difficulty-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Difficulty</label>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${currentQuestion.metadata_hooks.difficulty === 'Hard' ? 'bg-red-500' : currentQuestion.metadata_hooks.difficulty === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                        <select
                          id="difficulty-field"
                          value={currentQuestion.metadata_hooks.difficulty || 'Medium'}
                          onChange={(e) => updateCurrentMetadata('difficulty', e.target.value)}
                          className="w-full text-sm font-semibold text-gray-800 outline-none cursor-pointer bg-transparent"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>
                    </div>

                    <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors border-b border-gray-100">
                      <label htmlFor="difficulty-level-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Diff Level (1-10)</label>
                      <input
                        id="difficulty-level-field"
                        type="number"
                        step="0.1"
                        value={currentQuestion.metadata_hooks.difficulty_level ?? ''}
                        onChange={(e) => updateCurrentMetadata('difficulty_level', e.target.value === '' ? '' : Number.parseFloat(e.target.value))}
                        className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent"
                      />
                    </div>

                    <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors">
                      <label htmlFor="calc-intensity-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Calc Intensity</label>
                      <select
                        id="calc-intensity-field"
                        value={currentQuestion.metadata_hooks.calculation_intensity || 'Medium'}
                        onChange={(e) => updateCurrentMetadata('calculation_intensity', e.target.value)}
                        className="w-full text-sm font-semibold text-gray-800 outline-none cursor-pointer bg-transparent"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>

                    <div className="p-4 bg-white focus-within:bg-indigo-50/30 transition-colors">
                      <label htmlFor="trap-type-field" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Trap Type</label>
                      <input
                        id="trap-type-field"
                        value={currentQuestion.metadata_hooks.trap_type || ''}
                        onChange={(e) => updateCurrentMetadata('trap_type', e.target.value)}
                        className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent placeholder-gray-300"
                        placeholder="e.g., boundary-condition"
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            <MarkdownEditor
              label="Question Prompt"
              value={currentQuestion.question_text || ''}
              onChange={(val) => updateField('question_text', val)}
            />

            {currentQuestion.question_type === 'MCQ' && (
              <div className="mb-4 bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 block">Multiple Choice Options</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['A', 'B', 'C', 'D'].map((optKey) => (
                    <div key={optKey} className="flex items-center gap-3">
                      <span className="text-xs font-semibold bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 text-gray-700">
                        {optKey}
                      </span>
                      <input
                        value={currentQuestion.options?.[optKey] || ''}
                        onChange={(e) => {
                          setQuestions(prev => {
                            if (prev.length === 0) return prev;
                            const next = [...prev];
                            const currentOptions = next[0].options || { A: '', B: '', C: '', D: '' };
                            next[0] = {
                              ...next[0],
                              options: { ...currentOptions, [optKey]: e.target.value },
                            };
                            return next;
                          });
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
                <label htmlFor="correct-answer-field" className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Correct Answer</label>
                <input
                  id="correct-answer-field"
                  value={currentQuestion.correct_answer || ''}
                  onChange={(e) => updateField('correct_answer', e.target.value)}
                  className="w-full text-sm p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="semantic-keywords-field" className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Semantic Keywords</label>
                <input
                  id="semantic-keywords-field"
                  value={currentQuestion.semantic_keywords ? currentQuestion.semantic_keywords.join(', ') : ''}
                  onChange={(e) => updateField('semantic_keywords', e.target.value.split(',').map(s => s.trim()))}
                  className="w-full text-sm p-2.5 rounded-lg bg-white border border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-gray-200 outline-none transition-all"
                />
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="image-descriptions-field" className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 block">Image Descriptions</label>
              <textarea
                id="image-descriptions-field"
                value={currentQuestion.image_descriptions ? currentQuestion.image_descriptions.join('\n') : ''}
                onChange={(e) => updateField('image_descriptions', e.target.value.split('\n').filter(s => s.trim() !== ''))}
                className="w-full h-24 text-sm p-3 rounded-lg bg-gray-50 border border-gray-200 focus:bg-white focus:border-gray-300 outline-none transition-all resize-y"
                placeholder="Enter descriptions for images shown in the question or passage only..."
              />
            </div>

            <MarkdownEditor
              label="Solution Derivation (Optional)"
              value={currentQuestion.solution_text || ''}
              onChange={(val) => updateField('solution_text', val)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
