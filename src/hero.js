// Tailwind v4 plugins are registered from CSS via `@plugin`, which needs a
// module whose default export IS the plugin — @heroui/theme only exports a
// named `heroui`, hence this one-line shim (same pattern HeroUI's own Vite
// guide uses, just .js instead of .ts since this project isn't TypeScript).
import { heroui } from '@heroui/theme'

export default heroui()
