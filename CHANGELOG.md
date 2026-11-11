## [11.0.3](https://github.com/todoist/comms-mcp/compare/v11.0.2...v11.0.3) (2026-11-11)

### Bug Fixes

* **deps:** update @todoist/comms-sdk to 5.0.1 ([#92](https://github.com/todoist/comms-mcp/issues/92)) ([dd592a3](https://github.com/todoist/comms-mcp/commit/dd592a3e4627e5b26d86223f2cc8ac55a9e520a0))

## [11.0.2](https://github.com/todoist/comms-mcp/compare/v11.0.1...v11.0.2) (2026-11-11)

### Bug Fixes

* mark update-channel and update-object as destructive ([#91](https://github.com/todoist/comms-mcp/issues/91)) ([6f38d4c](https://github.com/todoist/comms-mcp/commit/6f38d4c449549d32097f019c2f7afec6cefeb459))

## [11.0.1](https://github.com/todoist/comms-mcp/compare/v11.0.0...v11.0.1) (2026-11-11)

### Bug Fixes

* **deps:** move to @todoist/comms-sdk ([#90](https://github.com/todoist/comms-mcp/issues/90)) ([d61687d](https://github.com/todoist/comms-mcp/commit/d61687d1d81037c7d1d44f6954575b29383d9b81))

## [11.0.0](https://github.com/todoist/comms-mcp/compare/v10.2.1...v11.0.0) (2026-11-11)

### ⚠ BREAKING CHANGES

* the package is now published as @todoist/comms-mcp; replace @doist/comms-mcp with @todoist/comms-mcp in dependencies and imports.

### Features

* publish as @todoist/comms-mcp ([#89](https://github.com/todoist/comms-mcp/issues/89)) ([c505ba4](https://github.com/todoist/comms-mcp/commit/c505ba441300ce43871bd972e03f7f5cbe0d0691))

## [10.2.1](https://github.com/todoist/comms-mcp/compare/v10.2.0...v10.2.1) (2026-11-11)

### Bug Fixes

* **ci:** use the todoist GitHub org after the rename ([#88](https://github.com/todoist/comms-mcp/issues/88)) ([20cec5d](https://github.com/todoist/comms-mcp/commit/20cec5d5b4d96ef3790cecb5ab2d48ad01f96ea4))

## [10.2.0](https://github.com/Doist/comms-mcp/compare/v10.1.0...v10.2.0) (2026-11-10)

### Features

* add update-user-info and report the status in user-info ([#72](https://github.com/Doist/comms-mcp/issues/72)) ([8340c00](https://github.com/Doist/comms-mcp/commit/8340c00a2a44260b6b90f6e7feac2a99dd3b4713))

## [10.1.0](https://github.com/Doist/comms-mcp/compare/v10.0.2...v10.1.0) (2026-11-09)

### Features

* tag Comms API requests with usage-tracking headers ([#87](https://github.com/Doist/comms-mcp/issues/87)) ([b3dac0a](https://github.com/Doist/comms-mcp/commit/b3dac0a90cb8bb74de3b80f73fb5a1e6c0303718))

## [10.0.2](https://github.com/Doist/comms-mcp/compare/v10.0.1...v10.0.2) (2026-11-09)

### Bug Fixes

* **deps:** move to @doist/mcp-core 0.4.0, and run its shared suites ([#86](https://github.com/Doist/comms-mcp/issues/86)) ([430db3c](https://github.com/Doist/comms-mcp/commit/430db3ce0305b30636484100c83961829654526d))

## [10.0.1](https://github.com/Doist/comms-mcp/compare/v10.0.0...v10.0.1) (2026-11-09)

### Bug Fixes

* report the package version as the server version ([#85](https://github.com/Doist/comms-mcp/issues/85)) ([8d50087](https://github.com/Doist/comms-mcp/commit/8d500871842474a2e4e882350d16c74e088a0d65))

## [10.0.0](https://github.com/Doist/comms-mcp/compare/v9.0.0...v10.0.0) (2026-11-09)

### ⚠ BREAKING CHANGES

* share the host contract from @doist/mcp-core/host (#83)

### Features

* share the host contract from @doist/mcp-core/host ([#83](https://github.com/Doist/comms-mcp/issues/83)) ([b2c83e0](https://github.com/Doist/comms-mcp/commit/b2c83e051d20409600d1a312dabd0aa9e7701229))

## [9.0.0](https://github.com/Doist/comms-mcp/compare/v8.2.1...v9.0.0) (2026-11-08)

### ⚠ BREAKING CHANGES

* build tool registration on @doist/mcp-core (#82)

### Features

* build tool registration on @doist/mcp-core ([#82](https://github.com/Doist/comms-mcp/issues/82)) ([3e42378](https://github.com/Doist/comms-mcp/commit/3e4237814dbd78c99fa8c5a408a99572589655a7))

## [8.2.1](https://github.com/Doist/comms-mcp/compare/v8.2.0...v8.2.1) (2026-11-08)

### Bug Fixes

* keep tool arguments out of the error log ([#81](https://github.com/Doist/comms-mcp/issues/81)) ([6a19abc](https://github.com/Doist/comms-mcp/commit/6a19abc6feb6ae52d31811fa8c92ffdd5335f124))

## [8.2.0](https://github.com/Doist/comms-mcp/compare/v8.1.2...v8.2.0) (2026-11-05)

### Features

* **list-conversations:** Find group chats by title ([#73](https://github.com/Doist/comms-mcp/issues/73)) ([bd57792](https://github.com/Doist/comms-mcp/commit/bd57792c65af55977e69bfa80891089e168d3992))

## [8.1.2](https://github.com/Doist/comms-mcp/compare/v8.1.1...v8.1.2) (2026-11-02)

### Performance Improvements

* resolve users with one getUsersByIds call per tool ([#71](https://github.com/Doist/comms-mcp/issues/71)) ([01b99f4](https://github.com/Doist/comms-mcp/commit/01b99f41d95b348e940a81fd7eaadf89d6ee1dc3))

## [8.1.1](https://github.com/Doist/comms-mcp/compare/v8.1.0...v8.1.1) (2026-10-06)

### Bug Fixes

* **deps:** bump @doist/comms-sdk to 3.3.1 to fix HTTP/2 GOAWAY failures ([#61](https://github.com/Doist/comms-mcp/issues/61)) ([19e9414](https://github.com/Doist/comms-mcp/commit/19e9414a967f7bce1711ffa5e94d320afb5f5077))

## [8.1.0](https://github.com/Doist/comms-mcp/compare/v8.0.4...v8.1.0) (2026-09-18)

### Features

* add mark-read tool and fix mark-done read position ([#58](https://github.com/Doist/comms-mcp/issues/58)) ([5508454](https://github.com/Doist/comms-mcp/commit/5508454476cb52f2a45fee0a4696394a3fa56bc9))

## [8.0.4](https://github.com/Doist/comms-mcp/compare/v8.0.3...v8.0.4) (2026-09-07)

### Performance Improvements

* cache MCP tool schemas ([#54](https://github.com/Doist/comms-mcp/issues/54)) ([e4c77f0](https://github.com/Doist/comms-mcp/commit/e4c77f0d182321cb2baae21fc447888077cd3c2e))

## [8.0.3](https://github.com/Doist/comms-mcp/compare/v8.0.2...v8.0.3) (2026-08-31)

### Bug Fixes

* take comms-sdk 3.0.2 for retry backoff on retired connections ([#52](https://github.com/Doist/comms-mcp/issues/52)) ([2fff911](https://github.com/Doist/comms-mcp/commit/2fff911fd4905192a75347b4cbc1938d9cbca9ef))

## [8.0.2](https://github.com/Doist/comms-mcp/compare/v8.0.1...v8.0.2) (2026-08-31)

### Bug Fixes

* put the first failure reason in the mark-done log message ([#51](https://github.com/Doist/comms-mcp/issues/51)) ([61ff86d](https://github.com/Doist/comms-mcp/commit/61ff86d2b72841e334c2ad4165b56c455545b816))

## [8.0.1](https://github.com/Doist/comms-mcp/compare/v8.0.0...v8.0.1) (2026-08-28)

### Bug Fixes

* log the mark-done operations that did not apply ([#50](https://github.com/Doist/comms-mcp/issues/50)) ([1a42f7d](https://github.com/Doist/comms-mcp/commit/1a42f7d75c20099ed59a0fa4df88ab35bf4ed65c))

## [8.0.0](https://github.com/Doist/comms-mcp/compare/v7.0.1...v8.0.0) (2026-08-26)

### ⚠ BREAKING CHANGES

* comms-sdk 3 is ESM-only, so consumers type-checking
against this package need moduleResolution node16, nodenext or bundler.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

* test: cover relative thread links, and run Jest through cross-env

The relative thread link is the one path this change rewrote that had no
test; the relative conversation link was already covered. Adds both the
channel and inbox variants.

Runs Jest through cross-env so the NODE_OPTIONS assignment works on
Windows shells too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

### Features

* take comms-sdk 3 and run Jest as ESM ([#48](https://github.com/Doist/comms-mcp/issues/48)) ([0db7749](https://github.com/Doist/comms-mcp/commit/0db7749ed11e76607e0682e6a61921168a895571))

## [7.0.1](https://github.com/Doist/comms-mcp/compare/v7.0.0...v7.0.1) (2026-08-24)

### Bug Fixes

* upgrade Comms SDK to 2.0.1 ([#46](https://github.com/Doist/comms-mcp/issues/46)) ([446ff36](https://github.com/Doist/comms-mcp/commit/446ff36e643cda4b42360b3fdca9585516248be7))

## [7.0.0](https://github.com/Doist/comms-mcp/compare/v6.3.0...v7.0.0) (2026-08-19)

### ⚠ BREAKING CHANGES

* migrate to MCP SDK v2 (#45)

### Features

* migrate to MCP SDK v2 ([#45](https://github.com/Doist/comms-mcp/issues/45)) ([3291ad6](https://github.com/Doist/comms-mcp/commit/3291ad6354efa03fa78b1ab6153b47e6095f5a78))

## [6.3.0](https://github.com/Doist/comms-mcp/compare/v6.2.3...v6.3.0) (2026-08-11)

### Features

* announce new releases in Comms ([#43](https://github.com/Doist/comms-mcp/issues/43)) ([2dbc2d8](https://github.com/Doist/comms-mcp/commit/2dbc2d86f2345eaea4d14345f03b5bf0a12cf7c3))

## [6.2.3](https://github.com/Doist/comms-mcp/compare/v6.2.2...v6.2.3) (2026-08-11)

### Bug Fixes

* log the lookups the tools degrade past ([#41](https://github.com/Doist/comms-mcp/issues/41)) ([4e69aba](https://github.com/Doist/comms-mcp/commit/4e69aba01b918d163c1cf14802df42921637c192))

## [6.2.2](https://github.com/Doist/comms-mcp/compare/v6.2.1...v6.2.2) (2026-08-11)

### Bug Fixes

* **fetch-inbox:** log participant lookups that fail ([#39](https://github.com/Doist/comms-mcp/issues/39)) ([29693c3](https://github.com/Doist/comms-mcp/commit/29693c34dd4334d92631fad2bd1baad6dc090da2))

## [6.2.1](https://github.com/Doist/comms-mcp/compare/v6.2.0...v6.2.1) (2026-08-11)

### Bug Fixes

* tolerate users the viewer cannot see in full ([#40](https://github.com/Doist/comms-mcp/issues/40)) ([feabbfa](https://github.com/Doist/comms-mcp/commit/feabbfaa7e12d6abe285b23d6af7e1ddd4bec635))

## [6.2.0](https://github.com/Doist/comms-mcp/compare/v6.1.0...v6.2.0) (2026-07-29)

### Features

* document Comms mention and reference syntax for LLM clients ([#34](https://github.com/Doist/comms-mcp/issues/34)) ([aea2eb9](https://github.com/Doist/comms-mcp/commit/aea2eb95bf19a3aed6e3fcaa6627795486e8f699))

## [6.1.0](https://github.com/Doist/comms-mcp/compare/v6.0.0...v6.1.0) (2026-07-29)

### Features

* **get-groups:** add includeMembers to list group members ([#33](https://github.com/Doist/comms-mcp/issues/33))` ([b792192](https://github.com/Doist/comms-mcp/commit/b792192438b8d264cc49e9be3605ab98314d5f59))

## [6.0.0](https://github.com/Doist/comms-mcp/compare/v5.12.0...v6.0.0) (2026-07-16)

### ⚠ BREAKING CHANGES

* require node >=24, test on 24 & 26, support npm >=11 (#28)

### Features

* require node >=24, test on 24 & 26, support npm >=11 ([#28](https://github.com/Doist/comms-mcp/issues/28)) ([251db80](https://github.com/Doist/comms-mcp/commit/251db8068447d813ffd79df544da421c1f9e8b17))

## [5.12.0](https://github.com/Doist/comms-mcp/compare/v5.11.0...v5.12.0) (2026-07-15)

### Features

* add create-conversation tool ([#27](https://github.com/Doist/comms-mcp/issues/27)) ([e509afb](https://github.com/Doist/comms-mcp/commit/e509afbcb01c9d41b617003de1d03d8a3c5fb5e5))

## [5.11.0](https://github.com/Doist/comms-mcp/compare/v5.10.0...v5.11.0) (2026-07-07)

### Features

* clarify search-content and get-mentions result id contract ([#25](https://github.com/Doist/comms-mcp/issues/25)) ([8f297e2](https://github.com/Doist/comms-mcp/commit/8f297e2733fc674d981509edbef3d17338f65c4b))

## [5.10.0](https://github.com/Doist/comms-mcp/compare/v5.9.0...v5.10.0) (2026-07-06)

### Features

* add list-conversations tool ([#24](https://github.com/Doist/comms-mcp/issues/24)) ([dd04864](https://github.com/Doist/comms-mcp/commit/dd0486420406006666c3163a3b49fc58643cb04d))

## [5.9.0](https://github.com/Doist/comms-mcp/compare/v5.8.1...v5.9.0) (2026-07-06)

### Features

* expose notifyAudience on create-thread ([#22](https://github.com/Doist/comms-mcp/issues/22)) ([25e4296](https://github.com/Doist/comms-mcp/commit/25e4296dc4f27e36314ccf0f783210db3d5e94a6))

## [5.8.1](https://github.com/Doist/comms-mcp/compare/v5.8.0...v5.8.1) (2026-06-19)

### Bug Fixes

* **mark-done:** archive defines done; secondary failures become warnings ([#19](https://github.com/Doist/comms-mcp/issues/19)) ([14d63f3](https://github.com/Doist/comms-mcp/commit/14d63f30db237992220f318806dc23933c0fdcf1))

## [5.8.0](https://github.com/Doist/comms-mcp/compare/v5.7.2...v5.8.0) (2026-06-19)

### Features

* expose attachments in load-thread and load-conversation output ([#16](https://github.com/Doist/comms-mcp/issues/16)) ([9689639](https://github.com/Doist/comms-mcp/commit/9689639d44ddba382c7b74e3040307a5933f0fe5))

## [5.7.2](https://github.com/Doist/comms-mcp/compare/v5.7.1...v5.7.2) (2026-06-15)

### Bug Fixes

* **deps:** bump @doist/comms-sdk to 0.4.6 ([#15](https://github.com/Doist/comms-mcp/issues/15)) ([39e97bc](https://github.com/Doist/comms-mcp/commit/39e97bcbdca11831d647e4cd846568a9eb67044d))

## [5.7.1](https://github.com/Doist/comms-mcp/compare/v5.7.0...v5.7.1) (2026-06-15)

### Bug Fixes

* **deps:** bump @doist/comms-sdk to ^0.4.5 ([#14](https://github.com/Doist/comms-mcp/issues/14)) ([2a6d088](https://github.com/Doist/comms-mcp/commit/2a6d088132baf8c36da5353a151f98f8372a96ab))

## [5.7.0](https://github.com/Doist/comms-mcp/compare/v5.6.0...v5.7.0) (2026-06-10)

### Features

* export validateCommsToken for token validation ([#13](https://github.com/Doist/comms-mcp/issues/13)) ([3db54b0](https://github.com/Doist/comms-mcp/commit/3db54b0cfdd6b2c024699f11036faf7738407a54))

## [5.6.0](https://github.com/Doist/comms-mcp/compare/v5.5.0...v5.6.0) (2026-05-27)

### Features

* **create-thread:** opt-in Inbox display via displayInInbox param + env var ([#6](https://github.com/Doist/comms-mcp/issues/6)) ([7ce6e27](https://github.com/Doist/comms-mcp/commit/7ce6e27024deacf0018363f4f1e530f01f43e906))

## [5.5.0](https://github.com/Doist/comms-mcp/compare/v5.4.0...v5.5.0) (2026-05-25)

### Features

* Add channel create/update tools ([#4](https://github.com/Doist/comms-mcp/issues/4)) ([8fdb4c8](https://github.com/Doist/comms-mcp/commit/8fdb4c8f5ed2ff84559fd6d96498f1bdc8338816))

# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Forked from [Doist/twist-ai](https://github.com/Doist/twist-ai); renamed
  to `@doist/comms-mcp` and re-targeted at the Comms API via
  [`@doist/comms-sdk`](https://github.com/Doist/comms-sdk-typescript).
