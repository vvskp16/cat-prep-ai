'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MathRenderer from './MathRenderer';

// --- INTERFACES ---
interface ParentContext { context_id: string; context_type: string; context_body: string; }
interface QuestionOptions { A?: string; B?: string; C?: string; D?: string; }
interface OriginalSource { label: string; link: string; } // <--- ADD THIS

export interface Question {
  id: string; subject: string; question_type: string; topic: string; sub_topic: string;
  has_parent_context: boolean; parent_context: ParentContext | null;
  question_text: string; options: QuestionOptions | null; correct_answer: string;
  solution_text: string; original_sources?: OriginalSource[] | string; 
  metadata_hooks?: { difficulty?: string; difficulty_level?: number; calculation_intensity?: string; };
}
interface ExamEngineProps {
  initialTestData: Question[];
  initialTimeInSeconds?: number;
  isReviewMode?: boolean;
  pastUserAnswers?: Record<string, string>;
  pastTimeSpent?: Record<string, number>; 
  onExit?: () => void;
}

export default function ExamEngine({ 
  initialTestData, 
  initialTimeInSeconds = 1200, 
  isReviewMode = false,
  pastUserAnswers = {},
  pastTimeSpent = {},
  onExit
}: ExamEngineProps) {
  const router = useRouter();

  const [testData] = useState<Question[]>(initialTestData);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>(pastUserAnswers);
  const [timeSpent, setTimeSpent] = useState<Record<string, number>>(pastTimeSpent);
  const [timeLeft, setTimeLeft] = useState(initialTimeInSeconds);
  
  const [isSubmitted, setIsSubmitted] = useState(isReviewMode);
  const [showExitModal, setShowExitModal] = useState(false);
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  
  const [revealedSolutions, setRevealedSolutions] = useState<Set<string>>(new Set());

  const currentQuestion = testData[currentIndex];
  const isCurrentlyRevealed = revealedSolutions.has(currentQuestion.id);

  useEffect(() => {
    if (isSubmitted || timeLeft <= 0) {
      if (timeLeft <= 0 && !isSubmitted) submitExam();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
      setTimeSpent((prev) => ({
        ...prev,
        [currentQuestion.id]: (prev[currentQuestion.id] || 0) + 1
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted, currentQuestion.id]);

  useEffect(() => {
    if (isSubmitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault(); e.returnValue = "You have an active exam. Progress will be lost."; 
    };
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => { window.history.pushState(null, "", window.location.href); setShowExitModal(true); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    return () => { window.removeEventListener('beforeunload', handleBeforeUnload); window.removeEventListener('popstate', handlePopState); };
  }, [isSubmitted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (optionKey: string) => {
    if (isSubmitted) return; 
    setUserAnswers({ ...userAnswers, [currentQuestion.id]: optionKey });
  };

  const handleTITAInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitted) return;
    setUserAnswers({ ...userAnswers, [currentQuestion.id]: e.target.value });
  };

  const submitExam = () => {
    setShowExitModal(false);
    
    const pastExams = JSON.parse(localStorage.getItem('cat_exam_history') || '[]');
    const newExamRecord = {
      id: `EXAM_${Date.now()}`,
      date: new Date().toISOString(),
      testData,
      userAnswers,
      timeSpent, 
      totalTimeTaken: initialTimeInSeconds - timeLeft
    };
    localStorage.setItem('cat_exam_history', JSON.stringify([newExamRecord, ...pastExams]));
    // Sends the user straight to the summary page instead of staying in the engine
    router.push('/history');
  };

  const getPaletteColor = (index: number) => {
    if (!isSubmitted) {
      const isAnswered = !!userAnswers[testData[index].id];
      const isMarked = markedForReview.has(index);
      if (isMarked && isAnswered) return "bg-purple-600 text-white border-purple-600";
      if (isMarked) return "bg-purple-100 text-purple-800 border-purple-400";
      if (isAnswered) return "bg-green-600 text-white border-green-600";
      if (index === currentIndex) return "border-blue-600 text-blue-600 bg-blue-50";
      return "bg-white text-gray-700 border-gray-300";
    } else {
      const q = testData[index];
      const ans = userAnswers[q.id];
      const isViewing = index === currentIndex ? "ring-2 ring-blue-600 ring-offset-2 " : "";
      if (!ans) return isViewing + "bg-gray-200 text-gray-500 border-gray-300"; 
      if (ans === q.correct_answer) return isViewing + "bg-green-100 text-green-800 border-green-500"; 
      return isViewing + "bg-red-100 text-red-800 border-red-500"; 
    }
  };

  const parseSources = (sourcesStr?: OriginalSource[] | string): OriginalSource[] => {
    if (!sourcesStr) return [];
    
    // If FastAPI successfully passed it as a Javascript Array, just return it!
    if (Array.isArray(sourcesStr)) return sourcesStr;
    
    // If it comes through as a string from LocalStorage or older DB records
    try { 
      const parsed = JSON.parse(sourcesStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch { 
      return []; 
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col h-screen overflow-hidden">
        {/* HEADER */}
        <div className={`bg-white border-b shadow-sm px-6 py-3 flex justify-between items-center shrink-0 ${isSubmitted ? 'border-b-4 border-b-indigo-500' : ''}`}>
          <span className="font-bold text-gray-700 flex items-center gap-2">
            {isSubmitted && <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded tracking-wide">REVIEW MODE</span>}
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              CAT Practice Interface
            </span>
          </span>
          {!isSubmitted ? (
            <div className="flex items-center gap-6">
              <div className="text-xl font-mono text-blue-700 font-bold flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 {formatTime(timeLeft)}
              </div>
              <button onClick={() => setShowExitModal(true)} className="bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-red-700 transition-colors shadow-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Submit Test
              </button>
            </div>
          ) : (
              <button 
                type="button" 
                onClick={(e) => {
                  e.preventDefault();
                  if (onExit) {
                    onExit(); // If a parent component passed a close function, use it
                  } else {
                    window.location.href = '/history'; // Hard-force the browser to reload the history route
                  }
                }} 
                className="bg-gray-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-900 transition-colors shadow-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                Exit
              </button>
          )}
        </div>
        
        {/* MIDDLE WORKSPACE */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANE */}
          <div className="flex-1 overflow-y-auto p-6 relative bg-white">
            <div className={currentQuestion.has_parent_context ? "grid grid-cols-1 lg:grid-cols-2 gap-8 h-full" : "max-w-4xl mx-auto"}>
               {currentQuestion.has_parent_context && currentQuestion.parent_context && (
                   <div className="border-r border-gray-200 pr-6 h-full overflow-y-auto">
                      <div className="bg-gray-50 p-6 rounded-xl shadow-inner text-gray-800 text-sm leading-relaxed border border-gray-100">
                         <MathRenderer content={currentQuestion.parent_context.context_body} />
                      </div>
                   </div>
               )}

               <div className="flex flex-col pb-20">
                  <div className="flex items-center justify-between mb-4">
                     <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Question {currentIndex + 1}</span>
                     <span className="text-xs font-bold bg-gray-100 border border-gray-200 text-gray-600 px-3 py-1 rounded-full">
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
                          if (isCurrentlyRevealed) {
                            if (isCorrectOption) btnClass = "bg-green-50 border-green-500 ring-1 ring-green-500 shadow-sm";
                            else if (isSelected && !isCorrectOption) btnClass = "bg-red-50 border-red-400 opacity-80";
                            else btnClass = "bg-gray-50 border-gray-200 opacity-60";
                          } else {
                            if (isSelected) btnClass = "bg-blue-50 border-blue-400 opacity-80";
                            else btnClass = "bg-gray-50 border-gray-200 opacity-80";
                          }
                        } else if (isSelected) {
                          btnClass = "bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-sm";
                        }

                        return (
                          <button key={key} onClick={() => handleOptionSelect(key)} disabled={isSubmitted}
                            className={`w-full text-left p-4 border rounded-xl transition-all relative pr-24 ${btnClass} ${isSubmitted ? 'cursor-default' : 'cursor-pointer'}`}>
                            
                            {/* Flex Alignment fixes text wrapping under the option key */}
                            <div className="flex items-start gap-3">
                              <span className="font-bold text-gray-700 mt-[2px] min-w-[1.2rem]">{key}.</span> 
                              <div className="flex-1 overflow-x-auto"><MathRenderer content={val} /></div>
                            </div>
                            
                            {/* Option Badges */}
                            {isSubmitted && isCurrentlyRevealed && isCorrectOption && (
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-green-800 bg-green-200 px-2 py-1 rounded-full border border-green-300 flex items-center gap-1 shadow-sm">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg> Correct
                              </span>
                            )}
                            {isSubmitted && isCurrentlyRevealed && isSelected && !isCorrectOption && (
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-800 bg-red-200 px-2 py-1 rounded-full border border-red-300 flex items-center gap-1 shadow-sm">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg> Your Answer
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <input type="text" value={userAnswers[currentQuestion.id] || ''} onChange={handleTITAInput} disabled={isSubmitted} placeholder="Type your answer here..."
                        className={`w-full p-4 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none ${isSubmitted ? 'bg-gray-50 text-gray-600 border-gray-300' : 'border-gray-300'}`}/>
                      
                      {isSubmitted && isCurrentlyRevealed && (
                        <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-900 text-sm font-medium flex items-center gap-2 animate-fadeIn">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Correct Answer: <span className="font-bold text-base">{currentQuestion.correct_answer}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* REVIEW MODE: Answer Mask / Solution Block with Toggle */}
                  {isSubmitted && (
                    <div className="mt-10 space-y-4 border-t border-gray-100 pt-6">
                      <button 
                        onClick={() => {
                          const newSet = new Set(revealedSolutions);
                          newSet.has(currentQuestion.id) ? newSet.delete(currentQuestion.id) : newSet.add(currentQuestion.id);
                          setRevealedSolutions(newSet);
                        }} 
                        className={`w-full py-4 border-2 border-dashed font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${isCurrentlyRevealed ? 'border-gray-300 text-gray-500 hover:bg-gray-50' : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'}`}
                      >
                        {isCurrentlyRevealed ? (
                          <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> Hide Answer & Solution</>
                        ) : (
                          <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> Reveal Correct Answer & Solution</>
                        )}
                      </button>

                      {isCurrentlyRevealed && (
                        <div className="animate-fadeIn space-y-4">
                          <div className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                            <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                              Solution
                            </h4>
                            <div className="text-gray-700 leading-relaxed">
                              <MathRenderer content={currentQuestion.solution_text || "No solution provided."} />
                            </div>
                          </div>
                          
                          {parseSources(currentQuestion.original_sources).length > 0 && (
                            <div className="flex flex-wrap gap-2 items-center p-4 bg-gray-50 border border-gray-200 rounded-xl">
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide mr-2 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                Original Sources:
                              </span>
                              {parseSources(currentQuestion.original_sources).map((src: any, i: number) => (
                                <a key={i} href={src.link} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
                                  {src.label}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
               </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="w-80 bg-gray-50 border-l border-gray-200 shadow-sm shrink-0 flex flex-col p-5 overflow-y-auto">
             <h3 className="font-bold text-gray-700 mb-4 uppercase text-xs tracking-wider">Question Palette</h3>
             <div className="grid grid-cols-5 gap-2 mb-8">
                {testData.map((_, index) => (
                   <button key={index} onClick={() => setCurrentIndex(index)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all border ${getPaletteColor(index)}`}>
                      {index + 1}
                   </button>
                ))}
             </div>
             
             {isSubmitted && currentQuestion.metadata_hooks && (
               <div className="mt-auto bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
                 
                 <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                   <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                     Time Analytics
                   </h4>
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-xs font-medium text-slate-700">Time Spent on Question:</span>
                     <span className="text-sm font-bold text-indigo-700">
                       {formatTime(timeSpent[currentQuestion.id] || 0)}
                     </span>
                   </div>
                 </div>

                 <div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Diagnostic Data</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[10px] text-gray-500 uppercase">Topic</span>
                        <span className="text-xs font-semibold text-gray-800 text-right">{currentQuestion.topic}</span>
                      </div>
                      
                      {currentQuestion.sub_topic && (
                        <div className="flex justify-between">
                          <span className="text-[10px] text-gray-500 uppercase">Sub-Topic</span>
                          <span className="text-xs font-semibold text-gray-800 text-right">{currentQuestion.sub_topic}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-500 uppercase">Difficulty</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${currentQuestion.metadata_hooks.difficulty === 'Hard' ? 'bg-red-500' : currentQuestion.metadata_hooks.difficulty === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                          <span className="text-xs font-medium text-gray-700">
                            {currentQuestion.metadata_hooks.difficulty} 
                            {currentQuestion.metadata_hooks.difficulty_level && ` (${currentQuestion.metadata_hooks.difficulty_level})`}
                          </span>
                        </div>
                      </div>
                      {/* Trap Type Data Intentionally Removed For Clean UI */}
                    </div>
                 </div>

                 <button className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                   Ask AI Tutor
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
                }} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  Mark for Review
                </button>
                <button onClick={() => {
                  const updated = { ...userAnswers };
                  delete updated[currentQuestion.id];
                  setUserAnswers(updated);
                }} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  Clear
                </button>
              </>
            )}
          </div>
          <div className="flex gap-4">
            <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} disabled={currentIndex === 0} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Previous
            </button>
            <button onClick={() => setCurrentIndex(prev => Math.min(testData.length - 1, prev + 1))} disabled={currentIndex === testData.length - 1} className="px-8 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-sm">
              {isSubmitted ? 'Next Question' : 'Save & Next'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      {showExitModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fadeIn">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              Submit Exam?
            </h2>
            
            <div className="flex justify-end gap-3 mt-6">
              {/* NEW EXIT OPTION */}
              <button 
                onClick={() => {
                  setShowExitModal(false);
                  if (onExit) onExit();
                  else router.push('/'); // Route them back to dashboard without saving
                }} 
                className="px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
              >
                Exit without Saving
              </button>
              
              <button onClick={() => setShowExitModal(false)} className="px-5 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
                Resume Exam
              </button>
              
              {/* Updated to Blue to distinguish from the Exit action */}
              <button onClick={submitExam} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}