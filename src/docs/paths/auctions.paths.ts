import { env } from "../../config/env";
import {
  ERR,
  paginated,
  paramRef,
  ref,
  requestBody,
  response,
  successBody,
} from "./helpers";

const API = env.apiPrefix;

const auctionListParams = [
  paramRef("PageParam"),
  paramRef("LimitParam"),
  paramRef("StatusFilterParam"),
  paramRef("SellerIdFilterParam"),
  paramRef("SearchParam"),
  paramRef("AuctionSortByParam"),
  paramRef("SortOrderParam"),
];

const authErrors = {
  401: ERR.unauthorized,
  403: ERR.forbidden,
  429: ERR.tooManyRequests,
  500: ERR.internalServerError,
};

export const auctionsPaths = {
  [`${API}/auctions`]: {
    get: {
      tags: ["Auctions"],
      summary: "Lista os leilões públicos",
      description:
        "Rota pública. Por padrão exclui lotes DRAFT e CANCELLED. Retorna os lotes com preço atual, contagem de lances e timing.",
      operationId: "listAuctions",
      security: [],
      parameters: auctionListParams,
      responses: {
        200: response("Lista de leilões.", paginated("Batch")),
        400: ERR.badRequest,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auctions/{id}`]: {
    get: {
      tags: ["Auctions"],
      summary: "Retorna um leilão pelo ID",
      description:
        "Rota pública. Retorna o lote, vendedor, os 10 maiores lances, liquidação e contadores.",
      operationId: "getAuctionById",
      security: [],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Leilão encontrado.", successBody(ref("Batch"))),
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auctions/{id}/bids`]: {
    get: {
      tags: ["Auctions"],
      summary: "Lista os lances de um leilão",
      description:
        "Rota pública. Lista paginada dos lances do lote, ordenados do maior para o menor, com dados do licitante e hash de auditoria.",
      operationId: "getAuctionBids",
      security: [],
      parameters: [
        paramRef("IdParam"),
        paramRef("PageParam"),
        paramRef("LimitParam"),
        paramRef("BidderIdFilterParam"),
      ],
      responses: {
        200: response("Lista de lances.", paginated("Bid")),
        400: ERR.badRequest,
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
    post: {
      tags: ["Auctions"],
      summary: "Realiza um lance",
      description:
        "Requer perfil BIDDER, AUCTIONEER ou ADMIN. O lote precisa estar ACTIVE e dentro da janela de lances; o licitante não pode ser o vendedor. O valor deve superar o preço inicial (ou o maior lance) e respeitar o incremento mínimo. É necessário saldo disponível suficiente na carteira.",
      operationId: "placeBid",
      "x-required-roles": ["BIDDER", "AUCTIONEER", "ADMIN"],
      parameters: [paramRef("IdParam")],
      requestBody: requestBody(ref("PlaceBidRequest")),
      responses: {
        201: response(
          "Lance registrado.",
          successBody(ref("Bid"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auctions/admin/all`]: {
    get: {
      tags: ["Auctions"],
      summary: "Lista todos os leilões (visão administrativa)",
      description:
        "Requer perfil ADMIN. Inclui lotes em qualquer status, inclusive DRAFT e CANCELLED.",
      operationId: "listAllAuctions",
      "x-required-roles": ["ADMIN"],
      parameters: auctionListParams,
      responses: {
        200: response("Lista completa de leilões.", paginated("Batch")),
        400: ERR.badRequest,
        ...authErrors,
      },
    },
  },

  [`${API}/auctions/{id}/publish`]: {
    post: {
      tags: ["Auctions"],
      summary: "Publica um lote",
      description:
        "Requer perfil AUCTIONEER ou ADMIN, com ownership do lote. Só permite publicar lotes DRAFT ou SCHEDULED cujo endsAt esteja no futuro. O status final é ACTIVE se startsAt já passou, ou SCHEDULED caso contrário.",
      operationId: "publishAuction",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Lote publicado/agendado.",
          successBody(ref("Batch"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        409: ERR.conflict,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auctions/{id}/cancel`]: {
    post: {
      tags: ["Auctions"],
      summary: "Cancela um lote",
      description:
        "Requer perfil AUCTIONEER ou ADMIN, com ownership do lote. Libera as reservas de carteira ativas e não permite cancelar lotes ENDED, SETTLED ou CANCELLED.",
      operationId: "cancelAuction",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Lote cancelado.",
          successBody(ref("Batch"), { message: true }),
        ),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        409: ERR.conflict,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auctions/{id}/end`]: {
    post: {
      tags: ["Auctions"],
      summary: "Encerra um lote ativo",
      description:
        "Requer perfil AUCTIONEER ou ADMIN, com ownership do lote. Só permite encerrar lotes ACTIVE. Quando há lances, cria a liquidação automaticamente.",
      operationId: "endAuction",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Lote encerrado.", {
          type: "object",
          required: ["success", "message", "data"],
          properties: {
            success: { type: "boolean", example: true },
            message: {
              type: "string",
              example: "Batch ended and settlement created",
            },
            data: {
              type: "object",
              properties: {
                batch: ref("Batch"),
                settlement: {
                  type: "object",
                  nullable: true,
                  allOf: [{ $ref: "#/components/schemas/Settlement" }],
                },
              },
            },
          },
        }),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        409: ERR.conflict,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auctions/{id}/status`]: {
    put: {
      tags: ["Auctions"],
      summary: "Sobrescreve o status de um lote",
      description:
        "Requer perfil ADMIN. Atualiza diretamente o status do lote; ao definir CANCELLED, libera as reservas ativas.",
      operationId: "updateAuctionStatus",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("IdParam")],
      requestBody: requestBody(ref("UpdateAuctionStatusRequest")),
      responses: {
        200: response("Status atualizado.", {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Batch status updated" },
            data: {
              type: "object",
              properties: {
                previousStatus: { $ref: "#/components/schemas/BatchStatus" },
                batch: ref("Batch"),
              },
            },
          },
        }),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },
};
