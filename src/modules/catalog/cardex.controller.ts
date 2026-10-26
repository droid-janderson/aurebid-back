import type { Request, Response } from "express";
import { CardexApiError, cardexService } from "./cardex.service";

export async function searchCards(req: Request, res: Response) {
  const stringParams = [
    "name",
    "setId",
    "rarity",
    "supertype",
    "type",
  ] as const;

  for (const key of stringParams) {
    if (req.query[key] !== undefined && typeof req.query[key] !== "string") {
      return res.status(400).json({
        error: `O parâmetro ${key} deve ser uma string.`,
      });
    }
  }

  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 50);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50
  ) {
    return res.status(400).json({
      error: "page deve ser maior que zero e pageSize deve estar entre 1 e 50.",
    });
  }

  try {
    const result = await cardexService.searchCards({
      name: typeof req.query.name === "string" ? req.query.name : undefined,
      setId: typeof req.query.setId === "string" ? req.query.setId : undefined,
      rarity:
        typeof req.query.rarity === "string" ? req.query.rarity : undefined,
      supertype:
        typeof req.query.supertype === "string"
          ? req.query.supertype
          : undefined,
      type: typeof req.query.type === "string" ? req.query.type : undefined,
      page,
      pageSize,
    });

    return res.json(result);
  } catch {
    return res.status(502).json({
      error: "Não foi possível consultar o catálogo da Cardex.",
    });
  }
}

export async function getCardById(req: Request, res: Response) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      error: "Informe o identificador da carta.",
    });
  }

  try {
    const card = await cardexService.getCardById(id);

    return res.json(card);
  } catch (error) {
    if (error instanceof CardexApiError && error.status === 404) {
      return res.status(404).json({ error: "Carta não encontrada." });
    }

    return res.status(502).json({
      error: "Não foi possível consultar a carta na Cardex.",
    });
  }
}
