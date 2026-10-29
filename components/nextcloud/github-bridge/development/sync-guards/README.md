# Bridge 0.1.1: selected sync adapter and guarded CLI update

AGPL-3.0-or-later; see ../../LICENSE. This directory contains a tested update candidate for an existing NovaSpace bridge 0.1.0 installation, plus isolated upstream regression fixtures.

## Resulting behavior

A sync explicitly invoked through the NovaSpace bridge uses the unchanged upstream SyncService with a per-run GithubProjectService adapter. Reverse-capable runs fetch all paginated Project items without the updated-date filter that omitted drafts. Forward-only incremental queries remain unchanged.

The adapter respects the mapping and field directions before exposing status names for Deck list creation, preparing GitHub status options, or creating missing date fields. It retains the native sync service's locking, timestamp conflict rule, owner/session handling, mapping persistence and item tracking. It changes no mapping direction or field configuration.

Bridge results include native transfer counts, warning/error counts and an optional rate-limit timestamp. Native errors are explicit; malformed results remain uncertain. Private native messages are excluded. These counts do not prove an item-level commit or readback.

The original app's own cron and settings-page sync do not use this adapter. Their reverse-path behavior remains a separate upstream issue.

## Verified source

All three upstream service files were matched byte-for-byte to the installed baseline at the pinned upstream commit d750a58e5f018d854c11f3a3811aa4c3f3f1ed77. The installed bridge files match the published baseline after removing its added SPDX header. Source fingerprints are fixed in the runtime adapter and install manifest. A later upstream source change stops the adapter until compatibility is reviewed.

The fixture preserves upstream copyright/license headers. The patch under patches/ is an isolated proposal tested against that fixture; the CLI installer does not apply it to the signed app.

## Package and recovery

Build deterministically with:

    python components/nextcloud/github-bridge/development/sync-guards/build-install-bundle.py

The generated NovaSpace_GitHub_Sync_Bridge_0_1_1_Installer.php.txt is CLI-only. Run it from the existing Nextcloud root with PHP 8.3 or later, after verifying INSTALL_SHA256.json.

The installer validates the three upstream hashes and the two existing bridge hashes before replacing any app file. It installs only GithubSyncProjectAdapter.php, GithubBridgeCore.php and GithubBridgeService.php under the existing platform app. It refuses a signed platform target rather than changing signed contents.

Original files and a manifest are saved with protected permissions under the configured data directory. Files are replaced atomically one at a time, independently read back, and restored if installation fails. Unknown/concurrently edited files are preserved. Repeating a successful install is a no-op.

For explicit recovery, set NOVASPACE_SYNC_ROLLBACK to the exact backupId returned by installation, then run the same verified installer from the Nextcloud root. Recovery validates the backup and current files before restoring. It refuses path traversal, changed backups and later user edits.

The signed upstream app, its signatures, credentials, account permissions and mapping settings are not modified. No sync runs as part of installation.

## Validation and remaining acceptance

The checks include the original baseline reproduction and patched-source regression, 34 existing bridge guards, 24 result-reporting checks, 32 checks of the unchanged SyncService with the adapter/factory, 19 checks against the real upstream GithubProjectService, and 16 installer/recovery test cases. The CI rebuilds the package and verifies reproducibility.

These are isolated tests. SyncService and GithubProjectService logic are real pinned source; remote transport and Nextcloud service dependencies are doubles. Installer tests use a filesystem/Nextcloud bootstrap fixture with failure injection at the I/O boundary. They do not claim a full clean Nextcloud/Deck integration or a completed hosting acceptance.

After the controlled hosting installation, first read the bridge version, then test the selected private mapping and read the complete Deck/GitHub/mindmap results. Native conflict/archive cases and the independent scheduled-job proof remain open. The PR stays a development draft until its release and acceptance work is completed.
