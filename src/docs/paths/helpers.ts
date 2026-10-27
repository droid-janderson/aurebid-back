export const jsonContent = (schema: unknown) => ({
  'application/json': { schema },
});

export const response = (description: string, schema?: unknown) =>
  schema ? { description, content: jsonContent(schema) } : { description };

export const requestBody = (schema: unknown, required = true) => ({
  required,
  content: jsonContent(schema),
});

export const ref = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
});

export const paginated = (schemaName: string) => ({
  type: 'object',
  required: ['success', 'data', 'meta'],
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: ref(schemaName) },
    meta: { $ref: '#/components/schemas/PaginationMeta' },
  },
});

export const successBody = (
  dataSchema?: unknown,
  options: { message?: boolean } = {},
) => ({
  type: 'object',
  required: options.message ? ['success', 'message'] : ['success'],
  properties: {
    success: { type: 'boolean', example: true },
    ...(options.message ? { message: { type: 'string' } } : {}),
    ...(dataSchema ? { data: dataSchema } : {}),
  },
});

export const ERR = {
  badRequest: { $ref: '#/components/responses/BadRequest' },
  unauthorized: { $ref: '#/components/responses/Unauthorized' },
  forbidden: { $ref: '#/components/responses/Forbidden' },
  notFound: { $ref: '#/components/responses/NotFound' },
  conflict: { $ref: '#/components/responses/Conflict' },
  internalServerError: { $ref: '#/components/responses/InternalServerError' },
} as const;

export const paramRef = (name: string) => ({
  $ref: `#/components/parameters/${name}`,
});
