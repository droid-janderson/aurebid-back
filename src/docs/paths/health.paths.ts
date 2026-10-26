import { ERR, response, successBody } from './helpers';

const healthOk = {
  type: 'object',
  required: ['success', 'message', 'data'],
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Service healthy' },
    data: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time' },
        uptime: { type: 'number', example: 1234.56 },
        environment: { type: 'string', example: 'development' },
      },
    },
  },
};

export const healthPaths = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Verifica a saúde do serviço',
      description:
        'Rota pública que retorna o status do serviço, timestamp, uptime e ambiente de execução.',
      operationId: 'getHealth',
      security: [],
      responses: {
        200: response('Serviço saudável.', healthOk),
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },
};
