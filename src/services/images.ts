const MAX_INPUT = 20 * 1024 * 1024;
export async function imageSignature(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (blob.type === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (blob.type === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  if (blob.type === 'image/webp')
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  return false;
}
async function resize(source: ImageBitmap, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não permite processar esta fotografia.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível processar a imagem.'))),
      'image/jpeg',
      quality,
    ),
  );
}
export async function preparePhotos(files: File[], onProgress?: (done: number) => void) {
  if (files.length > 30) throw new Error('Selecione até 30 fotografias por vez.');
  const output: { arquivo: Blob; miniatura: Blob; descricao: string }[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_INPUT) throw new Error(`${file.name}: o limite é de 20 MB por fotografia.`);
    if (!(await imageSignature(file)))
      throw new Error(`${file.name}: use uma fotografia JPEG, PNG ou WebP válida.`);
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new Error(`${file.name}: a imagem não pôde ser aberta.`);
    }
    try {
      if (bitmap.width * bitmap.height > 100_000_000)
        throw new Error(`${file.name}: a resolução excede o limite de 100 megapixels.`);
      // Canvas re-encoding strips EXIF/location; 2560 px and .92 preserve plate legibility.
      output.push({
        arquivo: await resize(bitmap, 2560, 0.92),
        miniatura: await resize(bitmap, 256, 0.8),
        descricao: '',
      });
    } finally {
      bitmap.close();
    }
    onProgress?.(index + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return output;
}
