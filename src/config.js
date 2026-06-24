// Constantes partagees entre le thread principal et le worker.
export const CHUNK_SIZE = 32; // cote d'un chunk en unites monde
export const SEGMENTS = 16; // facettes par cote d'un chunk
export const HEIGHT_AMP = 58; // amplitude verticale des montagnes (procedural)
export const WATER_LEVEL = 8; // altitude du plan d'eau
export const SNOW_LINE = 34; // au-dela : roche/neige, pas d'arbres
export const RENDER_DISTANCE = 5; // rayon de chunks charges
export const MAX_BUILDS_PER_FRAME = 3; // chunks demarres par frame
