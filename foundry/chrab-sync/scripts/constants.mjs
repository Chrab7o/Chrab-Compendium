export const MODULE_ID = 'chrab-sync'

// lib/foundryActorBuilder.js writes flags['chrab-sync'].npcDraftId on every NPC
// it builds. Phase 1 downloads used 'chrab-corner', which isn't a package id
// (so getFlag can't read it) - LEGACY_FLAG_SCOPE is read directly for those.
export const DRAFT_FLAG_KEY = 'npcDraftId'
export const LEGACY_FLAG_SCOPE = 'chrab-corner'

export const BACKUP_PACK_NAME = 'chrab-sync-backups'
export const BACKUP_PACK_LABEL = 'Chrab Sync Backups'
export const DEFAULT_FOLDER = 'Chrab Corner NPCs'

// Feature Forge items (lib/foundryFeatures.js writes flags['chrab-sync'].featureDraftId).
export const FEATURE_FLAG_KEY = 'featureDraftId'
export const ITEM_BACKUP_PACK_NAME = 'chrab-sync-item-backups'
export const ITEM_BACKUP_PACK_LABEL = 'Chrab Sync Item Backups'
export const DEFAULT_ITEM_FOLDER = 'Chrab Corner Features'

// Homebrew classes (classes.mjs): the public file the site publishes
// (src/lib/foundryClassPack.js, bucket/path) and the world compendium it fills.
export const CLASS_PACK_FORMAT = 'chrab-class-pack'
export const CLASS_PACK_FILE = 'foundry-feed/chrab-classes.json'
export const CLASS_PACK_NAME = 'chrab-classes'
export const CLASS_PACK_LABEL = 'Chrab Corner Classes'
