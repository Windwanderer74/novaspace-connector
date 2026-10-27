// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../plugin.cjs');
const mutations=['deck_create_board_share','deck_update_board_share','deck_revoke_board_share'];
test('Board sharing writes require the extra selection; ordinary Deck only adds the read tool',()=>{
 assert.equal(api.configSchematics.parse({fields:[]}).get('boardShares'),false);
 const ordinary=api.selectedNames({topics:['deck']});
 assert.ok(ordinary.has('deck_read_board_shares'));
 for(const name of mutations)assert.ok(!ordinary.has(name),name);
 const chosen=api.selectedNames({topics:['deck','boardShares']});
 for(const name of ['deck_read_board_shares',...mutations])assert.ok(chosen.has(name),name);
});
