// app/components/MathRenderer.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// CRITICAL: You must import the KaTeX CSS for the math to render correctly!
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

export default function MathRenderer({ content, className = "" }: MathRendererProps) {
  return (
    <div className={`prose dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Optional: Add custom styling to standard markdown tables for DILR caselets
          table: ({node, ...props}) => <table className="min-w-full divide-y divide-gray-200 border" {...props} />,
          th: ({node, ...props}) => <th className="bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border" {...props} />,
          td: ({node, ...props}) => <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}