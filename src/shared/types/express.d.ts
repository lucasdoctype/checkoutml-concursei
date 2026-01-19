declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      rawBody?: string;
    }
  }
}

export {};
