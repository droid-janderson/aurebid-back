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

const walletOperationData = {
  type: "object",
  properties: {
    transaction: { $ref: "#/components/schemas/WalletTransaction" },
    wallet: { $ref: "#/components/schemas/WalletSummary" },
  },
};

export const walletsPaths = {
  [`${API}/wallets`]: {
    get: {
      tags: ["Wallets"],
      summary: "Retorna a carteira do usuário autenticado",
      description:
        "Requer autenticação. Retorna saldo, valor reservado, valor disponível, reservas ativas e as 10 transações mais recentes. Se a carteira ainda não existir, ela é criada automaticamente com saldo zero.",
      operationId: "getWallet",
      responses: {
        200: response("Carteira do usuário.", successBody(ref("Wallet"))),
        401: ERR.unauthorized,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/wallets/transactions`]: {
    get: {
      tags: ["Wallets"],
      summary: "Lista as transações da carteira",
      description:
        "Requer autenticação. Lista paginada das transações do próprio usuário, com filtros por tipo e período. A carteira é criada automaticamente com saldo zero se ainda não existir.",
      operationId: "listTransactions",
      parameters: [
        paramRef("PageParam"),
        paramRef("LimitParam"),
        paramRef("TypeFilterParam"),
        paramRef("StartDateParam"),
        paramRef("EndDateParam"),
      ],
      responses: {
        200: response("Lista de transações.", paginated("WalletTransaction")),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/wallets/deposit`]: {
    post: {
      tags: ["Wallets"],
      summary: "Realiza um depósito",
      description:
        "Requer autenticação. Credita o valor na carteira do usuário e registra uma transação do tipo DEPOSIT. A carteira é criada automaticamente com saldo zero se ainda não existir.",
      operationId: "deposit",
      requestBody: requestBody(ref("DepositRequest")),
      responses: {
        201: response(
          "Depósito realizado.",
          successBody(walletOperationData, { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/wallets/withdraw`]: {
    post: {
      tags: ["Wallets"],
      summary: "Realiza um saque",
      description:
        "Requer autenticação. Debita o valor disponível (saldo menos reservas ativas). O método aceita PIX ou BANK_TRANSFER e o destino é opcional. A carteira é criada automaticamente com saldo zero se ainda não existir.",
      operationId: "withdraw",
      requestBody: requestBody(ref("WithdrawRequest")),
      responses: {
        201: response(
          "Saque realizado.",
          successBody(walletOperationData, { message: true }),
        ),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/wallets/admin/all`]: {
    get: {
      tags: ["Wallets"],
      summary: "Lista todas as carteiras",
      description:
        "Requer perfil ADMIN. Lista paginada de carteiras com usuário, valor reservado, disponível e contagem de transações.",
      operationId: "listAllWallets",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("PageParam"), paramRef("LimitParam")],
      responses: {
        200: response("Lista de carteiras.", paginated("Wallet")),
        400: ERR.badRequest,
        401: ERR.unauthorized,
        403: ERR.forbidden,
        500: ERR.internalServerError,
      },
    },
  },

  [`${API}/wallets/admin/{userId}`]: {
    get: {
      tags: ["Wallets"],
      summary: "Retorna a carteira de um usuário",
      description:
        "Requer perfil ADMIN. Retorna a carteira do usuário, reservas ativas com lote e as 20 transações mais recentes.",
      operationId: "getWalletByUserId",
      "x-required-roles": ["ADMIN"],
      parameters: [paramRef("UserIdParam")],
      responses: {
        200: response("Carteira do usuário.", successBody(ref("Wallet"))),
        401: ERR.unauthorized,
        403: ERR.forbidden,
        404: ERR.notFound,
        500: ERR.internalServerError,
      },
    },
  },
};
