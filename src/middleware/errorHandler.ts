<<<<<<< HEAD
﻿import { Request, Response, NextFunction } from 'express';
=======
import { Request, Response, NextFunction } from 'express';
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf

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
<<<<<<< HEAD
}
=======
}
>>>>>>> 97e3c117db302a9378850e23984f054207c67daf
