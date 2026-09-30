import { useState, useRef, useEffect, useCallback } from 'react';

export function useResizablePanels(defaultWidth = 420, minWidth = 280, maxWidthLimit = 1200) {
  const [chatWidth, setChatWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('genia_chat_panel_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidthLimit) {
          return parsed;
        }
      }
    } catch {}
    return defaultWidth;
  });

  const [isDraggingChatWidth, setIsDraggingChatWidth] = useState<boolean>(false);
  const mainContainerRef = useRef<HTMLElement>(null);

  // Handle dragging resize between Code Editor and AI Chat
  const handleStartResizeChat = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingChatWidth(true);
  }, []);

  const handleResetChatWidth = useCallback(() => {
    setChatWidth(defaultWidth);
  }, [defaultWidth]);

  useEffect(() => {
    if (!isDraggingChatWidth) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mainContainerRef.current) return;
      const rect = mainContainerRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      const maxWidth = Math.max(minWidth, rect.width - 320);
      const clamped = Math.min(Math.max(newWidth, minWidth), maxWidth);
      setChatWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingChatWidth(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingChatWidth, minWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('genia_chat_panel_width', chatWidth.toString());
    } catch {}
  }, [chatWidth]);

  return {
    chatWidth,
    setChatWidth,
    isDraggingChatWidth,
    mainContainerRef,
    handleStartResizeChat,
    handleResetChatWidth,
  };
}
