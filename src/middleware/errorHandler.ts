import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Unhandled error:', error);

  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path
  });
}
