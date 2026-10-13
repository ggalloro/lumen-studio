import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { unauthorized } from './errors.js';
import { ROLES, type Principal, type UserPrincipal } from './types.js';

const claimsSchema = z.object({
  user_id: z.number().int(),
  workspace_id: z.number().int(),
  role: z.enum(ROLES),
  name: z.string(),
});

export interface AuthOptions {
  tokenSecret: string;
  internalToken: string;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function verifyJwt(token: string, secret: string): UserPrincipal {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('invalid or expired token');
  }
  const claims = claimsSchema.safeParse(payload);
  if (!claims.success) {
    throw unauthorized('token is missing required claims');
  }
  return { kind: 'user', ...claims.data };
}

function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function createAuth(opts: AuthOptions) {
  const isInternal = (req: FastifyRequest): boolean => {
    const value = req.headers['x-internal-token'];
    return typeof value === 'string' && safeEqual(value, opts.internalToken);
  };

  return {
    /** Requires a valid JWT in the Authorization header. */
    user(req: FastifyRequest): UserPrincipal {
      const token = bearerToken(req);
      if (!token) throw unauthorized('missing bearer token');
      return verifyJwt(token, opts.tokenSecret);
    },

    /** Accepts a valid JWT or the internal token. */
    userOrInternal(req: FastifyRequest): Principal {
      if (isInternal(req)) return { kind: 'internal' };
      const token = bearerToken(req);
      if (!token) throw unauthorized('missing bearer token or internal token');
      return verifyJwt(token, opts.tokenSecret);
    },

    /** Accepts a JWT in the Authorization header or the `token` query parameter (for EventSource). */
    userFromHeaderOrQuery(req: FastifyRequest): UserPrincipal {
      const query = req.query as Record<string, unknown> | undefined;
      const token = bearerToken(req) ?? (typeof query?.token === 'string' ? query.token : undefined);
      if (!token) throw unauthorized('missing token');
      return verifyJwt(token, opts.tokenSecret);
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
