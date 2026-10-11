import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'STUDENT' | 'RECRUITER' | 'OFFICER' | 'ADMIN';
export type AuthUser = { id: string; email: string; role: Role; institutionId: string | null };
declare global { namespace Express { interface Request { user?: AuthUser } } }

export function signToken(user: AuthUser) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 24) throw new Error('JWT_SECRET must be set to at least 24 characters');
  return jwt.sign(user, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Missing JWT_SECRET');
    req.user = jwt.verify(token, secret) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
