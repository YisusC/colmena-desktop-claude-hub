// Stored as a small data URL so it does not depend on the file still existing.
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, nativeImage, type BrowserWindow, type NativeImage } from 'electron';

export type PickIconResult = { ok: true; icon: string } | { ok: false; error: string } | null;

const RASTER = new Set(['.png', '.jpg', '.jpeg', '.ico', '.bmp']);
const MAX_SVG_BYTES = 100 * 1024;
const MAX_SIDE = 64;

function shrink(img: NativeImage): string {
  const { width, height } = img.getSize();
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height, 1));
  const out = scale < 1 ? img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : img;
  return out.toDataURL();
}

export async function pickIcon(win: BrowserWindow | null): Promise<PickIconResult> {
  const opts: Electron.OpenDialogOptions = {
    title: 'Elegir ícono',
    properties: ['openFile'],
    filters: [
      { name: 'Imágenes e íconos', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp', 'svg'] },
      { name: 'Cualquier archivo (usa su ícono de Windows)', extensions: ['*'] },
    ],
  };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const file = r.canceled ? undefined : r.filePaths[0];
  if (!file) return null;
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.svg') {
      const buf = fs.readFileSync(file);
      if (buf.length > MAX_SVG_BYTES) return { ok: false, error: 'El SVG pesa más de 100 KB.' };
      if (!/<svg[\s>]/i.test(buf.toString('utf8'))) return { ok: false, error: 'El archivo no parece un SVG válido.' };
      // Shown with <img>: in that context an SVG does not run scripts.
      return { ok: true, icon: `data:image/svg+xml;base64,${buf.toString('base64')}` };
    }
    if (RASTER.has(ext)) {
      const img = nativeImage.createFromPath(file);
      if (img.isEmpty()) return { ok: false, error: 'No pude leer esa imagen. Prueba con PNG, JPG o ICO.' };
      return { ok: true, icon: shrink(img) };
    }
    const img = await app.getFileIcon(file, { size: 'large' });
    if (img.isEmpty()) return { ok: false, error: 'Ese archivo no tiene un ícono que se pueda usar.' };
    return { ok: true, icon: shrink(img) };
  } catch (err) {
    return { ok: false, error: `No pude abrir el archivo: ${(err as Error).message}` };
  }
}
