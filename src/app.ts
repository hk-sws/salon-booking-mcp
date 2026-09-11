import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import api from './routes';
import { swaggerSpec } from './config/swagger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Log request duration per endpoint (dead-air budget is ~800ms).
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - t0;
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} ${ms}ms`);
    });
    next();
  });

  // Swagger UI + raw spec.
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/openapi.json', (_req, res) => res.json(swaggerSpec));

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
