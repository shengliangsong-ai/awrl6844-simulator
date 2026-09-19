import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div 
      id="offline-status-banner"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600/90 backdrop-blur-xs border border-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-100 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
      <span>Offline Mode — Cached radar simulator & register maps active</span>
    </div>
  );
};
