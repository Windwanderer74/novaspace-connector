# GitHub sync guard candidate

This directory is a development and regression candidate under AGPL-3.0-or-later; see ../../LICENSE. It is separate from the published runtime snapshots and is not an installable release.

## Observed problem and changes

The pinned upstream implementation can use an updated-date Project search while pulling GitHub data. In the observed GitHub UI behavior, that query omitted an existing draft whose body had changed. The candidate therefore fetches all paginated Project items whenever the mapping permits GitHub-to-Deck updates. Forward-only incremental behavior is retained.

Status setup is now guarded by the status field's direction as well as the mapping direction. With status disabled, reverse runs do not try to create Deck lists, forward runs do not prepare GitHub status options, and an absent unused status field does not produce a warning. Explicit status directions keep their respective setup behavior.

The bridge candidate returns the native counts, warning/error counts and optional rate-limit timestamp. Native errors produce sync_reported_errors. Missing or malformed native results remain unknown, with no automatic retry. Private native messages and extra provider fields are excluded. Counts never claim item-level commit or readback.

## Source boundary

The upstream fixture is the complete SyncService.php from SchVinzenz/Github-Projects-for-Deck at d750a58e5f018d854c11f3a3811aa4c3f3f1ed77, Git blob add2a544736c13fa6fa0e49736d2432cbe6cf7dd. Its copyright and license header are preserved. Its exact origin is recorded in upstream/SOURCE_PROVENANCE.json.

The bridge baseline is the repository's source at 2fadb91748d294395815b7aeb1f5a0fe4c234289. The candidate identifies itself as bridge 0.1.1; the published runtime snapshots remain at their existing version.

The installed upstream file hashes have not been matched. No production deployment, mapping change or access expansion is performed by these files or by the CI workflow.

## Verification

The workflow runs on a GitHub-hosted Ubuntu 24.04 runner with PHP. Checkout is pinned to a commit and does not persist credentials. Workflow permissions are contents:read. Fixtures have no account credentials, hosting paths, user documents or production object identifiers.

The baseline test must reproduce both failures: a draft omitted by the date filter and three list-creation attempts despite status being disabled. The fixed-source test exercises the actual patched SyncService with dependency doubles. It covers full reverse retrieval, hidden checklist identifiers, pagination, unchanged repetition, field boundaries, status directions, cooldown, preservation of missing items and the existing timestamp conflict rule.

Bridge tests retain the existing core guards and verify zero counts, native errors, rate limits, uncertain/malformed results, private-message exclusion and exactly one selected sync call.

These are isolated regression tests. The GitHub query omission is a replay of observed behavior, not a live API assertion. Nextcloud and GitHub dependencies are doubles. A clean Nextcloud integration and the installed-source comparison are required before packaging or production acceptance. Native conflict/archive and scheduled-job acceptance remain separate.

## Reproduce

From the repository root:

    php components/nextcloud/github-bridge/development/sync-guards/tests/native-sync.php components/nextcloud/github-bridge/development/sync-guards/upstream/lib/Service/SyncService.php baseline
    cp -R components/nextcloud/github-bridge/development/sync-guards/upstream .ci-deckgithubsync
    git apply --check --directory=.ci-deckgithubsync components/nextcloud/github-bridge/development/sync-guards/patches/deckgithubsync.diff
    git apply --directory=.ci-deckgithubsync components/nextcloud/github-bridge/development/sync-guards/patches/deckgithubsync.diff
    php components/nextcloud/github-bridge/development/sync-guards/tests/native-sync.php .ci-deckgithubsync/lib/Service/SyncService.php fixed
    php components/nextcloud/github-bridge/development/sync-guards/tests/legacy-bridge-core.php
    php components/nextcloud/github-bridge/development/sync-guards/tests/bridge-results.php

Use a disposable checkout so that the .ci-deckgithubsync directory is initially absent.
