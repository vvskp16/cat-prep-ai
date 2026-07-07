'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { generatePracticeTest, Question } from '../lib/api';
import ExamEngine from '../components/ExamEngine';

function PracticeSessionContent() {
  const searchParams = useSearchParams();

  // --- Launcher Configuration States (Fallback) ---
  const [subject, setSubject] = useState<'Quant' | 'DILR' | 'VARC' | ''>('');
  const [limit, setLimit] = useState<number>(5);
  const [initialTimeInSeconds, setInitialTimeInSeconds] = useState<number>(2400);
  
  // --- Operational Control States ---
  const [testPayload, setTestPayload] = useState<Question[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- 🚀 NEW: Auto-Trigger from Query Parameters ---
  useEffect(() => {
    const urlSubject = searchParams.get('subject');
    
    // If we detect URL parameters, immediately auto-launch the test
    if (urlSubject) {
      setSubject(urlSubject as any);
      setLimit(parseInt(searchParams.get('limit') || '5'));

      const autoLaunchTest = async () => {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const config = {
            subject: searchParams.get('subject') || undefined,
            limit: parseInt(searchParams.get('limit') || '5', 10),
            min_difficulty_level: searchParams.get('min_diff') ? parseFloat(searchParams.get('min_diff') as string) : undefined,
            max_difficulty_level: searchParams.get('max_diff') ? parseFloat(searchParams.get('max_diff') as string) : undefined,
            topic: searchParams.get('topics') || undefined,
            sub_topic: searchParams.get('sub_topics') || undefined,
            question_type: searchParams.get('question_type') || undefined
          };

          const cleanConfig = Object.fromEntries(
            Object.entries(config).filter(([_, v]) => v !== undefined)
          );

          // 🚀 Uses cleanConfig
          const rawResponse = await generatePracticeTest(cleanConfig);
          
          const questionsMatrix = Array.isArray(rawResponse) 
            ? rawResponse 
            : rawResponse.questions || [];

          const requestedTimeLimit = searchParams.get('time_limit');
          const calculatedTimeInSeconds = requestedTimeLimit
            ? parseInt(requestedTimeLimit, 10) * 60
            : questionsMatrix.length * 120;

          setInitialTimeInSeconds(calculatedTimeInSeconds);

          if (questionsMatrix.length === 0) {
            setErrorMessage("No matching questions discovered inside the vector collection matching these filter keys.");
          } else {
            setTestPayload(questionsMatrix);
          }
        } catch (err: any) {
          setErrorMessage(err.message || "Network execution breakdown...");
        } finally {
          setIsLoading(false);
        }
      };

      autoLaunchTest();
    }
  }, [searchParams]);

  // Fallback trigger if someone visits /test-exam directly without URL parameters
  const triggerTestGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 🚀 FIX: Uses { subject, limit } directly from React state, NOT cleanConfig
      const rawResponse = await generatePracticeTest({ subject, limit });
      
      const questionsMatrix = Array.isArray(rawResponse) 
        ? rawResponse 
        : rawResponse.questions || [];
        
      if (questionsMatrix.length === 0) {
        setErrorMessage("No matching questions discovered...");
      } else {
        setTestPayload(questionsMatrix);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network execution breakdown...");
    } finally {
      setIsLoading(false);
    }
  };

  // Safe Mode: If test data has been successfully initialized, shift view directly into the active player workspace
  if (testPayload) {
    return <ExamEngine initialTestData={testPayload} initialTimeInSeconds={initialTimeInSeconds} />;
  }

  // Render the Fallback / Loading UI
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 text-white">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-8 transition-all">
        
        <div className="text-center mb-8">
          <div className="h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center text-xl font-bold mx-auto mb-3 shadow-md">
            🚀
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isLoading ? "Assembling Exam..." : "CAT Prep Test Generator"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {isLoading 
              ? "Running Semantic Vector Compilation based on your blueprint..." 
              : "Configure vector space parameters to spin up a custom sectional simulation."}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/40 border border-red-700/60 rounded-lg text-sm text-red-200">
            <span className="font-bold">Execution Trap:</span> {errorMessage}
          </div>
        )}

        {/* If it's loading from URL params, hide the form and show a loading spinner */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
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
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-lg active:scale-98 text-sm uppercase tracking-wider flex justify-center items-center"
            >
              Launch Practice Exam Session
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Next.js requires components utilizing useSearchParams to be wrapped in a Suspense boundary
export default function PracticeSessionLauncher() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex justify-center items-center">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <PracticeSessionContent />
    </Suspense>
  );
}