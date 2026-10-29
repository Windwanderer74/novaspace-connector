# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run after copying into the prepared package's tests directory."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('coordinator',Path(__file__).resolve().parents[1]/'update_connector.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CoordinatorTests(unittest.TestCase):
    def run_check(self,flags):
        with patch.object(module,'os',SimpleNamespace(name='nt')),patch.object(module,'verify_package'),patch.object(module.subprocess,'run') as run,patch.object(module.sys,'argv',['update_connector.py','--expected-user','Soul',*flags]):
            module.main()
        self.assertEqual(run.call_count,2)
        commands=[c.args[0] for c in run.call_args_list]
        self.assertTrue(all('--check' in command for command in commands))
        core=commands[1]
        return [core[i+1] for i,v in enumerate(core) if v=='--enable-scope']
    def test_normal_update_keeps_existing_scopes(self):
        self.assertEqual(self.run_check([]),[])
    def test_planning_scope_addition_is_explicit_and_narrow(self):
        self.assertEqual(set(self.run_check(['--enable-planning'])),{area+':'+mode for area in ['notes','tasks','contacts'] for mode in ['read','write']})
    def test_notes_only_option_does_not_grant_tasks_or_contacts(self):
        self.assertEqual(set(self.run_check(['--enable-notes'])),{'notes:read','notes:write'})
    def test_combined_options_deduplicate_new_scopes(self):
        scopes=self.run_check(['--enable-planning','--enable-notes'])
        self.assertEqual(len(scopes),6)
        self.assertEqual(len(set(scopes)),6)

class DeckShareScopeTests(unittest.TestCase):
    run_check=CoordinatorTests.run_check
    def test_calendar_management_is_separate(self):
        self.assertEqual(self.run_check(['--enable-calendar-management']),['calendar:manage'])
    def test_calendar_sharing_is_separate(self):
        self.assertEqual(self.run_check(['--enable-calendar-sharing']),['calendar:share'])
    def test_calendar_organizer_requires_the_explicit_option(self):
        self.assertEqual(self.run_check(['--enable-calendar-organizer']),['calendar:organize'])

    def test_calendar_response_requires_the_explicit_option(self):
        self.assertEqual(self.run_check(['--enable-calendar-replies']),['calendar:schedule'])
    def test_deck_share_requires_the_explicit_option(self):
        self.assertEqual(self.run_check(['--enable-deck-sharing']),['deck:share'])

class ContactManagementScopeTests(unittest.TestCase):
    run_check=CoordinatorTests.run_check
    def test_contact_sharing_requires_explicit_option(self):
        self.assertEqual(self.run_check(['--enable-contact-sharing']),['contacts:share'])
    def test_contact_management_requires_explicit_option(self):
        self.assertEqual(self.run_check(['--enable-contact-management']),['contacts:manage'])

class DeckTrashScopeTests(unittest.TestCase):
    run_check=CoordinatorTests.run_check
    def test_deck_trash_requires_explicit_option(self):
        self.assertEqual(self.run_check(['--enable-deck-trash']),['deck:trash'])

if __name__=='__main__':unittest.main()
