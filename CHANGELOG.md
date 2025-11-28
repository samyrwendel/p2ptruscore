# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-11-28

### Added

#### Resiliência e Confiabilidade
- **Rate Limiting por Usuário:** Sistema de limitação de requisições para prevenir abuso
  - 5 operações por hora por usuário
  - 10 avaliações por hora por usuário
  - Implementado via `RateLimiterService` com cleanup automático

- **Retry Automático para Telegram API:** Sistema robusto de retry com exponential backoff
  - Retry automático para erros 429 (Too Many Requests)
  - Retry para erros 500-504 (Server Errors)
  - Retry para erros de rede (ETIMEDOUT, ECONNRESET, etc.)
  - Configurável via variáveis de ambiente
  - Implementado via `TelegramRetryService`

- **Transações MongoDB ACID:** Suporte a transações para operações críticas
  - Detecção automática de suporte a replica set
  - Fallback gracioso para standalone mode
  - Transações em `completeOperation()` e `updateKarma()`
  - Implementado via `TransactionService`

#### Infraestrutura de Produção
- **Configuração PM2:** Gerenciamento de processo para produção
  - Auto-restart em caso de falha
  - Restart automático ao reiniciar servidor (systemd)
  - Limite de memória (500MB) com restart automático
  - Logs estruturados com timestamps
  - Parser customizado de `.env` para evitar conflitos com variáveis do sistema

- **Sistema de Notificações Admin:** Alertas para administradores
  - Notificações de operações suspeitas
  - Alertas de erros críticos
  - Configurável via `TELEGRAM_ADMIN_CHANNEL_ID`

### Fixed

- **Memory Leaks:** Correção de vazamentos de memória em listeners de eventos
  - Cleanup adequado de event listeners
  - Remoção de referências circulares
  - Garbage collection otimizado

- **Race Conditions:** Correção de condições de corrida em operações concorrentes
  - Uso de operações atômicas no MongoDB
  - Transações para operações multi-documento
  - Locks otimistas onde necessário

- **Conflito de Variáveis de Ambiente:** Parser customizado de `.env` no PM2
  - Resolve problema onde variáveis do sistema sobrescreviam o arquivo `.env`
  - Leitura direta do arquivo `.env` ignorando `process.env`

### Changed

- **AbstractRepository:** Adicionado suporte a `ClientSession` no método `upsert()`
- **KarmaRepository:** Métodos `updateSenderKarma()` e `updateReceiverKarma()` agora suportam transações
- **OperationsRepository:** Métodos `completeOperation()` e `updateOperation()` agora suportam transações
- **SharedModule:** Adicionados novos serviços: `RateLimiterService`, `TelegramRetryService`, `TransactionService`

### Documentation

- **docs/DEPLOY.md:** Guia completo de deploy para produção
- **docs/TELEGRAM_RETRY_CONFIGURATION.md:** Configuração do sistema de retry
- **docs/PM2_SETUP.md:** Configuração do PM2 para produção

### Security

- Rate limiting previne ataques de força bruta e abuse
- Transações garantem consistência de dados
- Validação rigorosa de termos de uso

---

## [2.0.0] - 2025-07-24

### Changed

- **Complete Architectural Migration:** The entire application has been rewritten from a classic Node.js/Express stack to a modern, robust, and scalable **NestJS** framework.
- **Switched to TypeScript:** The entire codebase is now strictly typed with TypeScript, improving code quality, maintainability, and developer experience.
- **Upgraded Telegram Library:** Migrated from `node-telegram-bot-api` to the more modern and NestJS-friendly `Telegraf`.

### Added

- **SOLID Principles:** Implemented a clean architecture with decoupled services, repositories, and controllers.
- **Command Handler Pattern:** Introduced a scalable pattern for managing bot commands, making it easy to add new commands without modifying existing code.
- **Full REST API:** Added a complete REST API with endpoints for groups and users, designed to power the companion Telegram Mini App.
- **Type-Safe Configuration:** Implemented `@nestjs/config` with Joi for robust, validated environment variable management.
- **API Security:** Added rate limiting (`@nestjs/throttler`) to all API endpoints to prevent abuse.
- **Professional Dockerfile:** Optimized for multi-stage builds, smaller production images, and enhanced security.

### Removed

- Removed direct dependencies between services and repositories of other domains.
- Removed all legacy code from the `v1.0.0-legacy` version.

---

## [1.0.0-legacy]

- Initial release based on Node.js and `node-telegram-bot-api`.
