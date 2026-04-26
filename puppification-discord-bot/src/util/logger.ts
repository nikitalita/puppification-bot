function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info(...args: unknown[]): void {
    console.log(`[${ts()}]`, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`[${ts()}]`, ...args);
  },
  error(...args: unknown[]): void {
    console.error(`[${ts()}]`, ...args);
  },
  debug(...args: unknown[]): void {
    if (process.env.PUPPIFIER_DEBUG === '1') {
      console.log(`[${ts()}] [debug]`, ...args);
    }
  },
};
