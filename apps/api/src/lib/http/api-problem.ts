/**
 * An expected failure with a specific code for the client (an expired code, an outdated legal
 * version...). Thrown from library code and answered by withApiErrors with its status and code.
 */
export class ApiProblem extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiProblem';
  }
}
