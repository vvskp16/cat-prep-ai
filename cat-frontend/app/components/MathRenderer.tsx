// app/components/MathRenderer.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks'; 
import rehypeKatex from 'rehype-katex';

// CRITICAL: You must import the KaTeX CSS for the math to render correctly!
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

export default function MathRenderer({ content, className = "" }: MathRendererProps) {
  // Safety check in case content is undefined
  const safeContent = content || "";

  return (
    <div className={`prose dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkBreaks]} 
        rehypePlugins={[rehypeKatex]}
        components={{
          // 1. ADD THESE OVERRIDES to force Tailwind to render list numbers and bullets
          ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-2" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,

          // 2. Your existing table overrides
          table: ({node, ...props}) => <table className="min-w-full divide-y divide-gray-200 border my-4" {...props} />,
          th: ({node, ...props}) => <th className="bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border" {...props} />,
          td: ({node, ...props}) => <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border" {...props} />
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}