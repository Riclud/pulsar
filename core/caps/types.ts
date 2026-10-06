export type CapHandler = (params: any) => Promise<unknown>
export type CapRegistry = Record<string, CapHandler>
