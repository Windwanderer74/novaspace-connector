// SPDX-License-Identifier: AGPL-3.0-or-later
import { createCard, getCard, listBoards, listStacks, updateCard, deckBoardUrl } from './deck';
import { readMindmap } from './mindmap';
import { updateTextFile } from './files-write';
import { mindmapSummary } from './mindmap-core';
import { createWorkStep, type WorkStepClient, type WorkStepInput } from './work-step-core';

export async function createMindmapWorkStep(input: WorkStepInput) {
  const client: WorkStepClient = {
    map: readMindmap,
    saveMap: async (path, etag, fileId, text) => { const out = await updateTextFile(path, etag, text, fileId); if (!out.verified) throw Error('Mindmap-Rücklesung offen.'); },
    target: async (boardId, stackId) => {
      const board = (await listBoards()).find(b => b.id === boardId && !b.deletedAt);
      if (!board || board.permissions?.PERMISSION_EDIT !== true || !(await listStacks(boardId)).some(s => s.id === stackId && s.boardId === boardId && !s.deletedAt)) throw Error('Beschreibbares Board oder Anfangsspalte nicht bestätigt.');
    },
    cards: async boardId => { const cards = (await listStacks(boardId)).flatMap(s => (s.cards ?? []).filter(c => !c.deletedAt).map(c => ({ ...c, stackId: s.id }))); const out = []; for (let i = 0; i < cards.length; i += 6) out.push(...await Promise.all(cards.slice(i, i + 6).map(c => typeof c.description === 'string' ? c : getCard(boardId, c.stackId, c.id)))); return out; },
    createCard: (boardId, stackId, title, description) => createCard({ boardId, stackId, title, description }),
    card: getCard,
    saveCard: (boardId, card, title, description) => updateCard({ boardId, stackId: card.stackId, cardId: card.id, title, description }),
  };
  const result = await createWorkStep(client, input, new URL(deckBoardUrl(input.boardId)).origin);
  return { ...result, ...mindmapSummary(result.map), note: 'Gemeinsamer Arbeitsschritt mit erster Bedingungsliste. Bei unterbrochener Anlage dieselbe nodeId frisch lesen und wiederaufnehmen. Kein atomarer Vorgang über Deck und DAV.' };
}
