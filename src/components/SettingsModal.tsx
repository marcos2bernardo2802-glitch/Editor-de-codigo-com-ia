import React from 'react';
import {
  X,
  Sparkles,
  Network,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  HardDrive,
} from 'lucide-react';
import { ConnectionConfig, AIProvider } from '../types';
import { Tooltip } from './Tooltip';
import { ModesTab } from './settings/ModesTab';
import { KeysTab, KeyStatusItem } from './settings/KeysTab';
import { ColabTab } from './settings/ColabTab';
import { LocalFolderTab } from './settings/LocalFolderTab';
import { useSettingsModal, maskKey } from './settings/useSettingsModal';

interface SettingsModalProps {
  isOpen: boolean;
  config: ConnectionConfig;
  onClose: () => void;
  onSave: (newConfig: ConnectionConfig) => void;
  onTestConnection: (
    configToTest: ConnectionConfig,
    targetProvider?: AIProvider
  ) => Promise<{ success: boolean; message: string }>;
  localFolderSupported?: boolean;
  localFolderName?: string | null;
  localFolderPermissionNeeded?: boolean;
  saveMode?: 'auto' | 'manual';
  onOpenLocalFolder?: () => Promise<void>;
  onReconnectLocalFolder?: () => Promise<void>;
  onDisconnectLocalFolder?: () => void;
  onChangeSaveMode?: (mode: 'auto' | 'manual') => void;
  defaultTab?: 'modes' | 'keys' | 'colab' | 'localFolder';
}

