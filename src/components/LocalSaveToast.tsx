import React from 'react';

export interface LocalSaveToastData {
  type: 'success' | 'error';
  message: string;
}

interface LocalSaveToastProps {
  toast: LocalSaveToastData | null;
}

export const LocalSaveToast: React.FC<LocalSaveToastProps> = ({ toast }) => {
  if (!toast) return null;

  return (
    <div
      id="localSaveToast"
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-150 ${
        toast.type === 'success'
          ? 'bg-[var(--panel)] border-emerald-500/40 text-[var(--text)]'
          : 'bg-[var(--panel)] border-[var(--rem)]/40 text-[var(--rem)]'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          toast.type === 'success' ? 'bg-emerald-400' : 'bg-[var(--rem)]'
        }`}
      />
      <span>{toast.message}</span>
    </div>
  );
};
