import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileCode,
  FileText,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Layers,
  FolderPlus,
} from 'lucide-react';
import { ProjectFile, SupportedLanguage } from '../types';
import { FileTreeNode, buildFileTree } from '../utils/fileTree';
import {
  detectLanguageFromName,
  getDefaultFileContent,
  normalizeFilePath,
  extractFileNameFromPath,
} from '../utils/workspace';

interface FileTreeExplorerProps {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onAddFile: (pathOrName: string, language: SupportedLanguage, initialContent?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newPathOrName: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const FileTreeExplorer: React.FC<FileTreeExplorerProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile,
  onRenameFile,
  isOpen,
  onToggleOpen,
}) => {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newFilePath, setNewFilePath] = useState<string>('');
  const [targetFolderForAdd, setTargetFolderForAdd] = useState<string>('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string>('');

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const treeNodes = React.useMemo(() => {
    return buildFileTree(files);
  }, [files]);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const handleStartAddInFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetFolderForAdd(folderPath);
    setNewFilePath('');
    setIsAdding(true);
    // Ensure parent folder is open
    setCollapsedFolders((prev) => ({ ...prev, [folderPath]: false }));
  };

  const handleConfirmAdd = () => {
    const raw = newFilePath.trim();
    if (!raw) {
      setIsAdding(false);
      return;
    }

    let fullPath = targetFolderForAdd
      ? `${targetFolderForAdd}/${raw}`
      : raw;

    fullPath = normalizeFilePath(fullPath);

    // If no extension, add .js
    if (!extractFileNameFromPath(fullPath).includes('.')) {
      fullPath += '.js';
    }

    // Avoid duplicate paths
    let uniquePath = fullPath;
    let counter = 1;
    while (files.some((f) => normalizeFilePath(f.path || f.name).toLowerCase() === uniquePath.toLowerCase())) {
      const parts = fullPath.split('.');
      const ext = parts.pop();
      uniquePath = `${parts.join('.')}_${counter}.${ext}`;
      counter++;
    }

    const fileName = extractFileNameFromPath(uniquePath);
    const lang = detectLanguageFromName(fileName);
    const content = getDefaultFileContent(fileName, lang);

    onAddFile(uniquePath, lang, content);
    setNewFilePath('');
    setIsAdding(false);
    setTargetFolderForAdd('');
  };

  const handleConfirmRename = (file: ProjectFile) => {
    if (!editingNodeId) return;
    const trimmed = editingPath.trim();
    if (trimmed && trimmed !== (file.path || file.name)) {
      onRenameFile(file.id, trimmed);
    }
    setEditingNodeId(null);
  };

  const getLanguageIcon = (lang: SupportedLanguage, name: string) => {
    switch (lang) {
      case 'html':
        return <span className="text-[10px] font-bold text-orange-400 shrink-0">HTML</span>;
      case 'css':
        return <span className="text-[10px] font-bold text-blue-400 shrink-0">CSS</span>;
      case 'javascript':
        return <span className="text-[10px] font-bold text-yellow-400 shrink-0">JS</span>;
      case 'typescript':
        return <span className="text-[10px] font-bold text-sky-400 shrink-0">TS</span>;
      case 'python':
        return <span className="text-[10px] font-bold text-emerald-400 shrink-0">PY</span>;
      case 'json':
        return <span className="text-[10px] font-bold text-amber-400 shrink-0">JSON</span>;
      case 'markdown':
        return <span className="text-[10px] font-bold text-purple-400 shrink-0">MD</span>;
      default:
        return <FileCode className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />;
    }
  };

  const renderNode = (node: FileTreeNode, depth = 0) => {
    const isCollapsed = collapsedFolders[node.path];

    if (node.isFolder) {
      return (
        <div key={node.id} className="select-none">
          <div
            onClick={(e) => toggleFolder(node.path, e)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="group flex items-center justify-between pr-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] rounded cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="shrink-0 text-[var(--muted)] group-hover:text-[var(--text)]">
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </span>
              <span className="shrink-0 text-[var(--accent)]">
                {isCollapsed ? (
                  <Folder className="w-3.5 h-3.5" />
                ) : (
                  <FolderOpen className="w-3.5 h-3.5" />
                )}
              </span>
              <span className="truncate font-medium text-[11px] text-[var(--text)]">
                {node.name}
              </span>
            </div>

            {/* Folder Actions */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleStartAddInFolder(node.path, e)}
                className="p-1 hover:text-[var(--accent)] text-[var(--muted)] hover:bg-[var(--panel)] rounded"
                title={`Adicionar arquivo em ${node.name}`}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Folder Children */}
          {!isCollapsed && node.children && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Render File Node
    const file = node.file!;
    const isActive = file.id === activeFileId;
    const isEditing = file.id === editingNodeId;

    return (
      <div
        key={node.id}
        onClick={() => !isEditing && onSelectFile(file.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingNodeId(file.id);
          setEditingPath(file.path || file.name);
        }}
        style={{ paddingLeft: `${depth * 14 + 20}px` }}
        className={`group flex items-center justify-between pr-2 py-1 text-xs rounded cursor-pointer transition-colors select-none ${
          isActive
            ? 'bg-[var(--accent)]/15 text-[var(--text)] font-medium border-l-2 border-[var(--accent)]'
            : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] border-l-2 border-transparent'
        }`}
        title={`${file.path || file.name} (Clique duplo para renomear)`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {getLanguageIcon(file.language, file.name)}

          {isEditing ? (
            <div
              className="flex items-center gap-1 flex-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={editInputRef}
                value={editingPath}
                onChange={(e) => setEditingPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename(file);
                  if (e.key === 'Escape') setEditingNodeId(null);
                }}
                onBlur={() => handleConfirmRename(file)}
                className="w-full px-1.5 py-0.5 bg-[var(--bg)] border border-[var(--accent)] rounded text-[11px] text-[var(--text)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleConfirmRename(file)}
                className="text-[var(--accent)] hover:opacity-80 p-0.5"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="truncate text-[11px]">{node.name}</span>
          )}
        </div>

        {/* Action icons on hover */}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingNodeId(file.id);
                setEditingPath(file.path || file.name);
              }}
              className="p-1 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)] rounded"
              title="Renomear caminho/arquivo"
            >
              <Edit2 className="w-2.5 h-2.5" />
            </button>
            {files.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className="p-1 text-[var(--muted)] hover:text-[var(--rem)] hover:bg-[var(--panel)] rounded"
                title="Excluir arquivo"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`border-r border-[var(--border)] bg-[var(--panel)] flex flex-col shrink-0 transition-all duration-200 ${
        isOpen ? 'w-56 sm:w-60' : 'w-0 hidden md:flex md:w-0 overflow-hidden'
      }`}
    >
      {/* Explorer Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--panel-2)] shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
          <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="uppercase tracking-wider text-[10px] text-[var(--muted)]">Explorador</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setTargetFolderForAdd('');
              setNewFilePath('');
              setIsAdding(true);
            }}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)] rounded transition-colors"
            title="Novo arquivo (ex: src/App.tsx ou index.js)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)] rounded md:hidden"
            title="Fechar explorador"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Adding file input box */}
      {isAdding && (
        <div className="p-2 border-b border-[var(--border)] bg-[var(--bg)]">
          <div className="text-[10px] text-[var(--muted)] mb-1">
            {targetFolderForAdd ? `Novo em: ${targetFolderForAdd}/` : 'Novo arquivo (use pastas se desejar, ex: src/Button.tsx):'}
          </div>
          <div className="flex items-center gap-1">
            <input
              ref={addInputRef}
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmAdd();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              placeholder="ex: components/Header.tsx"
              className="w-full px-2 py-1 bg-[var(--panel)] border border-[var(--accent)] rounded text-xs text-[var(--text)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleConfirmAdd}
              className="p-1 text-[var(--accent)] hover:opacity-80 rounded"
              title="Confirmar criação"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="p-1 text-[var(--muted)] hover:text-[var(--rem)] rounded"
              title="Cancelar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1 space-y-0.5 no-scrollbar">
        {treeNodes.map((node) => renderNode(node, 0))}
      </div>

      {/* Footer info */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--panel-2)] text-[10px] text-[var(--muted)] flex items-center justify-between shrink-0 select-none">
        <span>{files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}</span>
        <button
          type="button"
          onClick={() => {
            const allFolders: Record<string, boolean> = {};
            const gatherFolders = (nodes: FileTreeNode[]) => {
              for (const n of nodes) {
                if (n.isFolder) {
                  allFolders[n.path] = true;
                  if (n.children) gatherFolders(n.children);
                }
              }
            };
            gatherFolders(treeNodes);
            setCollapsedFolders(allFolders);
          }}
          className="hover:text-[var(--text)] underline cursor-pointer"
        >
          Recolher pastas
        </button>
      </div>
    </aside>
  );
};
