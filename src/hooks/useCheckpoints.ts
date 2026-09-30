import { useState, useCallback } from 'react';
import { VersionCheckpoint } from '../types';
import { CODE_TEMPLATES } from '../utils/templates';

export function useCheckpoints() {
  const [checkpoints, setCheckpoints] = useState<VersionCheckpoint[]>(() => [
    {
      id: 'cp-init',
      timestamp: Date.now(),
      description: 'Versão inicial do código',
      code: CODE_TEMPLATES[0].code,
      source: 'user',
      fileName: 'index.html',
    },
  ]);

  const addCheckpoint = useCallback(
    (data: Omit<VersionCheckpoint, 'id' | 'timestamp'>) => {
      const newCp: VersionCheckpoint = {
        id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        ...data,
      };
      setCheckpoints((prev) => [...prev.slice(-30), newCp]);
    },
    []
  );

  return {
    checkpoints,
    setCheckpoints,
    addCheckpoint,
  };
}
