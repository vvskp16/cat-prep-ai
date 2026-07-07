'use client';
import { useState, useEffect } from 'react';
import ExamEngine from '../components/ExamEngine';

type ViewState = 'LIST' | 'SUMMARY' | 'REVIEW';

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [viewState, setViewState] = useState<ViewState>('LIST');
  const [selectedExam, setSelectedExam] = useState<any | null>(null);

  useEffect(() => {
    setHistory(JSON.parse(localStorage.getItem('cat_exam_history') || '[]'));
  }, []);

  const handleDelete = (examId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this test record? This cannot be undone.")) {
      const updatedHistory = history.filter(exam => exam.id !== examId);
      setHistory(updatedHistory);
      localStorage.setItem('cat_exam_history', JSON.stringify(updatedHistory));
      
      if (selectedExam?.id === examId) {
        setViewState('LIST');
        setSelectedExam(null);
      }
    }
  };

  const calculateMetrics = (exam: any) => {
    let correct = 0, incorrect = 0, unattempted = 0;
    let timeCorrect = 0, timeIncorrect = 0, timeUnattempted = 0;
    let score = 0;
    
    const safeTimeSpent = exam.timeSpent || {}; 

    exam.testData.forEach((q: any) => {
      const ans = exam.userAnswers[q.id];
      const t = safeTimeSpent[q.id] || 0;

      if (!ans) {
        unattempted++;
        timeUnattempted += t;
      } else if (ans === q.correct_answer) {
        correct++;
        timeCorrect += t;
        score += 3;
      } else {
        incorrect++;
        timeIncorrect += t;
        if (q.question_type !== 'TITA') {
          score -= 1;
        }
      }
    });

    const totalQuestions = exam.testData.length;
    const accuracy = ((correct / (correct + incorrect)) * 100) || 0;

    return {
      totalQuestions, correct, incorrect, unattempted, score, accuracy,
      avgTimeCorrect: correct ? Math.floor(timeCorrect / correct) : 0,
      avgTimeIncorrect: incorrect ? Math.floor(timeIncorrect / incorrect) : 0,
      avgTimeUnattempted: unattempted ? Math.floor(timeUnattempted / unattempted) : 0
    };
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  if (viewState === 'REVIEW' && selectedExam) {
    return (
      <ExamEngine 
        initialTestData={selectedExam.testData} 
        pastUserAnswers={selectedExam.userAnswers}
        pastTimeSpent={selectedExam.timeSpent}
        isReviewMode={true} 
      />
    );
  }

  // REFINED SUMMARY VIEW
  if (viewState === 'SUMMARY' && selectedExam) {
    const metrics = calculateMetrics(selectedExam);
    
    return (
      <div className="max-w-5xl mx-auto p-6 animate-fadeIn">
        <button onClick={() => setViewState('LIST')} className="mb-4 text-slate-500 font-medium hover:text-slate-800 text-sm transition-colors flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Tests
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-6">
          
          {/* COMPACT HEADER */}
          <div className="bg-slate-900 px-6 py-6 text-white flex justify-between items-center">
            <div>
              <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Analytics Overview
              </h1>
              <p className="text-sm text-slate-400 font-medium tracking-wide">ATTEMPTED • {new Date(selectedExam.date).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{metrics.score} <span className="text-base text-slate-400 font-medium">marks</span></p>
            </div>
          </div>

          {/* COMPACT METRIC CARDS */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 bg-slate-50/50">
             
             {/* Correct */}
             <div className="bg-white border border-green-200 p-4 rounded-lg shadow-sm">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                   <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                   Correct
                 </h3>
                 <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded">{metrics.correct} Qs</span>
               </div>
               <div className="flex justify-between items-end">
                 <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Avg Time</span>
                 <span className="text-lg font-bold text-slate-800">{formatTime(metrics.avgTimeCorrect)}</span>
               </div>
             </div>

             {/* Incorrect */}
             <div className="bg-white border border-red-200 p-4 rounded-lg shadow-sm">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                   <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                   Incorrect
                 </h3>
                 <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded">{metrics.incorrect} Qs</span>
               </div>
               <div className="flex justify-between items-end">
                 <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Avg Time Wasted</span>
                 <span className="text-lg font-bold text-slate-800">{formatTime(metrics.avgTimeIncorrect)}</span>
               </div>
             </div>

             {/* Unattempted */}
             <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                   <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                   Unattempted
                 </h3>
                 <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-0.5 rounded">{metrics.unattempted} Qs</span>
               </div>
               <div className="flex justify-between items-end">
                 <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Avg Time Before Skip</span>
                 <span className="text-lg font-bold text-slate-800">{formatTime(metrics.avgTimeUnattempted)}</span>
               </div>
             </div>

          </div>

          {/* COMPACT FOOTER ACTION */}
          <div className="px-6 py-4 flex items-center justify-between bg-white">
             <div>
               <h3 className="text-sm font-bold text-slate-800">Ready for Review?</h3>
               <p className="text-xs text-slate-500">Launch the engine to see solutions and diagnostics.</p>
             </div>
             <button onClick={() => setViewState('REVIEW')} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2.5 rounded-lg font-semibold shadow-sm transition-colors flex items-center gap-2">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               Launch Micro-Review
             </button>
          </div>
        </div>
      </div>
    );
  }

  // REFINED LIST VIEW
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Performance History</h1>
      </div>

      {history.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
          <p className="text-slate-500 font-medium text-sm">No tests attempted yet. Generate a test to start tracking!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map(exam => {
            const m = calculateMetrics(exam);
            return (
              <div key={exam.id} className="p-4 border border-slate-200 rounded-lg flex justify-between items-center bg-white shadow-sm hover:shadow transition-shadow group">
                <div>
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                    Practice Blueprint 
                    <span className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border border-slate-200">
                      {exam.id.slice(-6)}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{new Date(exam.date).toLocaleString()}</p>
                  
                  <div className="flex gap-3 mt-3">
                    <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                      Score: {m.score}
                    </span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                      Accuracy: {m.accuracy.toFixed(0)}%
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setSelectedExam(exam); setViewState('SUMMARY'); }}
                    className="bg-slate-50 text-slate-700 px-4 py-2 rounded text-xs font-semibold hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    Analytics
                  </button>
                  <button 
                    onClick={(e) => handleDelete(exam.id, e)}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition-colors"
                    title="Delete Record"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}