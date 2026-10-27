import { env } from "../../config/env";
import {
  ERR,
  paginated,
  paramRef,
  ref,
  response,
  successBody,
} from "./helpers";

const API = env.apiPrefix;

const settlementListParams = [
  paramRef("PageParam"),
  paramRef("LimitParam"),
  paramRef("SettlementStatusFilterParam"),
  paramRef("BatchIdFilterParam"),
];

export const settlementsPaths = {
  [`${API}/settlements/public/{token}`]: {
    get: {
      tags: ["Settlements"],
      summary: "Consulta um recibo público de liquidação",
      description:
        "Rota pública. Retorna a liquidação associada ao token público do recibo, sem exigir autenticação.",
      operationId: "getSettlementByToken",
      security: [],
      parameters: [paramRef("TokenParam")],
      responses: {
        200: response("Liquidação encontrada.", successBody(ref("Settlement"))),
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements`]: {
    get: {
      tags: ["Settlements"],
      summary: "Lista as liquidações do usuário autenticado",
      description:
        "Requer autenticação. Retorna as liquidações em que o usuário é comprador ou vendedor, com filtros por status e lote.",
      operationId: "listMySettlements",
      parameters: settlementListParams,
      responses: {
        200: response("Lista de liquidações.", paginated("Settlement")),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements/{id}`]: {
    get: {
      tags: ["Settlements"],
      summary: "Retorna uma liquidação pelo ID",
      description:
        "Requer autenticação. Apenas o comprador, o vendedor ou um ADMIN podem acessar. Inclui as transações vinculadas.",
      operationId: "getSettlementById",
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Liquidação encontrada.", successBody(ref("Settlement"))),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements/{id}/process`]: {
    post: {
      tags: ["Settlements"],
      summary: "Inicia o processamento de uma liquidação",
      description:
        "Requer autenticação. Apenas o comprador, o vendedor ou um ADMIN podem iniciar. Move a liquidação para PROCESSING.",
      operationId: "processSettlement",
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Processamento iniciado.",
          successBody(ref("Settlement"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements/admin/all`]: {
    get: {
      tags: ["Settlements"],
      summary: "Lista todas as liquidações",
      description:
        "Requer perfil ADMIN. Lista paginada de liquidações com filtros por status e lote.",
      operationId: "listAllSettlements",
      "x-required-roles": ["ADMIN"],
      parameters: settlementListParams,
      responses: {
        200: response(
          "Lista completa de liquidações.",
          paginated("Settlement"),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements/admin/batchs/{batchId}`]: {
    post: {
      tags: ["Settlements"],
      summary: "Cria uma liquidação para um lote",
      description:
        "Requer perfil ADMIN. Cria a liquidação a partir do maior lance do lote. Retorna erro quando o lote não possui lances.",
      operationId: "createSettlementForBatch",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("BatchIdParam")],
      responses: {
        201: response(
          "Liquidação criada.",
          successBody(ref("Settlement"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements/admin/{id}/complete`]: {
    post: {
      tags: ["Settlements"],
      summary: "Conclui uma liquidação",
      description:
        "Requer perfil ADMIN. Debita o comprador, credita o vendedor e gera o recibo com número e token público.",
      operationId: "completeSettlement",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Liquidação concluída.",
          successBody(ref("Settlement"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/settlements/admin/{id}/fail`]: {
    post: {
      tags: ["Settlements"],
      summary: "Marca uma liquidação como falha",
      description:
        "Requer perfil ADMIN. Marca a liquidação como FAILED e libera as reservas de carteira relacionadas.",
      operationId: "failSettlement",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Liquidação marcada como falha.",
          successBody(ref("Settlement"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },
};
