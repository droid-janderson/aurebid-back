import type { SwaggerUiOptions } from 'swagger-ui-express';
import { components } from './components';
import { swaggerCustomCss, swaggerCustomJs } from './swagger-custom';
import { auctionsPaths } from './paths/auctions.paths';
import { auditPaths } from './paths/audit.paths';
import { authPaths } from './paths/auth.paths';
import { bidsPaths } from './paths/bids.paths';
import { catalogPaths } from './paths/catalog.paths';
import { healthPaths } from './paths/health.paths';
import { settlementsPaths } from './paths/settlements.paths';
import { walletsPaths } from './paths/wallets.paths';

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Aurebid API',
    version: '1.0.0',
    description: [
      'API da plataforma de leilões Aurebid.',
      '',
      '**Autenticação:** as rotas protegidas usam JWT no header `Authorization: Bearer <accessToken>`.',
      'Use o botão **Authorize** abaixo para informar o access token retornado por `POST /api/v1/auth/login`.',
      '',
      '**Perfis:** `ADMIN`, `AUCTIONEER` e `BIDDER`. Os requisitos de perfil de cada rota estão descritos na operação',
      'e no campo de extensão `x-required-roles`.',
      '',
      '**Formato de erro:** `{ success: false, message, error, errors?, details? }`.',
      '',
      '**Exportar rotas:** use os botões no topo da página para baixar a coleção do Postman',
      '(`/docs/postman.json`, já com todas as rotas, parâmetros e bodies de exemplo) ou o',
      'documento OpenAPI (`/docs/openapi.json`).',
    ].join('\n'),
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
    contact: {
      name: 'Aurebid',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Servidor atual',
    },
  ],
  tags: [
    { name: 'Health', description: 'Saúde do serviço.' },
    { name: 'Auth', description: 'Registro, login, tokens e usuários.' },
    { name: 'Catalog', description: 'Lotes e catálogo externo Cardex.' },
    { name: 'Auctions', description: 'Ciclo de vida dos leilões e lances.' },
    { name: 'Bids', description: 'Consultas de lances.' },
    { name: 'Wallets', description: 'Carteira, depósitos, saques e transações.' },
    { name: 'Settlements', description: 'Liquidações e recibos.' },
    { name: 'Audit', description: 'Cadeia de auditoria dos lances.' },
  ],
  security: [{ bearerAuth: [] }],
  components,
  paths: {
    ...healthPaths,
    ...authPaths,
    ...catalogPaths,
    ...auctionsPaths,
    ...bidsPaths,
    ...walletsPaths,
    ...settlementsPaths,
    ...auditPaths,
  },
};

export const swaggerUiOptions: SwaggerUiOptions = {
  customSiteTitle: 'Aurebid API — Documentação',
  customCss: swaggerCustomCss,
  customJs: '/docs/postman-export.js',
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'none',
    filter: true,
    displayRequestDuration: true,
    tagsSorter: 'alpha',
    operationsSorter: 'alpha',
  },
};
