import JSZip from 'jszip';
import { ProjectFile, SupportedLanguage } from '../types';

/**
 * Exports current workspace (or current code file) as a ZIP archive
 */
export async function exportProjectAsZip(
  files: ProjectFile[],
  workspaceMode: 'single' | 'project',
  activeCode: string,
  activeLanguage: SupportedLanguage
): Promise<void> {
  const zip = new JSZip();

  if (workspaceMode === 'project' && files.length > 0) {
    // Add all project files into zip, preserving folder structure
    files.forEach((file) => {
      const filePath = file.path || file.name;
      zip.file(filePath, file.content);
    });

    // Add a basic README
    zip.file(
      'README.md',
      `# Projeto Web Multi-Arquivos\n\nExportado via Editor de Código com IA em ${new Date().toLocaleDateString('pt-BR')}.\n\n## Como rodar:\nAbra o arquivo \`index.html\` no seu navegador ou inicie um servidor local como \`npx serve .\`.\n`
    );
  } else {
    // Single file export inside a zip
    const extMap: Record<SupportedLanguage, string> = {
      html: 'html',
      javascript: 'js',
      typescript: 'ts',
      css: 'css',
      python: 'py',
      json: 'json',
      markdown: 'md',
    };
    const ext = extMap[activeLanguage] || 'txt';
    const filename = `codigo.${ext}`;

    zip.file(filename, activeCode);
    zip.file(
      'README.md',
      `# Arquivo de Código (${activeLanguage.toUpperCase()})\n\nExportado via Editor de Código com IA.\n`
    );
  }

  // Generate zip blob and trigger browser download
  const blob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = workspaceMode === 'project' ? 'projeto-completo.zip' : 'codigo.zip';
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}
