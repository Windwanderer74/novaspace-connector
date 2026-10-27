// SPDX-License-Identifier: AGPL-3.0-or-later
export const TEXT_FILE_MAX_BYTES = 128 * 1024;
export const MINDMAP_MAX_BYTES = 512 * 1024;

/** The larger budget is reserved for native mindmap JSON, not arbitrary text. */
export function textFileMaxBytes(path: string) {
  return /\.km$/i.test(path) ? MINDMAP_MAX_BYTES : TEXT_FILE_MAX_BYTES;
}
