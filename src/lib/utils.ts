import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
export const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        ...(value.includes('T') ? { timeStyle: 'short' } : {}),
      }).format(new Date(value.includes('T') ? value : `${value}T12:00:00`))
    : 'Não registrada';
export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/quota/i.test(error.name + error.message))
      return 'Armazenamento insuficiente. Exporte um backup e libere espaço no dispositivo.';
    if (error.name === 'ZodError') return 'Dados inválidos. Confira os campos e tente novamente.';
    return error.message;
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
