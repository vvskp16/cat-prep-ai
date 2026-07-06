'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export default function StudentDashboard() {
  const [stats, setStats] = useState({ total: 0, accuracy: 0, lastActive: 'Never' });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load macro stats from the history we implemented earlier
  useEffect(() => {
    const savedHistory = localStorage.getItem('cat_test_history');
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory);
        if (history.length > 0) {
          const avgAcc = Math.round(history.reduce((acc: number, test: any) => acc + test.metrics.accuracy, 0) / history.length);
          const date = new Date(history[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          setStats({ total: history.length, accuracy: avgAcc, lastActive: date });
        }
      } catch (e) {
        console.error("Failed to load history stats", e);
      }
    }
    setIsLoaded(true);
  }, []);

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto w-full px-6 py-12">
      
      {/* WELCOME HEADER */}
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight mb-2">Welcome back.</h1>
          <p className="text-lg text-slate-500 font-medium">Select a module to begin your targeted practice session.</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Global Accuracy</p>
          <div className="text-3xl font-black text-blue-600">{stats.total > 0 ? `${stats.accuracy}%` : '--'}</div>
        </div>
      </div>

      {/* QUICK START MODULES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        
        {/* QUANT CARD */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-col h-full">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-2xl mb-6">📐</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Quantitative Ability</h2>
          <p className="text-slate-500 text-sm mb-8 flex-1">Practice Arithmetic, Algebra, Geometry, and Number Systems.</p>
          <Link href="/test-exam?subject=Quant&limit=5" className="w-full block text-center bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 font-bold py-3 rounded-lg transition-colors">
            Start Quant Practice
          </Link>
        </div>

        {/* DILR CARD */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-col h-full">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center text-2xl mb-6">📊</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">DILR Sets</h2>
          <p className="text-slate-500 text-sm mb-8 flex-1">Tackle multi-question data tables, charts, and logical reasoning caselets.</p>
          <Link href="/test-exam?subject=DILR&limit=5" className="w-full block text-center bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700 font-bold py-3 rounded-lg transition-colors">
            Start DILR Practice
          </Link>
        </div>

        {/* VARC CARD */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-col h-full">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center text-2xl mb-6">📝</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">VARC Passages</h2>
          <p className="text-slate-500 text-sm mb-8 flex-1">Improve reading comprehension and verbal logic execution.</p>
          <Link href="/test-exam?subject=VARC&limit=5" className="w-full block text-center bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 font-bold py-3 rounded-lg transition-colors">
            Start VARC Practice
          </Link>
        </div>

      </div>

      {/* RECENT ACTIVITY */}
      <div className="bg-slate-900 rounded-2xl p-8 text-white flex justify-between items-center shadow-md">
        <div>
          <h3 className="font-bold text-lg mb-1">Performance Tracking Active</h3>
          <p className="text-slate-400 text-sm">You have completed {stats.total} practice sections. Last active: {stats.lastActive}</p>
        </div>
        <Link href="/history" className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-bold transition text-sm shadow-sm">
          View Detailed Analytics
        </Link>
      </div>

    </div>
  );
}