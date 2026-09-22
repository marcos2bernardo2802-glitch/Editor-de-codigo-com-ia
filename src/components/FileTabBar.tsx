import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, FileCode, FileText, Check, Edit2 } from 'lucide-react';
import { ProjectFile, SupportedLanguage } from '../types';
import { detectLanguageFromName, getDefaultFileContent } from '../utils/workspace';

interface FileTabBarProps {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onAddFile: (name: string, language: SupportedLanguage, initialContent?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
}

export const FileTabBar: React.FC<FileTabBarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onRenameFile,
}) => {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingFileId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingFileId]);

  const handleConfirmAdd = () => {
    const trimmed = newFileName.trim();
    if (!trimmed) {
      setIsAdding(false);
      return;
    }

    // Ensure extension
    let finalName = trimmed;
    if (!finalName.includes('.')) {
      finalName += '.js';
    }

    // Avoid duplicate names
    let counter = 1;
    let uniqueName = finalName;
    while (files.some((f) => f.name.toLowerCase() === uniqueName.toLowerCase())) {
      const parts = finalName.split('.');
      const ext = parts.pop();
      uniqueName = `${parts.join('.')}_${counter}.${ext}`;
      counter++;
    }

    const lang = detectLanguageFromName(uniqueName);
    const content = getDefaultFileContent(uniqueName, lang);
    onAddFile(uniqueName, lang, content);
    setNewFileName('');
    setIsAdding(false);
  };

  const handleConfirmRename = () => {
    if (!editingFileId) return;
    const trimmed = editingFileName.trim();
    if (trimmed) {
      onRenameFile(editingFileId, trimmed);
    }
    setEditingFileId(null);
  };

  const getFileBadge = (lang: SupportedLanguage) => {
    switch (lang) {
      case 'html':
        return <span className="text-[10px] font-bold text-orange-400">HTML</span>;
      case 'css':
        return <span className="text-[10px] font-bold text-blue-400">CSS</span>;
      case 'javascript':
        return <span className="text-[10px] font-bold text-yellow-400">JS</span>;
      case 'typescript':
        return <span className="text-[10px] font-bold text-sky-400">TS</span>;
      case 'python':
        return <span className="text-[10px] font-bold text-emerald-400">PY</span>;
      case 'json':
        return <span className="text-[10px] font-bold text-amber-400">JSON</span>;
      default:
        return <FileCode className="w-3 h-3 text-[var(--muted)]" />;
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 pt-1 bg-[var(--panel-2)] border-b border-[var(--border)] overflow-x-auto no-scrollbar shrink-0 select-none">
      {/* File Tabs */}
      {files.map((file) => {
        const isActive = file.id === activeFileId;
        const isEditing = file.id === editingFileId;

        return (
          <div
            key={file.id}
            onClick={() => !isEditing && onSelectFile(file.id)}
            onDoubleClick={() => {
              setEditingFileId(file.id);
              setEditingFileName(file.name);
            }}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-lg border-t border-x transition-colors cursor-pointer shrink-0 max-w-[180px] ${
              isActive
                ? 'bg-[var(--bg)] text-[var(--text)] border-[var(--border)] font-medium -mb-px pb-2'
                : 'bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)] border-transparent'
            }`}
          >
            {getFileBadge(file.language)}

            {isEditing ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={editInputRef}
                  value={editingFileName}
                  onChange={(e) => setEditingFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename();
                    if (e.key === 'Escape') setEditingFileId(null);
                  }}
                  onBlur={handleConfirmRename}
                  className="w-20 px-1 py-0.5 bg-[var(--panel)] border border-[var(--accent)] rounded text-xs text-[var(--text)] focus:outline-none"
                />
                <button
                  onClick={handleConfirmRename}
                  className="text-[var(--accent)] hover:opacity-80 p-0.5"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="truncate text-[11px]" title={`${file.name} (Clique duplo para renomear)`}>
                {file.name}
              </span>
            )}

            {/* Quick Rename hover action */}
            {!isEditing && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFileId(file.id);
                  setEditingFileName(file.name);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--muted)] hover:text-[var(--text)] transition-opacity"
                title="Renomear arquivo"
              >
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            )}

            {/* Close tab button (only if more than 1 file exists) */}
            {files.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--rem)] hover:bg-[var(--panel-2)] transition-colors opacity-70 hover:opacity-100"
                title={`Fechar ${file.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add File Inline Input or Button */}
      {isAdding ? (
        <div className="flex items-center gap-1 px-2 py-1 bg-[var(--panel)] rounded-md border border-[var(--accent)] shrink-0">
          <FileText className="w-3 h-3 text-[var(--accent)]" />
          <input
            ref={addInputRef}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmAdd();
              if (e.key === 'Escape') setIsAdding(false);
            }}
            placeholder="ex: app.js ou style.css"
            className="w-32 bg-transparent text-xs text-[var(--text)] focus:outline-none placeholder:text-[var(--muted)]/60"
          />
          <button
            onClick={handleConfirmAdd}
            className="p-1 text-[var(--accent)] hover:opacity-80"
            title="Criar arquivo"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsAdding(false)}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)]"
            title="Cancelar"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          id="btnAddFile"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)] transition-colors cursor-pointer shrink-0 ml-1"
          title="Adicionar novo arquivo ao projeto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="text-[11px]">Novo Arquivo</span>
        </button>
      )}
    </div>
  );
};
