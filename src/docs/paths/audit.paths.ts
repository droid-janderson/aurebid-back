import { env } from "../../config/env";
import { ERR, paginated, paramRef, response, successBody } from "./helpers";

const API = env.apiPrefix;

const adminErrors = {
  400: ERR.badRequest,
  401: ERR.unauthorized,
  403: ERR.forbidden,
  500: ERR.internalServerError,
};

export const auditPaths = {
  [`${API}/audit`]: {
    get: {
      tags: ["Audit"],
      summary: "Lista as entradas de auditoria",
      description:
        "Requer perfil ADMIN. Lista paginada das entradas da cadeia de hash, com filtros por lote e licitante.",
      operationId: "listAuditEntries",
      "x-required-roles": ["ADMIN"],
      parameters: [
        paramRef("PageParam"),
        paramRef("LimitParam"),
        paramRef("BatchIdFilterParam"),
        paramRef("BidderIdFilterParam"),
      ],
      responses: {
        200: response(
          "Lista de entradas de auditoria.",
          paginated("AuditEntry"),
        ),
        ...adminErrors,
      },
    },
  },

  [`${API}/audit/batchs/{batchId}`]: {
    get: {
      tags: ["Audit"],
      summary: "Lista a cadeia de auditoria de um lote",
      description:
        "Requer perfil ADMIN. Retorna as entradas do lote em ordem de sequência.",
      operationId: "listAuditByBatch",
      "x-required-roles": ["ADMIN"],
      parameters: [
        paramRef("BatchIdParam"),
        paramRef("PageParam"),
        paramRef("LimitParam"),
      ],
      responses: {
        200: response("Cadeia de auditoria do lote.", paginated("AuditEntry")),
        ...adminErrors,
        404: ERR.notFound,
      },
    },
  },

  [`${API}/audit/batchs/{batchId}/verify`]: {
    get: {
      tags: ["Audit"],
      summary: "Verifica a integridade da cadeia de auditoria",
      description:
        "Requer perfil ADMIN. Recalcula a cadeia de hashes do lote e informa se ela é válida.",
      operationId: "verifyBatchChain",
      "x-required-roles": ["ADMIN"],
      parameters: [
        paramRef("BatchIdParam"),
        paramRef("PageParam"),
        paramRef("LimitParam"),
      ],
      responses: {
        200: response("Resultado da verificação.", {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "object",
              properties: {
                batchId: { type: "string" },
                valid: { type: "boolean", example: true },
                entries: { type: "integer", example: 3 },
                brokenAtSequence: {
                  type: "integer",
                  nullable: true,
                  example: null,
                },
                reason: { type: "string", nullable: true, example: null },
              },
            },
          },
        }),
        ...adminErrors,
        404: ERR.notFound,
      },
    },
  },

  [`${API}/audit/bids/{bidId}`]: {
    get: {
      tags: ["Audit"],
      summary: "Retorna a auditoria de um lance",
      description:
        "Requer perfil ADMIN. Retorna a entrada de auditoria vinculada ao lance.",
      operationId: "getAuditEntryByBid",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("BidIdParam")],
      responses: {
        200: response(
          "Entrada de auditoria.",
          successBody({ $ref: "#/components/schemas/AuditEntry" }),
        ),
        ...adminErrors,
        404: ERR.notFound,
      },
    },
  },
};
