/**
 * Načtení souboru CSV v prohlížeči (Import dat). Excel ukládá „CSV UTF-8“, starší „CSV (s oddělovači)“
 * ve windows-1250 a „Text v kódování Unicode“ v UTF-16 – poznáme všechny tři.
 */

export type CsvEncoding = 'UTF-8' | 'windows-1250' | 'UTF-16';

export interface DecodedCsv {
  text: string;
  encoding: CsvEncoding;
}

/** Největší soubor, který přijmeme (5 MB ≈ desítky tisíc řádků). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class ImportFileError extends Error {}

function decode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Bajty → text: UTF-16 podle BOM, jinak UTF-8; když UTF-8 dá náhradní znaky (soubor není UTF-8),
 * zkusí windows-1250 (český Excel).
 */
export function decodeCsvBytes(bytes: Uint8Array): DecodedCsv {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
    throw new ImportFileError('Soubor je sešit Excelu (.xlsx). V Excelu ho uložte jako „CSV UTF-8 (s oddělovači)“ a nahrajte znovu.');
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0)
    throw new ImportFileError('Soubor je sešit Excelu (.xls). V Excelu ho uložte jako „CSV UTF-8 (s oddělovači)“ a nahrajte znovu.');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decode(bytes, 'utf-16le') ?? '', encoding: 'UTF-16' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decode(bytes, 'utf-16be') ?? '', encoding: 'UTF-16' };
  const utf8 = decode(bytes, 'utf-8') ?? '';
  if (!utf8.includes('�')) return { text: utf8, encoding: 'UTF-8' };
  const cp1250 = decode(bytes, 'windows-1250');
  return cp1250 !== null ? { text: cp1250, encoding: 'windows-1250' } : { text: utf8, encoding: 'UTF-8' };
}

export async function readCsvFile(file: File): Promise<DecodedCsv> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportFileError('Soubor je větší než 5 MB – rozdělte ho prosím na menší části.');
  if (!file.size) throw new ImportFileError('Soubor je prázdný.');
  const buffer = await file.arrayBuffer();
  return decodeCsvBytes(new Uint8Array(buffer));
}

export const ENCODING_LABEL: Record<CsvEncoding, string> = {
  'UTF-8': 'UTF-8',
  'windows-1250': 'windows-1250 (starší Excel)',
  'UTF-16': 'UTF-16',
};
