'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

// --- INTERFACES matching the ExamEngine payload ---
interface TopicStat {
  total: number;
  correct: number;
  incorrect: number;
  unattempted: number;
}

interface TestReport {
  id: string;
  date: string;
  subject: string;
  metrics: {
    score: number;
    maxScore: number;
    correct: number;
    incorrect: number;
    unattempted: number;
    timeTakenSeconds: number;
    accuracy: number;
  };
  topicStats: Record<string, TopicStat>;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<TestReport[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Load data from localStorage (Client-side only to avoid Next.js hydration errors)
  useEffect(() => {
    const savedHistory = localStorage.getItem('cat_test_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // 2. Utility Formatters
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  // 3. Smart Analytics: Find best and worst topics per test
  const getTopicInsights = (topicStats: Record<string, TopicStat>) => {
    let bestTopic = { name: '-', accuracy: -1 };
    let worstTopic = { name: '-', accuracy: 101 };

    Object.entries(topicStats).forEach(([topic, stats]) => {
      const attempted = stats.correct + stats.incorrect;
      if (attempted === 0) return; // Skip unattempted topics

      const accuracy = (stats.correct / attempted) * 100;

      if (accuracy > bestTopic.accuracy) bestTopic = { name: topic, accuracy };
      if (accuracy < worstTopic.accuracy) worstTopic = { name: topic, accuracy };
    });

    return {
      best: bestTopic.accuracy === -1 ? null : bestTopic,
      worst: worstTopic.accuracy === 101 ? null : worstTopic
    };
  };

  // 4. Aggregate Metrics
  const totalTests = history.length;
  const avgAccuracy = totalTests > 0 
    ? Math.round(history.reduce((acc, test) => acc + test.metrics.accuracy, 0) / totalTests) 
    : 0;

  // --- UI RENDERING ---
  if (!isLoaded) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-semibold text-slate-500">Loading History...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-10 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Practice History</h1>
            <p className="text-slate-500 mt-1">Track your performance and conceptual mastery over time.</p>
          </div>
          <Link 
            href="/" // Or wherever your main practice setup page is
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-sm transition-all active:scale-95 text-sm"
          >
            Start New Test
          </Link>
        </div>

        {totalTests === 0 ? (
          // EMPTY STATE
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">No Test History Found</h2>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">You haven't completed any practice sections yet. Take your first test to start generating performance analytics.</p>
            <Link href="/" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold shadow-sm transition-all">
              Take a Practice Test
            </Link>
          </div>
        ) : (
          <>
            {/* MACRO OVERVIEW BAR */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-black">
                  {totalTests}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Total Sections Taken</p>
                  <p className="text-xl font-bold text-slate-700">Practice Sessions</p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-black ${
                  avgAccuracy > 80 ? 'bg-emerald-100 text-emerald-600' : avgAccuracy > 50 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                }`}>
                  {avgAccuracy}%
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">All-Time Accuracy</p>
                  <p className="text-xl font-bold text-slate-700">Average Hit Rate</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl border border-slate-700 shadow-sm text-white flex flex-col justify-center">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Consistency Tracker</p>
                <p className="text-sm font-medium text-slate-300">
                  Last active: <span className="text-emerald-400 font-bold">{formatDate(history[0].date)}</span>
                </p>
              </div>
            </div>

            {/* TIMELINE / TEST CARDS */}
            <h2 className="text-lg font-bold text-slate-700 mb-4 tracking-tight">Recent Sessions</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {history.map((test) => {
                const insights = getTopicInsights(test.topicStats);
                
                return (
                  <div key={test.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                    
                    {/* Card Header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div className="flex items-center space-x-3">
                        <span className="bg-blue-600 text-white text-[10px] uppercase px-2 py-1 rounded font-black tracking-wider">
                          {test.subject}
                        </span>
                        <span className="text-sm font-bold text-slate-600">
                          {formatDate(test.date)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded">
                        {formatTime(test.metrics.timeTakenSeconds)}
                      </span>
                    </div>

                    {/* Card Body - Core Metrics */}
                    <div className="p-6 grid grid-cols-3 gap-4 border-b border-slate-100">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Net Score</p>
                        <p className="text-2xl font-black text-slate-800">
                          {test.metrics.score} <span className="text-sm text-slate-400 font-medium">/ {test.metrics.maxScore}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Accuracy</p>
                        <p className={`text-2xl font-black ${
                          test.metrics.accuracy > 80 ? 'text-emerald-500' : test.metrics.accuracy > 50 ? 'text-amber-500' : 'text-red-500'
                        }`}>
                          {test.metrics.accuracy}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Attempted</p>
                        <p className="text-2xl font-black text-slate-800">
                          {test.metrics.correct + test.metrics.incorrect} <span className="text-sm text-slate-400 font-medium">/ {test.metrics.correct + test.metrics.incorrect + test.metrics.unattempted}</span>
                        </p>
                      </div>
                    </div>

                    {/* Card Footer - Dynamic Insights */}
                    <div className="bg-slate-50 px-6 py-4 flex-1 flex flex-col justify-center space-y-2">
                      {insights.best ? (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500 font-medium flex items-center"><span className="text-emerald-500 mr-2">↑</span> Strongest</span>
                          <span className="font-bold text-slate-700">{insights.best.name}</span>
                        </div>
                      ) : null}
                      
                      {insights.worst ? (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500 font-medium flex items-center"><span className="text-red-500 mr-2">↓</span> Needs Work</span>
                          <span className="font-bold text-slate-700">{insights.worst.name}</span>
                        </div>
                      ) : (
                        <div className="text-sm text-emerald-600 font-bold">Flawless execution! No weaknesses detected.</div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
}