// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Client } from './deck-mindmap-client';
import type { WorkStepClient } from '../lib/work-step-core';

export function browserWorkStepClient(client: Client, request: (url: string, init?: RequestInit) => Promise<Response>, api: string, uid: string): WorkStepClient {
  return {
    map: client.map, saveMap: client.saveMap,
    target: async (boardId, stackId) => {
      const boards = await (await request(`${api}/boards`)).json();
      const board = boards.find((b: any) => b.id === boardId && !b.archived && !b.deletedAt);
      const stacks = await (await request(`${api}/boards/${boardId}/stacks`)).json();
      if (!board || board.permissions?.PERMISSION_EDIT !== true || !stacks.some((s: any) => s.id === stackId && s.boardId === boardId && !s.deletedAt)) throw Error('Beschreibbares Board oder Anfangsspalte nicht bestätigt.');
    },
    cards: async boardId => {
      const stacks = await (await request(`${api}/boards/${boardId}/stacks`)).json();
      const cards = stacks.flatMap((s: any) => (s.cards ?? []).filter((c: any) => !c.deletedAt).map((c: any) => ({ ...c, stackId: s.id })));
      const out = [];
      for (let i = 0; i < cards.length; i += 6) out.push(...await Promise.all(cards.slice(i, i + 6).map((c: any) => typeof c.description === 'string' ? c : client.card({ boardId, stackId: c.stackId, cardId: c.id }))));
      return out;
    },
    createCard: async (boardId, stackId, title, description) => (await request(`${api}/boards/${boardId}/stacks/${stackId}/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, type: 'plain', owner: uid, order: 999 }) })).json(),
    card: (boardId, stackId, cardId) => client.card({ boardId, stackId, cardId }),
    saveCard: (boardId, card, title, description) => client.saveCard({ boardId, stackId: card.stackId, cardId: card.id }, card, title, description),
  };
}
