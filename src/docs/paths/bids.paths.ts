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

export const bidsPaths = {
  [`${API}/bids`]: {
    get: {
      tags: ["Bids"],
      summary: "Lista os lances do usuário autenticado",
      description:
        "Requer autenticação. Retorna os lances do próprio usuário, com dados do lote, do licitante e da auditoria.",
      operationId: "listMyBids",
      parameters: [
        paramRef("PageParam"),
        paramRef("LimitParam"),
        paramRef("BatchIdFilterParam"),
      ],
      responses: {
        200: response("Lista de lances do usuário.", paginated("Bid")),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/bids/{id}`]: {
    get: {
      tags: ["Bids"],
      summary: "Retorna um lance pelo ID",
      description:
        "Requer autenticação. Apenas o autor do lance, o vendedor do lote ou um ADMIN podem acessar.",
      operationId: "getBidById",
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Lance encontrado.", successBody(ref("Bid"))),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/bids/admin/all`]: {
    get: {
      tags: ["Bids"],
      summary: "Lista todos os lances",
      description:
        "Requer perfil ADMIN. Lista paginada de todos os lances, com filtros por lote e licitante.",
      operationId: "listAllBids",
      "x-required-roles": ["ADMIN"],
      parameters: [
        paramRef("PageParam"),
        paramRef("LimitParam"),
        paramRef("BatchIdFilterParam"),
        paramRef("BidderIdFilterParam"),
      ],
      responses: {
        200: response("Lista completa de lances.", paginated("Bid")),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },
};
