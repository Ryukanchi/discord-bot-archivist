# Changelog

## Unreleased

### Polish
- Added a more structured `/help` guide centered on Archivist's main workflows and primary entrypoints.
- Reduced command-surface duplication by removing the redundant `/archivist help` subcommand.
- Reframed command and embed wording around Archivist as a privacy-first community highlight and memory bot.
- Reduced the prominence of generic utility commands by treating them as secondary in help and documentation.
- Polished the admin overview, privacy, inspect, and weekly recap embeds so they read more like product UI than debug output.
- Improved highlight notification embeds with clearer hierarchy, safer content trimming, richer context, and direct message links.
- Redesigned weekly recap embeds to feel more like a signature product feature with clearer sections and easier scanning.
- Introduced shared embed styling so Archivist's core surfaces feel more consistent across help, overview, privacy, inspection, and recap output.
- Added a curated daily “Moment of the Day” presentation that reuses saved highlight data and matches Archivist’s recap tone.
- Updated `/ping`, `/hello`, and `/info` descriptions and copy so even utility commands sound like Archivist.

### Added
- Added lightweight application settings and channel monitoring rules in SQLite for admin-managed configuration.
- Added a clearer `/archivist` admin surface with overview, health, inspect, privacy, threshold, channel, weekly recap, and auto-post controls.
- Added runtime health tracking for last processed event, processed event count, queue depth, and recent error count.
- Added basic weekly recap configuration and guarded weekly recap posting.
- Added focused tests for channel monitoring rules, configurable reaction thresholds, update-driven promote or demote behavior, and weekly recap scheduling.
- Added `/privacy delete` so users can remove their stored Archivist data without changing consent preferences.
- Added `/archivist motd` so administrators can review, enable, disable, and manually post Moment of the Day from Discord.

### Changed
- Repositioned the bot as a privacy-first community highlight and memory bot instead of a generic archive utility.
- Updated highlight scoring to use the configured reaction threshold consistently in scoring output and inspection.
- Expanded message lifecycle handling to include message updates alongside create, reaction, and delete flows.
- Improved startup validation for numeric configuration and Discord activity settings.
- Updated README guidance to reflect the real privacy model, admin workflow, and operating limits.
- Expanded `/archivist overview` and `/help` so Moment of the Day is visible as a first-class product feature.

### Fixed
- Prevented duplicate point inflation by keeping highlight persistence idempotent per message.
- Prevented excluded or non-monitored channels from being analyzed or stored as highlights.
- Preserved correct promote or demote behavior when edited messages cross the highlight threshold.
- Improved error logging around Discord hydration, automatic posting, and weekly recap delivery.
