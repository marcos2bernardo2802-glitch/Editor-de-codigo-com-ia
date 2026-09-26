import React, { useRef, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import {
  Send,
  Loader2,
  Sparkles,
  Trash2,
  Scissors,
  FileText,
  X,
  Layers,
  MessageSquare,
  Zap,
  Network,
  Settings2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Image as ImageIcon,
  Paperclip,
  Eye,
  Square,
} from 'lucide-react';
import {
  ChatMessage,
  AIScopeMode,
  SelectionRange,
  InteractionMode,
  AIProvider,
  AVAILABLE_GEMINI_MODELS,
  ChatImageAttachment,
} from '../types';
import { DiffViewer } from './DiffViewer';

interface SidePanelProps {
  messages: ChatMessage[];
  instruction: string;
  isLoading: boolean;
  onChangeInstruction: (val: string) => void;
  onSend: () => void;
  onClearChat: () => void;
  onApplyDiff: (msgId: string, newCode: string) => void;
  onApplyPartialDiff?: (msgId: string, updatedCode: string) => void;
  onDiscardDiff: (msgId: string) => void;
  onSelectQuickPrompt?: (prompt: string) => void;
  currentCode: string;

  // Multimodal (Images)
  attachedImages?: ChatImageAttachment[];
  onAddImages?: (files: File[]) => void;
  onRemoveImage?: (id: string) => void;
  isAnalyzingVision?: boolean;

  // Mode (Planejamento vs Execução)
  interactionMode: InteractionMode;
  onChangeInteractionMode: (mode: InteractionMode) => void;
  activeProvider: AIProvider;
  onToggleActiveProvider: () => void;
  onOpenSettings?: () => void;
  geminiModel?: string;
  onChangeGeminiModel?: (model: string) => void;

  // Short Model Name & Info
  activeShortModelName?: string;
  activeFullModelInfo?: string;

  // AI Scope & Selection
  aiScopeMode: AIScopeMode;
  onChangeAiScopeMode: (mode: AIScopeMode) => void;
  selection: SelectionRange | null;
  onClearSelection: () => void;
  onExplainCode?: () => void;
  onCancelInstruction?: () => void;

  // Connection Status
  status: 'connected' | 'disconnected' | 'testing';
  statusText: string;

  // Resizable panel width (desktop)
  width?: number;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  messages,
  instruction,
  isLoading,
  onChangeInstruction,
  onSend,
  onClearChat,
  onApplyDiff,
  onApplyPartialDiff,
  onDiscardDiff,
  attachedImages = [],
  onAddImages,
  onRemoveImage,
  isAnalyzingVision = false,
  interactionMode,
  onChangeInteractionMode,
  activeProvider,
  onToggleActiveProvider,
  onOpenSettings,
  geminiModel,
  onChangeGeminiModel,
  activeShortModelName,
  activeFullModelInfo,
  aiScopeMode,
  onChangeAiScopeMode,
  selection,
  onClearSelection,
  onExplainCode,
  onCancelInstruction,
  status,
  statusText,
  width,
}) => {
  const chatLogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Estado de expansão dos diffs lembrado por mensagem
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  // Auto scroll to bottom on new message or during streaming
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages, isLoading, isAnalyzingVision]);

  const isGenerating = isLoading || isAnalyzingVision;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && (instruction.trim() || attachedImages.length > 0)) {
        onSend();
      }
    }
  };

  // Paste handler (Ctrl+V) for images
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAddImages) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      onAddImages(files);
    }
  };

  // Drag and Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    if (!onAddImages) return;
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      onAddImages(files);
    }
  };

  const handleTransferToExecution = (planText: string) => {
    onChangeInteractionMode('execute');
    onChangeInstruction(`Implemente as seguintes diretrizes planejadas:\n${planText}`);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const displayShortModel =
    activeShortModelName || (activeProvider === 'gemini' ? 'Gemini' : 'Colab');
  const fullModelTooltip = activeFullModelInfo || `Provedor: ${activeProvider}`;

  return (
    <aside
      style={width && isDesktop ? { width: `${width}px` } : undefined}
      className={`w-full ${width && isDesktop ? '' : 'md:w-[380px] lg:w-[440px]'} shrink-0 flex flex-col bg-[var(--panel)] h-full overflow-hidden border-t md:border-t-0 md:border-l border-[var(--border)]`}
    >
      {/* 1. Header do chat: compacto e discreto */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] shrink-0 select-none bg-[var(--panel)]">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] m-0">
            Assistente de IA
          </h2>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                status === 'connected'
                  ? 'bg-[var(--add)] ring-2 ring-[var(--add)]/20'
                  : status === 'testing'
                  ? 'bg-[var(--accent)] animate-pulse'
                  : 'bg-[var(--rem)]'
              }`}
            />
            <span className="capitalize text-[10px] text-[var(--muted)] font-normal">{statusText}</span>
          </div>
          {messages.length > 0 && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--panel-2)] text-[var(--muted)] font-mono">
              {messages.length}
            </span>
          )}
        </div>

        <button
          id="btnClearChat"
          type="button"
          onClick={onClearChat}
          disabled={messages.length === 0}
          className="flex items-center gap-1 text-[10.5px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-1.5 py-0.5 rounded hover:bg-[var(--panel-2)] cursor-pointer"
          title="Limpar conversa"
          aria-label="Limpar conversa"
        >
          <Trash2 className="w-2.5 h-2.5" />
          <span>Limpar</span>
        </button>
      </div>

      {/* Chat Log Body */}
      <div
        id="chatLog"
        ref={chatLogRef}
        className="flex-1 overflow-y-auto p-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="my-auto text-center px-4 py-6 max-w-xs mx-auto">
            <div className="w-9 h-9 rounded-xl bg-[var(--panel-2)] border border-[var(--border)] flex items-center justify-center mx-auto mb-2.5 text-[var(--accent)]">
              {interactionMode === 'plan' ? (
                <MessageSquare className="w-4 h-4 text-blue-400" />
              ) : (
                <Zap className="w-4 h-4 text-[var(--accent)]" />
              )}
            </div>
            <p className="text-xs text-[var(--text)] font-semibold mb-1">
              {interactionMode === 'plan' ? 'Modo Planejamento Ativo' : 'Modo Execução Ativo'}
            </p>
            <p className="text-[11px] text-[var(--muted)] leading-relaxed m-0">
              {interactionMode === 'plan'
                ? 'Converse, tire dúvidas ou discuta arquitetura sem alterar seu código.'
                : aiScopeMode === 'selection'
                ? 'Selecione um trecho no editor e envie instruções para edições cirúrgicas.'
                : 'Descreva a alteração que a IA deve aplicar no código para revisão do diff.'}
            </p>
          </div>
        )}

        {/* Message feed */}
        {messages.map((msg) => {
          if (msg.type === 'instruction') {
            const isPlanMode = msg.mode === 'plan';
            const modeTooltip = `Modo: ${isPlanMode ? 'Planejamento' : 'Execução'} · Escopo: ${
              msg.scope === 'selection' ? 'Seleção' : 'Completo'
            }`;

            return (
              <div key={msg.id} className="flex flex-col items-end">
                {/* Imagens anexadas na mensagem do usuário */}
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end max-w-[85%]">
                    {msg.images.map((img) => (
                      <div
                        key={img.id}
                        className="relative rounded-md overflow-hidden border border-[var(--border)] bg-black/40 group max-w-[130px] max-h-[130px] cursor-pointer shadow-2xs hover:border-[var(--accent)] transition-all"
                        onClick={() => {
                          const url = img.dataUrl || `data:${img.mimeType};base64,${img.base64}`;
                          const w = window.open('');
                          w?.document.write(`<img src="${url}" style="max-width:100%; height:auto; margin:auto; display:block;" />`);
                        }}
                        title={`${img.name} (${img.width}x${img.height}) - Clique para expandir`}
                      >
                        <img
                          src={img.dataUrl || `data:${img.mimeType};base64,${img.base64}`}
                          alt={img.name}
                          className="object-cover w-full h-full max-h-20 rounded"
                        />
                        <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8.5px] text-white px-1 py-0.2 truncate text-center font-mono">
                          {img.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4. Mensagem do usuário com marcação visual de cor para o modo */}
                <div
                  title={modeTooltip}
                  className={`max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-xs text-xs font-medium leading-relaxed shadow-2xs ${
                    isPlanMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--accent)] text-[#1a1206]'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Collapsible Vision Analysis Block if attached to instruction */}
                {msg.imageAnalysis && (
                  <details className="max-w-[85%] w-full text-[11px] bg-purple-950/20 border border-purple-500/30 rounded-xl p-2 text-[var(--muted)] group my-1.5 text-left">
                    <summary className="cursor-pointer font-medium text-purple-300 hover:text-purple-200 select-none flex items-center justify-between list-none">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3 text-purple-400" />
                        <span className="font-semibold text-[10.5px]">Análise de Visão (Auxiliar)</span>
                      </span>
                      <span className="text-[9px] text-purple-400 group-open:rotate-90 transition-transform">▸</span>
                    </summary>
                    <div className="mt-1.5 pt-1.5 border-t border-purple-500/20 text-[10.5px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto text-[var(--text)]/90 select-text font-sans">
                      {msg.imageAnalysis}
                    </div>
                  </details>
                )}

                {/* Mostra texto apenas quando o escopo for Seleção */}
                {msg.scope === 'selection' && (
                  <div
                    className="flex items-center gap-1 mt-1 text-[9.5px] text-[var(--muted)] font-mono"
                    title="Instrução restrita ao trecho selecionado"
                  >
                    <Scissors className="w-2.5 h-2.5 text-[var(--accent)]" />
                    <span>L{msg.selectionRange?.fromLine}–L{msg.selectionRange?.toLine}</span>
                  </div>
                )}
              </div>
            );
          }

          if (msg.type === 'proposal' && msg.oldCode !== undefined && msg.newCode !== undefined) {
            return (
              <div key={msg.id} className="flex flex-col gap-1">
                {/* Cabeçalho da proposta: nome completo apenas no tooltip */}
                <div
                  className="flex items-center justify-between text-[11px] text-[var(--muted)] px-1 cursor-default"
                  title={msg.provider || fullModelTooltip}
                >
                  <span className="flex items-center gap-1 font-semibold text-[var(--text)]">
                    <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                    <span>Proposta de Edição</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {msg.usedKeyMask && (
                      <span
                        className="inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[var(--muted)] font-mono"
                        title="Chave de API utilizada para esta requisição"
                      >
                        <ShieldCheck className="w-2.5 h-2.5 text-[var(--accent)]" />
                        {msg.usedKeyMask}
                      </span>
                    )}

                    {msg.scope === 'selection' && (
                      <span className="inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.2 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] font-mono">
                        <Scissors className="w-2.5 h-2.5" />
                        L{msg.selectionRange?.fromLine}–L{msg.selectionRange?.toLine}
                      </span>
                    )}
                  </div>
                </div>

                {/* 7. Diffs recolhidos por padrão, mantendo estado por mensagem */}
                <DiffViewer
                  messageId={msg.id}
                  isExpanded={expandedDiffs[msg.id] ?? false}
                  onToggleExpand={() =>
                    setExpandedDiffs((prev) => ({
                      ...prev,
                      [msg.id]: !(prev[msg.id] ?? false),
                    }))
                  }
                  oldCode={msg.oldCode}
                  newCode={msg.newCode}
                  applied={msg.applied}
                  discarded={msg.discarded}
                  onApply={() => onApplyDiff(msg.id, msg.fullNewCode || msg.newCode || '')}
                  onDiscard={() => onDiscardDiff(msg.id)}
                  onApplyPartial={
                    onApplyPartialDiff
                      ? (updated) => onApplyPartialDiff(msg.id, updated)
                      : undefined
                  }
                />

                {/* Aviso / Interrupção */}
                {msg.warning && (
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-300 flex items-start gap-1.5 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span>{msg.warning}</span>
                  </div>
                )}

                {/* Bloco recolhível de raciocínio interno */}
                {msg.thinking && (
                  <details className="text-[10.5px] bg-[var(--panel-2)] border border-[var(--border)] rounded-xl p-2 text-[var(--muted)] group">
                    <summary className="cursor-pointer font-medium text-[var(--muted)] hover:text-[var(--text)] select-none flex items-center justify-between list-none">
                      <span className="flex items-center gap-1.5">
                        <span>🧠</span>
                        <span>Raciocínio interno ({msg.thinking.length} caracteres)</span>
                      </span>
                      <span className="text-[9px] text-[var(--muted)] group-open:rotate-90 transition-transform">▸</span>
                    </summary>
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/50 font-mono text-[9.5px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto text-[var(--text)]/80 select-text">
                      {msg.thinking}
                    </div>
                  </details>
                )}
              </div>
            );
          }

          if (msg.type === 'explanation') {
            const rawContent = msg.explanation || msg.text || '';

            return (
              <div
                key={msg.id}
                className="bg-[var(--panel-2)] border border-[var(--border)] rounded-2xl rounded-bl-xs p-3 text-xs text-[var(--text)] flex flex-col gap-2 shadow-2xs"
              >
                {/* Cabeçalho da resposta: menor e mais discreto */}
                <div
                  className="flex items-center justify-between border-b border-[var(--border)]/40 pb-1 cursor-default select-none"
                  title={msg.provider || fullModelTooltip}
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--muted)]">
                    <MessageSquare className="w-2.5 h-2.5 text-blue-400/70 shrink-0" />
                    <span className="tracking-tight text-blue-400/80">Resposta de Planejamento</span>
                  </span>

                  {msg.usedKeyMask && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-[var(--panel)] border border-[var(--border)] text-[var(--muted)] font-mono"
                      title="Chave de API utilizada"
                    >
                      <ShieldCheck className="w-2.5 h-2.5 text-[var(--accent)]" />
                      {msg.usedKeyMask}
                    </span>
                  )}
                </div>

                {/* Corpo Markdown com cursor pulsante discreto durante streaming */}
                <div className="text-xs text-[var(--text)] leading-relaxed font-sans prose prose-invert max-w-none space-y-2 selection:bg-[var(--accent)]/30">
                  <Markdown>{rawContent}</Markdown>
                  {msg.streaming && (
                    <span className="inline-block w-1.5 h-3 ml-1 bg-blue-400 animate-pulse align-middle" />
                  )}
                </div>

                {/* Aviso / Interrupção */}
                {msg.warning && (
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-300 flex items-start gap-1.5 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span>{msg.warning}</span>
                  </div>
                )}

                {/* Bloco discreto de raciocínio */}
                {msg.thinking && (
                  <details className="text-[10.5px] bg-[var(--panel)] border border-[var(--border)] rounded-xl p-2 text-[var(--muted)] group">
                    <summary className="cursor-pointer font-medium text-[var(--muted)] hover:text-[var(--text)] select-none flex items-center justify-between list-none">
                      <span className="flex items-center gap-1.5">
                        <span>🧠</span>
                        <span>Raciocínio interno ({msg.thinking.length} caracteres)</span>
                      </span>
                      <span className="text-[9px] text-[var(--muted)] group-open:rotate-90 transition-transform">▸</span>
                    </summary>
                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border)]/50 font-mono text-[9.5px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto text-[var(--text)]/80 select-text">
                      {msg.thinking}
                    </div>
                  </details>
                )}

                {/* Ação rápida: transferir plano para Execução */}
                {!msg.streaming && (
                  <div className="pt-1.5 border-t border-[var(--border)]/60 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleTransferToExecution(rawContent)}
                      className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      <span>Levar plano para Execução</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          }

          if (msg.type === 'error') {
            const isModelNotFound =
              msg.text.includes('MODEL_NOT_FOUND') ||
              msg.text.toLowerCase().includes('modelo não encontrado') ||
              msg.text.toLowerCase().includes('model not found');

            return (
              <div
                key={msg.id}
                className="bg-[var(--rem-bg)] border border-[var(--rem)]/40 rounded-2xl rounded-bl-xs p-2.5 text-xs text-[var(--text)] whitespace-pre-wrap font-mono shadow-2xs"
              >
                <div className="font-semibold text-[var(--rem)] text-[11px] mb-1 flex items-center justify-between font-sans">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[var(--rem)]" />
                    <span>{isModelNotFound ? 'Modelo não encontrado (404)' : 'Erro na requisição'}</span>
                  </div>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1 cursor-pointer font-medium font-sans"
                    >
                      <Settings2 className="w-3 h-3" />
                      <span>Configurações</span>
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-[var(--text)]/90 leading-relaxed font-sans whitespace-pre-wrap">
                  {msg.text}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Escopo da Edição (Visível no modo Execução) */}
      {interactionMode === 'execute' && (
        <div className="px-3 py-1 border-t border-[var(--border)] bg-[var(--panel-2)]/60 flex items-center justify-between gap-2 shrink-0 select-none">
          <div className="flex items-center gap-1 text-[10.5px] text-[var(--muted)] font-medium">
            <Layers className="w-3 h-3 text-[var(--accent)]" />
            <span>Escopo:</span>
          </div>

          <div className="flex items-center p-0.5 rounded-md bg-[var(--panel)] border border-[var(--border)]">
            <button
              id="sideBtnScopeFull"
              type="button"
              onClick={() => onChangeAiScopeMode('full')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                aiScopeMode === 'full'
                  ? 'bg-[var(--panel-2)] text-[var(--text)] font-semibold shadow-2xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="A IA analisa e propõe mudanças para o arquivo completo"
            >
              <FileText className="w-2.5 h-2.5" />
              <span>Completo</span>
            </button>

            <button
              id="sideBtnScopeSelection"
              type="button"
              onClick={() => onChangeAiScopeMode('selection')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] transition-colors cursor-pointer ${
                aiScopeMode === 'selection'
                  ? 'bg-[var(--accent)] text-[#1a1206] font-semibold shadow-2xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              title="A IA foca exclusivamente no trecho de código selecionado"
            >
              <Scissors className="w-2.5 h-2.5" />
              <span>Seleção</span>
            </button>
          </div>
        </div>
      )}

      {/* Detalhes da Seleção Ativa no Editor */}
      {selection && (
        <div className="px-3 py-1 bg-[var(--accent)]/10 border-t border-[var(--accent)]/30 flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-[10.5px] text-[var(--text)] truncate">
              Trecho:{' '}
              <strong className="font-mono text-[var(--accent)]">
                L{selection.fromLine}–L{selection.toLine}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onExplainCode && (
              <button
                id="btnExplainSelection"
                type="button"
                onClick={onExplainCode}
                disabled={isGenerating}
                className="flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-[var(--accent)] text-[#1a1206] hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
                title="Tirar dúvidas sobre este trecho no modo Planejamento"
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>Explicar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClearSelection}
              className="p-0.5 rounded text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              title="Desmarcar seleção"
              aria-label="Desmarcar seleção"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 6. CONTROLES DO RODAPÉ MENORES E COMPACTOS */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-[var(--border)] bg-[var(--panel)] shrink-0 select-none gap-2">
        {/* Seletor Plan / Exec: menor */}
        <div className="flex p-0.5 bg-[var(--panel-2)] rounded-md border border-[var(--border)]">
          <button
            id="tabModePlan"
            type="button"
            onClick={() => onChangeInteractionMode('plan')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] transition-all cursor-pointer ${
              interactionMode === 'plan'
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title="Planejar, tirar dúvidas e conversar sem alterar o código"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Plan</span>
          </button>

          <button
            id="tabModeExecute"
            type="button"
            onClick={() => onChangeInteractionMode('execute')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] transition-all cursor-pointer ${
              interactionMode === 'execute'
                ? 'bg-[var(--accent)] text-[#1a1206] font-semibold shadow-xs'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            title="Executar alterações e gerar diff para aprovação"
          >
            <Zap className="w-3 h-3" />
            <span>Exec</span>
          </button>
        </div>

        {/* Botão de conexão menor com nome curto e engrenagem menor */}
        <div className="flex items-center gap-1">
          <button
            id="btnQuickToggleProvider"
            type="button"
            onClick={onToggleActiveProvider}
            title={`Conexão ativa: ${fullModelTooltip} (clique para alternar)`}
            aria-label={`Conexão ativa: ${fullModelTooltip}`}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] text-[10.5px] font-medium transition-colors cursor-pointer shrink-0"
          >
            {activeProvider === 'gemini' ? (
              <Sparkles className="w-2.5 h-2.5 text-[var(--accent)] shrink-0" />
            ) : (
              <Network className="w-2.5 h-2.5 text-[var(--add)] shrink-0" />
            )}
            <span className="font-semibold truncate max-w-[110px] text-[var(--text)]">
              {displayShortModel}
            </span>
          </button>

          {/* Seletor rápido de versão do Gemini se ativo */}
          {activeProvider === 'gemini' && onChangeGeminiModel && (
            <select
              id="quickGeminiModelSelect"
              value={geminiModel || 'gemini-3.8-flash'}
              onChange={(e) => onChangeGeminiModel(e.target.value)}
              title="Selecionar versão do modelo Gemini"
              aria-label="Selecionar versão do modelo Gemini"
              className="px-1 py-0.5 rounded bg-[var(--panel-2)] hover:bg-[var(--border)] border border-[var(--border)] text-[10px] font-mono text-[var(--accent)] font-semibold transition-colors cursor-pointer outline-none focus:border-[var(--accent)]"
            >
              {AVAILABLE_GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id} className="bg-[var(--panel)] text-[var(--text)]">
                  {m.shortName}
                </option>
              ))}
              {geminiModel &&
                !AVAILABLE_GEMINI_MODELS.some((m) => m.id === geminiModel) && (
                  <option value={geminiModel} className="bg-[var(--panel)] text-[var(--text)]">
                    {geminiModel}
                  </option>
                )}
            </select>
          )}

          {/* Ícone de ajustes menor */}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
              title="Configurações de IA e Conexão"
              aria-label="Configurações"
            >
              <Settings2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Campo de Entrada (Composer) */}
      <div
        className={`p-2.5 border-t border-[var(--border)] bg-[var(--panel)] shrink-0 flex flex-col relative transition-colors ${
          isDraggingOver ? 'bg-[var(--accent)]/10 ring-2 ring-inset ring-[var(--accent)]' : ''
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Overlay de Drag-and-Drop */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-[var(--panel)]/90 backdrop-blur-xs z-20 flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-[var(--accent)] rounded-lg pointer-events-none">
            <ImageIcon className="w-6 h-6 text-[var(--accent)] animate-bounce" />
            <span className="text-xs font-semibold text-[var(--text)]">
              Solte aqui para anexar
            </span>
          </div>
        )}

        {/* Input oculto de arquivo */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            if (e.target.files && onAddImages) {
              onAddImages(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        {/* Miniaturas de Imagens Anexadas */}
        {attachedImages.length > 0 && (
          <div className="flex flex-col gap-1 p-1.5 bg-[var(--panel-2)] border border-[var(--border)] rounded-md mb-2">
            <div className="flex items-center justify-between text-[9.5px] text-[var(--muted)] px-0.5">
              <span className="flex items-center gap-1 font-semibold text-[var(--text)]">
                <ImageIcon className="w-3 h-3 text-[var(--accent)]" />
                <span>Anexos ({attachedImages.length}/3)</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group flex items-center gap-1.5 p-1 rounded border border-[var(--border)] bg-[var(--panel)] shadow-2xs"
                >
                  <img
                    src={img.dataUrl || `data:${img.mimeType};base64,${img.base64}`}
                    alt={img.name}
                    className="w-8 h-8 object-cover rounded border border-[var(--border)]"
                  />
                  <span className="font-medium text-[9.5px] text-[var(--text)] truncate max-w-[90px]">
                    {img.name}
                  </span>
                  {onRemoveImage && (
                    <button
                      type="button"
                      onClick={() => onRemoveImage(img.id)}
                      className="p-0.5 rounded-full text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Remover imagem"
                      aria-label="Remover imagem"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <textarea
            id="instructionInput"
            ref={textareaRef}
            value={instruction}
            onChange={(e) => onChangeInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              attachedImages.length > 0
                ? 'Explique o print ou peça auxílio para o erro (Enter)...'
                : interactionMode === 'plan'
                ? 'Tire dúvidas ou planeje (Enter)...'
                : aiScopeMode === 'selection'
                ? selection
                  ? `Descreva a alteração para L${selection.fromLine}–L${selection.toLine}...`
                  : 'Selecione um trecho e digite a instrução...'
                : 'Descreva a alteração no código...'
            }
            rows={3}
            className="flex-1 resize-none bg-[var(--panel-2)] border border-[var(--border)] rounded-md text-[var(--text)] px-2.5 py-1.5 text-[11px] leading-relaxed focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--muted)]/60 font-sans"
          />

          {/* Coluna de ações: clipe (acima) e enviar / parar (abaixo) para economizar espaço horizontal */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            {/* Ícone de clipe (anexar imagem) */}
            <button
              id="btnAttachImage"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || attachedImages.length >= 3}
              className={`p-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center ${
                attachedImages.length > 0
                  ? 'text-[var(--accent)] bg-[var(--accent)]/15'
                  : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title={
                attachedImages.length >= 3
                  ? 'Limite de 3 imagens atingido'
                  : 'Anexar imagem/print (Ctrl+V ou arraste)'
              }
              aria-label="Anexar imagem"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>

            {/* Botão de envio / parar */}
            {isGenerating ? (
              <button
                id="btnStop"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancelInstruction?.();
                }}
                className="p-2 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 font-semibold transition-all cursor-pointer flex items-center justify-center shadow-xs active:scale-95"
                title="Parar geração"
                aria-label="Parar geração"
              >
                <div className="relative flex items-center justify-center w-3.5 h-3.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin absolute inset-0 text-red-400" />
                  <Square className="w-1.5 h-1.5 fill-current text-red-400" />
                </div>
              </button>
            ) : (
              <button
                id="btnSend"
                type="button"
                onClick={onSend}
                disabled={!instruction.trim() && attachedImages.length === 0}
                className={`p-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-xs transition-all cursor-pointer flex items-center justify-center shadow-xs active:scale-95 ${
                  interactionMode === 'plan'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-[var(--accent)] hover:brightness-105 text-[#1a1206]'
                }`}
                title="Enviar comando para a IA (Enter)"
                aria-label="Enviar"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
