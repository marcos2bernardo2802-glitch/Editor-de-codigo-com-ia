import React from 'react';
import { UploadCloud, FolderArchive, FileCode } from 'lucide-react';

interface DropzoneOverlayProps {
  isVisible: boolean;
}

export const DropzoneOverlay: React.FC<DropzoneOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-[var(--bg)]/85 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-none select-none">
      <div className="w-full max-w-lg p-8 rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--panel)]/90 shadow-2xl flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center mb-4 text-[var(--accent)] animate-bounce">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-base font-bold text-[var(--text)] mb-2">
          Solte para importar para o Workspace
        </h3>

        <p className="text-xs text-[var(--muted)] max-w-sm mb-4 leading-relaxed">
          Arraste e solte um arquivo <strong className="text-[var(--text)]">.zip</strong> ou pastas e arquivos de código inteiros para importar seu projeto.
        </p>

        <div className="flex items-center gap-3 text-[11px] text-[var(--muted)] bg-[var(--panel-2)] px-3 py-1.5 rounded-full border border-[var(--border)] font-medium">
          <span className="flex items-center gap-1 text-[var(--accent)]">
            <FolderArchive className="w-3.5 h-3.5" /> Arquivos .zip
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-[var(--accent)]">
            <FileCode className="w-3.5 h-3.5" /> Pastas & Arquivos de Código
          </span>
        </div>
      </div>
    </div>
  );
};
