import { NextResponse } from 'next/server';

export function apiError(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: details === undefined ? { code, message } : { code, message, details } },
    { status }
  );
}
