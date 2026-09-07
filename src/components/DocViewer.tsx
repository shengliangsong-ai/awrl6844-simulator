import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Book, X, ChevronRight, FileText } from 'lucide-react';

const docsModules = import.meta.glob('/doc/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export const DocViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (paths.length > 0) {
        setActiveDoc(paths[0].split('/').pop() || null);
      }
      setLoading(false);
    };

    loadDocs();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="w-full max-w-6xl h-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 text-slate-200">
            <Book className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold tracking-wide">Simulator Documentation</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-800 bg-slate-900/30 overflow-y-auto hidden md:block shrink-0">
            <div className="p-4 space-y-1">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Available Documents</h3>
              {Object.keys(docs).sort().map(filename => (
                <button
                  key={filename}
                  onClick={() => setActiveDoc(filename)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                    activeDoc === filename 
                      ? 'bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">{filename.replace('.md', '')}</span>
                  {activeDoc === filename && <ChevronRight className="w-4 h-4 ml-auto shrink-0" />}
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
              <div className="prose prose-invert prose-slate max-w-none prose-headings:text-slate-200 prose-a:text-indigo-400 prose-code:text-indigo-300 prose-code:bg-indigo-950/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                <Markdown>{docs[activeDoc]}</Markdown>
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
