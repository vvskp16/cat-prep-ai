"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sliders, BookOpen, Brain, Zap, ShieldAlert, Layers, ArrowDownUp, Loader2 } from "lucide-react";

export default function EnhancedTestGenerator() {
  const router = useRouter();

  // Core Configuration State
  const [subject, setSubject] = useState("Quant");
  const [limit, setLimit] = useState(5);
  
  // NEW: Numeric Difficulty & Sorting States
  const [minDifficulty, setMinDifficulty] = useState<number>(1.0);
  const [maxDifficulty, setMaxDifficulty] = useState<number>(10.0);
  const [sortOrder, setSortOrder] = useState<string>("random"); // "random", "asc", "desc"

  // Advanced / Optional States
  const [calcIntensity, setCalcIntensity] = useState<string>("");
  const [questionType, setQuestionType] = useState<string>("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedTrap, setSelectedTrap] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Dynamic Taxonomy State
  const [dynamicTopics, setDynamicTopics] = useState<string[]>([]);
  const [dynamicTraps, setDynamicTraps] = useState<string[]>([]);
  const [isFetchingFilters, setIsFetchingFilters] = useState(false);

  // 1. DYNAMIC FETCHING LOGIC
  useEffect(() => {
    async function fetchDynamicTaxonomy() {
      setIsFetchingFilters(true);
      try {
        // TODO: Replace with your actual FastAPI endpoint to fetch unique metadata
        // const res = await fetch(`http://localhost:8000/api/filters?subject=${subject}`);
        // const data = await res.json();
        
        // SIMULATED BACKEND RESPONSE FOR NOW:
        await new Promise(resolve => setTimeout(resolve, 500)); // Fake network delay
        
        if (subject === "Quant") {
          setDynamicTopics(["Arithmetic", "Algebra", "Geometry", "Modern Math", "Number Systems"]);
          setDynamicTraps(["double-counting", "boundary-condition", "unit-conversion"]);
        } else if (subject === "DILR") {
          setDynamicTopics(["Logical Reasoning", "Data Interpretation", "Caselets", "Matrix Arrangements"]);
          setDynamicTraps(["deduction", "extreme-option"]);
        } else {
          setDynamicTopics(["Reading Comprehension", "Parajumbles", "Paragraph Summary"]);
          setDynamicTraps(["extreme-option", "out-of-context"]);
        }
      } catch (error) {
        console.error("Failed to fetch taxonomy:", error);
      } finally {
        setIsFetchingFilters(false);
      }
    }

    // Reset selections on subject change, then fetch new dynamic lists
    setSelectedTopics([]);
    setSelectedTrap("");
    fetchDynamicTaxonomy();
  }, [subject]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  // 2. SUBMIT HANDLER (Builds the URL and Navigates)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const queryParams = new URLSearchParams({
      subject: subject,
      limit: limit.toString(),
      min_diff: minDifficulty.toString(),
      max_diff: maxDifficulty.toString(),
      sort: sortOrder
    });

    if (calcIntensity) queryParams.append("calculation_intensity", calcIntensity);
    if (questionType) queryParams.append("question_type", questionType);
    if (selectedTopics.length > 0) queryParams.append("topics", selectedTopics.join(","));
    if (selectedTrap) queryParams.append("trap_type", selectedTrap);

    // Push straight to your exam engine page
    router.push(`/test-exam?${queryParams.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-300" />
              Custom Practice Blueprint Wizard
            </h2>
            <p className="text-sm text-blue-100 mt-1">Configure precision filters dynamically powered by ChromaDB.</p>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-full text-xs font-mono backdrop-blur-sm border border-white/20">
            Live Taxonomy Sync
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          
          {/* Step 1: Subject Selection */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600" /> 1. Select Target Section
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {["Quant", "DILR", "VARC"].map((sub) => {
                const isActive = subject === sub;
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubject(sub)}
                    className={`p-5 rounded-xl border text-left transition-all duration-200 relative overflow-hidden ${
                      isActive 
                        ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20 shadow-sm" 
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-base font-bold block ${isActive ? "text-blue-700" : "text-gray-900"}`}>{sub}</span>
                    {isActive && <div className="absolute top-0 right-0 w-3 h-3 bg-blue-600 rounded-bl-lg" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Dynamic Topics Sub-Grid */}
          <div className="space-y-3 bg-gray-50/80 p-5 rounded-xl border border-gray-100 min-h-[120px]">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" /> 2. Focus Topics (Dynamic)
              </label>
              {isFetchingFilters && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {!isFetchingFilters && dynamicTopics.length === 0 && (
                <span className="text-sm text-gray-400">No topics found for this subject.</span>
              )}
              {dynamicTopics.map((topic) => {
                const isChecked = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      isChecked
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Quantities and Exact Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Limit Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-gray-700">3. Target Count</label>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md">
                  {limit} Questions
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Numeric Difficulty Ranges (1.0 to 10.0) */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-purple-600" /> 4. Difficulty Range (1.0 - 10.0)
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <span className="text-[10px] uppercase text-gray-400 font-bold mb-1 block">Min</span>
                  <input 
                    type="number" min="1.0" max="10.0" step="0.1" 
                    value={minDifficulty} onChange={(e) => setMinDifficulty(parseFloat(e.target.value) || 1.0)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <span className="text-gray-400 mt-5">-</span>
                <div className="flex-1">
                  <span className="text-[10px] uppercase text-gray-400 font-bold mb-1 block">Max</span>
                  <input 
                    type="number" min="1.0" max="10.0" step="0.1" 
                    value={maxDifficulty} onChange={(e) => setMaxDifficulty(parseFloat(e.target.value) || 10.0)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Advanced Filters Accordion */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full bg-gray-50 px-5 py-3 text-left flex justify-between items-center text-sm font-medium text-gray-700 hover:bg-gray-100/70 border-b border-gray-200 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-gray-500" />
                Advanced Settings (Sorting, Operations, Traps)
              </span>
              <span className="text-xs text-gray-400 font-mono">{showAdvanced ? "▲ HIDE" : "▼ EXPAND"}</span>
            </button>
            
            {showAdvanced && (
              <div className="p-5 bg-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
                
                {/* SORTING CONTROL */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <ArrowDownUp className="w-3.5 h-3.5 text-green-600" /> Sort Difficulty
                  </label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="random">Shuffle (Random)</option>
                    <option value="asc">Ascending (Easiest First)</option>
                    <option value="desc">Descending (Hardest First)</option>
                  </select>
                </div>

                {/* Calculation Intensity */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" /> Calc Intensity
                  </label>
                  <select
                    value={calcIntensity}
                    onChange={(e) => setCalcIntensity(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Any</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                {/* Evaluation Style */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    Format
                  </label>
                  <select
                    value={questionType}
                    onChange={(e) => setQuestionType(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Mixed</option>
                    <option value="MCQ">Standard MCQ</option>
                    <option value="TITA">Type In The Answer</option>
                  </select>
                </div>

                {/* Cognitive Traps (Dynamic) */}
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> Target Trap
                  </label>
                  <select
                    value={selectedTrap}
                    onChange={(e) => setSelectedTrap(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">No explicit trap</option>
                    {dynamicTraps.map(trap => (
                      <option key={trap} value={trap}>{trap}</option>
                    ))}
                  </select>
                </div>

              </div>
            )}
          </div>

          {/* Execution Submit Action */}
          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="submit"
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all duration-150 flex items-center gap-2"
            >
              Assemble Custom Exam Set →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}