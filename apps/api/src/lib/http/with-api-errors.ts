import { Prisma } from '@prisma/client';
import type { NextResponse } from 'next/server';
import { apiError } from './api-error';
import { UnauthenticatedError } from './require-auth';
import { ForbiddenError, InactiveUserError } from '../rbac/permissions';
import { InvalidFilePathError } from '../storage/file-storage';

function conflictTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.['target'];
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return 'Value';
}

/**
 * Maps a thrown error to the API's structured error body. Every route handler funnels through
 * this so the whole API has one error contract instead of leaking raw 500s from Prisma or from
 * `request.json()` on a malformed body.
 */
export function toApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return apiError('UNAUTHENTICATED', error.message, 401);
  }
  // A deactivated or deleted user's JWT is no longer an acceptable credential: 401, not 403.
  if (error instanceof InactiveUserError) {
    return apiError('UNAUTHENTICATED', error.message, 401);
  }
  if (error instanceof ForbiddenError) {
    return apiError('FORBIDDEN', error.message, 403);
  }
  if (error instanceof InvalidFilePathError) {
    return apiError('INVALID_INPUT', 'Invalid file path', 400);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return apiError('CONFLICT', `${conflictTarget(error)} already exists`, 409);
      case 'P2003':
        return apiError('INVALID_INPUT', 'Referenced record does not exist', 400);
      case 'P2025':
        return apiError('NOT_FOUND', 'Record not found', 404);
    }
  }
  // `request.json()` throws a SyntaxError on a malformed body.
  if (error instanceof SyntaxError) {
    return apiError('INVALID_INPUT', 'Malformed request body', 400);
  }
  console.error('Unhandled API error', error);
  return apiError('INTERNAL_ERROR', 'Internal server error', 500);
}

/**
 * Wraps a Next.js route handler so anything it throws — auth errors, Prisma errors, JSON parse
 * errors — becomes a structured `ApiErrorBody` response with the right status code.
 */
export function withApiErrors<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toApiErrorResponse(error);
    }
  };
}
