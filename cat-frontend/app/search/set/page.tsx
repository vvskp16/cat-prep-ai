"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ExamEngine from '@/app/components/ExamEngine';

export default function SetViewerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const contextId = searchParams.get('context_id');
  
  const [setData, setSetData] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!contextId) {
      router.push('/search');
      return;
    }

    const fetchFullSet = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/set/${contextId}`);
        const data = await res.json();
        
        if (data.questions && data.questions.length > 0) {
          setSetData(data.questions);
        } else {
          console.error("No questions found for this set.");
        }
      } catch (error) {
        console.error("Failed to fetch set:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFullSet();
  }, [contextId, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-500 font-medium">Extracting Full Set from Knowledge Base...</p>
      </div>
    );
  }

  if (!setData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl text-gray-500">Failed to load the requested set.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ExamEngine 
        examData={setData} // <--- Change testData to examData
        isReviewMode={true} 
        onExit={() => router.push('/search')} 
      />
    </div>
  );
}