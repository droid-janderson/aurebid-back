# AureBid Backend

API de backend da plataforma de leilões [AureBid](aurebid.vercel.app), desenvolvida com Node.js, TypeScript, Express, PostgreSQL, Prisma ORM e Docker.

> **Este repositório é somente o backend.** O frontend está no projeto [aurebid-frontend](https://github.com/droid-janderson/aurebid-front).

---

## Comportamento inesperado no Frontend

Durante os testes no navegador [Brave](https://brave.com/pt-br/), foram identificados problemas na conexão em tempo real (Socket.IO) com o backend, possivelmente relacionados às configurações de privacidade e ao Brave Shields (Bloqueador de rastreadores e anúncios).

Esse comportamento pode causar atrasos ou falhas na atualização dos lances e no estado dos leilões.

**Recomendação:** para uma experiência mais estável, utilize o Chrome, Edge ou Firefox. Caso prefira o Brave, tente desativar o Brave Shields para o domínio da aplicação e teste novamente.

---

## Funcionalidades

- **Autenticação e autorização:** tokens JWT de acesso e atualização (_access/refresh tokens_), com controle de acesso baseado em papéis (`ADMIN`, `AUCTIONEER` e `BIDDER`).
- **Catálogo de lotes:** lotes vinculados ao leiloeiro responsável, com referência externa de produto (`productSource` e `externalProductId`) e dados flexíveis em `productData`.
- **Ciclo de vida dos leilões:** gerenciamento dos estados `DRAFT` → `SCHEDULED` → `ACTIVE` → `ENDED` → `SETTLED`, com possibilidade de cancelamento (`CANCELLED`).
- **Lances em tempo real:** comunicação via Socket.IO, com salas por lote e eventos de atualização de lances e status.
- **Carteiras digitais:** gerenciamento de saldos, reservas para lances ativos e histórico completo de transações.
- **Auditoria de lances:** cadeia de hashes SHA-256 por lote (`BidAudit`), com endpoint para verificar a integridade dos registros.
- **Liquidação financeira:** criação automática de liquidações ao encerrar lotes e débito do comprador com crédito ao vendedor de forma atômica durante a conclusão.
- **Tarefas em segundo plano:** início automático de lotes agendados e encerramento de lotes com prazo expirado.
- **Segurança:** Helmet, configuração de CORS e limitação de requisições (_rate limiting_).

## Pré-requisitos

- Node.js 20+ (recomendado 22)
- npm 10+
- PostgreSQL 16+ (Postgres roda dentro de um container Docker)
- Docker e Docker Compose.

## Instalação

### Desenvolvimento local

**1. Instale as dependências:**

```bash
npm install
```

**2. Configure as variáveis de ambiente:**

```bash
cp .env.example .env
```

Edite o arquivo `.env` com as configurações do seu ambiente.

**3. Inicie o PostgreSQL com Docker:**

```bash
docker-compose up -d postgres
```

Se você já possui uma instância do PostgreSQL em execução, pode utilizar essa instância configurando a variável `DATABASE_URL` no arquivo `.env`.

**4. Configure o esquema do banco de dados:**

```bash
npm run prisma:migrate
```

Como alternativa, para sincronizar o esquema sem criar um arquivo de migração:

```bash
npx prisma db push
```

**6. Inicie o servidor de desenvolvimento:**

```bash
npm run dev
```

Por padrão, a API estará disponível em:

`http://localhost:3000`

### Utilizando Docker

Você também pode rodar a aplicação no Docker ao inves de rodar localmente. Para construir as imagens e iniciar todos os serviços:

```bash
docker-compose up -d --build
```

Para acompanhar os logs da aplicação:

```bash
docker-compose logs -f api
```

---

## 🚀 Deploy e hospedagem

O backend do AureBid está hospedado em uma **VPS da Oracle Cloud Infrastructure (OCI)**, utilizando uma instância do plano **Always Free**.

A aplicação é executada em contêineres Docker, com PostgreSQL para persistência dos dados e um proxy reverso para intermediar o acesso aos serviços.

### Infraestrutura de produção

- **Provedor de hospedagem:** Oracle Cloud Infrastructure (OCI).
- **Instância:** `VM.Standard.E2.1.Micro` (AMD).
- **Plano:** Always Free.
- **Execução da aplicação:** Docker.
- **Banco de dados:** PostgreSQL.
- **Camada de entrada:** proxy reverso.
- **Backend:** Node.js, TypeScript e Express.
- **ORM:** Prisma.
- **Comunicação em tempo real:** Socket.IO.

### Arquitetura do deploy

A infraestrutura separa as responsabilidades da aplicação, do banco de dados e da camada de entrada.

O fluxo de comunicação é organizado da seguinte forma:

```text
Navegador
    │
    ▼
Frontend Vercel
    │
    ├── Requisições HTTP
    └── Conexão Socket.IO
             │
             ▼
      Nginx Proxy reverso
             │
             ▼
      Backend Express
         Docker
             │
             ▼
         PostgreSQL
```

O frontend hospedado na Vercel consome a API disponibilizada pelo backend. As conexões Socket.IO permitem distribuir atualizações dos leilões aos clientes conectados, enquanto o PostgreSQL mantém os dados persistidos da aplicação.

### Configuração do ambiente

As configurações de execução são definidas por variáveis de ambiente, incluindo:

- `DATABASE_URL`: conexão com o PostgreSQL.
- `JWT_SECRET` e `JWT_REFRESH_SECRET`: segredos utilizados na autenticação.
- `CORS_ORIGIN`: origem permitida para requisições HTTP.
- `SOCKET_IO_CORS_ORIGIN`: origem permitida para conexões Socket.IO.
- `PORT` e `API_PREFIX`: porta e prefixo das rotas da API.

Os segredos e as credenciais devem ser configurados diretamente no ambiente de execução, sem serem versionados no repositório.

### Comunicação em tempo real

O Socket.IO é utilizado para transmitir eventos relacionados aos leilões, incluindo novos lances, mudanças de estado e atualizações do cronômetro.

Como essa funcionalidade depende de conexões persistentes entre cliente e servidor, o proxy reverso e as configurações de rede precisam permitir o funcionamento adequado das conexões WebSocket.

### Links de deploy

A aplicação está publicada e pode ser acessada nos seguintes links:

| Nome             | Links                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Health Check     | [https://aurebid.duckdns.org/health](https://aurebid.duckdns.org/health) |
| Documentação     | [https://aurebid.duckdns.org/docs](https://aurebid.duckdns.org/docs)     |
| API Principal V1 | [https://aurebid.duckdns.org/api/v1](https://aurebid.duckdns.org/api/v1) |

---

## Documentação da API

Com o servidor em execução, a documentação interativa do Swagger estará disponível em:

[http://localhost:3000/docs](http://localhost:3000/docs)

No topo da documentação, estão disponíveis duas opções de exportação:

- **Baixar coleção do Postman:** exporta o arquivo `aurebid.postman_collection.json`, contendo as rotas, os parâmetros de caminho e consulta, além de exemplos de corpos de requisição, organizados por categoria.
- **Baixar OpenAPI (JSON):** exporta o documento OpenAPI completo em formato JSON.

A coleção do Postman pode ser importada diretamente pelo menu **File → Import**.

Ela utiliza as seguintes variáveis:

- `baseUrl`: endereço-base da API, com valor padrão `http://localhost:3000`.
- `accessToken`: token JWT utilizado na autenticação das rotas protegidas.

Após executar `POST /api/v1/auth/login`, copie o `accessToken` retornado e configure a variável correspondente na coleção para acessar as rotas protegidas.

## Estrutura do projeto

```text
src/
├── app.ts                      # Configuração da aplicação Express
├── server.ts                   # Ponto de entrada com Socket.IO
├── config/
│   ├── env.ts                  # Configuração das variáveis de ambiente
│   └── database.ts             # Cliente Prisma
├── modules/
│   ├── auth/                   # Autenticação e gerenciamento de usuários
│   ├── catalog/                # CRUD de lotes e catálogo de produtos
│   ├── auctions/               # Ciclo de vida dos leilões e gerenciamento de lances
│   ├── bids/                   # Consultas de lances
│   ├── wallets/                # Carteiras, reservas e transações
│   ├── settlements/            # Processamento das liquidações
│   └── audit/                  # Cadeia de hashes para auditoria dos lances
├── sockets/
│   ├── socket.server.ts        # Configuração do Socket.IO
│   └── auction.socket.ts       # Eventos de comunicação dos leilões
├── jobs/
│   └── close-auctions.job.ts   # Tarefas em segundo plano dos leilões
├── shared/
│   ├── errors/                 # Classes de erros personalizados
│   ├── middlewares/            # Middlewares do Express
│   ├── types/                  # Tipos do TypeScript
│   └── utils/                  # Funções utilitárias, incluindo a cadeia de auditoria
└── routes/
    └── index.ts                # Registro das rotas
```

## Modelos de dados

| Modelo              | Finalidade                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `User`              | Conta de usuário com papel de acesso (`ADMIN`, `AUCTIONEER` ou `BIDDER`).                             |
| `Batch`             | Lote de leilão, incluindo dados do produto, preços, período e status.                                 |
| `Bid`               | Registro imutável de um lance, contendo lote, participante, valor e data.                             |
| `BidAudit`          | Registro de auditoria que compõe a cadeia de hashes de cada lote.                                     |
| `Wallet`            | Carteira com o saldo do usuário.                                                                      |
| `WalletReservation` | Valores reservados pelo participante para um lote.                                                    |
| `WalletTransaction` | Movimentações financeiras, como `DEPOSIT`, débitos e créditos de liquidação, `REFUND` e `ADJUSTMENT`. |
| `Settlement`        | Registro da liquidação financeira entre comprador e vendedor de um lote encerrado.                    |

## 🔌 Eventos WebSocket

A aplicação utiliza Socket.IO para comunicação em tempo real.

A conexão deve incluir o token JWT de acesso na propriedade `auth.token` durante o handshake.

### Cliente → Servidor

```javascript
socket.emit("auction:join", batchId);
socket.emit("auction:leave", batchId);
```

- `auction:join`: entra na sala de um lote para receber atualizações.
- `auction:leave`: sai da sala do lote.

### Servidor → Cliente

```javascript
socket.on("auction:state", (data) => {
  // Estado inicial ao entrar na sala
});

socket.on("bid:new", (data) => {
  // Novo lance registrado
});

socket.on("auction:status_change", (data) => {
  // Alteração no estado do leilão
});

socket.on("auction:ended", (data) => {
  // Encerramento do lote
});

socket.on("auction:timer", (data) => {
  // Atualização da contagem regressiva
});
```

## Scripts disponíveis

| Script                        | Descrição                                                                |
| ----------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                 | Inicia o servidor de desenvolvimento com recarga automática.             |
| `npm run build`               | Gera a versão de produção.                                               |
| `npm start`                   | Inicia o servidor de produção.                                           |
| `npm run prisma:generate`     | Gera o cliente Prisma.                                                   |
| `npm run prisma:migrate`      | Executa as migrações no ambiente de desenvolvimento.                     |
| `npm run prisma:migrate:prod` | Executa as migrações no ambiente de produção.                            |
| `npm run prisma:studio`       | Abre o Prisma Studio.                                                    |
| `npm run prisma:seed`         | Popula o banco de dados com dados iniciais.                              |
| `npm run lint`                | Executa o ESLint.                                                        |
| `npm run lint:fix`            | Corrige automaticamente os problemas de lint que puderem ser resolvidos. |

## Comandos Docker

**Iniciar somente o banco de dados:**

```bash
docker-compose up -d postgres
```

**Iniciar todos os serviços:**

```bash
docker-compose up -d --build
```

**Parar todos os serviços:**

```bash
docker-compose down
```

**Parar os serviços e remover os volumes:**

```bash
docker-compose down -v
```

> **Atenção:** o comando `docker-compose down -v` remove os volumes associados ao projeto e pode apagar os dados persistidos do banco de dados. Utilize-o somente quando desejar realmente remover esses dados.

## 🔧 Variáveis de ambiente

Configure as variáveis abaixo no arquivo `.env`.

| Variável                 | Descrição                                               | Valor padrão            |
| ------------------------ | ------------------------------------------------------- | ----------------------- |
| `DATABASE_URL`           | String de conexão com o PostgreSQL.                     | Obrigatória             |
| `PORT`                   | Porta do servidor.                                      | `3000`                  |
| `NODE_ENV`               | Ambiente de execução.                                   | `development`           |
| `API_PREFIX`             | Prefixo das rotas da API.                               | `/api/v1`               |
| `JWT_SECRET`             | Segredo utilizado para assinar os tokens JWT de acesso. | Obrigatória             |
| `JWT_EXPIRES_IN`         | Tempo de expiração do token de acesso.                  | `15m`                   |
| `JWT_REFRESH_SECRET`     | Segredo utilizado para os tokens de atualização.        | Obrigatória             |
| `JWT_REFRESH_EXPIRES_IN` | Tempo de expiração do token de atualização.             | `7d`                    |
| `CORS_ORIGIN`            | Origem permitida para requisições HTTP.                 | `http://localhost:3001` |
| `SOCKET_IO_CORS_ORIGIN`  | Origem permitida para conexões Socket.IO.               | `http://localhost:3001` |

Os valores padrão representam o ambiente de desenvolvimento. Ajuste-os conforme o ambiente de execução.

**Segurança:** não compartilhe o arquivo `.env` nem utilize os segredos ou as credenciais de desenvolvimento em produção.

## Licença

Este projeto está licenciado sob a licença MIT.