export type { KeyStatusItem };

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
  onTestConnection,
  localFolderSupported = false,
  localFolderName = null,
  localFolderPermissionNeeded = false,
  saveMode = 'manual',
  onOpenLocalFolder,
  onReconnectLocalFolder,
  onDisconnectLocalFolder,
  onChangeSaveMode,
  defaultTab,
}) => {
  const {
    planningProvider,
    setPlanningProvider,
    executionProvider,
    setExecutionProvider,
    visionProvider,
    setVisionProvider,
    visionModel,
    setVisionModel,
    colabVisionModel,
    setColabVisionModel,
    colabPlanningModel,
    setColabPlanningModel,
    colabExecutionModel,
    setColabExecutionModel,
    visionPrompt,
    setVisionPrompt,
    modelVisionMap,
    setModelVisionMap,
    visionSectionOpen,
    setVisionSectionOpen,
    showAdvancedColab,
    setShowAdvancedColab,
    geminiModel,
    setGeminiModel,
    customGeminiInput,
    setCustomGeminiInput,
    geminiKeys,
    newKeyInput,
    setNewKeyInput,
    keyInputError,
    setKeyInputError,
    keysHealth,
    individualKeyTests,
    geminiDisplayName,
    setGeminiDisplayName,
    colabDisplayName,
    setColabDisplayName,
    endpointUrl,
    setEndpointUrl,
    colabModel,
    isCustomColabModel,
    setIsCustomColabModel,
    detectedModels,
    detectingModels,
    authToken,
    setAuthToken,
    requestTemplate,
    setRequestTemplate,
    responsePath,
    setResponsePath,
    useProxy,
    setUseProxy,
    activeTab,
    setActiveTab,
    testing,
    testResult,
    resolvedPlanColabModel,
    resolvedExecColabModel,
    resolvedVisionColabModel,
    resolvedGeminiModel,
    geminiShortName,
    handleAddKey,
    handleRemoveKey,
    handleTestIndividualKey,
    handleSetModel,
    handleDetectModels,
    handleApplyPreset,
    handleTest,
    handleSave,
  } = useSettingsModal({
    isOpen,
    config,
    defaultTab,
    onSave,
    onClose,
    onTestConnection,
  });

  if (!isOpen) return null;

  return (
    <div
      id="settingsModalOverlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
    >
      <div
        id="settingsModalContainer"
        className="bg-[var(--panel)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header without subtitle */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--panel)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--text)] m-0">
              Configurações de IA & Conexão
            </h3>
          </div>
          <Tooltip content="Fechar configurações" position="left">
            <button
              id="btnCloseSettingsModal"
              type="button"
              onClick={onClose}
              aria-label="Fechar configurações"
              className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] bg-[var(--panel-2)]/50 px-4 pt-2 gap-1.5 shrink-0 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('modes')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'modes'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>Modos (Plan / Act)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'keys'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>Gemini (Chaves)</span>
            {geminiKeys.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--panel)] border border-[var(--border)] text-[var(--muted)]">
                {geminiKeys.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('colab')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'colab'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>Colab / Local</span>
            {endpointUrl && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                title="Endpoint configurado"
              />
            )}
          </button>

          <button
            id="tabBtnLocalFolder"
            type="button"
            onClick={() => setActiveTab('localFolder')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'localFolder'
                ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Pasta Local</span>
            {localFolderName && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                title={`Conectado: ${localFolderName}`}
              />
            )}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 text-xs leading-normal">
          {/* ==================== TAB 1: MODOS (PLAN / ACT) ==================== */}
          {activeTab === 'modes' && (
            <ModesTab
              planningProvider={planningProvider}
              setPlanningProvider={setPlanningProvider}
              executionProvider={executionProvider}
              setExecutionProvider={setExecutionProvider}
              visionProvider={visionProvider}
              setVisionProvider={setVisionProvider}
              visionModel={visionModel}
              setVisionModel={setVisionModel}
              resolvedPlanColabModel={resolvedPlanColabModel}
              setColabPlanningModel={setColabPlanningModel}
              colabPlanningModel={colabPlanningModel}
              colabModel={colabModel}
              detectedModels={detectedModels}
              modelVisionMap={modelVisionMap}
              detectingModels={detectingModels}
              endpointUrl={endpointUrl}
              handleDetectModels={handleDetectModels}
              resolvedGeminiModel={resolvedGeminiModel}
              geminiShortName={geminiShortName}
              resolvedExecColabModel={resolvedExecColabModel}
              setColabExecutionModel={setColabExecutionModel}
              colabExecutionModel={colabExecutionModel}
              visionSectionOpen={visionSectionOpen}
              setVisionSectionOpen={setVisionSectionOpen}
              resolvedVisionColabModel={resolvedVisionColabModel}
              setColabVisionModel={setColabVisionModel}
              colabVisionModel={colabVisionModel}
            />
          )}

          {/* ==================== TAB 2: MODELOS & CHAVES GEMINI ==================== */}
          {activeTab === 'keys' && (
            <KeysTab
              geminiModel={geminiModel}
              setGeminiModel={setGeminiModel}
              customGeminiInput={customGeminiInput}
              setCustomGeminiInput={setCustomGeminiInput}
              geminiDisplayName={geminiDisplayName}
              setGeminiDisplayName={setGeminiDisplayName}
              geminiKeys={geminiKeys}
              newKeyInput={newKeyInput}
              setNewKeyInput={setNewKeyInput}
              keyInputError={keyInputError}
              setKeyInputError={setKeyInputError}
              handleAddKey={handleAddKey}
              handleRemoveKey={handleRemoveKey}
              handleTestIndividualKey={handleTestIndividualKey}
              keysHealth={keysHealth}
              individualKeyTests={individualKeyTests}
              maskKey={maskKey}
            />
          )}

          {/* ==================== TAB 3: GOOGLE COLAB / NGROK ==================== */}
          {activeTab === 'colab' && (
            <ColabTab
              endpointUrl={endpointUrl}
              setEndpointUrl={setEndpointUrl}
              testing={testing}
              handleTest={handleTest}
              detectedModels={detectedModels}
              isCustomColabModel={isCustomColabModel}
              setIsCustomColabModel={setIsCustomColabModel}
              colabModel={colabModel}
              handleSetModel={handleSetModel}
              modelVisionMap={modelVisionMap}
              setModelVisionMap={setModelVisionMap}
              detectingModels={detectingModels}
              handleDetectModels={handleDetectModels}
              colabDisplayName={colabDisplayName}
              setColabDisplayName={setColabDisplayName}
              showAdvancedColab={showAdvancedColab}
              setShowAdvancedColab={setShowAdvancedColab}
              authToken={authToken}
              setAuthToken={setAuthToken}
              useProxy={useProxy}
              setUseProxy={setUseProxy}
              handleApplyPreset={handleApplyPreset}
              requestTemplate={requestTemplate}
              setRequestTemplate={setRequestTemplate}
              responsePath={responsePath}
              setResponsePath={setResponsePath}
              visionPrompt={visionPrompt}
              setVisionPrompt={setVisionPrompt}
            />
          )}

          {/* ==================== TAB 4: PASTA LOCAL ==================== */}
          {activeTab === 'localFolder' && (
            <LocalFolderTab
              localFolderSupported={localFolderSupported}
              localFolderPermissionNeeded={localFolderPermissionNeeded}
              localFolderName={localFolderName}
              saveMode={saveMode}
              onOpenLocalFolder={onOpenLocalFolder}
              onReconnectLocalFolder={onReconnectLocalFolder}
              onDisconnectLocalFolder={onDisconnectLocalFolder}
              onChangeSaveMode={onChangeSaveMode}
            />
          )}

          {/* Test connection feedback */}
          {testResult && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-[var(--add-bg)] border-[var(--add)]/30 text-[var(--add)]'
                  : 'bg-[var(--rem-bg)] border-[var(--rem)]/30 text-[var(--rem)]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Modal Footer with unified "Testar conexão" button */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] bg-[var(--panel)] shrink-0">
          {activeTab !== 'localFolder' ? (
            <Tooltip
              content={
                activeTab === 'modes'
                  ? 'Testa a conectividade dos provedores ativos para Planejamento e Execução.'
                  : activeTab === 'keys'
                  ? 'Valida todas as chaves Gemini cadastradas e verifica limites de cota.'
                  : 'Testa a resposta do endpoint ngrok e o modelo configurado no Colab.'
              }
              position="top"
            >
              <button
                id="btnTestConn"
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {testing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Network className="w-3.5 h-3.5" />
                )}
                <span>{testing ? 'Testando...' : 'Testar conexão'}</span>
              </button>
            </Tooltip>
          ) : (
            <div className="text-[11px] text-[var(--muted)] flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span>File System Access API</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btnSaveSettings"
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:brightness-105 text-[#1a1206] transition-all cursor-pointer shadow-sm"
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
