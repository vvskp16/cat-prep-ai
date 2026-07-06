"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sliders, BookOpen, Brain, Zap, ShieldAlert, Layers, ArrowDownUp, Loader2, Target, Save, Bookmark, History } from "lucide-react";

// --- Helper Functions for Difficulty Labels ---
const getDifficultyCategory = (val: number) => {
  if (val < 4.0) return { label: "Easy", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  if (val < 7.5) return { label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" };
  return { label: "Hard", color: "text-rose-600 bg-rose-50 border-rose-200" };
};

const getDifficultyDisplay = (min: number, max: number) => {
  const minCat = getDifficultyCategory(min);
  const maxCat = getDifficultyCategory(max);

  if (minCat.label === maxCat.label) return <span className={`px-2.5 py-1 text-xs font-bold rounded-md border ${minCat.color}`}>Targeted {minCat.label}</span>;
  if (minCat.label === "Easy" && maxCat.label === "Hard") return <span className="px-2.5 py-1 text-xs font-bold rounded-md border text-blue-600 bg-blue-50 border-blue-200">Full Spectrum</span>;
  return <span className={`px-2.5 py-1 text-xs font-bold rounded-md border ${maxCat.color} bg-gradient-to-r from-transparent to-white/50`}>{minCat.label} to {maxCat.label}</span>;
};

// Types for our Saved Presets
type TestConfig = {
  name: string;
  subject: string;
  limit: number;
  minDifficulty: number;
  maxDifficulty: number;
  sortOrder: string;
  calcIntensity: string;
  questionType: string;
  selectedTopics: string[];
  selectedSubTopics: string[];
  selectedTrap: string;
};

export default function EnhancedTestGenerator() {
  const router = useRouter();

  // Core State
  const [subject, setSubject] = useState("Quant");
  const [limit, setLimit] = useState(5);
  const [minDifficulty, setMinDifficulty] = useState<number>(1.0);
  const [maxDifficulty, setMaxDifficulty] = useState<number>(10.0);
  const [sortOrder, setSortOrder] = useState<string>("random");

  // Advanced Filters
  const [calcIntensity, setCalcIntensity] = useState<string>("");
  const [questionType, setQuestionType] = useState<string>("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedSubTopics, setSelectedSubTopics] = useState<string[]>([]);
  const [selectedTrap, setSelectedTrap] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Dynamic Taxonomy State (Nested Topics -> Subtopics)
  const [dynamicTaxonomy, setDynamicTaxonomy] = useState<Record<string, string[]>>({});
  const [dynamicTraps, setDynamicTraps] = useState<string[]>([]);
  const [isFetchingFilters, setIsFetchingFilters] = useState(false);

  // Presets State
  const [presets, setPresets] = useState<TestConfig[]>([]);

  // 1. DYNAMIC FETCHING & CASCADING LOGIC
  useEffect(() => {
    async function fetchDynamicTaxonomy() {
      setIsFetchingFilters(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 500)); // Fake delay
        
        // SIMULATED BACKEND RESPONSE - Notice the nested hierarchy now
        if (subject === "Quant") {
          setDynamicTaxonomy({
            "Arithmetic": ["Time-Speed-Distance", "Percentages", "Ratios", "SI & CI", "Averages"],
            "Algebra": ["Quadratic Equations", "Logarithms", "Functions & Graphs"],
            "Geometry": ["Triangles", "Circles", "Mensuration", "Coordinate Geometry"],
            "Modern Math": ["Permutation & Combination", "Probability"]
          });
          setDynamicTraps(["double-counting", "boundary-condition", "unit-conversion"]);
        } else if (subject === "DILR") {
          setDynamicTaxonomy({
            "Logical Reasoning": ["Blood Relations", "Syllogisms", "Seating Arrangement"],
            "Data Interpretation": ["Bar Charts", "Pie Charts", "Radar Graphs"],
            "Caselets": ["Matrix Arrangements", "Venn Diagrams"]
          });
          setDynamicTraps(["deduction", "extreme-option", "missing-data"]);
        } else {
          setDynamicTaxonomy({
            "Reading Comprehension": ["Philosophy", "Science & Tech", "Economics", "History"],
            "Verbal Ability": ["Parajumbles", "Paragraph Summary", "Odd One Out"]
          });
          setDynamicTraps(["extreme-option", "out-of-context", "partial-truth"]);
        }
      } finally {
        setIsFetchingFilters(false);
      }
    }

    // Reset cascading selections on subject change
    setSelectedTopics([]);
    setSelectedSubTopics([]);
    setSelectedTrap("");
    fetchDynamicTaxonomy();
  }, [subject]);

  // Load Presets on Mount
  useEffect(() => {
    const saved = localStorage.getItem("cat_test_presets");
    if (saved) setPresets(JSON.parse(saved));
  }, []);

  const toggleArrayItem = (item: string, stateSetter: React.Dispatch<React.SetStateAction<string[]>>) => {
    stateSetter(prev => prev.includes(item) ? prev.filter(t => t !== item) : [...prev, item]);
  };

  // Compile current state into an object
  const getCurrentConfig = (name: string): TestConfig => ({
    name, subject, limit, minDifficulty, maxDifficulty, sortOrder, 
    calcIntensity, questionType, selectedTopics, selectedSubTopics, selectedTrap
  });

  const savePreset = (name: string) => {
    const newConfig = getCurrentConfig(name);
    // Keep max 10 presets, filter out older ones with the same name
    const updatedPresets = [newConfig, ...presets.filter(p => p.name !== name)].slice(0, 10);
    setPresets(updatedPresets);
    localStorage.setItem("cat_test_presets", JSON.stringify(updatedPresets));
  };

  const loadPreset = (config: TestConfig) => {
    setSubject(config.subject);
    setLimit(config.limit);
    setMinDifficulty(config.minDifficulty);
    setMaxDifficulty(config.maxDifficulty);
    setSortOrder(config.sortOrder);
    setCalcIntensity(config.calcIntensity);
    setQuestionType(config.questionType);
    setSelectedTopics(config.selectedTopics || []);
    setSelectedSubTopics(config.selectedSubTopics || []);
    setSelectedTrap(config.selectedTrap || "");
  };

  // 2. SUBMIT HANDLER
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto-save the "Last Run" configuration seamlessly
    savePreset("Last Run");
    
    const queryParams = new URLSearchParams({
      subject, limit: limit.toString(), min_diff: minDifficulty.toString(), 
      max_diff: maxDifficulty.toString(), sort: sortOrder
    });

    if (calcIntensity) queryParams.append("calculation_intensity", calcIntensity);
    if (questionType) queryParams.append("question_type", questionType);
    if (selectedTopics.length > 0) queryParams.append("topics", selectedTopics.join(","));
    if (selectedSubTopics.length > 0) queryParams.append("sub_topics", selectedSubTopics.join(","));
    if (selectedTrap) queryParams.append("trap_type", selectedTrap);

    router.push(`/test-exam?${queryParams.toString()}`);
  };

  const thumbStyles = "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab active:[&::-webkit-slider-thumb]:cursor-grabbing [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab active:[&::-moz-range-thumb]:cursor-grabbing";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-6">
      
      {/* 🚀 QUICK LOAD PRESETS RIBBON */}
      {presets.length > 0 && (
        <div className="w-full max-w-4xl mb-4 flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 shrink-0">
            <History className="w-3.5 h-3.5" /> Blueprints:
          </span>
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => loadPreset(preset)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                preset.name === "Last Run" 
                  ? "bg-gray-800 text-white border-gray-800" 
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {preset.name === "Last Run" ? <History className="w-3 h-3" /> : <Bookmark className="w-3 h-3 text-blue-500" />}
              {preset.name}
            </button>
          ))}
        </div>
      )}

      <div className="w-full max-w-4xl bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-300" />
              Custom Practice Blueprint Wizard
            </h2>
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
                  <button key={sub} type="button" onClick={() => setSubject(sub)}
                    className={`p-5 rounded-xl border text-left transition-all duration-200 relative overflow-hidden ${
                      isActive ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20 shadow-sm" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`text-base font-bold block ${isActive ? "text-blue-700" : "text-gray-900"}`}>{sub}</span>
                    {isActive && <div className="absolute top-0 right-0 w-3 h-3 bg-blue-600 rounded-bl-lg" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Cascading Topics & Subtopics */}
          <div className="space-y-3 bg-gray-50/80 p-5 rounded-xl border border-gray-100 min-h-[120px]">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" /> 2. Focus Areas (Cascading Taxonomy)
              </label>
              {isFetchingFilters && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            </div>
            
            {/* Parent Topics */}
            <div className="flex flex-wrap gap-2">
              {Object.keys(dynamicTaxonomy).map((topic) => {
                const isChecked = selectedTopics.includes(topic);
                return (
                  <button key={topic} type="button" onClick={() => toggleArrayItem(topic, setSelectedTopics)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      isChecked ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>

            {/* Child Sub-Topics (Only renders if a Parent Topic is selected) */}
            {selectedTopics.length > 0 && (
              <div className="pt-4 mt-4 border-t border-gray-200 animate-fadeIn">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Target Specific Sub-Topics</span>
                <div className="flex flex-wrap gap-2">
                  {selectedTopics.flatMap(topic => dynamicTaxonomy[topic] || []).map((subTopic) => {
                    const isChecked = selectedSubTopics.includes(subTopic);
                    return (
                      <button key={subTopic} type="button" onClick={() => toggleArrayItem(subTopic, setSelectedSubTopics)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          isChecked ? "bg-indigo-100 text-indigo-800 border-indigo-300" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {subTopic}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step 3 & 4: Quantities and Exact Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Target Count Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-blue-600" /> 3. Target Count
                </label>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md">{limit} Questions</span>
              </div>
              <div className="relative pt-2">
                <input type="range" min="2" max="20" step="1" value={limit} onChange={(e) => setLimit(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700 transition-all"
                />
              </div>
            </div>

            {/* Interactive Dual-Thumb Difficulty Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-purple-600" /> 4. Difficulty Range
                </label>
                {getDifficultyDisplay(minDifficulty, maxDifficulty)}
              </div>
              <div className="relative pt-3 pb-6">
                <div className="absolute w-full h-2 bg-gray-200 rounded-lg top-3"></div>
                <div className="absolute h-2 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg top-3"
                  style={{ left: `${((minDifficulty - 1) / 9) * 100}%`, right: `${100 - (((maxDifficulty - 1) / 9) * 100)}%` }}></div>
                <input type="range" min="1.0" max="10.0" step="0.1" value={minDifficulty}
                  onChange={(e) => setMinDifficulty(Math.min(parseFloat(e.target.value), maxDifficulty - 0.2))}
                  className={`absolute w-full top-1.5 h-5 appearance-none bg-transparent pointer-events-none ${thumbStyles} z-20`} />
                <input type="range" min="1.0" max="10.0" step="0.1" value={maxDifficulty}
                  onChange={(e) => setMaxDifficulty(Math.max(parseFloat(e.target.value), minDifficulty + 0.2))}
                  className={`absolute w-full top-1.5 h-5 appearance-none bg-transparent pointer-events-none ${thumbStyles} z-30`} />
                
                <div className="absolute text-[10px] font-bold text-gray-500 -mt-1" style={{ left: `calc(${((minDifficulty - 1) / 9) * 100}% - 10px)`, top: '30px' }}>{minDifficulty.toFixed(1)}</div>
                <div className="absolute text-[10px] font-bold text-gray-500 -mt-1" style={{ left: `calc(${((maxDifficulty - 1) / 9) * 100}% - 10px)`, top: '30px' }}>{maxDifficulty.toFixed(1)}</div>
              </div>
            </div>
          </div>

          {/* Advanced Filters Accordion */}
          <div className="border border-gray-200 rounded-xl overflow-hidden mt-6">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
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
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1"><ArrowDownUp className="w-3.5 h-3.5 text-green-600" /> Sort Difficulty</label>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <option value="random">Shuffle (Random)</option>
                    <option value="asc">Ascending (Easiest First)</option>
                    <option value="desc">Descending (Hardest First)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-500" /> Calc Intensity</label>
                  <select value={calcIntensity} onChange={(e) => setCalcIntensity(e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <option value="">Any</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Format</label>
                  <select value={questionType} onChange={(e) => setQuestionType(e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <option value="">Mixed</option><option value="MCQ">Standard MCQ</option><option value="TITA">Type In The Answer</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5 text-red-500" /> Target Trap</label>
                  <select value={selectedTrap} onChange={(e) => setSelectedTrap(e.target.value)} className="w-full text-xs p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <option value="">No explicit trap</option>
                    {dynamicTraps.map(trap => <option key={trap} value={trap}>{trap}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Execution & Save Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                const name = prompt("Name this test blueprint (e.g., 'Hard Arithmetic Drill')");
                if (name) savePreset(name);
              }}
              className="text-sm font-semibold text-gray-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-4 h-4" /> Save as Preset
            </button>
            <button
              type="submit"
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            >
              Assemble Exam Set →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}