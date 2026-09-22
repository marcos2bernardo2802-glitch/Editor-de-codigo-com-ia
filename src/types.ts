export type SupportedLanguage = 'html' | 'javascript' | 'typescript' | 'css' | 'python' | 'json' | 'markdown';

export type AIProvider = 'gemini' | 'colab';

export type InteractionMode = 'plan' | 'execute';

export type ThemeMode = 'dark' | 'light';

export type EditorViewMode = 'code' | 'preview' | 'split';

export type AIScopeMode = 'full' | 'selection';

export type WorkspaceMode = 'single' | 'project';

export interface SelectionRange {
  from: number;
  to: number;
  text: string;
  fromLine: number;
  toLine: number;
}

export interface ProjectFile {
  id: string;
  path: string;
  name: string;
  language: SupportedLanguage;
  content: string;
  history: string[];
  historyIndex: number;
}

export interface GeminiModelInfo {
  id: string;
  name: string;
  shortName: string;
  badge: string;
  description: string;
  tier: 'flash' | 'pro' | 'lite' | 'custom';
}

export const AVAILABLE_GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    shortName: '3.8 Flash',
    badge: 'Recomendado',
    description: 'Equilíbrio ideal entre velocidade ultrarrápida, alta precisão de código e raciocínio.',
    tier: 'flash',
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash (Latest)',
    shortName: 'Flash Latest',
    badge: 'Mais Recente',
    description: 'Versão mais atual e atualizada do modelo Flash disponível na API do Google.',
    tier: 'flash',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    shortName: '3.1 Pro',
    badge: 'Raciocínio Avançado',
    description: 'Máxima capacidade analítica para raciocínio complexo, refatoração de código e arquitetura.',
    tier: 'pro',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    shortName: '3.1 Flash Lite',
    badge: 'Ultraleve',
    description: 'Menor latência e respostas praticamente instantâneas para tarefas simples e rápidas.',
    tier: 'lite',
  },
];

export interface ChatImageAttachment {
  id: string;
  name: string;
  dataUrl: string;
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface ConnectionConfig {
  provider: AIProvider;
  planningProvider: AIProvider;
  executionProvider: AIProvider;
  // Auxiliary Vision
  visionProvider?: 'gemini' | 'colab' | 'none';
  visionModel?: string; // Gemini vision model (e.g. gemini-3.8-flash)
  colabVisionModel?: string; // Local Colab model with vision (e.g. llava, qwen2.5-vl)
  visionPrompt?: string; // Custom vision prompt
  colabPlanningModel?: string;
  colabExecutionModel?: string;
  detectedModels?: string[];
  planningAcceptsImages?: boolean;
  executionAcceptsImages?: boolean;
  modelVisionMap?: Record<string, boolean>; // Model name -> boolean
  geminiModel: string;
  geminiKeys: string[];
  endpointUrl: string;
  colabModel: string;
  colabDisplayName?: string; // Custom display name override
  geminiDisplayName?: string; // Custom display name override
  authToken: string;
  requestTemplate: string;
  responsePath: string;
  useProxy: boolean;
}

export interface DiffLine {
  type: 'add' | 'rem' | 'same';
  text: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface ChatMessage {
  id: string;
  type: 'instruction' | 'proposal' | 'error' | 'info' | 'explanation' | 'chat';
  mode?: InteractionMode;
  text?: string;
  images?: ChatImageAttachment[];
  imageAnalysis?: string;
  oldCode?: string;
  newCode?: string;
  fullNewCode?: string;
  scope?: AIScopeMode;
  selectionRange?: SelectionRange;
  applied?: boolean;
  discarded?: boolean;
  timestamp: number;
  provider?: string;
  usedKeyMask?: string;
  explanation?: string;
  thinking?: string;
  streaming?: boolean;
  warning?: string;
}

export interface VersionCheckpoint {
  id: string;
  timestamp: number;
  description: string;
  code: string;
  fileId?: string;
  fileName?: string;
  source: 'ai' | 'user' | 'format' | 'autofix';
}

export interface PreviewLogItem {
  id: string;
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: number;
}

export interface CodeTemplate {
  name: string;
  language: SupportedLanguage;
  description: string;
  code: string;
}

export interface DiagnosticItem {
  id: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
  message: string;
  source: string;
  suggestedPrompt: string;
}
