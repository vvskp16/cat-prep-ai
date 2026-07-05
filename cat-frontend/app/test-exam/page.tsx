// app/test-exam/page.tsx
'use client';

import React, { useState } from 'react';
import { generatePracticeTest, Question } from '../lib/api';
import ExamEngine from '../components/ExamEngine';

export default function PracticeSessionLauncher() {
  // --- Launcher Configuration States ---
  const [subject, setSubject] = useState<'Quant' | 'DILR' | 'VARC' | ''>('');
  const [limit, setLimit] = useState<number>(5);
  
  // --- Operational Control States ---
  const [testPayload, setTestPayload] = useState<Question[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const triggerTestGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Direct call out to our API abstraction utility layer
      const questionsMatrix = await generatePracticeTest({ subject, limit });
      
      if (questionsMatrix.length === 0) {
        setErrorMessage("No matching questions discovered inside the vector collection matching these filter keys.");
      } else {
        setTestPayload(questionsMatrix);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network execution breakdown: Connection to FastAPI endpoint aborted.");
    } finally {
      setIsLoading(false);
    }
  };

  // Safe Mode: If test data has been successfully initialized, shift view directly into the active player workspace
  if (testPayload) {
    return <ExamEngine initialTestData={testPayload} initialTimeInSeconds={limit * 480} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 text-white">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-8 transition-all">
        
        <div className="text-center mb-8">
          <div className="h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center text-xl font-bold mx-auto mb-3 shadow-md">
            🚀
          </div>
          <h1 className="text-2xl font-bold tracking-tight">CAT Prep Test Generator</h1>
          <p className="text-slate-400 text-sm mt-1">Configure vector space parameters to spin up a custom sectional simulation.</p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/40 border border-red-700/60 rounded-lg text-sm text-red-200">
            <span className="font-bold">Execution Trap:</span> {errorMessage}
          </div>
        )}

        <form onSubmit={triggerTestGeneration} className="space-y-5">
          {/* Target Section Filter Selection Box */}
          <div>
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider mb-2">
              Target Subject Section
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as any)}
              className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 transition font-medium text-slate-200 text-sm"
            >
              <option value="">All Fields Mixed (Poly-retrieval)</option>
              <option value="Quant">Quantitative Aptitude (QA)</option>
              <option value="DILR">Data Interpretation & Logical Reasoning (DILR)</option>
              <option value="VARC">Verbal Ability & Reading Comprehension (VARC)</option>
            </select>
          </div>

          {/* Base Limit Parameter Config Spinner */}
          <div>
            <label className="block text-xs uppercase text-slate-400 font-bold tracking-wider mb-2">
              Requested Target Count (Base Question Limit)
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 5)}
              className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 transition font-mono text-slate-200 text-sm"
            />
            <p className="text-slate-500 text-xs mt-1.5 leading-normal">
              Note: The backend intelligently overrides this limit to pull in whole contextual caselet sets where relevant.
            </p>
          </div>

          {/* Action Form Submit Switcher */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-bold rounded-lg transition shadow-lg active:scale-98 text-sm uppercase tracking-wider flex justify-center items-center space-x-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                <span>Running Semantic Caselet Compilation...</span>
              </>
            ) : (
              <span>Launch Practice Exam Session</span>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}