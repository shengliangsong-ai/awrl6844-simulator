import React, { useState } from 'react';
import { 
  MonitorDown, 
  X, 
  ExternalLink, 
  Copy, 
  Check, 
  HardDrive, 
  WifiOff, 
  Layers, 
  Laptop, 
  Apple, 
  Share2, 
  Sparkles 
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface DesktopInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DesktopInstallModal: React.FC<DesktopInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, isMac, isIframe, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'desktop' | 'mac' | 'mobile'>(
    isIOS ? 'mobile' : isMac ? 'mac' : 'desktop'
  );
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    const success = await install();
    if (success) {
      setInstallSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    }
  };

  const handleOpenTopLevel = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      id="desktop-install-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div 
        id="desktop-install-dialog"
        className="w-full max-w-xl rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-200 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <MonitorDown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Install as Desktop App</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  PWA Standalone
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Run AWRL6844 Radar Toolkit with native window controls and offline caching
              </p>
            </div>
          </div>
          <button
            id="close-desktop-install-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Already Installed Alert */}
        {isInstalled && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
            <Check className="w-4 h-4 shrink-0" />
            <span>This app is currently running in desktop standalone mode. All features and offline assets are active.</span>
          </div>
        )}

        {/* Primary Action Section */}
        <div className="bg-slate-950/70 rounded-lg p-4 border border-slate-800 flex flex-col gap-3">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Direct Installation Action</span>
          </div>

          {installSuccess ? (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-emerald-400 font-semibold">
              <Check className="w-5 h-5" /> Installed successfully! Opening desktop window...
            </div>
          ) : isInstallable ? (
            <button
              id="trigger-native-install-btn"
              onClick={handleNativeInstall}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium text-sm text-white shadow-lg transition"
            >
              <MonitorDown className="w-4 h-4" />
              <span>Install to Desktop Now</span>
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              {isIframe ? (
                <div className="text-xs text-slate-400 leading-relaxed">
                  Web browsers require installation prompts to originate from a top-level tab rather than an embedded preview iframe.
                </div>
              ) : (
                <div className="text-xs text-slate-400 leading-relaxed">
                  Click below to open the application directly, or follow the browser-specific steps to install to your desktop taskbar or dock.
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  id="open-toplevel-install-btn"
                  onClick={handleOpenTopLevel}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Full Tab to Install</span>
                </button>
                <button
                  id="copy-app-link-btn"
                  onClick={handleCopyLink}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy URL'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Browser Guidance Tabs */}
        <div>
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
            <button
              onClick={() => setActiveTab('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'desktop' 
                  ? 'bg-slate-800 text-indigo-400 border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Chrome / Edge / Windows / Linux</span>
            </button>
            <button
              onClick={() => setActiveTab('mac')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'mac' 
                  ? 'bg-slate-800 text-indigo-400 border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Apple className="w-3.5 h-3.5" />
              <span>macOS (Safari / Chrome)</span>
            </button>
            <button
              onClick={() => setActiveTab('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'mobile' 
                  ? 'bg-slate-800 text-indigo-400 border border-slate-700' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>iOS / Mobile</span>
            </button>
          </div>

          {activeTab === 'desktop' && (
            <div className="text-xs text-slate-300 space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
              <div className="font-semibold text-white mb-1">In Google Chrome, Microsoft Edge, or Brave:</div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>Open this application in a top-level browser tab.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span>Look at the right side of the address bar for the <strong>Install icon</strong> (computer monitor with download arrow).</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                <span>Alternatively, click the browser menu (<strong>⋮</strong>) &rarr; <strong>Cast, save, and share</strong> (or <strong>Apps</strong>) &rarr; <strong>Install AWRL6844 Simulator</strong>.</span>
              </div>
            </div>
          )}

          {activeTab === 'mac' && (
            <div className="text-xs text-slate-300 space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
              <div className="font-semibold text-white mb-1">On macOS with Safari (Sonoma+) or Chrome:</div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>In Safari, click <strong>File</strong> in the top menu bar.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span>Select <strong>Add to Dock...</strong>, configure name, and click <strong>Add</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                <span>The app will now launch directly from your macOS Dock or Spotlight search as a standalone app!</span>
              </div>
            </div>
          )}

          {activeTab === 'mobile' && (
            <div className="text-xs text-slate-300 space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
              <div className="font-semibold text-white mb-1">On iOS (iPhone / iPad):</div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>Tap the <strong>Share</strong> button in the Safari toolbar.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
              </div>
            </div>
          )}
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 mb-1">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline Ready</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Register maps, docs, and simulation models cached locally.
            </p>
          </div>
          <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 mb-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Dedicated Window</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Zero browser tab clutter with full screen and multi-monitor layouts.
            </p>
          </div>
          <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Fast Hardware I/O</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Direct WebSerial / UART live debugging from your desktop environment.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-800 pt-3">
          <button
            id="dismiss-desktop-install-btn"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
