const errorSchema = { $ref: "#/components/schemas/ApiError" };

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
});

const pageParam = {
  name: "page",
  in: "query",
  required: false,
  description: "Número da página (a partir de 1).",
  schema: { type: "integer", minimum: 1, default: 1 },
} as const;

const limitParam = {
  name: "limit",
  in: "query",
  required: false,
  description: "Quantidade de registros por página.",
  schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
} as const;

const pathIdParam = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string", minLength: 1 },
});

export const components = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description:
        'Access token JWT retornado por POST /auth/login ou POST /auth/refresh. Informe apenas o token (o Swagger adiciona o prefixo "Bearer").',
    },
  },

  parameters: {
    PageParam: pageParam,
    LimitParam: limitParam,
    IdParam: pathIdParam("id", "Identificador do recurso."),
    BatchIdParam: pathIdParam("batchId", "Identificador do lote."),
    BidIdParam: pathIdParam("bidId", "Identificador do lance."),
    UserIdParam: pathIdParam("userId", "Identificador do usuário."),
    TokenParam: pathIdParam("token", "Token público do recibo de liquidação."),

    SearchParam: {
      name: "search",
      in: "query",
      required: false,
      description:
        "Busca textual (título, descrição, e-mail, nome ou ID externo, conforme a rota).",
      schema: { type: "string" },
    },
    RoleFilterParam: {
      name: "role",
      in: "query",
      required: false,
      description: "Filtra usuários pelo perfil.",
      schema: { type: "string", enum: ["ADMIN", "AUCTIONEER", "BIDDER"] },
    },
    StatusFilterParam: {
      name: "status",
      in: "query",
      required: false,
      description: "Filtra lotes pelo status.",
      schema: {
        type: "string",
        enum: ["DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "SETTLED", "CANCELLED"],
      },
    },
    SellerIdFilterParam: {
      name: "sellerId",
      in: "query",
      required: false,
      description: "Filtra lotes pelo vendedor.",
      schema: { type: "string", minLength: 1 },
    },
    ProductSourceFilterParam: {
      name: "productSource",
      in: "query",
      required: false,
      description: "Filtra lotes pela origem do produto (ex.: CARDEX).",
      schema: { type: "string" },
    },
    MinPriceParam: {
      name: "minPrice",
      in: "query",
      required: false,
      description: "Preço inicial mínimo (inclusive).",
      schema: { type: "number", minimum: 0 },
    },
    MaxPriceParam: {
      name: "maxPrice",
      in: "query",
      required: false,
      description: "Preço inicial máximo (inclusive).",
      schema: { type: "number", minimum: 0 },
    },
    BatchSortByParam: {
      name: "sortBy",
      in: "query",
      required: false,
      description: "Campo de ordenação.",
      schema: {
        type: "string",
        enum: ["createdAt", "startsAt", "endsAt", "title", "startingPrice"],
        default: "startsAt",
      },
    },
    AuctionSortByParam: {
      name: "sortBy",
      in: "query",
      required: false,
      description: "Campo de ordenação.",
      schema: {
        type: "string",
        enum: ["startsAt", "endsAt", "startingPrice", "createdAt"],
        default: "startsAt",
      },
    },
    SortOrderParam: {
      name: "sortOrder",
      in: "query",
      required: false,
      description: "Direção da ordenação.",
      schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
    },
    BidderIdFilterParam: {
      name: "bidderId",
      in: "query",
      required: false,
      description: "Filtra lances pelo licitante.",
      schema: { type: "string", minLength: 1 },
    },
    BatchIdFilterParam: {
      name: "batchId",
      in: "query",
      required: false,
      description: "Filtra registros pelo lote.",
      schema: { type: "string", minLength: 1 },
    },
    TypeFilterParam: {
      name: "type",
      in: "query",
      required: false,
      description: "Filtra transações pelo tipo.",
      schema: {
        type: "string",
        enum: [
          "DEPOSIT",
          "BUYER_SETTLEMENT_DEBIT",
          "SELLER_SETTLEMENT_CREDIT",
          "REFUND",
          "ADJUSTMENT",
        ],
      },
    },
    StartDateParam: {
      name: "startDate",
      in: "query",
      required: false,
      description: "Data/hora inicial (ISO 8601).",
      schema: { type: "string", format: "date-time" },
    },
    EndDateParam: {
      name: "endDate",
      in: "query",
      required: false,
      description: "Data/hora final (ISO 8601).",
      schema: { type: "string", format: "date-time" },
    },
    SettlementStatusFilterParam: {
      name: "status",
      in: "query",
      required: false,
      description: "Filtra liquidações pelo status.",
      schema: {
        type: "string",
        enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      },
    },
    CardexNameParam: {
      name: "name",
      in: "query",
      required: false,
      description: "Nome (ou parte do nome) da carta.",
      schema: { type: "string" },
    },
    CardexSetIdParam: {
      name: "setId",
      in: "query",
      required: false,
      description: "Identificador da coleção (ex.: base1).",
      schema: { type: "string" },
    },
    CardexRarityParam: {
      name: "rarity",
      in: "query",
      required: false,
      description: "Raridade da carta (ex.: Rare Holo).",
      schema: { type: "string" },
    },
    CardexSupertypeParam: {
      name: "supertype",
      in: "query",
      required: false,
      description: "Supercategoria da carta (ex.: Pokémon, Trainer, Energy).",
      schema: { type: "string" },
    },
    CardexTypeParam: {
      name: "type",
      in: "query",
      required: false,
      description: "Tipo energético da carta (ex.: Fire, Water).",
      schema: { type: "string" },
    },
    CardexPageParam: {
      name: "page",
      in: "query",
      required: false,
      description: "Número da página (a partir de 1).",
      schema: { type: "integer", minimum: 1, default: 1 },
    },
    CardexPageSizeParam: {
      name: "pageSize",
      in: "query",
      required: false,
      description: "Quantidade de cartas por página.",
      schema: { type: "integer", minimum: 1, maximum: 50, default: 50 },
    },
  },

  responses: {
    BadRequest: errorResponse(
      "Requisição inválida ou dados de validação incorretos.",
    ),
    Unauthorized: errorResponse(
      "Token de acesso ausente, inválido ou expirado.",
    ),
    Forbidden: errorResponse(
      "Usuário autenticado sem permissão para executar a ação.",
    ),
    NotFound: errorResponse("Recurso não encontrado."),
    Conflict: errorResponse(
      "A operação entra em conflito com o estado atual do recurso.",
    ),
    TooManyRequests: errorResponse("Limite de requisições excedido."),
    InternalServerError: errorResponse("Erro interno inesperado."),
  },

  schemas: {
    ValidationErrorItem: {
      type: "object",
      required: ["field", "message", "code"],
      properties: {
        field: { type: "string", example: "body.email" },
        message: { type: "string", example: "Invalid email format" },
        code: { type: "string", example: "invalid_string" },
      },
    },

    ApiError: {
      type: "object",
      required: ["success", "message"],
      properties: {
        success: { type: "boolean", example: false },
        message: { type: "string", example: "Validation failed" },
        error: { type: "string", example: "VALIDATION_ERROR" },
        errors: {
          type: "array",
          items: { $ref: "#/components/schemas/ValidationErrorItem" },
        },
        details: { type: "object", additionalProperties: true },
      },
    },

    PaginationMeta: {
      type: "object",
      required: ["total", "page", "limit", "totalPages", "hasNext", "hasPrev"],
      properties: {
        total: { type: "integer", example: 42 },
        page: { type: "integer", example: 1 },
        limit: { type: "integer", example: 20 },
        totalPages: { type: "integer", example: 3 },
        hasNext: { type: "boolean", example: true },
        hasPrev: { type: "boolean", example: false },
      },
    },

    UserRole: {
      type: "string",
      enum: ["ADMIN", "AUCTIONEER", "BIDDER"],
    },

    BatchStatus: {
      type: "string",
      enum: ["DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "SETTLED", "CANCELLED"],
    },

    SettlementStatus: {
      type: "string",
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
    },

    WalletTransactionType: {
      type: "string",
      enum: [
        "DEPOSIT",
        "BUYER_SETTLEMENT_DEBIT",
        "SELLER_SETTLEMENT_CREDIT",
        "REFUND",
        "ADJUSTMENT",
      ],
    },

    User: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string", example: "João da Silva" },
        email: { type: "string", format: "email", example: "joao@example.com" },
        role: { $ref: "#/components/schemas/UserRole" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        wallet: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "string" },
            balance: { type: "number", example: 1500.5 },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            reservations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  batchId: { type: "string" },
                  amount: { type: "number" },
                  status: { type: "string", example: "ACTIVE" },
                },
              },
            },
          },
        },
        _count: {
          type: "object",
          properties: {
            batchs: { type: "integer" },
            bids: { type: "integer" },
            purchases: { type: "integer" },
            sales: { type: "integer" },
          },
        },
      },
    },

    BatchTiming: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["scheduled", "active", "ended"] },
        timeRemaining: {
          type: "integer",
          description:
            "Milissegundos restantes até o fim (0 quando encerrado).",
        },
        timeUntilStart: {
          type: "integer",
          description:
            "Milissegundos restantes até o início (0 quando já iniciou).",
        },
      },
    },

    Batch: {
      type: "object",
      properties: {
        id: { type: "string" },
        sellerId: { type: "string" },
        productSource: { type: "string", example: "CARDEX" },
        externalProductId: { type: "string", example: "base1-4" },
        title: { type: "string", example: "Charizard Base Set" },
        description: { type: "string", nullable: true },
        imageUrl: { type: "string", format: "uri", nullable: true },
        productData: { type: "object", additionalProperties: true },
        startingPrice: { type: "number", example: 100 },
        minimumIncrement: { type: "number", example: 10 },
        startsAt: { type: "string", format: "date-time" },
        endsAt: { type: "string", format: "date-time" },
        status: { $ref: "#/components/schemas/BatchStatus" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        currentPrice: {
          type: "number",
          description:
            "Maior lance atual ou preço inicial quando não há lances.",
        },
        bidCount: { type: "integer" },
        timing: { $ref: "#/components/schemas/BatchTiming" },
        seller: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        bids: {
          type: "array",
          items: { $ref: "#/components/schemas/Bid" },
        },
        settlement: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "string" },
            status: { $ref: "#/components/schemas/SettlementStatus" },
            amount: { type: "number" },
            receiptNumber: { type: "string", nullable: true },
            publicToken: { type: "string" },
            completedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
          },
        },
        _count: {
          type: "object",
          properties: {
            bids: { type: "integer" },
            auditEntries: { type: "integer" },
            reservations: { type: "integer" },
          },
        },
      },
    },

    Bid: {
      type: "object",
      properties: {
        id: { type: "string" },
        batchId: { type: "string" },
        bidderId: { type: "string" },
        amount: { type: "number", example: 250 },
        createdAt: { type: "string", format: "date-time" },
        bidder: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        batch: { $ref: "#/components/schemas/Batch" },
        audit: {
          type: "object",
          nullable: true,
          properties: {
            sequence: { type: "integer" },
            previousHash: { type: "string", nullable: true },
            currentHash: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },

    WalletSummary: {
      type: "object",
      properties: {
        id: { type: "string" },
        balance: { type: "number", example: 1500.5 },
        reservedAmount: {
          type: "number",
          description: "Soma dos valores reservados em lances ativos.",
        },
        availableAmount: {
          type: "number",
          description: "Saldo disponível (balance - reservedAmount).",
        },
        formatted: {
          type: "object",
          properties: {
            balance: { type: "string", example: "R$ 1.500,50" },
            reservedAmount: { type: "string", example: "R$ 100,00" },
            availableAmount: { type: "string", example: "R$ 1.400,50" },
          },
        },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },

    WalletTransaction: {
      type: "object",
      properties: {
        id: { type: "string" },
        walletId: { type: "string" },
        settlementId: { type: "string", nullable: true },
        type: { $ref: "#/components/schemas/WalletTransactionType" },
        amount: { type: "number", example: 500 },
        description: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        settlement: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "string" },
            receiptNumber: { type: "string", nullable: true },
            status: { $ref: "#/components/schemas/SettlementStatus" },
          },
        },
      },
    },

    Wallet: {
      allOf: [
        { $ref: "#/components/schemas/WalletSummary" },
        {
          type: "object",
          properties: {
            reservations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  batchId: { type: "string" },
                  bidId: { type: "string", nullable: true },
                  amount: { type: "number" },
                  status: { type: "string", example: "ACTIVE" },
                  batch: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      status: { $ref: "#/components/schemas/BatchStatus" },
                      endsAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            recentTransactions: {
              type: "array",
              items: { $ref: "#/components/schemas/WalletTransaction" },
            },
            transactions: {
              type: "array",
              items: { $ref: "#/components/schemas/WalletTransaction" },
            },
            user: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                email: { type: "string", format: "email" },
                name: { type: "string" },
                role: { $ref: "#/components/schemas/UserRole" },
              },
            },
            _count: {
              type: "object",
              properties: {
                transactions: { type: "integer" },
              },
            },
          },
        },
      ],
    },

    Settlement: {
      type: "object",
      properties: {
        id: { type: "string" },
        batchId: { type: "string" },
        winningBidId: { type: "string", nullable: true },
        buyerId: { type: "string" },
        sellerId: { type: "string" },
        amount: { type: "number", example: 250 },
        status: { $ref: "#/components/schemas/SettlementStatus" },
        receiptNumber: {
          type: "string",
          nullable: true,
          example: "REC-2026-0001",
        },
        publicToken: { type: "string" },
        completedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        batch: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: { $ref: "#/components/schemas/BatchStatus" },
            imageUrl: { type: "string", format: "uri", nullable: true },
            endsAt: { type: "string", format: "date-time" },
          },
        },
        winningBid: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "string" },
            amount: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        buyer: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        seller: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        transactions: {
          type: "array",
          items: { $ref: "#/components/schemas/WalletTransaction" },
        },
      },
    },

    AuditEntry: {
      type: "object",
      properties: {
        id: { type: "string" },
        batchId: { type: "string" },
        bidId: { type: "string" },
        sequence: { type: "integer", example: 1 },
        previousHash: { type: "string", nullable: true },
        currentHash: { type: "string" },
        payload: { type: "object", additionalProperties: true },
        createdAt: { type: "string", format: "date-time" },
        bid: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "string" },
            amount: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
            bidder: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string", format: "email" },
              },
            },
          },
        },
        batch: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: { $ref: "#/components/schemas/BatchStatus" },
          },
        },
      },
    },

    CardexCardSummary: {
      type: "object",
      description: "Resumo de uma carta retornada pela API externa Cardex.",
      properties: {
        id: { type: "string", example: "base1-4" },
        setId: { type: "string", example: "base1" },
        name: { type: "string", example: "Charizard" },
        number: { type: "string", example: "4" },
        imageSmall: {
          type: "string",
          format: "uri",
          example: "https://cdn.cardex-api.dev/images/base1/base1-4_small.png",
        },
        imageLarge: {
          type: "string",
          format: "uri",
          example: "https://cdn.cardex-api.dev/images/base1/base1-4_large.png",
        },
        rarity: { type: "string", nullable: true, example: "Rare Holo" },
        supertype: { type: "string", nullable: true, example: "Pokémon" },
        subtypes: {
          type: "array",
          items: { type: "string" },
          example: ["Stage 2"],
        },
        types: {
          type: "array",
          items: { type: "string" },
          example: ["Fire"],
        },
        cardmarketLowPrice: { type: "number", nullable: true, example: 799 },
        tcgplayerLowPrice: { type: "number", nullable: true, example: 475 },
        pricesUpdatedAt: {
          type: "string",
          nullable: true,
          description: "Data/hora da última atualização dos preços.",
          example: "2026-08-09 14:53:10.6240817",
        },
        cardmarketUrl: {
          type: "string",
          format: "uri",
          nullable: true,
          example: "https://prices.pokemontcg.io/cardmarket/base1-4",
        },
        tcgplayerUrl: {
          type: "string",
          format: "uri",
          nullable: true,
          example: "https://prices.pokemontcg.io/tcgplayer/base1-4",
        },
        source: { type: "string", nullable: true, example: "pokemontcgio" },
      },
    },

    CardexCard: {
      allOf: [
        { $ref: "#/components/schemas/CardexCardSummary" },
        {
          type: "object",
          description: "Detalhes completos de uma carta da Cardex.",
          properties: {
            hp: { type: "integer", nullable: true, example: 120 },
            evolvesFrom: {
              type: "string",
              nullable: true,
              example: "Charmeleon",
            },
            stage: { type: "string", nullable: true },
            energyType: { type: "string", nullable: true },
            artist: {
              type: "string",
              nullable: true,
              example: "Mitsuhiro Arita",
            },
            flavorText: { type: "string", nullable: true },
            retreatCostCount: { type: "integer", nullable: true, example: 3 },
            nationalPokedexNumbers: {
              type: "array",
              items: { type: "integer" },
              example: [6],
            },
            legalUnlimited: { type: "boolean", nullable: true },
            legalStandard: { type: "boolean", nullable: true },
            legalExpanded: { type: "boolean", nullable: true },
            hasFirstEdition: { type: "boolean", nullable: true },
            hasHolo: { type: "boolean", nullable: true },
            hasNormal: { type: "boolean", nullable: true },
            hasReverse: { type: "boolean", nullable: true },
            hasWPromo: { type: "boolean", nullable: true },
            abilities: {
              type: "array",
              nullable: true,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  text: { type: "string" },
                  type: { type: "string" },
                },
              },
            },
            attacks: {
              type: "array",
              nullable: true,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  cost: { type: "array", items: { type: "string" } },
                  convertedEnergyCost: { type: "integer" },
                  damage: { type: "string" },
                  text: { type: "string" },
                },
              },
            },
            weaknesses: {
              type: "array",
              nullable: true,
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
            resistances: {
              type: "array",
              nullable: true,
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
            rules: {
              type: "array",
              nullable: true,
              items: { type: "string" },
            },
            cardmarketPricingDetail: {
              type: "object",
              nullable: true,
              additionalProperties: true,
            },
            tcgplayerPricingDetail: {
              type: "object",
              nullable: true,
              additionalProperties: true,
            },
            variantsDetailed: {
              type: "object",
              nullable: true,
              additionalProperties: true,
            },
            enrichedAt: {
              type: "string",
              nullable: true,
              example: "2026-08-30T07:54:46.6493000Z",
            },
            enrichmentSource: { type: "string", nullable: true },
          },
        },
      ],
    },

    CardexSearchResult: {
      type: "object",
      required: ["items", "page", "pageSize", "totalCount", "totalPages"],
      properties: {
        items: {
          type: "array",
          items: { $ref: "#/components/schemas/CardexCardSummary" },
        },
        page: { type: "integer", example: 1 },
        pageSize: { type: "integer", example: 50 },
        totalCount: { type: "integer", example: 113 },
        totalPages: { type: "integer", example: 3 },
      },
    },

    RegisterRequest: {
      type: "object",
      required: ["email", "password", "name"],
      properties: {
        email: { type: "string", format: "email" },
        password: {
          type: "string",
          format: "password",
          minLength: 8,
          description: "Mínimo de 8 caracteres.",
        },
        name: { type: "string", minLength: 2, maxLength: 100 },
        role: {
          type: "string",
          enum: ["AUCTIONEER", "BIDDER"],
          default: "BIDDER",
          description:
            "Perfis ADMIN não podem ser criados via registro público.",
        },
      },
    },

    LoginRequest: {
      type: "object",
      required: ["email", "password"],
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", minLength: 1 },
      },
    },

    RefreshTokenRequest: {
      type: "object",
      required: ["refreshToken"],
      properties: {
        refreshToken: { type: "string", minLength: 1 },
      },
    },

    ChangePasswordRequest: {
      type: "object",
      required: ["currentPassword", "newPassword"],
      properties: {
        currentPassword: { type: "string", minLength: 1 },
        newPassword: { type: "string", format: "password", minLength: 8 },
      },
    },

    UpdateProfileRequest: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 2, maxLength: 100 },
      },
    },

    UpdateUserRoleRequest: {
      type: "object",
      required: ["role"],
      properties: {
        role: { $ref: "#/components/schemas/UserRole" },
      },
    },

    CreateBatchRequest: {
      type: "object",
      required: [
        "productSource",
        "externalProductId",
        "title",
        "startingPrice",
        "minimumIncrement",
        "startsAt",
        "endsAt",
      ],
      properties: {
        sellerId: {
          type: "string",
          minLength: 1,
          description:
            "Somente ADMIN pode informar um vendedor diferente do próprio usuário.",
        },
        productSource: { type: "string", minLength: 1, maxLength: 100 },
        externalProductId: { type: "string", minLength: 1, maxLength: 200 },
        title: { type: "string", minLength: 3, maxLength: 200 },
        description: { type: "string", maxLength: 5000 },
        imageUrl: { type: "string", format: "uri" },
        productData: { type: "object", additionalProperties: true },
        startingPrice: { type: "number", minimum: 0, exclusiveMinimum: true },
        minimumIncrement: {
          type: "number",
          minimum: 0,
          exclusiveMinimum: true,
        },
        startsAt: { type: "string", format: "date-time" },
        endsAt: {
          type: "string",
          format: "date-time",
          description: "Deve ser posterior a startsAt.",
        },
        status: {
          type: "string",
          enum: ["DRAFT", "SCHEDULED"],
          default: "DRAFT",
        },
      },
    },

    UpdateBatchRequest: {
      type: "object",
      properties: {
        productSource: { type: "string", minLength: 1, maxLength: 100 },
        externalProductId: { type: "string", minLength: 1, maxLength: 200 },
        title: { type: "string", minLength: 3, maxLength: 200 },
        description: { type: "string", maxLength: 5000, nullable: true },
        imageUrl: { type: "string", format: "uri", nullable: true },
        productData: { type: "object", additionalProperties: true },
        startingPrice: { type: "number", minimum: 0, exclusiveMinimum: true },
        minimumIncrement: {
          type: "number",
          minimum: 0,
          exclusiveMinimum: true,
        },
        startsAt: { type: "string", format: "date-time" },
        endsAt: { type: "string", format: "date-time" },
        status: {
          type: "string",
          enum: ["DRAFT", "SCHEDULED"],
        },
      },
    },

    PlaceBidRequest: {
      type: "object",
      required: ["amount"],
      properties: {
        amount: {
          type: "number",
          minimum: 0,
          exclusiveMinimum: true,
          description:
            "Deve ser maior que o preço inicial (ou maior que o maior lance) e respeitar o incremento mínimo do lote.",
        },
      },
    },

    UpdateAuctionStatusRequest: {
      type: "object",
      required: ["status"],
      properties: {
        status: { $ref: "#/components/schemas/BatchStatus" },
      },
    },

    WithdrawDestination: {
      type: "object",
      properties: {
        bankCode: { type: "string" },
        agency: { type: "string" },
        account: { type: "string" },
        accountType: { type: "string", enum: ["CHECKING", "SAVINGS"] },
        pixKey: { type: "string" },
        pixKeyType: {
          type: "string",
          enum: ["CPF", "EMAIL", "PHONE", "RANDOM"],
        },
      },
    },

    DepositRequest: {
      type: "object",
      required: ["amount", "method"],
      properties: {
        amount: { type: "number", minimum: 0, exclusiveMinimum: true },
        method: {
          type: "string",
          enum: ["PIX", "BANK_TRANSFER", "CREDIT_CARD", "BOLETO"],
        },
        metadata: { type: "object", additionalProperties: true },
      },
    },

    WithdrawRequest: {
      type: "object",
      required: ["amount", "method"],
      properties: {
        amount: { type: "number", minimum: 0, exclusiveMinimum: true },
        method: { type: "string", enum: ["PIX", "BANK_TRANSFER"] },
        destination: { $ref: "#/components/schemas/WithdrawDestination" },
      },
    },
  },
};
