import React, { useState } from 'react';
import { MonitorDown, Check, Download, Info } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DesktopInstallModal } from './DesktopInstallModal';

export const DesktopInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If running in standalone desktop mode
  if (isInstalled) {
    return (
      <>
        <button
          id="desktop-app-active-badge"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition"
          title="Running in Desktop App Mode (Click for details)"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Desktop App</span>
        </button>
        <DesktopInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  const handleClick = async () => {
    // If the browser already has the native prompt ready, attempt direct install
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        // If user cancelled or prompt couldn't complete, open modal with instructions
        setIsModalOpen(true);
      }
    } else {
      // If prompt not yet available or in iframe, open the guided modal
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <button
        id="install-desktop-app-btn"
        onClick={handleClick}
        className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-600/20 hover:bg-indigo-600/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:text-white transition shadow-xs"
        title="Install AWRL6844 Simulator as Desktop Application"
      >
        <MonitorDown className="w-3.5 h-3.5 text-indigo-400" />
        <span>Install as Desktop App</span>
      </button>

      <DesktopInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
