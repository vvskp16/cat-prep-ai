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

  if (viewState === 'SUMMARY' && selectedExam) {
    const metrics = calculateMetrics(selectedExam);
    
    return (
      <div className="max-w-6xl mx-auto p-8 animate-fadeIn">
        <button onClick={() => setViewState('LIST')} className="mb-6 text-indigo-600 font-bold hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to All Tests
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="bg-indigo-900 px-8 py-10 text-white flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Post-Exam Analytics
              </h1>
              <p className="text-indigo-200">Attempted on {new Date(selectedExam.date).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-black">{metrics.score} <span className="text-xl text-indigo-300 font-normal">pts</span></p>
              <p className="text-indigo-200 mt-1">Total Score (+3 / -1 format for MCQ, +3 / 0 for TITA)</p>
            </div>
          </div>

          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-gray-100">
             {/* Correct */}
             <div className="bg-green-50 border border-green-100 p-5 rounded-xl">
               <div className="flex justify-between items-start mb-4">
                 <h3 className="font-bold text-green-900 flex items-center gap-2">
                   <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                   Correct
                 </h3>
                 <span className="bg-green-200 text-green-800 text-xs font-bold px-2 py-1 rounded-full">{metrics.correct} Qs</span>
               </div>
               <p className="text-sm text-green-700 mb-1">Avg. Time Spent:</p>
               <p className="text-2xl font-bold text-green-800">{formatTime(metrics.avgTimeCorrect)}</p>
             </div>

             {/* Incorrect */}
             <div className="bg-red-50 border border-red-100 p-5 rounded-xl">
               <div className="flex justify-between items-start mb-4">
                 <h3 className="font-bold text-red-900 flex items-center gap-2">
                   <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   Incorrect
                 </h3>
                 <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded-full">{metrics.incorrect} Qs</span>
               </div>
               <p className="text-sm text-red-700 mb-1">Avg. Time Wasted:</p>
               <p className="text-2xl font-bold text-red-800">{formatTime(metrics.avgTimeIncorrect)}</p>
             </div>

             {/* Unattempted */}
             <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl">
               <div className="flex justify-between items-start mb-4">
                 <h3 className="font-bold text-gray-700 flex items-center gap-2">
                   <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                   Unattempted
                 </h3>
                 <span className="bg-gray-200 text-gray-700 text-xs font-bold px-2 py-1 rounded-full">{metrics.unattempted} Qs</span>
               </div>
               <p className="text-sm text-gray-500 mb-1">Avg. Time Before Skipping:</p>
               <p className="text-2xl font-bold text-gray-700">{formatTime(metrics.avgTimeUnattempted)}</p>
             </div>
          </div>

          <div className="p-8 flex items-center justify-between bg-slate-50">
             <div>
               <h3 className="text-lg font-bold text-slate-800 mb-1">Ready to review your mistakes?</h3>
               <p className="text-slate-600 text-sm">Launch the interactive engine to see solutions and AI diagnostics.</p>
             </div>
             <button onClick={() => setViewState('REVIEW')} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-md transition-all flex items-center gap-2">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               Launch Micro-Review
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black text-gray-800">Performance History</h1>
      </div>

      {history.length === 0 ? (
        <div className="text-center p-12 border-2 border-dashed border-gray-300 rounded-2xl">
          <p className="text-gray-500 font-medium text-lg">No tests attempted yet. Generate a test to start tracking!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map(exam => {
            const m = calculateMetrics(exam);
            return (
              <div key={exam.id} className="p-5 border border-gray-200 rounded-xl flex justify-between items-center bg-white shadow-sm hover:shadow-md transition-shadow">
                <div>
                  <h3 className="font-bold text-lg text-gray-800 flex items-center gap-3">
                    Practice Blueprint <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-md font-mono">{exam.id.slice(-6)}</span>
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{new Date(exam.date).toLocaleString()}</p>
                  
                  <div className="flex gap-4 mt-3">
                    <span className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">Score: {m.score}</span>
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">Accuracy: {m.accuracy.toFixed(0)}%</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => { setSelectedExam(exam); setViewState('SUMMARY'); }}
                    className="bg-indigo-50 text-indigo-700 px-5 py-2.5 rounded-lg font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.543 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    View Analytics 
                  </button>
                  <button 
                    onClick={(e) => handleDelete(exam.id, e)}
                    className="bg-red-50 text-red-600 px-4 py-2.5 rounded-lg font-bold hover:bg-red-100 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
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