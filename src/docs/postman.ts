import { env } from '../config/env';

type JsonObject = Record<string, any>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const HTTP_METHODS_UPPER: Record<string, string> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  head: 'HEAD',
  options: 'OPTIONS',
};

const COLLECTION_SCHEMA =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveRef = (ref: string, document: JsonObject): any => {
  if (!ref.startsWith('#/')) return undefined;

  return ref
    .slice(2)
    .split('/')
    .reduce<any>((current, segment) => current?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')], document);
};

const dereference = (value: any, document: JsonObject, seen = new Set<string>()): any => {
  if (!isObject(value)) return value;

  if (typeof value.$ref === 'string') {
    if (seen.has(value.$ref)) return {};
    const resolved = resolveRef(value.$ref, document);
    if (!resolved) return value;

    const nextSeen = new Set(seen).add(value.$ref);
    return dereference({ ...resolved, ...value, $ref: undefined }, document, nextSeen);
  }

  return value;
};

const mergeAllOf = (schema: JsonObject, document: JsonObject, seen = new Set<string>()): JsonObject => {
  const resolved = dereference(schema, document, seen);
  if (!isObject(resolved)) return {};

  if (Array.isArray(resolved.allOf)) {
    const merged: JsonObject = { ...resolved };
    delete merged.allOf;

    for (const part of resolved.allOf) {
      const partSchema = mergeAllOf(part, document, seen);
      Object.assign(merged, partSchema, {
        properties: {
          ...(partSchema.properties ?? {}),
          ...(merged.properties ?? {}),
        },
        required: [...(partSchema.required ?? []), ...(merged.required ?? [])],
      });
    }

    return merged;
  }

  return resolved;
};

const sampleFromSchema = (
  rawSchema: any,
  document: JsonObject,
  depth = 0,
  seenRefs = new Set<string>(),
): any => {
  if (!isObject(rawSchema) || depth > 12) return undefined;

  if (typeof rawSchema.$ref === 'string') {
    if (seenRefs.has(rawSchema.$ref)) return {};
    const resolved = resolveRef(rawSchema.$ref, document);
    if (!resolved) return {};
    return sampleFromSchema(resolved, document, depth + 1, new Set(seenRefs).add(rawSchema.$ref));
  }

  const schema = mergeAllOf(rawSchema, document);
  if (!isObject(schema)) return undefined;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return sampleFromSchema(schema.oneOf[0], document, depth + 1, seenRefs);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return sampleFromSchema(schema.anyOf[0], document, depth + 1, seenRefs);
  }

  switch (schema.type) {
    case 'object': {
      const sample: JsonObject = {};
      const properties = isObject(schema.properties) ? schema.properties : {};
      for (const [key, propertySchema] of Object.entries(properties)) {
        const value = sampleFromSchema(propertySchema, document, depth + 1, seenRefs);
        if (value !== undefined) sample[key] = value;
      }
      return sample;
    }
    case 'array':
      return [sampleFromSchema(schema.items ?? {}, document, depth + 1, seenRefs)];
    case 'integer':
    case 'number':
      if (schema.minimum !== undefined) {
        return schema.exclusiveMinimum === true ? schema.minimum + 1 : schema.minimum;
      }
      return schema.exclusiveMinimum === true ? 1 : 0;
    case 'boolean':
      return true;
    case 'string':
    default:
      break;
  }

  switch (schema.format) {
    case 'email':
      return 'usuario@example.com';
    case 'date-time':
      return new Date().toISOString();
    case 'date':
      return new Date().toISOString().slice(0, 10);
    case 'uri':
    case 'url':
      return 'https://example.com';
    case 'password':
      return 'senha12345';
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000';
    default:
      break;
  }

  if (schema.type === 'string' || schema.type === undefined) {
    const minLength = typeof schema.minLength === 'number' ? schema.minLength : 0;
    if (minLength > 1) return 'a'.repeat(minLength);
    return 'string';
  }

  return undefined;
};

const operationParameters = (operation: JsonObject, document: JsonObject): JsonObject[] => {
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  return parameters.map((parameter) => dereference(parameter, document)).filter(isObject);
};

const buildUrl = (
  path: string,
  parameters: JsonObject[],
  document: JsonObject,
): { raw: string; host: string[]; path: string[]; query: JsonObject[]; variable: JsonObject[] } => {
  const pathParameters = parameters.filter((parameter) => parameter.in === 'path');
  const queryParameters = parameters.filter((parameter) => parameter.in === 'query');

  const variable = pathParameters.map((parameter) => ({
    key: parameter.name,
    value: String(sampleFromSchema(parameter.schema ?? {}, document) ?? ''),
    description: parameter.description ?? '',
  }));

  const query = queryParameters.map((parameter) => ({
    key: parameter.name,
    value: String(sampleFromSchema(parameter.schema ?? {}, document) ?? ''),
    description: parameter.description ?? '',
    disabled: parameter.required !== true,
  }));

  const pathWithVariables = path.replace(/\{([^}]+)\}/g, ':$1');
  const requiredQuery = query.filter((parameter) => !parameter.disabled);
  const queryString =
    requiredQuery.length > 0
      ? `?${requiredQuery
          .map(
            (parameter) =>
              `${encodeURIComponent(parameter.key)}=${encodeURIComponent(parameter.value)}`,
          )
          .join('&')}`
      : '';

  const pathWithoutLeadingSlash = pathWithVariables.replace(/^\//, '');

  return {
    raw: `{{baseUrl}}/${pathWithoutLeadingSlash}${queryString}`,
    host: ['{{baseUrl}}'],
    path: pathWithoutLeadingSlash.split('/').filter(Boolean),
    query,
    variable,
  };
};

