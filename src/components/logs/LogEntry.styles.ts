/** Shared monospace text style for every part of a log row. */
export const LOG_TEXT_SX = { fontFamily: 'monospace', fontSize: 12 } as const;

/** Every chip in a log row is the same small monospace pill; color comes from the Chip's palette color. */
export const logChipSx = { fontFamily: 'monospace', fontSize: 10, height: 18, mr: 1, fontWeight: 700 } as const;
