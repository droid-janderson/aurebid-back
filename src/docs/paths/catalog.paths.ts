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

const batchListParams = [
  paramRef("PageParam"),
  paramRef("LimitParam"),
  paramRef("StatusFilterParam"),
  paramRef("SellerIdFilterParam"),
  paramRef("ProductSourceFilterParam"),
  paramRef("SearchParam"),
  paramRef("MinPriceParam"),
  paramRef("MaxPriceParam"),
  paramRef("BatchSortByParam"),
  paramRef("SortOrderParam"),
];

const protectedErrors = {
  401: ERR.unauthorized,
  403: ERR.forbidden,
  500: ERR.internalServerError,
};

export const catalogPaths = {
  [`${API}/catalog/batchs`]: {
    get: {
      tags: ["Catalog"],
      summary: "Lista os lotes públicos",
      description:
        "Rota pública. Por padrão exclui lotes DRAFT e CANCELLED. Aceita filtros, busca, faixa de preço e ordenação.",
      operationId: "listBatchs",
      security: [],
      parameters: batchListParams,
      responses: {
        200: response("Lista de lotes.", paginated("Batch")),
        400: ERR.badRequest,
        500: ERR.internalServerError,
      },
    },
    post: {
      tags: ["Catalog"],
      summary: "Cria um lote",
      description:
        "Requer perfil AUCTIONEER ou ADMIN. AUCTIONEER só pode criar lotes para si; ADMIN pode informar sellerId. O vendedor não pode ser BIDDER e endsAt deve ser posterior a startsAt.",
      operationId: "createBatch",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      requestBody: requestBody(ref("CreateBatchRequest")),
      responses: {
        201: response(
          "Lote criado.",
          successBody(ref("Batch"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/catalog/batchs/mine`]: {
    get: {
      tags: ["Catalog"],
      summary: "Lista os lotes do usuário autenticado",
      description:
        "Requer perfil AUCTIONEER ou ADMIN. AUCTIONEER vê apenas seus próprios lotes; ADMIN vê todos. Aceita os mesmos filtros da listagem pública.",
      operationId: "listMyBatchs",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      parameters: batchListParams,
      responses: {
        200: response("Lista de lotes do usuário.", paginated("Batch")),
        400: ERR.badRequest,
        ...protectedErrors,
      },
    },
  },

  [`${API}/catalog/batchs/{id}`]: {
    get: {
      tags: ["Catalog"],
      summary: "Retorna um lote pelo ID",
      description:
        "Rota pública. Retorna detalhes do lote, vendedor, os 10 maiores lances, liquidação e contadores.",
      operationId: "getBatchById",
      security: [],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Lote encontrado.", successBody(ref("Batch"))),
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
    put: {
      tags: ["Catalog"],
      summary: "Atualiza um lote",
      description:
        "Requer perfil AUCTIONEER ou ADMIN, com ownership do lote (ADMIN pode editar qualquer lote). Não permite alterar lotes ACTIVE, ENDED, SETTLED ou CANCELLED. Todos os campos são opcionais.",
      operationId: "updateBatch",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      parameters: [paramRef("IdParam")],
      requestBody: requestBody(ref("UpdateBatchRequest")),
      responses: {
        200: response(
          "Lote atualizado.",
          successBody(ref("Batch"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        409: ERR.conflict,
        500: ERR.internalServerError,
      },
    },
    delete: {
      tags: ["Catalog"],
      summary: "Remove um lote em rascunho",
      description:
        "Requer perfil AUCTIONEER ou ADMIN, com ownership do lote. Só permite excluir lotes em DRAFT e sem lances, reservas, auditoria ou liquidação.",
      operationId: "deleteBatch",
      "x-required-roles": ["AUCTIONEER", "ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Lote removido.",
          successBody(undefined, { message: true }),
        ),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        409: ERR.conflict,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/catalog/cards`]: {
    get: {
      tags: ["Catalog"],
      summary: "Pesquisa cartas no catálogo externo Cardex",
      description:
        "Rota pública. Consulta a API Cardex por nome e demais filtros. Todos os filtros são opcionais e podem ser combinados. Falhas de indisponibilidade do provedor retornam 502.",
      operationId: "searchCards",
      security: [],
      parameters: [
        paramRef("CardexNameParam"),
        paramRef("CardexSetIdParam"),
        paramRef("CardexRarityParam"),
        paramRef("CardexSupertypeParam"),
        paramRef("CardexTypeParam"),
        paramRef("CardexPageParam"),
        paramRef("CardexPageSizeParam"),
      ],
      responses: {
        200: response(
          "Resultado da pesquisa Cardex.",
          ref("CardexSearchResult"),
        ),
        400: response(
          "Parâmetros inválidos: filtros devem ser strings e a paginação deve respeitar os limites.",
          {
            type: "object",
            properties: {
              error: {
                type: "string",
                example:
                  "page deve ser maior que zero e pageSize deve estar entre 1 e 50.",
              },
            },
          },
        ),
        502: response("Falha ao consultar a API Cardex.", {
          type: "object",
          properties: {
            error: {
              type: "string",
              example: "Não foi possível consultar o catálogo da Cardex.",
            },
          },
        }),
      },
    },
  },

  [`${API}/catalog/cards/{id}`]: {
    get: {
      tags: ["Catalog"],
      summary: "Retorna uma carta do catálogo externo Cardex",
      description:
        "Rota pública. Consulta a API Cardex pelo identificador da carta e retorna os detalhes completos.",
      operationId: "getCardById",
      security: [],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Carta encontrada.", ref("CardexCard")),
        404: response("Carta não encontrada.", {
          type: "object",
          properties: {
            error: { type: "string", example: "Carta não encontrada." },
          },
        }),
        502: response("Falha ao consultar a API Cardex.", {
          type: "object",
          properties: {
            error: {
              type: "string",
              example: "Não foi possível consultar a carta na Cardex.",
            },
          },
        }),
      },
    },
  },
};
