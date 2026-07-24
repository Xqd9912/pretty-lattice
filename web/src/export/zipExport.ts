import { saveBlob } from "./saveFile";
import type { FigureExportFile } from "./types";

interface ZipEntryData {
  data: Uint8Array;
  path: string;
}

export async function downloadFigureExportZip(
  files: FigureExportFile[],
  sourceFileName: string | null,
  exportFileStem: (fileName: string | null) => string,
) {
  if (files.length === 0) {
    throw new Error("No export files were generated.");
  }

  const stem = exportFileStem(sourceFileName);
  const zipBlob = await createFigureExportZipBlob(files, stem);
  await downloadBlob(zipBlob, `${stem}.zip`);
}

export async function downloadFigureExportFiles(
  files: FigureExportFile[],
  sourceFileName: string | null,
  exportFileStem: (fileName: string | null) => string,
) {
  if (files.length === 0) {
    throw new Error("No export files were generated.");
  }

  if (files.length === 1) {
    const file = files[0]!;
    await downloadBlob(file.blob, file.fileName);
    return;
  }

  await downloadFigureExportZip(files, sourceFileName, exportFileStem);
}

/** Save `blob` as `fileName`. Resolves `false` if the user dismissed the save dialog. */
export function downloadBlob(blob: Blob, fileName: string): Promise<boolean> {
  return saveBlob(blob, fileName);
}

export async function createFigureExportZipBlob(
  files: FigureExportFile[],
  folderName: string,
): Promise<Blob> {
  const entries: ZipEntryData[] = [];
  for (const file of files) {
    entries.push({
      data: new Uint8Array(await file.blob.arrayBuffer()),
      path: `${folderName}/${file.fileName}`,
    });
  }

  return createZipBlob(entries);
}

export async function createZipBlob(entries: ZipEntryData[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const localHeader = zipLocalFileHeader(fileName, entry.data.byteLength, crc);
    const centralHeader = zipCentralDirectoryHeader(
      fileName,
      entry.data.byteLength,
      crc,
      offset,
    );

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endRecord = zipEndOfCentralDirectoryRecord(
    entries.length,
    centralDirectorySize,
    centralDirectoryOffset,
  );

  const parts = [...localParts, ...centralParts, endRecord].map(uint8ArrayBlobPart);
  return new Blob(parts, {
    type: "application/zip",
  });
}

function uint8ArrayBlobPart(value: Uint8Array): BlobPart {
  return value as BlobPart;
}

function zipLocalFileHeader(fileName: Uint8Array, size: number, crc: number): Uint8Array {
  const header = new Uint8Array(30 + fileName.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, fileName.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(fileName, 30);
  return header;
}

function zipCentralDirectoryHeader(
  fileName: Uint8Array,
  size: number,
  crc: number,
  localHeaderOffset: number,
): Uint8Array {
  const header = new Uint8Array(46 + fileName.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, fileName.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  header.set(fileName, 46);
  return header;
}

function zipEndOfCentralDirectoryRecord(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  }),
);
