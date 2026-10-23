// SPDX-License-Identifier: AGPL-3.0-or-later
export const MAIN_TOPICS = ['files', 'deck', 'mindmap', 'calendar', 'mail', 'notes', 'tasks', 'contacts'] as const;
export const EXTENSIONS = ['tables', 'talk', 'announcements', 'inventory', 'sharing', 'trash'] as const;
export type Topic = typeof MAIN_TOPICS[number] | typeof EXTENSIONS[number];
export const SOURCE_PLUGIN = 'mcp/nextcloud-pilot-next2';
export const BASE_TOOLS = ['nextcloud_account', 'nextcloud_capabilities', 'novaspace_connector_help'];

// Explicit catalogue from the supported personal releases through 1.31.0; Inventory is read-only in this selection. A future server
// tool is never implicitly enabled by a name prefix or a wildcard.
export const TOPIC_TOOLS: Record<Topic, readonly string[]> = {
  inventory: ['inventory_status','inventory_list_items','inventory_get_item'],
  sharing: ['files_shares_list','files_share_read','files_share_create','files_share_update','files_share_revoke','files_stat'],
  trash: ['files_trash_list','files_trash_read','files_trash','files_restore','files_stat','files_list'],
  files: ['files_trash_list','files_trash_read','files_shares_list','files_share_read','files_search','files_copy','files_list','files_stat','files_read_text','files_move','files_rename',
    'files_create_folder','files_create_text','files_update_text',
    'files_read_pdf_original_chunk','files_read_image','files_pdf_status','files_read_pdf'],
  tasks: ['tasks_read_list_settings','tasks_create_list','tasks_update_list','tasks_list_lists', 'tasks_search', 'tasks_read', 'tasks_create', 'tasks_update', 'tasks_delete'],
  contacts: ['contacts_read_addressbook_settings','contacts_create_addressbook','contacts_update_addressbook','contacts_export_vcf','contacts_prepare_vcf_import','contacts_import_vcf','contacts_list_addressbooks', 'contacts_search', 'contacts_read', 'contacts_create', 'contacts_update', 'contacts_delete'],
  notes: ['notes_resolve_file','notes_list_attachments','notes_attach_image','notes_prepare_delete','notes_export_text','notes_import_text','notes_list', 'notes_read', 'notes_create', 'notes_update'],
  deck: ['deck_read_structure','deck_create_board','deck_update_board','deck_create_stack','deck_update_stack','deck_list_comments','deck_create_comment','deck_update_comment','deck_list_attachments','deck_resolve_attachment_file','deck_attach_file','deck_detach_file','deck_read_board','deck_read_card','deck_list_cards','deck_save_label','deck_set_card_label','deck_set_assignee','search','fetch','get_board','list_boards','get_board_structure','get_stack',
    'create_card','update_card','move_card'],
  mindmap: ['mindmap_read','mindmap_create','mindmap_update_nodes',
    'mindmap_link_file','mindmap_add_source_capsule'],
  calendar: ['calendar_read_settings','calendar_create_calendar','calendar_update_calendar','calendar_free_busy','calendar_find_slots','calendar_read_series','calendar_create_series','calendar_update_series','calendar_exclude_occurrence','calendar_export_ics','calendar_prepare_ics_import','calendar_import_ics','calendar_list','calendar_read_period','calendar_read_event',
    'calendar_create_event','calendar_update_event','calendar_delete_event'],
  mail: ['mail_list_accounts','mail_list_folders','mail_list_messages','mail_read_message'],
  tables: ['tables_status','tables_list','tables_read','tables_list_rows',
    'tables_read_row','tables_search_rows'],
  talk: ['talk_list_rooms','talk_read_messages'],
  announcements: ['announcements_status','announcements_list','announcements_read'],
};
export const MINDMAP_FILES = ['files_list','files_stat','files_read_text',
  'files_create_folder','files_pdf_status','files_read_pdf','files_read_image'];
export const MINDMAP_DECK = ['mindmap_link_card','mindmap_sync_card','mindmap_create_work_step'];
export const NOTES_TRASH = ['notes_delete'];
export const KNOWN_TOOLS = new Set([...BASE_TOOLS,...Object.values(TOPIC_TOOLS).flat(),...MINDMAP_DECK,...NOTES_TRASH]);
export interface Selection { topics: readonly Topic[]; extraTools?: readonly string[]; excludedTools?: readonly string[] }

export function selectedNames(selection: Selection): Set<string> {
  if (!Array.isArray(selection.topics) || selection.topics.some(t => !Object.hasOwn(TOPIC_TOOLS,t))) {
    throw new Error('Unbekanntes Thema.');
  }
  const result = new Set(BASE_TOOLS);
  for (const topic of selection.topics as readonly Topic[]) for (const name of TOPIC_TOOLS[topic]) result.add(name);
  if (selection.topics.includes('mindmap')) {
    for (const name of MINDMAP_FILES) result.add(name);
    if (selection.topics.includes('deck')) for (const name of MINDMAP_DECK) result.add(name);
  }
  if (selection.topics.includes('notes') && selection.topics.includes('trash')) for (const name of NOTES_TRASH) result.add(name);
  for (const names of [selection.extraTools ?? [],selection.excludedTools ?? []]) {
    if (!Array.isArray(names) || names.some(n => !KNOWN_TOOLS.has(n))) throw new Error('Unbekanntes Einzelwerkzeug.');
  }
  for (const name of selection.extraTools ?? []) result.add(name);
  for (const name of selection.excludedTools ?? []) result.delete(name);
  return result;
}

// Keep the original objects, schemas, callbacks and provider ownership. The
// returned union is rebuilt for each chat session, never kept in a global cache.
export function selectTools<T extends {name: string}>(tools: readonly T[], selection: Selection): T[] {
  const names = selectedNames(selection);
  const seen = new Set<string>();
  return tools.filter(t => {
    if (!names.has(t.name) || seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });
}

export function chatRequest(selection: Selection, input: string, model: string, availableNames: readonly string[]) {
  const requested = selectedNames(selection);
  const allowed = [...new Set(availableNames)].filter(n => requested.has(n));
  // An explicit empty list must not fall back to all tools.
  return {model,input,integrations: allowed.length ? [{type:'plugin',id:SOURCE_PLUGIN,allowed_tools:allowed}] : []};
}
