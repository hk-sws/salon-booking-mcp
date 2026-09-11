import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Salon Voice-Agent Booking API',
      version: '1.0.0',
      description:
        'Multi-tenant tool backend for LiveKit voice agents. Every agent-facing ' +
        'field ships with a *Spoken variant the TTS reads verbatim. Base path /api/v1.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      parameters: {
        companyId: {
          name: 'companyId', in: 'query', required: true,
          schema: { type: 'string', example: 'salon-01' },
          description: 'Tenant id. Every endpoint is scoped by it.',
        },
      },
      headers: {
        IdempotencyKey: {
          description: 'Replay-safe key for POST retries.',
          schema: { type: 'string' },
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'STYLIST_SERVICE_MISMATCH' },
            message: { type: 'string' },
            spoken: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  },
  // Parsed for @openapi JSDoc blocks. Globbed from project root.
  apis: ['src/routes/*.ts'],
});
