import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

export const MarkdownMessage = ({ content, className = '' }: MarkdownMessageProps) => {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none 
      prose-headings:text-foreground 
      prose-p:text-foreground/90 
      prose-strong:text-foreground 
      prose-code:text-foreground 
      prose-pre:bg-[#1e1e1e] dark:prose-pre:bg-[#0d1117] 
      prose-pre:border prose-pre:border-border/50
      prose-pre:text-[#d4d4d4] dark:prose-pre:text-[#c9d1d9]
      prose-blockquote:text-foreground/80
      prose-blockquote:border-primary/60 dark:prose-blockquote:border-primary/80
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
      prose-table:bg-card/50
      prose-th:text-foreground prose-td:text-foreground
      ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom styling for tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full divide-y divide-border border border-border rounded-lg bg-card/50">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-secondary/80">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border bg-card/30">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-secondary/30 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-sm text-foreground">
              {children}
            </td>
          ),
          // Code blocks with better dark mode support
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <pre className="bg-[#1e1e1e] dark:bg-[#0d1117] rounded-lg p-4 overflow-x-auto my-4 border border-border/50 shadow-lg">
                <code className={`${className} text-[#d4d4d4] dark:text-[#c9d1d9] font-mono text-sm leading-relaxed`} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-secondary/80 dark:bg-secondary/60 text-foreground px-1.5 py-0.5 rounded text-sm font-mono border border-border/30" {...props}>
                {children}
              </code>
            );
          },
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-4 text-foreground marker:text-foreground/60">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-4 text-foreground marker:text-foreground/60">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-foreground">{children}</li>
          ),
          // Headings
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-foreground mt-6 mb-4">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-foreground mt-5 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-foreground mt-3 mb-2">{children}</h4>
          ),
          // Paragraphs
          p: ({ children }) => (
            <p className="text-foreground/90 mb-3 leading-relaxed">{children}</p>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/60 dark:border-primary/80 bg-secondary/30 dark:bg-secondary/20 pl-4 py-2 italic my-4 text-foreground/80 rounded-r">
              {children}
            </blockquote>
          ),
          // Links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 hover:underline transition-colors"
            >
              {children}
            </a>
          ),
          // Horizontal rule
          hr: () => <hr className="my-6 border-border/50" />,
          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          // Emphasis/Italic
          em: ({ children }) => (
            <em className="italic text-foreground/90">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

