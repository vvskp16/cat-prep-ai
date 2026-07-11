'use client';

import { useEffect, useState } from 'react';
import ExamEngine, { Question } from '../components/ExamEngine';
import { Trash2, TrendingUp, Clock, Target, Calendar, ArrowRight, Activity, AlertCircle } from 'lucide-react';

interface ExamRecord {
  id: string;
  name?: string;
  status?: 'completed' | 'paused' | 'autosaved';
  date: string;
  testData: Question[];
  userAnswers: Record<string, string>;
  timeSpent: Record<string, number>;
  totalTimeTaken: number;
  timeLeft?: number;
  currentIndex?: number;
  isSequential?: boolean;
  initialTimeInSeconds?: number;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<ExamRecord[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamRecord | null>(null);
  const [resumingExam, setResumingExam] = useState<ExamRecord | null>(null);
  const [autoSavedExam, setAutoSavedExam] = useState<ExamRecord | null>(null);

  useEffect(() => {
    // 1. Fetch completed & explicitly paused tests
    const rawData = localStorage.getItem('cat_exam_history');
    if (rawData) {
      setHistory(JSON.parse(rawData));
    }

    // 2. Detect orphaned background autosave
    const autoSave = localStorage.getItem('cat_autosaved_test');
    if (autoSave) {
      setAutoSavedExam(JSON.parse(autoSave));
    }
  }, []);

  const deleteExam = (id: string) => {
    if (!confirm('Are you sure you want to delete this test record?')) return;
    const updated = history.filter(exam => exam.id !== id);
    setHistory(updated);
    localStorage.setItem('cat_exam_history', JSON.stringify(updated));
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0s";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric', 
      minute: '2-digit'
    });
  };

  // -------------------------------------------------------------
  // STATE ROUTING: REVIEW MODE (COMPLETED) vs LIVE MODE (PAUSED)
  // -------------------------------------------------------------
  if (resumingExam) {
    return (
      <ExamEngine 
        initialTestData={resumingExam.testData}
        isReviewMode={false} // Live Mode!
        pastUserAnswers={resumingExam.userAnswers}
        pastTimeSpent={resumingExam.timeSpent}
        initialTimeInSeconds={resumingExam.initialTimeInSeconds ?? (resumingExam.testData.length * 120)}
        initialTimeLeft={resumingExam.timeLeft}
        initialCurrentIndex={resumingExam.currentIndex}
        resumeExamId={resumingExam.id}
        isSequential={resumingExam.isSequential}
        onExit={() => {
          setResumingExam(null);
          // Refresh lists to capture changes upon exit
          setHistory(JSON.parse(localStorage.getItem('cat_exam_history') || '[]'));
          setAutoSavedExam(JSON.parse(localStorage.getItem('cat_autosaved_test') || 'null'));
        }}
      />
    );
  }

  if (selectedExam) {
    return (
      <ExamEngine 
        initialTestData={selectedExam.testData}
        isReviewMode={true} // Post-Completion Mode!
        pastUserAnswers={selectedExam.userAnswers}
        pastTimeSpent={selectedExam.timeSpent}
        isSequential={selectedExam.isSequential}
        onExit={() => setSelectedExam(null)}
      />
    );
  }

  // Dashboard Layout
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-5">
           <div>
             <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
                <Activity className="text-indigo-600" size={26} /> 
                Performance Analytics
             </h1>
             <p className="text-sm text-gray-500 mt-1">Review your past attempts and analyze your time-management.</p>
           </div>
           {history.length > 0 && (
             <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm text-sm font-medium text-gray-600 flex items-center gap-2">
               <Target size={16} className="text-indigo-500"/> Total Sessions: {history.length}
             </div>
           )}
        </header>

        {/* Background Auto-Save Banner */}
        {autoSavedExam && (
          <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <h3 className="text-amber-900 font-bold flex items-center gap-2">
                <AlertCircle size={20} className="text-amber-600" /> Unsaved Ongoing Exam
              </h3>
              <p className="text-amber-700 text-sm mt-1">You have a background session that was automatically saved but not submitted.</p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button 
                onClick={() => {
                  if (confirm('Discard this ongoing background exam?')) {
                    localStorage.removeItem('cat_autosaved_test');
                    setAutoSavedExam(null);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 rounded-lg transition-colors"
              >
                Discard
              </button>
              <button 
                onClick={() => setResumingExam(autoSavedExam)}
                className="px-6 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
              >
                Resume Now
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {history.length === 0 && !autoSavedExam ? (
          <div className="bg-white border border-gray-200 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center">
            <div className="bg-gray-50 p-4 rounded-full mb-4">
              <AlertCircle size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">No exam history found</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
              You haven't taken or paused any practice tests yet. Head back to the dashboard to generate your first test.
            </p>
          </div>
        ) : (
          /* List of Exams */
          <div className="space-y-4">
            {history.map((exam) => {
              const totalQ = exam.testData.length;
              let correctCount = 0;
              let incorrectCount = 0;
              let timeOnCorrect = 0;

              exam.testData.forEach((q) => {
                const uAns = exam.userAnswers[q.id];
                const tSpent = exam.timeSpent?.[q.id] || 0;
                
                if (uAns) {
                  if (uAns === q.correct_answer) {
                    correctCount++;
                    timeOnCorrect += tSpent;
                  } else if (q.question_type === 'MCQ') {
                    // Only penalize wrong answers if they are MCQs (Official CAT Rule)
                    incorrectCount++;
                  }
                }
              });

              // Official CAT Marking Formula: +3 for Correct, -1 for Wrong MCQ
              const actualScore = (correctCount * 3) - (incorrectCount * 1);
              const maxPossibleScore = totalQ * 3;

              const attemptedCount = correctCount + incorrectCount;
              const accuracy = totalQ > 0 && attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
              const avgCorrectTime = correctCount > 0 ? Math.round(timeOnCorrect / correctCount) : 0;

              return (
                <div key={exam.id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group relative">
                  
                  {/* Top Row: Date & Actions */}
                  <div className="flex justify-between items-center mb-6">
                     <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                        <Calendar size={16} className="text-gray-400" /> {formatDate(exam.date)}
                        {exam.name && <span className="ml-2 font-bold text-gray-800 text-base">{exam.name}</span>}
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded uppercase tracking-wider font-bold">
                          {totalQ} Questions
                        </span>
                        {exam.status === 'paused' && (
                          <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded uppercase tracking-wider font-bold">
                            Paused
                          </span>
                        )}
                     </div>
                     
                     {/* Action Buttons (Fade in on hover) */}
                     <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        <button 
                          onClick={() => deleteExam(exam.id)} 
                          title="Delete Record"
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                           <Trash2 size={18} />
                        </button>
                        
                        {exam.status === 'paused' ? (
                          <button 
                            onClick={() => setResumingExam(exam)} 
                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white hover:bg-amber-700 text-sm font-bold rounded-lg transition-colors shadow-sm"
                          >
                             Resume Test <ArrowRight size={16} />
                          </button>
                        ) : (
                          <button 
                            onClick={() => setSelectedExam(exam)} 
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                          >
                             Review Test <ArrowRight size={16} />
                          </button>
                        )}
                     </div>
                  </div>

                  {/* Conditional Render: Paused Mask vs Performance Metrics */}
                  {exam.status === 'paused' ? (
                     <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-gray-500 text-sm font-medium flex items-center gap-2">
                       <Clock size={16} /> Session preserved. Resume to complete the test and view your performance analytics.
                     </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                       
                       {/* Score Block */}
                       <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                         <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                           <Target size={14} className="text-gray-400"/> Score
                         </div>
                         <div className="text-2xl font-bold text-gray-900 flex items-baseline gap-1">
                           {actualScore} <span className="text-sm text-gray-400 font-medium">/ {maxPossibleScore}</span>
                         </div>
                       </div>

                       {/* Accuracy */}
                       <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                         <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                           <TrendingUp size={14} className="text-gray-400"/> Accuracy
                         </div>
                         <div className={`text-2xl font-bold ${accuracy >= 80 ? 'text-green-600' : accuracy >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {accuracy}%
                         </div>
                       </div>

                       {/* Total Time */}
                       <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                         <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                           <Clock size={14} className="text-gray-400"/> Total Time
                         </div>
                         <div className="text-2xl font-bold text-gray-900 flex items-baseline gap-1">
                           {formatTime(exam.totalTimeTaken)}
                           <span className="text-sm text-gray-400 font-medium">
                             / {Math.round((exam.initialTimeInSeconds ?? (totalQ * 120)) / 60)}m
                           </span>
                         </div>
                       </div>

                       {/* Avg Time on Correct */}
                       <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                         <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
                           <Activity size={14} className="text-gray-400"/> Avg Time / Correct
                         </div>
                         <div className="text-2xl font-bold text-gray-900">
                           {formatTime(avgCorrectTime)}
                         </div>
                       </div>

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}