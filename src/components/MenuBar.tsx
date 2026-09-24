import React, { useState, useRef, useEffect } from 'react';
import {
  FolderUp,
  FolderDown,
  Download,
  History,
  Save,
  HardDrive,
  RotateCcw,
  RotateCw,
  Copy,
  Wand2,
  Trash2,
  Check,
  ChevronRight,
  Code,
  Sun,
  Moon,
  WrapText,
  Type,
  FolderTree,
  ShieldCheck,
  Code2,
  Eye,
  Columns,
} from 'lucide-react';
import { ThemeMode, EditorViewMode } from '../types';

export interface MenuBarProps {
  // Menu Arquivo
  onImportZip?: (file: File) => void;
  onExportZip?: () => void;
  onDownload: () => void;
  onOpenVersionHistory?: () => void;
  checkpointCount?: number;
  onSaveLocalFolder?: () => void;
  onOpenLocalFolderSettings?: () => void;

  // Menu Editar
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onCopy: () => void;
  onFormatCode?: () => void;
  onClearCode: () => void;
  language: string;
  onChangeLanguage: (lang: string) => void;

  // Menu Exibir
  theme: ThemeMode;
  onToggleTheme: () => void;
  lineWrapping: boolean;
  onToggleLineWrapping: () => void;
  fontSize: number;
  onChangeFontSize: (size: number) => void;
  isExplorerOpen: boolean;
  onToggleExplorer: () => void;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  viewMode: EditorViewMode;
  onChangeViewMode: (mode: EditorViewMode) => void;
}

const LANGUAGE_OPTIONS = [
  { id: 'html', label: 'HTML' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'css', label: 'CSS' },
  { id: 'python', label: 'Python' },
  { id: 'json', label: 'JSON' },
];

const FONT_SIZE_OPTIONS = [12, 13, 14, 16];

