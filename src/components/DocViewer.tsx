import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Book, X, ChevronRight, FileText, Search } from 'lucide-react';
import { MermaidDiagram } from './MermaidDiagram';

const docsModules = import.meta.glob(['/doc/*.md', '/docs/*.md'], { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export const DocViewer: React.FC<{ onClose: () => void; initialDoc?: string }> = ({ onClose, initialDoc }) => {
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadDocs = async () => {
      const loadedDocs: Record<string, string> = {};
      const paths = Object.keys(docsModules);
      
      for (const path of paths) {
        // Extract filename from path (e.g. '/doc/awrl6844-prompts.md' -> 'awrl6844-prompts.md')
        const filename = path.split('/').pop() || path;
        try {
          const content = await docsModules[path]();
          loadedDocs[filename] = content;
        } catch (e) {
          console.error(`Failed to load doc: ${path}`, e);
        }
      }
      
      setDocs(loadedDocs);
      
      if (initialDoc && loadedDocs[initialDoc]) {
        setActiveDoc(initialDoc);
      } else if (paths.length > 0) {
        // Default to dsp-pipeline-specification if available, otherwise first
        const defaultDoc = loadedDocs['dsp-pipeline-specification.md'] 
          ? 'dsp-pipeline-specification.md' 
          : (paths[0].split('/').pop() || null);
        setActiveDoc(defaultDoc);
      }
      setLoading(false);
    };

    loadDocs();
  }, [initialDoc]);

  const filteredDocs = Object.keys(docs)
    .sort((a, b) => {
      // Prioritize dsp-pipeline-specification.md near the top
      if (a.includes('dsp-pipeline')) return -1;
      if (b.includes('dsp-pipeline')) return 1;
      return a.localeCompare(b);
    })
    .filter(filename => filename.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="w-full max-w-6xl h-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 text-slate-200">
            <Book className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold tracking-wide">Simulator Documentation</h2>
            <span className="hidden sm:inline-block text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
              TI AWRL6844 / AWRL6888 TRM
            </span>
          </div>
          <button 
            id="close-docs-viewer-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r border-slate-800 bg-slate-900/40 overflow-y-auto hidden md:flex md:flex-col shrink-0">
            {/* Search filter */}
            <div className="p-3 border-b border-slate-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="p-3 space-y-1 flex-1 overflow-y-auto">
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                Available Documents ({filteredDocs.length})
              </h3>
              {filteredDocs.map(filename => (
                <button
                  key={filename}
                  onClick={() => setActiveDoc(filename)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                    activeDoc === filename 
                      ? 'bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/30 shadow-xs' 
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{filename.replace('.md', '')}</span>
                  {activeDoc === filename && <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0 text-indigo-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-10 relative">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                Loading documentation...
              </div>
            ) : activeDoc && docs[activeDoc] ? (
              <div className="prose prose-invert prose-slate max-w-none 
                prose-headings:text-slate-200 
                prose-a:text-indigo-400 
                prose-code:text-indigo-300 
                prose-code:bg-indigo-950/40 
                prose-code:px-1.5 
                prose-code:py-0.5 
                prose-code:rounded 
                prose-code:before:content-none 
                prose-code:after:content-none
                prose-table:w-full 
                prose-table:border-collapse 
                prose-table:text-xs 
                prose-table:my-6
                prose-th:bg-slate-900 
                prose-th:text-slate-200 
                prose-th:border 
                prose-th:border-slate-800 
                prose-th:p-2.5 
                prose-th:font-semibold
                prose-td:border 
                prose-td:border-slate-800/80 
                prose-td:p-2.5 
                prose-td:text-slate-300">
                <Markdown 
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const lang = match ? match[1] : '';
                      const codeString = String(children).replace(/\n$/, '');

                      if (lang === 'mermaid') {
                        return <MermaidDiagram chart={codeString} />;
                      }

                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {docs[activeDoc]}
                </Markdown>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Select a document to view.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

