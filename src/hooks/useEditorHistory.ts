import { useState, useCallback } from 'react';

export function useEditorHistory(initialCode: string) {
  const [history, setHistory] = useState<string[]>([initialCode]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const pushHistory = useCallback(
    (newCode: string) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const updated = [...sliced, newCode];
        if (updated.length > 40) updated.shift();
        return updated;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 39));
    },
    [historyIndex]
  );

  const resetHistory = useCallback((initial: string) => {
    setHistory([initial]);
    setHistoryIndex(0);
  }, []);

  return {
    history,
    setHistory,
    historyIndex,
    setHistoryIndex,
    pushHistory,
    resetHistory,
  };
}
