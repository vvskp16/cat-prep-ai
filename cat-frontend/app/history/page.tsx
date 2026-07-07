'use client';
import { useState, useEffect } from 'react';
import ExamEngine from '../components/ExamEngine';

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [reviewingExam, setReviewingExam] = useState<any | null>(null);

  useEffect(() => {
    // Read the newly implemented save logic from ExamEngine
    setHistory(JSON.parse(localStorage.getItem('cat_exam_history') || '[]'));
  }, []);

  if (reviewingExam) {
    return (
      <ExamEngine 
        initialTestData={reviewingExam.testData} 
        pastUserAnswers={reviewingExam.userAnswers}
        isReviewMode={true} 
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Your Past Tests</h1>
      <div className="space-y-4">
        {history.map(exam => (
          <div key={exam.id} className="p-4 border rounded-xl flex justify-between items-center bg-white shadow-sm">
            <div>
              <p className="font-bold text-gray-800">Practice Test</p>
              <p className="text-sm text-gray-500">{new Date(exam.date).toLocaleString()}</p>
            </div>
            <button 
              onClick={() => setReviewingExam(exam)}
              className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded font-bold hover:bg-indigo-100"
            >
              Review Test 
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}