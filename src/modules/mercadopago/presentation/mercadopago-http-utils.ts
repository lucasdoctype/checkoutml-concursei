import type { Request } from 'express';
import { ValidationError } from '../../../shared/errors/app-error';

export const requireObjectBody = (req: Request): Record<string, unknown> => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new ValidationError('invalid_body');
  }
  return req.body as Record<string, unknown>;
};

export const requirePathParam = (req: Request, name: string): string => {
  const value = req.params[name];
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`missing_${name}`);
  }
  return value;
};

export const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

export const getNested = (value: unknown, path: string[]): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current ?? null;
};
