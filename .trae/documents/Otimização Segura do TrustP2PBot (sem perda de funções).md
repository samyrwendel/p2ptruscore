## Objetivo
- Otimizar performance, resiliência e manutenção sem alterar comportamento funcional do bot.
- Reduzir riscos de rate limit, latência e acoplamento por IDs/segredos hardcoded.

## Escopo
- Serviços: `operations-broadcast.service.ts`, `operations.service.ts`, `currency-api.service.ts`
- Configuração: `app.module.ts`, `config/*`, uso de `process.env`
- Comandos/handlers: fluxo de cancelamento e mensagens
- Testes: unidade e e2e mínimos

## Fase 1 — Config e Integrações
- Remover default hardcoded de `CURRENCY_API_KEY` e ler via `ConfigService` com validação `Joi`.
- Adicionar retries com backoff exponencial e jitter na `CurrencyApiService` (falhas de rede/timeout).
- Tornar TTL de cache configurável via `REQUEST_TIMEOUT`/`CACHE_TTL` em `.env`.

## Fase 2 — Broadcast Escalável
- Introduzir fila com concorrência limitada (ex.: 3–5) para `broadcastOperationToAllGroups`.
- Tratar `429` com backoff exponencial e re-agendamento.
- Manter `messageId` atualizado; preferir `editMessageText` antes de reenviar.

## Fase 3 — Centralização de Configuração
- Criar provider de `TelegramConfig` (IDs de grupos/threads/admin) baseado em `ConfigService`.
- Migrar leituras diretas de `process.env` em `operations-broadcast.service.ts` e `telegram.service.ts` para o provider.
- Ampliar `Joi` em `app.module.ts` para validar: `TELEGRAM_GROUP_ID`, `TELEGRAM_THREAD_ID`, `TELEGRAM_ADMIN_CHANNEL_ID`.

## Fase 4 — Tratamento de Erros
- Substituir `throw new Error` por exceções Nest específicas (`BadRequestException`, `ForbiddenException`, `NotFoundException`) em `operations.service.ts`.
- Padronizar mensagens amigáveis ao usuário nos handlers ao capturar erros.

## Fase 5 — Redução de Duplicação
- Extrair helpers de formatação de mensagens (tipo/emoji, total, redes, setas) em módulo utilitário.
- Extrair geração de teclados inline em serviço dedicado para reuso.
- Aplicar nos métodos extensos (`notifyOperationAccepted`, `notifyOperationCompleted`).

## Fase 6 — Testes e Validação
- Unidade: `currency-api.service` (cache hit/miss, timeout/retries), utilitários de formatação, provider de config.
- e2e mínimo: aceitar → concluir → reverter (sem tocar Telegram real; usar mocks de Telegraf).
- Build e verificação manual das rotas web (`/setup`, `/help`) e logs consistentes.

## Riscos e Mitigações
- Alterações de concorrência podem afetar dinâmica de envio: usar limites conservadores e logs detalhados.
- Config obrigatória pode falhar em ambientes antigos: fornecer mensagens claras no `/setup` e validação `Joi`.
- Retries em integrações: limitar tentativas para evitar cascata em falhas prolongadas.

## Entregáveis
- Código atualizado nos serviços e módulos citados.
- Provider `TelegramConfig` e validações `Joi` ampliadas.
- Conjunto básico de testes passando.
- Documentação leve nas mensagens de log (sem comentários no código).

## Ordem de Execução
1) ConfigService + `Joi` (segredos/IDs) e remover defaults hardcoded.
2) Retries/backoff e parâmetros de cache/timeout na `CurrencyApiService`.
3) Fila de broadcast com concorrência limitada e backoff em `429`.
4) Exceções específicas em `operations.service` e mensagens amigáveis.
5) Helpers utilitários para formatação/teclados e aplicação nos métodos longos.
6) Implementar testes e rodar build; validação final.

Confirma proceder com esse plano? Após confirmação, executo cada fase com verificações e preservação completa da funcionalidade atual.