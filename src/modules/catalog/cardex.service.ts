const CARDEX_API_BASE_URL = (
  process.env.CARDEX_API ?? "https://cardex-api.dev/api"
).replace(/\/+$/, "");

const CARDEX_API_KEY = process.env.CARDEX_API_KEY;

export class CardexApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CardexApiError";
  }
}

export interface SearchCardsParams {
  name?: string;
  setId?: string;
  rarity?: string;
  supertype?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

async function request<T>(path: string): Promise<T> {
  if (!CARDEX_API_KEY) {
    throw new CardexApiError("CARDEX_API_KEY não configurada.");
  }

  let response: Response;

  try {
    response = await fetch(`${CARDEX_API_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        "x-api-key": CARDEX_API_KEY,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new CardexApiError("Não foi possível conectar à Cardex.");
  }

  if (!response.ok) {
    throw new CardexApiError("A Cardex retornou um erro.", response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new CardexApiError("A Cardex retornou JSON inválido.");
  }
}

export const cardexService = {
  searchCards(params: SearchCardsParams = {}) {
    const query = new URLSearchParams();

    if (params.name?.trim()) query.set("name", params.name.trim());
    if (params.setId) query.set("setId", params.setId);
    if (params.rarity) query.set("rarity", params.rarity);
    if (params.supertype) query.set("supertype", params.supertype);
    if (params.type) query.set("type", params.type);

    query.set("page", String(params.page ?? 1));
    query.set("pageSize", String(params.pageSize ?? 50));

    return request<unknown>(`/cards?${query.toString()}`);
  },

  getCardById(id: string) {
    return request<unknown>(`/cards/${encodeURIComponent(id)}`);
  },
};
