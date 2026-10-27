// SPDX-License-Identifier: AGPL-3.0-or-later
type CardSnapshot = { id: number; stackId: number; title: string; deletedAt?: number };

/** Compare every native PUT field, identity and observed modification stamp. */
export function sameCard(a: CardSnapshot, b: CardSnapshot) {
  const left = a as unknown as Record<string, unknown>, right = b as unknown as Record<string, unknown>;
  return !b.deletedAt && ['id','stackId','title','description','done','type','owner','order','duedate','startdate','color','archived','lastModified']
    .every(key => JSON.stringify(left[key]) === JSON.stringify(right[key]));
}
