// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');const assert=require('node:assert/strict');const api=require('../plugin.cjs');
test('Native replies are disabled by default; Calendar reads invitations without silently offering sends',()=>{
 assert.equal(api.configSchematics.parse({fields:[]}).get('invitationReplies'),false);
 const basic=api.selectedNames({topics:['calendar']});for(const name of ['calendar_read_scheduling','calendar_read_invitation'])assert.ok(basic.has(name));assert.ok(!basic.has('calendar_respond_invitation'));
 assert.ok(api.selectedNames({topics:['calendar','invitationReplies']}).has('calendar_respond_invitation'));
});
