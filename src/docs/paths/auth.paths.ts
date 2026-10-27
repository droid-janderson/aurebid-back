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

const authTokens = {
  type: "object",
  properties: {
    accessToken: {
      type: "string",
      description: "Token JWT de acesso (15m por padrão).",
    },
    refreshToken: {
      type: "string",
      description: "Token JWT de renovação (7 dias por padrão).",
    },
  },
};

const loginData = {
  type: "object",
  properties: {
    user: { $ref: "#/components/schemas/User" },
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
  },
};

const adminErrors = {
  400: ERR.badRequest,
  401: ERR.unauthorized,
  403: ERR.forbidden,
  429: ERR.tooManyRequests,
  500: ERR.internalServerError,
};

export const authPaths = {
  [`${API}/auth/register`]: {
    post: {
      tags: ["Auth"],
      summary: "Registra um novo usuário",
      description:
        "Rota pública. Cria o usuário, uma carteira com saldo zero e retorna o par de tokens. Perfis permitidos: AUCTIONEER ou BIDDER (padrão BIDDER).",
      operationId: "register",
      security: [],
      requestBody: requestBody(ref("RegisterRequest")),
      responses: {
        201: response(
          "Usuário registrado com sucesso.",
          successBody(
            {
              type: "object",
              properties: {
                user: { $ref: "#/components/schemas/User" },
                ...authTokens.properties,
              },
            },
            { message: true },
          ),
        ),
        400: ERR.badRequest,
        409: ERR.conflict,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auth/login`]: {
    post: {
      tags: ["Auth"],
      summary: "Autentica um usuário",
      description:
        "Rota pública. Valida e-mail e senha e retorna access e refresh tokens.",
      operationId: "login",
      security: [],
      requestBody: requestBody(ref("LoginRequest")),
      responses: {
        200: response(
          "Login realizado com sucesso.",
          successBody(loginData, { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auth/refresh`]: {
    post: {
      tags: ["Auth"],
      summary: "Renova o access token",
      description:
        "Rota pública. Recebe o refresh token no corpo e devolve um novo par de tokens.",
      operationId: "refreshToken",
      security: [],
      requestBody: requestBody(ref("RefreshTokenRequest")),
      responses: {
        200: response(
          "Tokens renovados.",
          successBody(authTokens, { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auth/logout`]: {
    post: {
      tags: ["Auth"],
      summary: "Encerra a sessão",
      description:
        "Requer autenticação. Como os tokens são stateless, o cliente deve descartá-los.",
      operationId: "logout",
      responses: {
        200: response(
          "Logout realizado.",
          successBody(undefined, { message: true }),
        ),
        401: ERR.unauthorized,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auth/me`]: {
    get: {
      tags: ["Auth"],
      summary: "Retorna o usuário autenticado",
      description:
        "Requer autenticação. Retorna os dados públicos do usuário e sua carteira.",
      operationId: "getMe",
      responses: {
        200: response(
          "Dados do usuário autenticado.",
          successBody(ref("User")),
        ),
        401: ERR.unauthorized,
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
    put: {
      tags: ["Auth"],
      summary: "Atualiza o perfil do usuário autenticado",
      description:
        "Requer autenticação. Atualmente permite alterar apenas o nome.",
      operationId: "updateProfile",
      requestBody: requestBody(ref("UpdateProfileRequest")),
      responses: {
        200: response(
          "Perfil atualizado.",
          successBody(ref("User"), { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auth/change-password`]: {
    post: {
      tags: ["Auth"],
      summary: "Altera a senha do usuário autenticado",
      description:
        "Requer autenticação. Valida a senha atual e exige a nova senha com no mínimo 8 caracteres.",
      operationId: "changePassword",
      requestBody: requestBody(ref("ChangePasswordRequest")),
      responses: {
        200: response(
          "Senha alterada.",
          successBody(undefined, { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/auth/users`]: {
    get: {
      tags: ["Auth"],
      summary: "Lista usuários",
      description:
        "Requer perfil ADMIN. Lista paginada com busca por nome/e-mail e filtro por perfil.",
      operationId: "listUsers",
      "x-required-roles": ["ADMIN"],
      parameters: [
        paramRef("PageParam"),
        paramRef("LimitParam"),
        paramRef("SearchParam"),
        paramRef("RoleFilterParam"),
      ],
      responses: {
        200: response("Lista de usuários.", paginated("User")),
        ...adminErrors,
      },
    },
  },

  [`${API}/auth/users/{id}`]: {
    get: {
      tags: ["Auth"],
      summary: "Retorna um usuário pelo ID",
      description:
        "Requer perfil ADMIN. Retorna dados públicos, carteira com reservas ativas e contadores de relacionamentos.",
      operationId: "getUserById",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response("Usuário encontrado.", successBody(ref("User"))),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        429: ERR.tooManyRequests,
        500: ERR.internalServerError,
      },
    },
    delete: {
      tags: ["Auth"],
      summary: "Remove um usuário",
      description:
        "Requer perfil ADMIN. Só permite remover usuários sem lotes, lances, compras, vendas ou histórico de carteira.",
      operationId: "deleteUser",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("IdParam")],
      responses: {
        200: response(
          "Usuário removido.",
          successBody(undefined, { message: true }),
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

  [`${API}/auth/users/{id}/role`]: {
    put: {
      tags: ["Auth"],
      summary: "Altera o perfil de um usuário",
      description:
        "Requer perfil ADMIN. Altera o perfil para ADMIN, AUCTIONEER ou BIDDER.",
      operationId: "updateUserRole",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("IdParam")],
      requestBody: requestBody(ref("UpdateUserRoleRequest")),
      responses: {
        200: response(
          "Perfil atualizado.",
          successBody(ref("User"), { message: true }),
        ),
        ...adminErrors,
        404: ERR.notFound,
      },
    },
  },
};
