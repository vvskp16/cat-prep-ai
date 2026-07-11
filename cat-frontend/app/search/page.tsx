"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MathRenderer from '../components/MathRenderer';

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 1. On Mount: Safely Restore Memory (No API calls triggered here!)
  useEffect(() => {
    const savedRecents = localStorage.getItem("cat_recent_searches");
    if (savedRecents) setRecentSearches(JSON.parse(savedRecents));

    const activeSearch = sessionStorage.getItem("cat_active_search");
    if (activeSearch) {
      try {
        const parsed = JSON.parse(activeSearch);
        if (parsed.query && parsed.results) {
          setQuery(parsed.query);
          setResults(parsed.results);
        }
      } catch (e) {
        console.error("Failed to restore search state", e);
      }
    }
  }, []);

  // 2. Explicit Trigger: Only searches when Enter is pressed
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (query.trim().length > 2) {
        performSearch(query);
      } else if (query.trim().length === 0) {
        handleClear();
      }
    }
  };

  const performSearch = async (searchStr: string) => {
    setIsSearching(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchStr, limit: 12 }) 
      });
      const data = await res.json();
      const fetchedQuestions = data.questions || [];
      
      setResults(fetchedQuestions);

      // SAVE STATE: Backup the successful search to session memory
      sessionStorage.setItem("cat_active_search", JSON.stringify({
        query: searchStr,
        results: fetchedQuestions
      }));

      let newRecents = [searchStr, ...recentSearches.filter(q => q !== searchStr)].slice(0, 3);
      setRecentSearches(newRecents);
      localStorage.setItem("cat_recent_searches", JSON.stringify(newRecents));

    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    sessionStorage.removeItem("cat_active_search"); 
  };

  /// UX EXPERT GROUPING: Maintains exact relevance order from the Backend
  const orderedResults = React.useMemo(() => {
    const layoutQueue: any[] = [];
    const seenSetIds = new Set<string>();

    results.forEach(q => {
      // If it is part of a Set
      if (q.has_parent_context && q.parent_context) {
        const cid = q.parent_context.context_id;
        // Only process this set if we haven't rendered it yet
        if (!seenSetIds.has(cid)) {
          seenSetIds.add(cid);
          
          // Gather all questions belonging to this set from the results
          const siblingQuestions = results.filter(
            rq => rq.has_parent_context && rq.parent_context?.context_id === cid
          );
          
          layoutQueue.push({
            type: 'set',
            context_id: cid,
            context_body: q.parent_context.context_body,
            subject: q.subject,
            topic: q.topic,
            sub_topic: q.sub_topic,
            questions: siblingQuestions
          });
        }
      } 
      // If it is a Standalone Question
      else {
        layoutQueue.push({
          type: 'standalone',
          ...q
        });
      }
    });

    return layoutQueue;
  }, [results]);

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header & Advanced Search Bar */}
        <div className="text-center space-y-4">
          
          <div className="relative max-w-2xl mx-auto">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the problem... (Hit Enter to search)"
              className="w-full pl-12 pr-12 py-4 text-lg border border-gray-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
            />

            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
              {isSearching ? (
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              ) : query.length > 0 ? (
                <button onClick={handleClear} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
          <p className="text-gray-500">E.g., "train problems" or "P&C problems"</p>

          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
              <span>Recent:</span>
              {recentSearches.map((rec, idx) => (
                <button 
                  key={idx} 
                  onClick={() => { 
                    setQuery(rec); 
                    performSearch(rec); // <--- Add this so clicking it instantly searches!
                  }} 
                  className="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                >
                  {rec}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Unified Results Stream (Strict Relevance Order) */}
        <div className="space-y-6">
          
          {orderedResults.map((item: any, index: number) => {
            
            // --- RENDER A SET CARD ---
            if (item.type === 'set') {
              return (
                <div key={`set-${item.context_id}-${index}`} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition hover:shadow-md">
                  <div className="bg-amber-50 px-6 py-3 border-b border-amber-100 flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-900">{item.topic} • {item.sub_topic}</span>
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded bg-amber-200 text-amber-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        Set ({item.questions.length} Q)
                      </span>
                      {/* Subject moved to right */}
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                        item.subject === 'Quant' ? 'bg-blue-100 text-blue-700' :
                        item.subject === 'DILR' ? 'bg-purple-100 text-purple-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {item.subject}
                      </span>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="text-gray-600 text-sm line-clamp-3 mb-4">
                       <MathRenderer content={item.context_body} />
                    </div>
                    {/* Button moved to right and scaled down */}
                    <div className="flex justify-end">
                      <button 
                        onClick={() => router.push(`/search/set?context_id=${item.context_id}`)}
                        className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
                      >
                        View Set
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // --- RENDER A STANDALONE QUESTION CARD ---
            return (
              <div key={`q-${item.id}-${index}`} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition hover:shadow-md">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">{item.topic} &gt; {item.sub_topic}</span>
                  {/* Subject moved to right */}
                  <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    item.subject === 'Quant' ? 'bg-blue-100 text-blue-700' :
                    item.subject === 'DILR' ? 'bg-purple-100 text-purple-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {item.subject}
                  </span>
                </div>
                <div className="p-6">
                  <div className="text-gray-800 text-lg mb-4 line-clamp-2">
                    <MathRenderer content={item.question_text} />
                  </div>
                  {/* Button moved to right and scaled down */}
                  <div className="flex justify-end">
                    <button 
                      onClick={() => router.push(`/search/question?id=${item.id}`)}
                      className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
                    >
                      View
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!isSearching && query.length > 2 && results.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No concepts found. Try refining your search!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}