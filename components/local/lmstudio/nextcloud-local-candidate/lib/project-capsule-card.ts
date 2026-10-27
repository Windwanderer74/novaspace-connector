// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireScope } from './access';
import { appPolicyDenial } from './connection-policy';
import { createCard, getCard, resumeNativeProjectCard } from './deck';

/** The native app chooses registered projects; proof is derived only from grants. */
export async function createProjectAwareCard(input: Parameters<typeof createCard>[0],
  context: { http?: { authInfo?: { scopes?: string[] } } }) {
  const deckError = requireScope(context, 'deck:write');
  if (deckError) return { denial: deckError };
  const denied = requireScope(context, 'deck:read') ?? requireScope(context, 'files:read')
    ?? requireScope(context, 'files:write') ?? appPolicyDenial('mindmap', true);
  // Keep the established strict pilot contract. Ordinary boards retain their
  // deck-only creation path; without cross-app grants the native listener may
  // preserve an open assignment, but cannot write a Mindmap on their behalf.
  if (input.boardId === 30 && denied) return { denial: denied };
  return { card: await createCard({ ...input, projectCapsuleFiles: !denied }) };
}

/** Explicit recovery of one existing pilot card; no creation and no automatic retry. */
export async function resumeProjectCapsuleCard(input: { boardId: number; stackId: number; cardId: number },
  context: { http?: { authInfo?: { scopes?: string[] } } }) {
  for (const scope of ['deck:write', 'deck:read', 'files:read', 'files:write']) {
    const denied = requireScope(context, scope); if (denied) return { denial: denied };
  }
  const denied = appPolicyDenial('mindmap', true); if (denied) return { denial: denied };
  if (input.boardId !== 30 || !Number.isSafeInteger(input.cardId) || input.cardId <= 549) throw Error('Außerhalb des begrenzten Projektkapsel-Piloten.');
  const before = await getCard(input.boardId, input.stackId, input.cardId);
  if (before.archived || before.deletedAt) throw Error('Archivierte oder gelöschte Karte wird nicht verändert.');
  const out = await resumeNativeProjectCard(input.boardId, input.cardId);
  if (out.cardId !== input.cardId || !['linked', 'existing-binding'].includes(String(out.state))) throw Error('Wiederaufnahme nicht bestätigt; dieselbe Karte lesen, keine zweite Karte anlegen.');
  const card = await getCard(input.boardId, input.stackId, input.cardId);
  return { result: { ...out, card, originalCardPreserved: true, newCardCreated: false } };
}
