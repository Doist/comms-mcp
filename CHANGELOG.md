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