const requestBody = (operation: JsonObject, document: JsonObject): JsonObject | undefined => {
  const body = operation.requestBody ? dereference(operation.requestBody, document) : undefined;
  if (!isObject(body)) return undefined;

  const content = isObject(body.content) ? body.content : {};
  const mediaType =
    content['application/json'] ??
    content[Object.keys(content).find((key) => key.includes('json')) ?? ''] ??
    Object.values(content)[0];
  if (!isObject(mediaType)) return undefined;

  const sample = sampleFromSchema(mediaType.schema ?? {}, document);
  if (sample === undefined) return undefined;

  return {
    mode: 'raw',
    raw: JSON.stringify(sample, null, 2),
    options: {
      raw: {
        language: 'json',
      },
    },
  };
};

const requestHeaders = (operation: JsonObject, hasBody: boolean): JsonObject[] => {
  const headers: JsonObject[] = [
    {
      key: 'Accept',
      value: 'application/json',
      type: 'text',
    },
  ];

  if (hasBody) {
    headers.unshift({
      key: 'Content-Type',
      value: 'application/json',
      type: 'text',
    });
  }

  return headers;
};

const buildRequestItem = (
  path: string,
  method: string,
  operation: JsonObject,
  document: JsonObject,
): JsonObject => {
  const parameters = operationParameters(operation, document);
  const url = buildUrl(path, parameters, document);
  const body = requestBody(operation, document);
  const requiredRoles = Array.isArray(operation['x-required-roles'])
    ? operation['x-required-roles']
    : [];
  const isPublic = Array.isArray(operation.security) && operation.security.length === 0;

  const descriptionParts = [
    operation.description,
    requiredRoles.length > 0 ? `Perfis necessários: ${requiredRoles.join(', ')}.` : '',
  ].filter(Boolean);

  return {
    name: operation.summary ?? operation.operationId ?? `${HTTP_METHODS_UPPER[method]} ${path}`,
    request: {
      method: HTTP_METHODS_UPPER[method],
      header: requestHeaders(operation, Boolean(body)),
      ...(body ? { body } : {}),
      url,
      ...(isPublic ? { auth: { type: 'noauth' } } : {}),
      description: descriptionParts.join('\n\n'),
    },
    response: [],
  };
};

const buildFolders = (document: JsonObject): JsonObject[] => {
  const paths = isObject(document.paths) ? document.paths : {};
  const folders = new Map<string, JsonObject[]>();

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!isObject(operation)) continue;

      const tags = Array.isArray(operation.tags) ? operation.tags : [];
      const folderName = typeof tags[0] === 'string' ? tags[0] : 'Outros';
      const item = buildRequestItem(path, method, operation, document);

      const folderItems = folders.get(folderName) ?? [];
      folderItems.push(item);
      folders.set(folderName, folderItems);
    }
  }

  const tagOrder: string[] = Array.isArray(document.tags)
    ? document.tags.map((tag: JsonObject) => tag.name).filter(Boolean)
    : [];

  return [...folders.entries()]
    .sort(([left], [right]) => {
      const leftIndex = tagOrder.indexOf(left);
      const rightIndex = tagOrder.indexOf(right);
      const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return leftRank - rightRank || left.localeCompare(right);
    })
    .map(([name, item]) => ({
      name,
      item,
    }));
};

export const buildPostmanCollection = (document: JsonObject) => {
  const info = isObject(document.info) ? document.info : {};
  const apiPrefix = env.apiPrefix;

  return {
    info: {
      name: `${info.title ?? 'API'} — Postman Collection`,
      description: [
        'Coleção gerada automaticamente a partir da documentação OpenAPI da Aurebid.',
        '',
        `Todas as rotas da API estão incluídas, agrupadas por tag, com parâmetros de path, query e bodies de exemplo.`,
        '',
        '**Como usar:**',
        '1. Importe este arquivo no Postman (File → Import).',
        `2. A variável \`baseUrl\` vem preenchida com \`http://localhost:${env.port}\`. Ajuste-a se a API estiver em outro endereço.`,
        `3. Rode \`POST ${apiPrefix}/auth/login\` e copie o \`accessToken\` retornado para a variável \`accessToken\` da coleção.`,
        '4. As rotas protegidas já usam autenticação Bearer herdada da coleção; as rotas públicas estão marcadas como No Auth.',
      ].join('\n'),
      schema: COLLECTION_SCHEMA,
    },
    auth: {
      type: 'bearer',
      bearer: [
        {
          key: 'token',
          value: '{{accessToken}}',
          type: 'string',
        },
      ],
    },
    variable: [
      {
        key: 'baseUrl',
        value: `http://localhost:${env.port}`,
        type: 'string',
      },
      {
        key: 'accessToken',
        value: '',
        type: 'string',
      },
    ],
    item: buildFolders(document),
  };
};
