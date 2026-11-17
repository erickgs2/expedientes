export async function register() {
  // Next compiles this file for the Edge runtime too, which has no fs, crypto or Prisma. This exact
  // condition is the one Next removes from the Edge bundle, so the Node-only code is never traced
  // there.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
  }
}
