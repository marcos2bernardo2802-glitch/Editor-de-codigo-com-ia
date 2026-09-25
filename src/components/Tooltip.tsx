import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className = '',
  position = 'top',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxWidth: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Trigger is completely out of view
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
      setIsVisible(false);
      return;
    }

    const padding = 10;
    const maxWidth = Math.min(280, vw - padding * 2);
    const tooltipWidth = tooltipRef.current?.offsetWidth || 180;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 36;

    let placement = position;
    if (placement === 'top' && rect.top - tooltipHeight - 6 < padding) {
      placement = 'bottom';
    } else if (placement === 'bottom' && rect.bottom + tooltipHeight + 6 > vh - padding) {
      placement = 'top';
    }

    let top = 0;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    if (placement === 'top') {
      top = rect.top - tooltipHeight - 6;
    } else if (placement === 'bottom') {
      top = rect.bottom + 6;
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - 6;
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + 6;
    }

    // Clamp horizontally
    if (left < padding) left = padding;
    if (left + tooltipWidth > vw - padding) left = vw - padding - tooltipWidth;

    // Clamp vertically
    if (top < padding) top = padding;
    if (top + tooltipHeight > vh - padding) top = vh - padding - tooltipHeight;

    setCoords({ top, left, maxWidth });
  }, [position]);

  useLayoutEffect(() => {
    if (!isVisible) {
      setCoords(null);
      return;
    }
    updatePosition();
    const handleEvents = () => updatePosition();
    window.addEventListener('resize', handleEvents);
    window.addEventListener('scroll', handleEvents, true);
    return () => {
      window.removeEventListener('resize', handleEvents);
      window.removeEventListener('scroll', handleEvents, true);
    };
  }, [isVisible, updatePosition]);

  useEffect(() => {
    if (isVisible) {
      // Re-adjust after measuring actual dimensions
      const raf = requestAnimationFrame(() => {
        updatePosition();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isVisible, updatePosition]);

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      <div
        onClick={() => setIsVisible((prev) => !prev)}
        className="inline-flex items-center"
      >
        {children}
      </div>

      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords ? `${coords.top}px` : '-9999px',
              left: coords ? `${coords.left}px` : '-9999px',
              maxWidth: coords ? `${coords.maxWidth}px` : '280px',
              zIndex: 99999,
              opacity: coords ? 1 : 0,
            }}
            className="pointer-events-none whitespace-normal px-2.5 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] text-[11px] leading-relaxed shadow-xl font-normal select-none transition-opacity duration-100"
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
};

interface InfoTooltipProps {
  text: React.ReactNode;
  ariaLabel?: string;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  ariaLabel = 'Mais informações',
  className = '',
  position = 'top',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; maxWidth: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Se o elemento saiu da tela devido ao scroll da modal
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
      setIsOpen(false);
      return;
    }

    const padding = 12;
    // Permite largura confortável para leitura sem estourar a tela
    const maxWidth = Math.min(320, vw - padding * 2);
    const tooltipWidth = tooltipRef.current?.offsetWidth || 260;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 60;

    let placement = position;
    // Se não couber em cima, posiciona em baixo automaticamente
    if (placement === 'top' && rect.top - tooltipHeight - 8 < padding) {
      placement = 'bottom';
    } else if (placement === 'bottom' && rect.bottom + tooltipHeight + 8 > vh - padding) {
      placement = 'top';
    }

    let top = 0;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    if (placement === 'top') {
      top = rect.top - tooltipHeight - 6;
    } else if (placement === 'bottom') {
      top = rect.bottom + 6;
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - 6;
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + 6;
    }

    // Evita corte nas laterais da janela (esquerda e direita)
    if (left < padding) {
      left = padding;
    } else if (left + tooltipWidth > vw - padding) {
      left = vw - padding - tooltipWidth;
    }

    // Evita corte no topo ou rodapé
    if (top < padding) {
      top = padding;
    } else if (top + tooltipHeight > vh - padding) {
      top = vh - padding - tooltipHeight;
    }

    setCoords({ top, left, maxWidth });
  }, [position]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    updatePosition();
    const handleEvents = () => updatePosition();
    window.addEventListener('resize', handleEvents);
    window.addEventListener('scroll', handleEvents, true);
    return () => {
      window.removeEventListener('resize', handleEvents);
      window.removeEventListener('scroll', handleEvents, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => {
        updatePosition();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <span className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        tabIndex={0}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--text)] focus:text-[var(--accent)] focus:outline-none transition-colors cursor-pointer inline-flex items-center justify-center opacity-75 hover:opacity-100"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords ? `${coords.top}px` : '-9999px',
              left: coords ? `${coords.left}px` : '-9999px',
              maxWidth: coords ? `${coords.maxWidth}px` : '320px',
              zIndex: 99999,
              opacity: coords ? 1 : 0,
            }}
            className="pointer-events-none whitespace-normal px-3 py-2 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] text-[11.5px] leading-relaxed shadow-xl font-normal select-none transition-opacity duration-100"
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
};
