// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');const assert=require('node:assert/strict');const api=require('../plugin.cjs');
test('Organizer extension starts off; ordinary Calendar offers a preview without silently offering organizer writes',()=>{
 assert.equal(api.configSchematics.parse({fields:[]}).get('calendarInvitations'),false);
 const basic=api.selectedNames({topics:['calendar']});
 assert.ok(basic.has('calendar_prepare_meeting'));assert.ok(!basic.has('calendar_submit_meeting'));
 const replies=api.selectedNames({topics:['calendar','invitationReplies']});
 assert.ok(replies.has('calendar_respond_invitation'));assert.ok(!replies.has('calendar_submit_meeting'));
});
test('Organizer selection stands alone with its required native readers, and exclusions still prevail',()=>{
 const names=api.selectedNames({topics:['calendarInvitations']});
 assert.deepEqual(names,new Set([...api.BASE_TOOLS,'calendar_list','calendar_read_settings','calendar_read_scheduling','calendar_read_event','calendar_prepare_meeting','calendar_submit_meeting']));
 assert.ok(!names.has('calendar_respond_invitation'));
 assert.ok(!api.selectedNames({topics:['calendarInvitations'],excludedTools:['calendar_submit_meeting']}).has('calendar_submit_meeting'));
});
