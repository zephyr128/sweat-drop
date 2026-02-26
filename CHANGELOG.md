# Changelog

All notable changes to the SWEATDROP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Agent communication protocol (`docs/AGENT_COMMUNICATION.md`)
- Changelog file for tracking all changes
- Migration notes system for database changes

### Changed
- SmartCoach card on home screen now conditionally renders based on `gym.smartcoach_enabled` flag
  - Card is hidden when SmartCoach is disabled for the active gym
  - Updated `Gym` interface in `useGymStore.ts` to include `smartcoach_enabled` field
- Workout screen now checks `smartcoach_enabled` before loading SmartCoach plan items
  - SmartCoach mode is disabled if the gym doesn't have SmartCoach enabled
  - Added `smartcoach_enabled` to gym query in `createSession` function
  - Added check in `loadPlanItem` to prevent SmartCoach mode when feature is disabled

---

## [2025-01-27] - Initial Setup

### Added
- Multi-agent workflow system with 5 agent personas
- Architecture documentation (`ARCHITECTURE.md`)
- State of the app tracking (`STATE_OF_THE_APP.md`)
- Cursor rules for context-aware development (`.cursorrules`)
- Agent persona rules (`.cursor/rules/*.mdc`)

### Documentation
- System architecture documentation
- State tracking documentation
- Agent communication protocol

---

**Note:** This changelog is maintained by all agents. Each agent should add entries when making significant changes.
