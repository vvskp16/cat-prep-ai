'use client';

import React, { useState, useEffect } from 'react';
import MathRenderer from './MathRenderer';

// --- INTERFACES ---
interface ParentContext {
  context_id: string;
  context_type: string;
  context_body: string;
}

interface QuestionOptions {
  A?: string;
  B?: string;
  C?: string;
  D?: string;
}

export interface Question {
  id: string;
  subject: string;
  question_type: string;
  topic: string;
  sub_topic: string;
  has_parent_context: boolean;
  parent_context: ParentContext | null;
  question_text: string;
  options: QuestionOptions | null;
  correct_answer: string;
  solution_text: string;
  original_sources?: string;
  metadata_hooks?: {
    trap_type?: string;
    difficulty?: string;
    difficulty_level?: number;
    calculation_intensity?: string;
  };
}

interface ExamEngineProps {
  initialTestData: Question[];
  initialTimeInSeconds?: number;
  isReviewMode?: boolean;
  pastUserAnswers?: Record<string, string>;
}

export default function ExamEngine({ 
  initialTestData, 
  initialTimeInSeconds = 1200, 
  isReviewMode = false,
  pastUserAnswers = {}
}: ExamEngineProps) {
  const [testData] = useState<Question[]>(initialTestData);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>(pastUserAnswers);
  const [timeLeft, setTimeLeft] = useState(initialTimeInSeconds);
  const [isSubmitted, setIsSubmitted] = useState(isReviewMode);
  const [showExitModal, setShowExitModal] = useState(false);
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());

  // EXAM SAFETY LOCKS (Only active if taking a live test)
  useEffect(() => {
    if (isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have an active exam. Progress will be lost."; 
    };

    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      setShowExitModal(true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isSubmitted]);

  // TIMER
  useEffect(() => {
    if (isSubmitted || timeLeft <= 0) {
      if (timeLeft <= 0 && !isSubmitted) submitExam();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion = testData[currentIndex];

  const handleOptionSelect = (optionKey: string) => {
    if (isSubmitted) return; // Lock inputs in review mode
    setUserAnswers({ ...userAnswers, [currentQuestion.id]: optionKey });
  };

  const handleTITAInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitted) return;
    setUserAnswers({ ...userAnswers, [currentQuestion.id]: e.target.value });
  };

  const submitExam = () => {
    setIsSubmitted(true);
    setShowExitModal(false);
    
    // Save to LocalStorage so History Page can access it
    const pastExams = JSON.parse(localStorage.getItem('cat_exam_history') || '[]');
    const newExamRecord = {
      id: `EXAM_${Date.now()}`,
      date: new Date().toISOString(),
      testData,
      userAnswers
    };
    localStorage.setItem('cat_exam_history', JSON.stringify([newExamRecord, ...pastExams]));
  };

  // UI Helpers
  const getPaletteColor = (index: number) => {
    if (!isSubmitted) {
      // Live Exam Colors
      const isAnswered = !!userAnswers[testData[index].id];
      const isMarked = markedForReview.has(index);
      if (isMarked && isAnswered) return "bg-purple-600 text-white border-purple-600";
      if (isMarked) return "bg-purple-100 text-purple-800 border-purple-400";
      if (isAnswered) return "bg-green-600 text-white border-green-600";
      if (index === currentIndex) return "border-blue-600 text-blue-600 bg-blue-50";
      return "bg-white text-gray-700 border-gray-300";
    } else {
      // Review Mode Colors (Accuracy)
      const q = testData[index];
      const ans = userAnswers[q.id];
      const isViewing = index === currentIndex ? "ring-2 ring-blue-600 ring-offset-2 " : "";
      if (!ans) return isViewing + "bg-gray-200 text-gray-500 border-gray-300"; // Skipped
      if (ans === q.correct_answer) return isViewing + "bg-green-100 text-green-800 border-green-500"; // Correct
      return isViewing + "bg-red-100 text-red-800 border-red-500"; // Incorrect
    }
  };

  // Safe parsing for sources
  const parseSources = (sourcesStr?: string) => {
    if (!sourcesStr) return [];
    try { return JSON.parse(sourcesStr); } catch { return []; }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-screen overflow-hidden">
        
        {/* HEADER */}
        <div className={`bg-white border-b shadow-sm px-6 py-3 flex justify-between items-center shrink-0 ${isSubmitted ? 'border-b-4 border-b-indigo-500' : ''}`}>
          <span className="font-bold text-gray-700 flex items-center gap-2">
            {isSubmitted && <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded">REVIEW MODE</span>}
            CAT Practice Interface
          </span>
          
          {!isSubmitted ? (
            <>
              <div className="text-xl font-mono text-blue-600 font-bold flex items-center gap-2">
                 <span>⏱️</span> {formatTime(timeLeft)}
              </div>
              <button onClick={() => setShowExitModal(true)} className="bg-red-600 text-white px-4 py-2 rounded-md font-medium hover:bg-red-700 transition-colors shadow-sm">
                Submit Test
              </button>
            </>
          ) : (
            <button onClick={() => window.history.back()} className="bg-gray-800 text-white px-4 py-2 rounded-md font-medium hover:bg-gray-900 transition-colors shadow-sm">
              Exit Review
            </button>
          )}
        </div>
        
        {/* MIDDLE WORKSPACE */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* LEFT PANE: Question Area */}
          <div className="flex-1 overflow-y-auto p-6 relative bg-white">
            <div className={currentQuestion.has_parent_context ? "grid grid-cols-1 lg:grid-cols-2 gap-8 h-full" : "max-w-4xl mx-auto"}>
               
               {/* Context Column */}
               {currentQuestion.has_parent_context && currentQuestion.parent_context && (
                   <div className="border-r border-gray-200 pr-6 h-full overflow-y-auto">
                      <div className="bg-gray-50 p-6 rounded-lg shadow-inner text-gray-800 text-sm leading-relaxed border border-gray-100">
                         <MathRenderer content={currentQuestion.parent_context.context_body} />
                      </div>
                   </div>
               )}

               {/* Question Column */}
               <div className="flex flex-col pb-20">
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">Question {currentIndex + 1}</span>
                     <span className="text-xs font-semibold bg-gray-100 border border-gray-200 text-gray-600 px-2 py-1 rounded">
                       {currentQuestion.question_type}
                     </span>
                  </div>
                  
                  <div className="text-lg text-gray-800 mb-8 font-medium">
                    <MathRenderer content={currentQuestion.question_text} />
                  </div>

                  {/* Options */}
                  {currentQuestion.question_type === 'MCQ' && currentQuestion.options ? (
                    <div className="space-y-3">
                      {Object.entries(currentQuestion.options).map(([key, val]) => {
                        if (!val) return null;
                        
                        let btnClass = "bg-white hover:bg-gray-50 border-gray-200";
                        const isSelected = userAnswers[currentQuestion.id] === key;
                        const isCorrectOption = currentQuestion.correct_answer === key;

                        if (isSubmitted) {
                          if (isCorrectOption) btnClass = "bg-green-50 border-green-500 ring-1 ring-green-500 shadow-sm";
                          else if (isSelected && !isCorrectOption) btnClass = "bg-red-50 border-red-400 opacity-80";
                          else btnClass = "bg-gray-50 border-gray-200 opacity-60";
                        } else if (isSelected) {
                          btnClass = "bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-sm";
                        }

                        return (
                          <button
                            key={key}
                            onClick={() => handleOptionSelect(key)}
                            disabled={isSubmitted}
                            className={`w-full text-left p-4 border rounded-xl transition-all relative ${btnClass} ${isSubmitted ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            <span className="font-bold text-gray-700 mr-3">{key}.</span> 
                            <MathRenderer content={val} />
                            
                            {/* Review Mode Badges */}
                            {isSubmitted && isCorrectOption && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-green-700 bg-green-200 px-2 py-1 rounded-full">Correct Answer</span>}
                            {isSubmitted && isSelected && !isCorrectOption && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-red-700 bg-red-200 px-2 py-1 rounded-full">Your Answer</span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <input 
                        type="text" 
                        value={userAnswers[currentQuestion.id] || ''}
                        onChange={handleTITAInput}
                        disabled={isSubmitted}
                        placeholder="Type your answer here..."
                        className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-600"
                      />
                      {isSubmitted && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium">
                          Correct Answer: <span className="font-bold">{currentQuestion.correct_answer}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* REVIEW MODE: Solution & Sources */}
                  {isSubmitted && (
                    <div className="mt-10 animate-fadeIn space-y-6">
                      <div className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                        <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                          <span className="bg-indigo-600 text-white w-6 h-6 flex items-center justify-center rounded-full text-sm">💡</span> 
                          Official Solution
                        </h4>
                        <div className="text-gray-700 leading-relaxed">
                          <MathRenderer content={currentQuestion.solution_text || "No solution provided."} />
                        </div>
                      </div>

                      {/* Original Sources Links */}
                      {parseSources(currentQuestion.original_sources).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center mr-2">Sources:</span>
                          {parseSources(currentQuestion.original_sources).map((src: any, i: number) => (
                            <a key={i} href={src.link} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full hover:bg-blue-100 transition-colors">
                              🔗 {src.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
               </div>

            </div>
          </div>

          {/* RIGHT SIDEBAR: Question Palette & Analytics */}
          <div className="w-80 bg-gray-50 border-l border-gray-200 shadow-sm shrink-0 flex flex-col p-5 overflow-y-auto">
             <h3 className="font-bold text-gray-700 mb-4">{isSubmitted ? 'Performance Map' : 'Question Palette'}</h3>
             
             <div className="grid grid-cols-5 gap-2 mb-8">
                {testData.map((_, index) => (
                   <button 
                      key={index} 
                      onClick={() => setCurrentIndex(index)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all border ${getPaletteColor(index)}`}
                   >
                      {index + 1}
                   </button>
                ))}
             </div>
             
             {/* Dynamic Metadata Card (Crucial for AI Context) */}
             {isSubmitted && currentQuestion.metadata_hooks && (
               <div className="mt-auto bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Diagnostic Data</h4>
                 
                 <div className="space-y-3">
                   <div>
                     <p className="text-[10px] text-gray-500 uppercase">Topic</p>
                     <p className="text-sm font-semibold text-gray-800">{currentQuestion.topic}</p>
                   </div>
                   {currentQuestion.sub_topic && (
                     <div>
                       <p className="text-[10px] text-gray-500 uppercase">Sub-Topic</p>
                       <p className="text-sm font-semibold text-gray-800">{currentQuestion.sub_topic}</p>
                     </div>
                   )}
                   <div className="flex gap-2">
                     <div className="flex-1">
                       <p className="text-[10px] text-gray-500 uppercase">Difficulty</p>
                       <div className="mt-1 flex items-center gap-1.5">
                         <span className={`w-2 h-2 rounded-full ${currentQuestion.metadata_hooks.difficulty === 'Hard' ? 'bg-red-500' : currentQuestion.metadata_hooks.difficulty === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                         <span className="text-xs font-medium text-gray-700">{currentQuestion.metadata_hooks.difficulty} ({currentQuestion.metadata_hooks.difficulty_level})</span>
                       </div>
                     </div>
                   </div>
                   {currentQuestion.metadata_hooks.trap_type && (
                     <div className="pt-2">
                       <p className="text-[10px] text-gray-500 uppercase mb-1">Identified Pitfall</p>
                       <span className="inline-block bg-orange-100 text-orange-800 border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded">
                         {currentQuestion.metadata_hooks.trap_type.toUpperCase()}
                       </span>
                     </div>
                   )}
                 </div>

                 {/* Future AI Tutor Button */}
                 <button className="w-full mt-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                   ✨ Ask AI Tutor
                 </button>
               </div>
             )}
          </div>
        </div>

        {/* FIXED FOOTER */}
        <div className="bg-white border-t shrink-0 p-4 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
          <div className="flex gap-4">
            {!isSubmitted && (
              <>
                <button onClick={() => {
                  const updated = new Set(markedForReview);
                  updated.has(currentIndex) ? updated.delete(currentIndex) : updated.add(currentIndex);
                  setMarkedForReview(updated);
                  if (currentIndex < testData.length - 1) setCurrentIndex(currentIndex + 1);
                }} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50">
                  Mark for Review & Next
                </button>
                <button onClick={() => {
                  const updated = { ...userAnswers };
                  delete updated[currentQuestion.id];
                  setUserAnswers(updated);
                }} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50">
                  Clear Response
                </button>
              </>
            )}
          </div>

          <div className="flex gap-4">
            <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={currentIndex === 0} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 disabled:opacity-50">
              Previous
            </button>
            <button onClick={() => setCurrentIndex(prev => Math.min(testData.length - 1, prev + 1))} disabled={currentIndex === testData.length - 1} className="px-8 py-2 bg-blue-600 text-white rounded-md font-bold hover:bg-blue-700 disabled:opacity-50">
              {isSubmitted ? 'Next Question' : 'Save & Next'}
            </button>
          </div>
        </div>
      </div>

      {/* EXIT MODAL */}
      {showExitModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-fadeIn">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">⚠️ Submit Exam?</h2>
            <p className="text-gray-600 mb-6">Unanswered questions will be marked as incorrect. Are you sure?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowExitModal(false)} className="px-4 py-2 border border-gray-300 rounded-md font-medium text-gray-700 hover:bg-gray-50">Resume Exam</button>
              <button onClick={submitExam} className="px-4 py-2 bg-red-600 text-white rounded-md font-bold hover:bg-red-700 shadow-sm">Yes, Submit</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}