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
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  } | null;
  correct_answer?: string;
  solution_text?: string;
  metadata_hooks?: QuestionMetadata;
}

interface ExamEngineProps {
  initialTestData: Question[];
  initialTimeInSeconds?: number;
}

export default function ExamEngine({ initialTestData, initialTimeInSeconds = 2400 }: ExamEngineProps) {
  const [testData] = useState<Question[]>(initialTestData);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState<number>(initialTimeInSeconds);
  
  // New State Variable to drive the Pause/Resume workflow Intercept
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const currentQuestion = testData[currentIndex];

  // Intercepting countdown loop tracking the active state of isPaused flag
  useEffect(() => {
    if (timeLeft <= 0 || isPaused) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isPaused]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    console.log('Current question payload:', currentQuestion);
  }, [currentQuestion]);

  const handleOptionSelect = (optionKey: string) => {
    if (isPaused) return; // Prevent selection changes when paused
    setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionKey }));
  };

  const handleTitaInput = (value: string) => {
    if (isPaused) return;
    setUserAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
  };

  const clearResponse = () => {
    if (isPaused) return;
    setUserAnswers((prev) => {
      const updated = { ...prev };
      delete updated[currentQuestion.id];
      return updated;
    });
  };

  const toggleMarkForReview = () => {
    if (isPaused) return;
    setMarkedForReview((prev) => ({
      ...prev,
      [currentQuestion.id]: !prev[currentQuestion.id],
    }));
  };

  const getQuestionStatusClass = (index: number) => {
    const qId = testData[index].id;
    const isAnswered = !!userAnswers[qId];
    const isMarked = !!markedForReview[qId];

    if (isAnswered && isMarked) return 'bg-violet-600 text-white border-violet-700';
    if (isMarked) return 'bg-amber-500 text-white border-amber-600 rounded-full';
    if (isAnswered) return 'bg-emerald-600 text-white border-emerald-700 rounded-tl-2xl rounded-br-2xl';
    if (currentIndex === index) return 'bg-blue-50 border-2 border-blue-600 text-blue-700 font-bold';
    return 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200';
  };

  if (!currentQuestion) return <div className="p-8 text-center text-red-500">Error: No test data loaded.</div>;

  return (
    // FIX 1: Swapped 'select-none' out for standard workspace selection rules
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 select-text">
      
      {/* HEADER BAR */}
      <header className="flex justify-between items-center px-6 py-3 bg-slate-800 text-white border-b border-slate-700 shadow-sm select-none">
        <div className="flex items-center space-x-4">
          <span className="bg-blue-600 text-xs uppercase px-2 py-1 rounded font-bold tracking-wider">
            {currentQuestion.subject} Engine
          </span>
          <h1 className="text-lg font-semibold tracking-tight">CAT Sectional Practice Environment</h1>
        </div>
        
        {/* FIX 2: Clock Display + Pause/Resume Button Hook */}
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
              isPaused 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse' 
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {isPaused ? 'Resume Test' : 'Pause'}
          </button>
          <div className="flex items-center space-x-3 bg-slate-900 px-4 py-1.5 rounded-md border border-slate-700">
            <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Time Remaining:</span>
            <span className={`font-mono text-lg font-bold ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </header>

      {/* CORE WORKSPACE OVERLAY FOR PAUSE STATE */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {isPaused && (
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex flex-col justify-center items-center text-white select-none">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Practice Session Paused</h2>
            <p className="text-gray-400 text-sm mb-6">Your test answers are saved. Click resume to restore the workspace content layout.</p>
            <button 
              onClick={() => setIsPaused(false)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 font-bold rounded-lg transition-transform active:scale-95 shadow-lg"
            >
              Resume Workspace Content
            </button>
          </div>
        )}

        {/* LEFT COMPONENT: Shared Context Module */}
        {currentQuestion.has_parent_context && currentQuestion.parent_context && (
          <div className="w-1/2 overflow-y-auto p-6 bg-white border-r border-gray-200 shadow-inner leading-relaxed">
            <div className="mb-4 pb-2 border-b border-gray-100 flex justify-between items-center text-xs text-gray-400 uppercase font-semibold select-none">
              <span>Set Context Matrix</span>
              <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{currentQuestion.parent_context.context_type}</span>
            </div>
            <MathRenderer content={currentQuestion.parent_context.context_body} className="text-gray-800" />
          </div>
        )}

        {/* RIGHT COMPONENT: Evaluator Pane */}
        <div className={`${currentQuestion.has_parent_context ? 'w-1/2' : 'w-full'} flex flex-col h-full bg-slate-50 overflow-y-auto p-6`}>
          <div className="flex-1 max-w-3xl mx-auto w-full bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center text-xs text-gray-400 mb-4 uppercase font-bold tracking-wider select-none">
                <span>Question {currentIndex + 1} of {testData.length}</span>
                <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{currentQuestion.question_type}</span>
              </div>

              <div className="text-gray-800 text-base mb-6 leading-relaxed">
                <MathRenderer content={currentQuestion.question_text} />
              </div>

              <hr className="my-6 border-gray-100" />

              {/* ANSWER CHOICES MATCHERS */}
              {currentQuestion.question_type === 'MCQ' && currentQuestion.options ? (
                <div className="space-y-3">
                  {Object.entries(currentQuestion.options).map(([key, val]) => {
                    const isSelected = userAnswers[currentQuestion.id] === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleOptionSelect(key)}
                        className={`w-full flex items-center text-left p-3.5 rounded-lg border transition-all duration-150 ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm ring-1 ring-blue-500'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full border text-xs font-bold mr-4 shrink-0 transition-colors select-none ${
                          isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-gray-50 text-gray-500'
                        }`}>
                          {key}
                        </span>
                        <div className="flex-1 text-sm font-medium">
                          <MathRenderer content={val} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block text-xs uppercase text-gray-500 font-bold tracking-wider mb-2 select-none">
                    Type Your Numeric Answer Below:
                  </label>
                  <input
                    type="text"
                    value={userAnswers[currentQuestion.id] || ''}
                    onChange={(e) => handleTitaInput(e.target.value)}
                    placeholder="Enter absolute final numeric evaluation..."
                    className="w-full max-w-md p-3 border border-gray-300 rounded-lg shadow-sm font-mono text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* LOWER NAV ELEMENT CONTROLS */}
            <div className="flex justify-between items-center pt-6 mt-8 border-t border-gray-100 select-none">
              <div className="flex space-x-2">
                <button
                  onClick={toggleMarkForReview}
                  className={`px-4 py-2 border rounded-md text-sm font-medium shadow-sm transition ${
                    markedForReview[currentQuestion.id]
                      ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {markedForReview[currentQuestion.id] ? 'Unmark Review' : 'Mark for Review & Next'}
                </button>
                <button
                  onClick={clearResponse}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-md text-sm font-medium shadow-sm hover:bg-gray-50 transition"
                >
                  Clear Response
                </button>
              </div>

              <div className="flex space-x-2">
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((prev) => prev - 1)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  disabled={currentIndex === testData.length - 1}
                  onClick={() => setCurrentIndex((prev) => prev + 1)}
                  className="px-4 py-2 bg-blue-600 text-white border border-blue-700 rounded-md text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Save & Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHTMOST PANEL: Grid Navigation */}
        <aside className="w-64 bg-slate-100 border-l border-gray-200 p-4 flex flex-col justify-between shadow-sm select-none">
          <div>
            <h2 className="text-xs uppercase text-slate-500 font-bold tracking-wider mb-4 pb-2 border-b border-gray-200">
              Question Palette
            </h2>
            <div className="grid grid-cols-4 gap-2.5">
              {testData.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-10 w-10 flex items-center justify-center border text-sm font-semibold transition-all duration-150 rounded-md shadow-sm ${getQuestionStatusClass(idx)}`}
                >
                  {(idx + 1).toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200 mt-4">
            <button
              onClick={() => alert(`Submitting Test!\nSelections: ${JSON.stringify(userAnswers, null, 2)}`)}
              className="w-full py-3 bg-red-600 text-white font-bold text-center rounded-md border border-red-700 hover:bg-red-700 shadow-md transform transition active:scale-98 tracking-wide uppercase text-xs"
            >
              Submit Section
            </button>
          </div>
        </aside>

      </div>
    </div>
  );
}