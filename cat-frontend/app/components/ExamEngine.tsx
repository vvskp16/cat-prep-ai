'use client';

import React, { useState, useEffect } from 'react';
import MathRenderer from './MathRenderer';

interface ParentContext {
  context_id: string;
  context_type: 'passage' | 'caselet_text' | 'table' | 'chart';
  context_body: string;
}

interface QuestionMetadata {
  trap_type?: string;
  difficulty?: string;
  difficulty_level?: number;
  calculation_intensity?: string;
}

interface Question {
  id: string;
  subject: 'Quant' | 'DILR' | 'VARC';
  question_type: 'MCQ' | 'TITA';
  topic: string;
  sub_topic: string;
  has_parent_context: boolean;
  parent_context: ParentContext | null;
  question_text: string;
  options: { A: string; B: string; C: string; D: string; } | null;
  correct_answer?: string;
  solution_text?: string;
  metadata_hooks?: QuestionMetadata;
}

interface ExamEngineProps {
  initialTestData: Question[];
  initialTimeInSeconds?: number;
}

export default function ExamEngine({ initialTestData, initialTimeInSeconds = 2400 }: ExamEngineProps) {
  // --- CORE STATE ---
  const [testData] = useState<Question[]>(initialTestData);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  
  // --- TRACKING STATES ---
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [visited, setVisited] = useState<Record<string, boolean>>({ [initialTestData[0]?.id]: true });
  
  // --- SESSION STATES ---
  const [timeLeft, setTimeLeft] = useState<number>(initialTimeInSeconds);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  
  // --- NEW: PHASE MODES ---
  const [showDashboard, setShowDashboard] = useState<boolean>(false);
  const [isReviewMode, setIsReviewMode] = useState<boolean>(false);
  const [testReport, setTestReport] = useState<any>(null); // Holds analytics

  const currentQuestion = testData[currentIndex];

  // 1. Timer Logic
  useEffect(() => {
    if (timeLeft <= 0 && !showDashboard && !isReviewMode) {
      handleTestSubmit(); // Auto-submit when time is up
      return;
    }
    if (isPaused || showDashboard || isReviewMode) return;
    
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isPaused, showDashboard, isReviewMode]);

  // 2. Mark as visited whenever current index changes
  useEffect(() => {
    if (currentQuestion && !showDashboard && !isReviewMode) {
      setVisited((prev) => ({ ...prev, [currentQuestion.id]: true }));
    }
  }, [currentIndex, currentQuestion, showDashboard, isReviewMode]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- ACTIONS ---
  const handleOptionSelect = (optionKey: string) => {
    if (isPaused || showDashboard || isReviewMode) return;
    setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionKey }));
  };

  const handleTitaInput = (value: string) => {
    if (isPaused || showDashboard || isReviewMode) return;
    setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const clearResponse = () => {
    if (isPaused || showDashboard || isReviewMode) return;
    setUserAnswers((prev) => {
      const updated = { ...prev };
      delete updated[currentQuestion.id];
      return updated;
    });
  };

  const toggleMarkForReview = () => {
    if (isPaused || showDashboard || isReviewMode) return;
    setMarkedForReview((prev) => ({ ...prev, [currentQuestion.id]: !prev[currentQuestion.id] }));
    handleNext();
  };

  const handleNext = () => {
    if (currentIndex < testData.length - 1) setCurrentIndex((prev) => prev + 1);
  };

  // --- ANALYTICS & SUBMISSION LOGIC ---
  const handleTestSubmit = () => {
    if (!window.confirm("Are you sure you want to submit the section?")) return;

    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let score = 0;
    const timeTaken = initialTimeInSeconds - timeLeft;
    
    // Group analytics by topic to identify student weaknesses
    const topicStats: Record<string, { total: number, correct: number, incorrect: number, unattempted: number }> = {};

    testData.forEach((q) => {
      const ans = userAnswers[q.id];
      const isTITA = q.question_type === 'TITA';
      const safeTopic = q.topic || "General";

      if (!topicStats[safeTopic]) {
        topicStats[safeTopic] = { total: 0, correct: 0, incorrect: 0, unattempted: 0 };
      }
      topicStats[safeTopic].total++;

      if (!ans) {
        unattempted++;
        topicStats[safeTopic].unattempted++;
      } else if (ans === q.correct_answer) {
        correct++;
        score += 3;
        topicStats[safeTopic].correct++;
      } else {
        incorrect++;
        if (!isTITA) score -= 1; // +3 / -1 grading for MCQ, no negative for TITA
        topicStats[safeTopic].incorrect++;
      }
    });

    const report = {
      id: `TEST_${Date.now()}`,
      date: new Date().toISOString(),
      subject: testData[0]?.subject || "Mixed",
      metrics: {
        score,
        maxScore: testData.length * 3,
        correct,
        incorrect,
        unattempted,
        timeTakenSeconds: timeTaken,
        accuracy: correct + incorrect > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0
      },
      topicStats
    };

    // --- LOCAL STORAGE MAGIC ---
    // Silently save this test to the browser so they can view it days later
    const existingHistory = JSON.parse(localStorage.getItem('cat_test_history') || '[]');
    localStorage.setItem('cat_test_history', JSON.stringify([report, ...existingHistory]));

    // Trigger state changes
    setTestReport(report);
    setShowDashboard(true);
    setIsPaused(false);
  };

  const startReviewMode = () => {
    setShowDashboard(false);
    setIsReviewMode(true);
    setCurrentIndex(0);
  };

  // --- UI/UX LOGIC: EXACT CAT EXAM PALETTE ---
  const getQuestionStatusClass = (index: number) => {
    const qId = testData[index].id;
    const isAnswered = !!userAnswers[qId];
    const isMarked = !!markedForReview[qId];
    const isVis = !!visited[qId];
    const isActive = currentIndex === index;

    const activeRing = isActive ? 'ring-2 ring-blue-500 ring-offset-1' : '';

    if (isReviewMode) {
      const isCorrect = userAnswers[qId] === testData[index].correct_answer;
      if (!isAnswered) return `bg-gray-200 text-gray-500 rounded ${activeRing}`;
      return isCorrect 
        ? `bg-green-600 text-white rounded-t-xl rounded-br-xl ${activeRing}` 
        : `bg-red-500 text-white rounded-b-xl rounded-tl-xl ${activeRing}`;
    }

    if (isAnswered && isMarked) return `bg-purple-600 text-white rounded-full relative ${activeRing} after:content-[''] after:absolute after:bottom-0 after:right-0 after:w-2.5 after:h-2.5 after:bg-green-500 after:rounded-full`;
    if (isMarked) return `bg-purple-600 text-white rounded-full ${activeRing}`;
    if (isAnswered) return `bg-green-600 text-white rounded-t-xl rounded-br-xl shadow-sm ${activeRing}`;
    if (isVis) return `bg-red-500 text-white rounded-b-xl rounded-tl-xl shadow-sm ${activeRing}`;
    return `bg-white border border-gray-300 text-gray-700 rounded shadow-sm ${activeRing}`;
  };

  if (!currentQuestion) return <div className="p-8 text-center text-red-500">Error: No test data loaded.</div>;

  // ==========================================
  // VIEW 1: THE SCORE DASHBOARD
  // ==========================================
  if (showDashboard && testReport) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 text-slate-900 font-sans">
        <div className="max-w-5xl mx-auto">
          
          <div className="flex justify-between items-center mb-8 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Performance Analytics</h1>
              <p className="text-slate-500 mt-1">Section: {testReport.subject} • Submitted on {new Date(testReport.date).toLocaleString()}</p>
            </div>
            <button 
              onClick={startReviewMode}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-all active:scale-95"
            >
              Review Question-by-Question
            </button>
          </div>

          {/* Macro Metrics */}
          <div className="grid grid-cols-4 gap-6 mb-10">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Net Score</p>
              <p className="text-4xl font-black text-blue-600">{testReport.metrics.score} <span className="text-lg text-slate-400 font-medium">/ {testReport.metrics.maxScore}</span></p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Accuracy</p>
              <p className={`text-4xl font-black ${testReport.metrics.accuracy > 80 ? 'text-emerald-500' : testReport.metrics.accuracy > 50 ? 'text-amber-500' : 'text-red-500'}`}>
                {testReport.metrics.accuracy}%
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Attempted</p>
              <p className="text-4xl font-black text-slate-700">{testReport.metrics.correct + testReport.metrics.incorrect} <span className="text-lg text-slate-400 font-medium">/ {testData.length}</span></p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Time Taken</p>
              <p className="text-4xl font-black text-slate-700">{formatTime(testReport.metrics.timeTakenSeconds)}</p>
            </div>
          </div>

          {/* Topic Weakness Analyzer */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Concept-Level Breakdown</h2>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="px-6 py-4 font-semibold">Topic Area</th>
                  <th className="px-6 py-4 font-semibold text-center">Total Qs</th>
                  <th className="px-6 py-4 font-semibold text-center text-emerald-600">Correct</th>
                  <th className="px-6 py-4 font-semibold text-center text-red-500">Incorrect</th>
                  <th className="px-6 py-4 font-semibold text-center text-slate-400">Skipped</th>
                  <th className="px-6 py-4 font-semibold text-right">Hit Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(testReport.topicStats).map(([topic, stats]: [string, any]) => {
                  const hitRate = stats.correct + stats.incorrect > 0 
                    ? Math.round((stats.correct / (stats.correct + stats.incorrect)) * 100) 
                    : 0;
                  
                  return (
                    <tr key={topic} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">{topic}</td>
                      <td className="px-6 py-4 text-center font-medium text-slate-600">{stats.total}</td>
                      <td className="px-6 py-4 text-center font-bold text-emerald-600">{stats.correct}</td>
                      <td className="px-6 py-4 text-center font-bold text-red-500">{stats.incorrect}</td>
                      <td className="px-6 py-4 text-center font-medium text-slate-400">{stats.unattempted}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          hitRate > 80 ? 'bg-emerald-100 text-emerald-700' : hitRate > 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {hitRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: THE EXAM & REVIEW ENGINE 
  // ==========================================
  return (
    <div className="flex flex-col h-screen bg-[#f3f4f6] text-gray-900 select-text font-sans">
      
      {/* HEADER BAR */}
      <header className="flex justify-between items-center px-6 py-3 bg-[#2c3e50] text-white shadow-md select-none">
        <div className="flex items-center space-x-4">
          <span className="bg-[#3498db] text-xs uppercase px-2 py-1 rounded font-bold tracking-wider">
            {currentQuestion.subject}
          </span>
          <h1 className="text-lg font-semibold tracking-tight">
            {isReviewMode ? "Test Review & Analysis" : "CAT Sectional Practice"}
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
          {isReviewMode ? (
            <div className="flex space-x-3">
              <button 
                onClick={() => { setIsReviewMode(false); setShowDashboard(true); }}
                className="bg-slate-600 hover:bg-slate-700 px-4 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider transition"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={() => setIsPaused(!isPaused)}
                className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                  isPaused ? 'bg-emerald-600 text-white animate-pulse' : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {isPaused ? 'Resume Test' : 'Pause'}
              </button>
              <div className="flex items-center space-x-3 bg-[#1a252f] px-4 py-1.5 rounded-md border border-gray-700">
                <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Time Left:</span>
                <span className={`font-mono text-lg font-bold ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* WORKSPACE AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        {isPaused && !isReviewMode && !showDashboard && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex flex-col justify-center items-center text-white select-none">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Practice Session Paused</h2>
            <button 
              onClick={() => setIsPaused(false)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 font-bold rounded-lg mt-4"
            >
              Resume Section
            </button>
          </div>
        )}

        {/* LEFT PANE: Shared Context */}
        {currentQuestion.has_parent_context && currentQuestion.parent_context && (
          <div className="w-1/2 overflow-y-auto p-6 bg-white border-r border-gray-300 shadow-inner">
            <MathRenderer content={currentQuestion.parent_context.context_body} className="text-gray-800 leading-relaxed text-sm md:text-base" />
          </div>
        )}

        {/* RIGHT PANE: Evaluator */}
        <div className={`${currentQuestion.has_parent_context ? 'w-1/2' : 'w-full'} flex flex-col h-full bg-[#f8f9fa] overflow-y-auto`}>
          <div className="flex-1 p-6 flex flex-col">
            
            <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4 select-none">
              <span className="font-bold text-gray-700 text-lg">Question {currentIndex + 1}</span>
              <div className="flex space-x-2">
                {isReviewMode && currentQuestion.metadata_hooks && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold border border-purple-200 uppercase">
                    {currentQuestion.metadata_hooks.difficulty}
                  </span>
                )}
                <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded font-bold uppercase">{currentQuestion.question_type}</span>
              </div>
            </div>

            <div className="text-gray-800 text-base mb-6 font-medium">
              <MathRenderer content={currentQuestion.question_text} />
            </div>

            {/* MCQ/TITA Options */}
            {currentQuestion.question_type === 'MCQ' && currentQuestion.options ? (
              <div className="space-y-3 mb-6">
                {Object.entries(currentQuestion.options).map(([key, val]) => {
                  const isSelected = userAnswers[currentQuestion.id] === key;
                  const isCorrect = currentQuestion.correct_answer === key;
                  
                  let optionClass = "bg-white border-gray-300 text-gray-700 hover:bg-blue-50";
                  let radioClass = "border-gray-400 text-transparent";

                  if (isReviewMode) {
                    if (isCorrect) {
                      optionClass = "bg-green-50 border-green-500 text-green-900 shadow-sm";
                      radioClass = "bg-green-500 border-green-500 text-white";
                    } else if (isSelected && !isCorrect) {
                      optionClass = "bg-red-50 border-red-400 text-red-900";
                      radioClass = "bg-red-500 border-red-500 text-white";
                    } else {
                      optionClass = "bg-gray-50 border-gray-200 opacity-60"; 
                    }
                  } else if (isSelected) {
                    optionClass = "bg-[#ebf5fb] border-[#3498db] shadow-sm";
                    radioClass = "bg-[#3498db] border-[#3498db] text-white";
                  }

                  return (
                    <button
                      key={key}
                      onClick={() => handleOptionSelect(key)}
                      disabled={isReviewMode}
                      className={`w-full flex items-center text-left p-3 rounded-md border-2 transition-colors ${optionClass}`}
                    >
                      <span className={`w-5 h-5 flex items-center justify-center rounded-full border-2 text-xs font-bold mr-4 shrink-0 transition-colors ${radioClass}`}>
                        {isSelected || isCorrect ? "✓" : ""}
                      </span>
                      <div className="flex-1 text-sm font-medium">
                        <MathRenderer content={val} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 mb-6">
                <input
                  type="text"
                  value={userAnswers[currentQuestion.id] || ''}
                  onChange={(e) => handleTitaInput(e.target.value)}
                  disabled={isReviewMode}
                  placeholder="Enter numeric response..."
                  className={`w-full max-w-sm p-3 border-2 rounded-md font-mono text-base outline-none ${
                    isReviewMode 
                      ? userAnswers[currentQuestion.id] === currentQuestion.correct_answer 
                        ? 'border-green-500 bg-green-50 text-green-900' 
                        : 'border-red-500 bg-red-50 text-red-900'
                      : 'border-gray-300 focus:border-[#3498db] focus:ring-1 focus:ring-[#3498db]'
                  }`}
                />
                {isReviewMode && (
                  <div className="mt-2 text-sm font-bold text-green-700">
                    Correct Answer: {currentQuestion.correct_answer}
                  </div>
                )}
              </div>
            )}

            {/* REVIEW MODE: Display Solution */}
            {isReviewMode && currentQuestion.solution_text && (
              <div className="mt-6 p-5 bg-blue-50 border border-blue-200 rounded-lg shadow-inner text-sm">
                <h4 className="font-bold text-blue-900 uppercase tracking-wider text-xs mb-3 flex items-center">
                  <span className="mr-2">💡</span> Official Solution Breakdown
                </h4>
                <div className="text-blue-900">
                  <MathRenderer content={currentQuestion.solution_text} />
                </div>
              </div>
            )}
            
            <div className="flex-grow"></div>

            {/* BOTTOM NAV BAR */}
            <div className="flex justify-between items-center pt-4 mt-6 border-t border-gray-300 select-none bg-[#f8f9fa]">
              {isReviewMode ? (
                <div className="flex justify-between w-full">
                  <button disabled={currentIndex === 0} onClick={() => setCurrentIndex((prev) => prev - 1)} className="px-6 py-2 bg-white border border-gray-400 text-gray-700 rounded font-semibold hover:bg-gray-100 disabled:opacity-40 transition">Previous</button>
                  <button disabled={currentIndex === testData.length - 1} onClick={handleNext} className="px-6 py-2 bg-[#3498db] text-white border border-[#2980b9] rounded font-semibold hover:bg-[#2980b9] disabled:opacity-40 transition">Next</button>
                </div>
              ) : (
                <>
                  <div className="flex space-x-3">
                    <button onClick={toggleMarkForReview} className="px-4 py-2 bg-white border border-gray-400 text-gray-700 rounded shadow-sm text-sm font-semibold hover:bg-gray-100 transition">Mark for Review & Next</button>
                    <button onClick={clearResponse} className="px-4 py-2 bg-white border border-gray-400 text-gray-700 rounded shadow-sm text-sm font-semibold hover:bg-gray-100 transition">Clear Response</button>
                  </div>
                  <div className="flex space-x-3">
                    <button disabled={currentIndex === 0} onClick={() => setCurrentIndex((prev) => prev - 1)} className="px-4 py-2 bg-white border border-gray-400 text-gray-700 rounded shadow-sm text-sm font-semibold hover:bg-gray-100 disabled:opacity-40 transition">Previous</button>
                    <button onClick={handleNext} className="px-8 py-2 bg-[#008cba] text-white border border-[#007095] rounded shadow-sm text-sm font-bold hover:bg-[#007095] transition">Save & Next</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHTMOST PANEL: Grid */}
        <aside className="w-72 bg-[#e9ecef] border-l border-gray-300 p-4 flex flex-col justify-between shadow-inner select-none z-10">
          <div>
            <div className="bg-white border border-gray-300 p-3 rounded shadow-sm mb-4">
              <h2 className="text-xs uppercase text-gray-600 font-bold mb-3 border-b border-gray-200 pb-2">Legend</h2>
              <div className="grid grid-cols-2 gap-y-2 text-[10px] text-gray-700 font-semibold tracking-tight">
                <div className="flex items-center"><span className="w-4 h-4 bg-green-600 rounded-t-sm rounded-br-sm mr-2"></span> Answered</div>
                <div className="flex items-center"><span className="w-4 h-4 bg-red-500 rounded-b-sm rounded-tl-sm mr-2"></span> Not Answered</div>
                <div className="flex items-center"><span className="w-4 h-4 bg-white border border-gray-400 rounded-sm mr-2"></span> Not Visited</div>
                <div className="flex items-center"><span className="w-4 h-4 bg-purple-600 rounded-full mr-2"></span> Marked</div>
              </div>
            </div>
            <h2 className="text-xs uppercase text-gray-500 font-bold tracking-wider mb-3">Question Palette</h2>
            <div className="grid grid-cols-5 gap-2">
              {testData.map((_, idx) => (
                <button key={idx} onClick={() => setCurrentIndex(idx)} className={`h-9 w-9 flex items-center justify-center text-xs font-bold transition-all duration-150 hover:opacity-80 ${getQuestionStatusClass(idx)}`}>
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
          {!isReviewMode && (
            <div className="pt-4 border-t border-gray-300 mt-4">
              <button onClick={handleTestSubmit} className="w-full py-3 bg-[#5cb85c] text-white font-bold text-center rounded border border-[#4cae4c] hover:bg-[#4cae4c] shadow-md transition uppercase text-sm tracking-wide">
                Submit Test
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}