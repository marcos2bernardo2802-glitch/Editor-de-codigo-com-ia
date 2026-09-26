export interface EditTargetMarker {
  filePath: string;
  targetName: string;
  cleanedText: string;
}

/**
 * Procura pela marcação de alvo de edição gerada pela IA no modo Planejamento:
 * [[ALVO_EDICAO: arquivo="caminho/do/arquivo.ext" nome="nomeDaFuncaoOuComponenteOuClasse"]]
 *
 * Retorna os dados extraídos e o texto limpo (sem a marcação), ou null caso não exista.
 */
export function extractEditTargetMarker(responseText: string): EditTargetMarker | null {
  if (!responseText || typeof responseText !== 'string') {
    return null;
  }

  // Regex tolerante a espaços e quebras de linha opcionais ao redor da marcação
  // Suporta tanto aspas duplas quanto simples, embora o prompt instrua aspas duplas
  const markerRegex = /(?:\r?\n)?[ \t]*\[\[ALVO_EDICAO:\s*arquivo=["']([^"']+)["']\s+nome=["']([^"']+)["']\s*\]\][ \t]*(?:\r?\n)?/i;

  const match = responseText.match(markerRegex);
  if (!match) {
    // Também testa caso os atributos estejam invertidos (nome antes de arquivo)
    const reversedMarkerRegex = /(?:\r?\n)?[ \t]*\[\[ALVO_EDICAO:\s*nome=["']([^"']+)["']\s+arquivo=["']([^"']+)["']\s*\]\][ \t]*(?:\r?\n)?/i;
    const revMatch = responseText.match(reversedMarkerRegex);
    if (!revMatch) {
      return null;
    }

    const targetName = revMatch[1].trim();
    const filePath = revMatch[2].trim();
    const cleanedText = responseText.replace(reversedMarkerRegex, '').trimEnd();

    return {
      filePath,
      targetName,
      cleanedText,
    };
  }

  const filePath = match[1].trim();
  const targetName = match[2].trim();
  const cleanedText = responseText.replace(markerRegex, '').trimEnd();

  return {
    filePath,
    targetName,
    cleanedText,
  };
}
