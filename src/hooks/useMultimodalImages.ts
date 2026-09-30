import { useState, useCallback } from 'react';
import { ChatImageAttachment, ChatMessage } from '../types';
import { processImageFiles } from '../utils/imageResize';

interface UseMultimodalImagesOptions {
  onNotifyMessage?: (msg: ChatMessage) => void;
}

export function useMultimodalImages(options: UseMultimodalImagesOptions = {}) {
  const { onNotifyMessage } = options;
  const [attachedImages, setAttachedImages] = useState<ChatImageAttachment[]>([]);
  const [isAnalyzingVision, setIsAnalyzingVision] = useState<boolean>(false);

  const handleAddImages = useCallback(async (newFiles: File[]) => {
    try {
      const result = await processImageFiles(newFiles, attachedImages);
      if (result.added.length > 0) {
        setAttachedImages((prev) => [...prev, ...result.added]);
      }
      if (result.warning && onNotifyMessage) {
        onNotifyMessage({
          id: `warn-${Date.now()}`,
          type: 'error',
          text: result.warning,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      if (onNotifyMessage) {
        onNotifyMessage({
          id: `err-${Date.now()}`,
          type: 'error',
          text: `Erro ao processar imagem: ${err.message}`,
          timestamp: Date.now(),
        });
      }
    }
  }, [attachedImages, onNotifyMessage]);

  const handleRemoveImage = useCallback((id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages([]);
  }, []);

  return {
    attachedImages,
    setAttachedImages,
    isAnalyzingVision,
    setIsAnalyzingVision,
    handleAddImages,
    handleRemoveImage,
    clearImages,
  };
}
