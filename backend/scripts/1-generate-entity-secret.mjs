// Run yourself: node scripts/1-generate-entity-secret.mjs
// Prints a fresh 32-byte entity secret (the library's own generateEntitySecret()
// call logs it directly -- that's Circle's function, not this script). No
// network call, no API key needed. Copy the printed ENTITY SECRET value into
// backend/.env as CIRCLE_ENTITY_SECRET, then run scripts/2-register-entity-secret.mjs.
import { generateEntitySecret } from "@circle-fin/developer-controlled-wallets";

generateEntitySecret();
