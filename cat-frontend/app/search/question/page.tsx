"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ExamEngine from '@/app/components/ExamEngine';

export default function StandaloneQuestionViewer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const questionId = searchParams.get('id');
  
  const [questionData, setQuestionData] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!questionId) {
      router.push('/search');
      return;
    }

    const fetchQuestion = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/question/${questionId}`);
        const data = await res.json();
        
        if (data.questions && data.questions.length > 0) {
          setQuestionData(data.questions);
        } else {
          console.error("Question not found.");
        }
      } catch (error) {
        console.error("Failed to fetch question:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestion();
  }, [questionId, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500 font-medium">Extracting Question from Knowledge Base...</p>
      </div>
    );
  }

  if (!questionData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl text-gray-500">Failed to load the requested question.</p>
      </div>
    );
  }

    return (
        <div className="min-h-screen bg-gray-50">
        <ExamEngine 
            examData={questionData} // <--- Change testData to examData
            isReviewMode={true} 
            onExit={() => router.push('/search')} 
        />
        </div>
  );
}