export const MenuBar: React.FC<MenuBarProps> = ({
  onImportZip,
  onExportZip,
  onDownload,
  onOpenVersionHistory,
  checkpointCount = 0,
  onSaveLocalFolder,
  onOpenLocalFolderSettings,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onCopy,
  onFormatCode,
  onClearCode,
  language,
  onChangeLanguage,
  theme,
  onToggleTheme,
  lineWrapping,
  onToggleLineWrapping,
  fontSize,
  onChangeFontSize,
  isExplorerOpen,
  onToggleExplorer,
  showDiagnostics,
  onToggleDiagnostics,
  viewMode,
  onChangeViewMode,
}) => {
  const [openMenu, setOpenMenu] = useState<'arquivo' | 'editar' | 'exibir' | null>(null);
  const [showLangSubmenu, setShowLangSubmenu] = useState<boolean>(false);
  const [showFontSizeSubmenu, setShowFontSizeSubmenu] = useState<boolean>(false);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
        setShowLangSubmenu(false);
        setShowFontSizeSubmenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setShowLangSubmenu(false);
        setShowFontSizeSubmenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMenuClick = (menu: 'arquivo' | 'editar' | 'exibir') => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
    setShowLangSubmenu(false);
    setShowFontSizeSubmenu(false);
  };

  const handleMenuHover = (menu: 'arquivo' | 'editar' | 'exibir') => {
    // If a menu is already open, hover switches between menus (standard IDE behavior)
    if (openMenu !== null) {
      setOpenMenu(menu);
      setShowLangSubmenu(false);
      setShowFontSizeSubmenu(false);
    }
  };

  const closeAll = () => {
    setOpenMenu(null);
    setShowLangSubmenu(false);
    setShowFontSizeSubmenu(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportZip) {
      onImportZip(file);
    }
    e.target.value = '';
    closeAll();
  };

  return (
    <nav
      ref={menuBarRef}
      aria-label="Barra de Menus Principal"
      className="flex items-center text-xs font-medium select-none relative"
    >
      {/* Hidden file input for Import ZIP */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Menu Arquivo */}
      <div className="relative">
        <button
          id="menuBtnArquivo"
          type="button"
          onClick={() => handleMenuClick('arquivo')}
          onMouseEnter={() => handleMenuHover('arquivo')}
          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
            openMenu === 'arquivo'
              ? 'bg-[var(--panel-2)] text-[var(--accent)] font-semibold shadow-2xs'
              : 'text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
          }`}
          aria-expanded={openMenu === 'arquivo'}
          aria-haspopup="true"
        >
          Arquivo
        </button>

        {openMenu === 'arquivo' && (
          <div className="absolute top-full left-0 mt-1 min-w-[220px] py-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
            {/* Salvar na pasta local */}
            {onSaveLocalFolder && (
              <button
                id="menuItemSaveLocal"
                type="button"
                onClick={() => {
                  onSaveLocalFolder();
                  closeAll();
                }}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                <span className="flex-1">Salvar disco local</span>
                <span className="text-[10px] font-mono text-[var(--muted)]">Ctrl+S</span>
              </button>
            )}

            {/* Configurar Pasta Local */}
            {onOpenLocalFolderSettings && (
              <button
                id="menuItemLocalFolderSettings"
                type="button"
                onClick={() => {
                  onOpenLocalFolderSettings();
                  closeAll();
                }}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span className="flex-1">Conectar pasta local...</span>
              </button>
            )}

            {(onSaveLocalFolder || onOpenLocalFolderSettings) && (
              <div className="my-1 border-t border-[var(--border)]" />
            )}

            {/* Importar Zip */}
            {onImportZip && (
              <button
                id="menuItemImportZip"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <FolderUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="flex-1">Importar .zip...</span>
              </button>
            )}

            {/* Exportar Zip */}
            {onExportZip && (
              <button
                id="menuItemExportZip"
                type="button"
                onClick={() => {
                  onExportZip();
                  closeAll();
                }}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <FolderDown className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="flex-1">Exportar projeto (.zip)</span>
              </button>
            )}

            {/* Baixar Arquivo Individual */}
            <button
              id="menuItemDownload"
              type="button"
              onClick={() => {
                onDownload();
                closeAll();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="flex-1">Baixar arquivo ativo</span>
            </button>

            {/* Histórico de Versões */}
            {onOpenVersionHistory && (
              <>
                <div className="my-1 border-t border-[var(--border)]" />
                <button
                  id="menuItemVersionHistory"
                  type="button"
                  onClick={() => {
                    onOpenVersionHistory();
                    closeAll();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span className="flex-1">Versões</span>
                  {checkpointCount > 0 && (
                    <span className="text-[10px] bg-[var(--panel-2)] px-1.5 py-0.2 rounded-full text-[var(--text)] font-semibold border border-[var(--border)]">
                      {checkpointCount}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Menu Editar */}
      <div className="relative">
        <button
          id="menuBtnEditar"
          type="button"
          onClick={() => handleMenuClick('editar')}
          onMouseEnter={() => handleMenuHover('editar')}
          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
            openMenu === 'editar'
              ? 'bg-[var(--panel-2)] text-[var(--accent)] font-semibold shadow-2xs'
              : 'text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
          }`}
          aria-expanded={openMenu === 'editar'}
          aria-haspopup="true"
        >
          Editar
        </button>

        {openMenu === 'editar' && (
          <div className="absolute top-full left-0 mt-1 min-w-[230px] py-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
            {/* Desfazer */}
            <button
              id="menuItemUndo"
              type="button"
              disabled={!canUndo}
              onClick={() => {
                onUndo();
                closeAll();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text)] disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="flex-1">Desfazer</span>
              <span className="text-[10px] font-mono text-[var(--muted)]">Ctrl+Z</span>
            </button>

            {/* Refazer */}
            <button
              id="menuItemRedo"
              type="button"
              disabled={!canRedo}
              onClick={() => {
                onRedo();
                closeAll();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text)] disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="flex-1">Refazer</span>
              <span className="text-[10px] font-mono text-[var(--muted)]">Ctrl+Y</span>
            </button>

            <div className="my-1 border-t border-[var(--border)]" />

            {/* Copiar */}
            <button
              id="menuItemCopy"
              type="button"
              onClick={() => {
                onCopy();
                closeAll();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="flex-1">Copiar código</span>
              <span className="text-[10px] font-mono text-[var(--muted)]">Ctrl+C</span>
            </button>

            {/* Formatar Código */}
            {onFormatCode && (
              <button
                id="menuItemFormatCode"
                type="button"
                onClick={() => {
                  onFormatCode();
                  closeAll();
                }}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="flex-1">Formatar código</span>
              </button>
            )}

            {/* Limpar Código */}
            <button
              id="menuItemClearCode"
              type="button"
              onClick={() => {
                onClearCode();
                closeAll();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--rem-bg)] hover:text-[var(--rem)] transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-[var(--rem)]" />
              <span className="flex-1">Limpar editor</span>
            </button>

            <div className="my-1 border-t border-[var(--border)]" />

            {/* Tipo de código / Linguagem Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setShowLangSubmenu(true)}
              onMouseLeave={() => setShowLangSubmenu(false)}
            >
              <button
                id="menuItemLanguageSubmenu"
                type="button"
                onClick={() => setShowLangSubmenu((prev) => !prev)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Code className="w-3.5 h-3.5 text-[var(--muted)]" />
                  <span>Tipo de código</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--accent)] border border-[var(--border)]">
                    {language}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)]" />
                </div>
              </button>

              {showLangSubmenu && (
                <div className="absolute left-full top-0 ml-1 min-w-[150px] py-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeLanguage(opt.id);
                        closeAll();
                      }}
                      className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <span>{opt.label}</span>
                      {language === opt.id && (
                        <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Menu Exibir */}
      <div className="relative">
        <button
          id="menuBtnExibir"
          type="button"
          onClick={() => handleMenuClick('exibir')}
          onMouseEnter={() => handleMenuHover('exibir')}
          className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
            openMenu === 'exibir'
              ? 'bg-[var(--panel-2)] text-[var(--accent)] font-semibold shadow-2xs'
              : 'text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
          }`}
          aria-expanded={openMenu === 'exibir'}
          aria-haspopup="true"
        >
          Exibir
        </button>

        {openMenu === 'exibir' && (
          <div className="absolute top-full left-0 mt-1 min-w-[240px] py-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
            {/* Alternar Tema */}
            <button
              id="menuItemToggleTheme"
              type="button"
              onClick={() => {
                onToggleTheme();
                closeAll();
              }}
              className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                {theme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-[var(--accent)]" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>Tema claro/escuro</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--muted)] border border-[var(--border)] capitalize">
                {theme === 'dark' ? 'Escuro' : 'Claro'}
              </span>
            </button>

            {/* Quebra de linha automática */}
            <button
              id="menuItemToggleWrap"
              type="button"
              onClick={() => {
                onToggleLineWrapping();
                closeAll();
              }}
              className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <WrapText
                  className={`w-3.5 h-3.5 ${
                    lineWrapping ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                  }`}
                />
                <span>Quebra de linha automática</span>
              </div>
              {lineWrapping && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </button>

            {/* Tamanho da Fonte (Submenu) */}
            <div
              className="relative"
              onMouseEnter={() => setShowFontSizeSubmenu(true)}
              onMouseLeave={() => setShowFontSizeSubmenu(false)}
            >
              <button
                id="menuItemFontSizeSubmenu"
                type="button"
                onClick={() => setShowFontSizeSubmenu((prev) => !prev)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Type className="w-3.5 h-3.5 text-[var(--muted)]" />
                  <span>Tamanho da fonte</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--panel-2)] text-[var(--accent)] border border-[var(--border)]">
                    {fontSize}px
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)]" />
                </div>
              </button>

              {showFontSizeSubmenu && (
                <div className="absolute left-full top-0 ml-1 min-w-[130px] py-1 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                  {FONT_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        onChangeFontSize(size);
                        closeAll();
                      }}
                      className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <span>{size}px</span>
                      {fontSize === size && (
                        <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="my-1 border-t border-[var(--border)]" />

            {/* Mostrar/ocultar árvore de arquivos */}
            <button
              id="menuItemToggleExplorer"
              type="button"
              onClick={() => {
                onToggleExplorer();
                closeAll();
              }}
              className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <FolderTree
                  className={`w-3.5 h-3.5 ${
                    isExplorerOpen ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                  }`}
                />
                <span>Árvore de arquivos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-[var(--muted)]">Ctrl+B</span>
                {isExplorerOpen && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
              </div>
            </button>

            {/* Mostrar/ocultar diagnósticos */}
            <button
              id="menuItemToggleDiagnostics"
              type="button"
              onClick={() => {
                onToggleDiagnostics();
                closeAll();
              }}
              className="flex items-center justify-between w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck
                  className={`w-3.5 h-3.5 ${
                    showDiagnostics ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
                  }`}
                />
                <span>Diagnósticos de sintaxe</span>
              </div>
              {showDiagnostics && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </button>

            <div className="my-1 border-t border-[var(--border)]" />

            {/* Modos de Visualização */}
            <div className="px-3 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">
              Visualização
            </div>

            <button
              id="menuItemViewCode"
              type="button"
              onClick={() => {
                onChangeViewMode('code');
                closeAll();
              }}
              className={`flex items-center justify-between w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                viewMode === 'code'
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Code2 className="w-3.5 h-3.5" />
                <span>Editor de Código</span>
              </div>
              {viewMode === 'code' && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </button>

            <button
              id="menuItemViewPreview"
              type="button"
              onClick={() => {
                onChangeViewMode('preview');
                closeAll();
              }}
              className={`flex items-center justify-between w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Eye className="w-3.5 h-3.5" />
                <span>Visualizador (Preview)</span>
              </div>
              {viewMode === 'preview' && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </button>

            <button
              id="menuItemViewSplit"
              type="button"
              onClick={() => {
                onChangeViewMode('split');
                closeAll();
              }}
              className={`flex items-center justify-between w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-semibold'
                  : 'text-[var(--text)] hover:bg-[var(--panel-2)] hover:text-[var(--accent)]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Columns className="w-3.5 h-3.5" />
                <span>Dividir tela</span>
              </div>
              {viewMode === 'split' && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
            </button>
          </div>
        )}
      </div>

      {/* Placeholders opcionais para menus futuros (desabilitados) */}
      <div className="relative hidden md:block">
        <button
          type="button"
          disabled
          title="Em breve"
          className="px-2 py-1 text-[var(--muted)]/50 cursor-not-allowed"
        >
          Seleção
        </button>
      </div>

      <div className="relative hidden md:block">
        <button
          type="button"
          disabled
          title="Em breve"
          className="px-2 py-1 text-[var(--muted)]/50 cursor-not-allowed"
        >
          Acessar
        </button>
      </div>
    </nav>
  );
};
