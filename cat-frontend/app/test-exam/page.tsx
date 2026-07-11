'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense, useRef } from 'react';
import ExamEngine, { Question } from '../components/ExamEngine';
import { generatePracticeTest } from '../lib/api';

function TestExamContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [testPayload, setTestPayload] = useState<Question[] | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Ref lock to prevent React Strict Mode from firing this twice
  const hasFetched = useRef(false);

  useEffect(() => {
    // Abort if we have already made the API call
    if (hasFetched.current) return;
    
    async function initTest() {
      const subject = searchParams.get('subject');
      
      // Strict Routing: If no subject is passed, bounce them back to Create Test
      if (!subject) {
        router.replace('/');
        return;
      }

      // Lock the fetch so it doesn't trigger again
      hasFetched.current = true;

      try {
        const limit = parseInt(searchParams.get('limit') || '5');
        
        // Match the backend Pydantic Schema exactly
        const cleanConfig: any = {
          subject,
          limit,
          min_difficulty_level: parseFloat(searchParams.get('min_diff') || '1.0'),
          max_difficulty_level: parseFloat(searchParams.get('max_diff') || '10.0')
        };

        // Extract topics (handle if URL uses 'topics' or 'topic')
        const topic = searchParams.get('topics') || searchParams.get('topic');
        if (topic) cleanConfig.topic = topic;

        const sub_topic = searchParams.get('sub_topics') || searchParams.get('sub_topic');
        if (sub_topic) cleanConfig.sub_topic = sub_topic;

        // Extract Advanced Filters and append them to payload
        const sort = searchParams.get('sort');
        if (sort) cleanConfig.sort = sort;

        const questionType = searchParams.get('question_type');
        if (questionType) cleanConfig.question_type = questionType;

        const trapType = searchParams.get('trap_type');
        if (trapType) cleanConfig.trap_type = trapType;

        const calcIntensity = searchParams.get('calculation_intensity');
        if (calcIntensity) cleanConfig.calculation_intensity = calcIntensity;

        const rawResponse = await generatePracticeTest(cleanConfig);
        if (rawResponse?.questions) {
          setTestPayload(rawResponse.questions);
        } else {
          setTestPayload(rawResponse as unknown as Question[]);
        }
      } catch (error) {
        console.error("Failed to generate practice test:", error);
      } finally {
        setLoading(false);
      }
    }

    initTest();
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 flex-col gap-6">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <h2 className="text-2xl font-bold text-gray-700 animate-pulse">Assembling Practice Blueprint...</h2>
        <p className="text-gray-500">Vector search engine is isolating your target questions.</p>
      </div>
    );
  }

  if (!testPayload || testPayload.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-center">
           <h2 className="text-xl font-bold text-red-600 mb-2">No Questions Found</h2>
           <p className="text-gray-600 mb-6">Could not find questions matching your exact filters.</p>
           <button onClick={() => router.replace('/')} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">
             Return to Create Test
           </button>
        </div>
      </div>
    );
  }

  const timeLimitParam = searchParams.get('time_limit');
  const timerSeconds = timeLimitParam ? parseInt(timeLimitParam) * 60 : testPayload.length * 120;
  
  // Extract Sequential Flag
  const isSequential = searchParams.get('sequential') === 'true';

  return (
    <ExamEngine 
      initialTestData={testPayload} 
      initialTimeInSeconds={timerSeconds}
      isSequential={isSequential} 
    />
  );
}

// Next.js requires useSearchParams to be wrapped in a suspense boundary
export default function TestExamPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <TestExamContent />
    </Suspense>
  );
}