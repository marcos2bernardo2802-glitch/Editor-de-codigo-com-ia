import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCw,
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
  FolderTree,
  Terminal,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SupportedLanguage, ProjectFile, PreviewLogItem } from '../types';
import { generatePreviewHtml } from '../utils/preview';

interface LivePreviewPaneProps {
  code: string;
  language: SupportedLanguage;
  projectFiles?: ProjectFile[];
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export const LivePreviewPane: React.FC<LivePreviewPaneProps> = ({ code, language, projectFiles }) => {
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [showConsole, setShowConsole] = useState<boolean>(false);
  const [logs, setLogs] = useState<PreviewLogItem[]>([]);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const blobUrlsRef = useRef<string[]>([]);

  // Regenerates preview HTML, collecting created Blob URLs for ES modules and revoking old ones to prevent memory leaks
  useEffect(() => {
    if (blobUrlsRef.current.length > 0) {
      blobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      });
      blobUrlsRef.current = [];
    }

    const createdUrls: string[] = [];
    const html = generatePreviewHtml(code, language, projectFiles, createdUrls);
    blobUrlsRef.current = createdUrls;
    setHtmlContent(html);

    return () => {
      if (blobUrlsRef.current.length > 0) {
        blobUrlsRef.current.forEach((url) => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        });
        blobUrlsRef.current = [];
      }
    };
  }, [code, language, projectFiles, refreshKey]);

  const deviceWidthMap: Record<DeviceMode, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  };

  // Listen to logs from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'preview_console') {
        const item: PreviewLogItem = {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
          type: event.data.level || 'log',
          message: event.data.message || '',
          timestamp: event.data.timestamp || Date.now(),
        };
        setLogs((prev) => [...prev.slice(-100), item]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRefresh = () => {
    setLogs([]);
    setRefreshKey((k) => k + 1);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const isMultiFileProject = Boolean(projectFiles && projectFiles.length > 1);
  const errorCount = logs.filter((l) => l.type === 'error').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)]">
      {/* Sub-toolbar for preview options */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--panel)] shrink-0 select-none text-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-[var(--accent)]" />
            Visualização em tempo real
          </span>
          {isMultiFileProject ? (
            <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)]">
              <FolderTree className="w-3 h-3" />
              Projeto Integrado ({projectFiles?.length} arquivos)
            </span>
          ) : (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[var(--muted)] uppercase">
              {language}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Console drawer toggle */}
          <button
            id="btnTogglePreviewConsole"
            onClick={() => setShowConsole(!showConsole)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
              showConsole
                ? 'bg-[var(--accent)] text-[#1a1206] border-[var(--accent)] font-semibold'
                : 'bg-[var(--panel-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title="Abrir/fechar console de execução"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console</span>
            {logs.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  errorCount > 0
                    ? 'bg-red-500 text-white'
                    : 'bg-[var(--panel)] text-[var(--text)]'
                }`}
              >
                {errorCount > 0 ? `${errorCount} err` : logs.length}
              </span>
            )}
            {showConsole ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronUp className="w-3 h-3" />
            )}
          </button>

          {/* Viewport size buttons */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
            <button
              onClick={() => setDevice('desktop')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                device === 'desktop'
                  ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Tela Cheia / Desktop (100%)"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDevice('tablet')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                device === 'tablet'
                  ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Tablet (768px)"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                device === 'mobile'
                  ? 'bg-[var(--panel)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="Celular (375px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--text)] bg-transparent transition-colors cursor-pointer"
            title="Recarregar visualização e limpar logs"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Frame Container */}
      <div className="flex-1 p-3 sm:p-4 flex items-center justify-center overflow-auto min-h-0 relative">
        <div
          className="h-full bg-white rounded-xl border border-[var(--border)] shadow-md overflow-hidden transition-all duration-200"
          style={{
            width: deviceWidthMap[device],
            maxWidth: '100%',
          }}
        >
          <iframe
            key={refreshKey}
            title="Visualizador de Código"
            srcDoc={htmlContent}
            sandbox="allow-scripts allow-modals"
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>

      {/* Interactive Console Drawer */}
      {showConsole && (
        <div className="h-44 border-t border-[var(--border)] bg-[#0d1117] text-[#c9d1d9] flex flex-col font-mono text-xs shrink-0 select-text">
          {/* Console Bar Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="font-semibold text-xs text-white">Console da Prévia</span>
              <span className="text-[11px] text-[#8b949e]">
                ({logs.length} {logs.length === 1 ? 'mensagem' : 'mensagens'})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearLogs}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                title="Limpar mensagens"
              >
                <Trash2 className="w-3 h-3" />
                Limpar
              </button>
              <button
                onClick={() => setShowConsole(false)}
                className="text-[11px] px-1.5 py-0.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                title="Fechar console"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Console Log List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {logs.length === 0 ? (
              <div className="text-[#8b949e] italic text-center py-4">
                Nenhum log registrado. Eventos de console.log, avisos e erros executados na prévia aparecerão aqui.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 py-1 px-2 rounded font-mono text-[11px] leading-relaxed border-b border-white/5 ${
                    log.type === 'error'
                      ? 'bg-red-950/40 text-red-300 border-l-2 border-l-red-500'
                      : log.type === 'warn'
                      ? 'bg-amber-950/40 text-amber-300 border-l-2 border-l-amber-500'
                      : 'text-[#e6edf3]'
                  }`}
                >
                  <span className="text-[#8b949e] shrink-0 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`uppercase text-[9px] font-bold px-1 rounded shrink-0 ${
                      log.type === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : log.type === 'warn'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {log.type}
                  </span>
                  <pre className="whitespace-pre-wrap break-all flex-1 m-0 font-mono">
                    {log.message}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
