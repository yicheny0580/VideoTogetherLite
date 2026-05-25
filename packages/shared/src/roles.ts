export const Role = {
  Member: 3,
  Null: 1,
  Master: 2
} as const;

export type Role = typeof Role[keyof typeof Role];
