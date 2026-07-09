"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import MathRenderer from '../components/MathRenderer';

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cat_recent_searches");
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.trim().length > 2) {
      performSearch(debouncedQuery);
    } else {
      setResults([]);
    }
  }, [debouncedQuery]);

  const performSearch = async (searchStr: string) => {
    setIsSearching(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchStr, limit: 12 }) // Increased limit to grab full sets
      });
      const data = await res.json();
      setResults(data.questions || []);

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
    setDebouncedQuery("");
    setResults([]);
  };

  // UX EXPERT GROUPING LOGIC: Separates Standalones from Sets to prevent UI repetition
  const groupedResults = useMemo(() => {
    const setsMap: Record<string, any> = {};
    const standalones: any[] = [];

    results.forEach(q => {
      if (q.has_parent_context && q.parent_context) {
        const cid = q.parent_context.context_id;
        if (!setsMap[cid]) {
          setsMap[cid] = {
            context_id: cid,
            context_body: q.parent_context.context_body,
            subject: q.subject,
            topic: q.topic,
            sub_topic: q.sub_topic,
            questions: []
          };
        }
        setsMap[cid].questions.push(q);
      } else {
        standalones.push(q);
      }
    });

    return {
      sets: Object.values(setsMap),
      standalones: standalones
    };
  }, [results]);

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header & Advanced Search Bar with Icons */}
        <div className="text-center space-y-4">
          <p className="text-gray-500">Search conceptually. E.g., "train crossing bridge" or "circular arrangement"</p>
          
          <div className="relative max-w-2xl mx-auto">
            {/* Search Icon */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe the problem..."
              className="w-full pl-12 pr-12 py-4 text-lg border border-gray-200 rounded-2xl shadow-sm focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white"
            />

            {/* Clear Icon / Loader */}
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

          {/* Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
              <span>Recent:</span>
              {recentSearches.map((rec, idx) => (
                <button key={idx} onClick={() => setQuery(rec)} className="px-3 py-1 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                  {rec}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results Stream */}
        <div className="space-y-6">
          
          {/* Render Full Set Collections */}
          {groupedResults.sets.map((set: any) => (
            <div key={set.context_id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition hover:shadow-md">
              <div className="bg-amber-50 px-6 py-3 border-b border-amber-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-amber-200 text-amber-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                    </svg>
                    Data Set ({set.questions.length} Questions)
                  </span>
                  <span className="text-sm font-medium text-amber-900">{set.subject} • {set.topic}</span>
                </div>
              </div>
              <div className="p-6">
                <div className="text-gray-600 text-sm line-clamp-3 mb-4">
                   <MathRenderer content={set.context_body} />
                </div>
                <button 
                  onClick={() => router.push(`/search/set?context_id=${set.context_id}`)}
                  className="w-full py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  View Interactive Set
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {/* Render Standalone Questions */}
          {groupedResults.standalones.map((q: any) => (
            <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition hover:shadow-md">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    q.subject === 'Quant' ? 'bg-blue-100 text-blue-700' :
                    q.subject === 'DILR' ? 'bg-purple-100 text-purple-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {q.subject}
                  </span>
                  <span className="text-sm font-medium text-gray-600">{q.topic} &gt; {q.sub_topic}</span>
                </div>
                <span className="text-xs font-mono text-gray-400">{q.id}</span>
              </div>
              <div className="p-6">
                <div className="text-gray-800 text-lg mb-4 line-clamp-2">
                  <MathRenderer content={q.question_text} />
                </div>
                <button 
                  onClick={() => router.push(`/search/question?id=${q.id}`)}
                  className="w-full py-3 bg-gray-100 text-gray-900 border border-gray-200 font-medium rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  View Question & Solution
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

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