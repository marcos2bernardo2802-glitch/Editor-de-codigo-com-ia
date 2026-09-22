import { ChatImageAttachment } from '../types';

export const MAX_IMAGE_DIMENSION = 1568;
export const JPEG_QUALITY = 0.85;
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;

/**
 * Reduz a imagem no navegador usando Canvas:
 * - Lado maior no máximo 1568 px
 * - Formato JPEG com qualidade 0.85
 */
export async function resizeImageFile(file: File): Promise<ChatImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo de imagem.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível decodificar o arquivo como imagem.'));
      img.onload = () => {
        let { width, height } = img;

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
            width = MAX_IMAGE_DIMENSION;
          } else {
            width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
            height = MAX_IMAGE_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Não foi possível obter contexto 2D do Canvas.'));
        }

        // Fundo branco para garantir que PNGs transparentes não fiquem pretos em JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        const commaIdx = dataUrl.indexOf(',');
        const base64 = commaIdx !== -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;

        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name || 'imagem.jpg',
          dataUrl,
          base64,
          mimeType: 'image/jpeg',
          width,
          height,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Valida e processa múltiplos arquivos até o limite de 3
 */
export async function processImageFiles(
  files: FileList | File[],
  currentAttachments: ChatImageAttachment[]
): Promise<{ added: ChatImageAttachment[]; warning?: string }> {
  const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (fileArray.length === 0) {
    return { added: [], warning: 'Apenas arquivos de imagem são suportados.' };
  }

  const remainingSlots = MAX_ATTACHMENTS_PER_MESSAGE - currentAttachments.length;
  if (remainingSlots <= 0) {
    return {
      added: [],
      warning: `Limite de ${MAX_ATTACHMENTS_PER_MESSAGE} imagens por mensagem já atingido.`,
    };
  }

  const toProcess = fileArray.slice(0, remainingSlots);
  const results = await Promise.all(toProcess.map((f) => resizeImageFile(f)));

  let warning: string | undefined;
  if (fileArray.length > remainingSlots) {
    warning = `Apenas ${remainingSlots} imagem(ns) foram adicionadas (limite máximo: ${MAX_ATTACHMENTS_PER_MESSAGE}).`;
  }

  return { added: results, warning };
}
