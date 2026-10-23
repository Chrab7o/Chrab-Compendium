import { emptyNpcSpec } from '../../../lib/foundryActorBuilder'

// The shared item editors expect an NPC to resolve @references against. A
// feature's owner isn't known until it's on a character, so formulas show "—"
// instead of an NPC's numbers.
export const OWNER_CONTEXT = { spec: { ...emptyNpcSpec(), name: 'the owner' }, rollData: {} }
