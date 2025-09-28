# PRD - P2P Score Bot

## 📋 Diretrizes de Desenvolvimento

### 🎯 Padrões Obrigatórios
- **ID da Operação**: SEMPRE incluir `🆔 **ID:** \`${operation._id}\`` em todas as mensagens
- **Fluxo de Mensagens**: Usar títulos corretos (`Operação Criada` → `Operação Aceita` → `Operação Concluída`)
- **Consistência de Moedas**: EUR (€), USD ($), BRL (R$) formatados corretamente
- **Validações**: Verificar permissões, estado da operação e dados obrigatórios

### 📚 Documentação de Referência
- `DIRETRIZES-DESENVOLVIMENTO.md`: Guia completo de padrões e checklists
- `tasks.json`: Histórico de implementações e correções
- Seguir sempre os padrões estabelecidos para manter consistência

## Arquitetura e Ambientes - Telegram Bot
- Deve existir uma única instância ativa do bot consumindo getUpdates por token.
- Em desenvolvimento, usar token/username separados no arquivo .env.development (NODE_ENV=development).
- Em caso de conflito 409 (getUpdates), a aplicação NÃO deve cair: operar em modo degradado (API HTTP ativa, bot desativado) e registrar log orientando a correção (usar token de dev ou desligar instância remota/webhook).

## 📋 Visão Geral do Produto

### Objetivo
Desenvolver um bot do Telegram para sistema de avaliação peer-to-peer (P2P) que permita aos usuários avaliar uns aos outros, construir reputação e estabelecer confiança em comunidades.

### Público-Alvo
- Comunidades do Telegram que precisam de sistema de reputação
- Grupos de negócios P2P
- Comunidades de trading e marketplace
- Grupos de colaboração e networking

## 🎯 Objetivos do Produto

### Objetivos Primários
1. **Sistema de Avaliação**: Permitir avaliações positivas e negativas entre usuários
2. **Reputação Transparente**: Exibir histórico e pontuação de reputação dos usuários
3. **Confiança P2P**: Estabelecer níveis de confiança baseados em interações
4. **Interface Intuitiva**: Comandos simples e em português brasileiro

### Objetivos Secundários
1. **Prevenção de Spam**: Sistema de cooldown para evitar abuso
2. **Histórico Detalhado**: Rastreamento completo de todas as interações
3. **Integração com Mini App**: Interface web complementar
4. **Escalabilidade**: Suporte a múltiplos grupos simultaneamente

## 🔧 Funcionalidades Principais

### 1. Sistema de Score/Karma (Existente - Adaptado)
- **Comando**: `/meuscore` - Visualizar própria pontuação
- **Comando**: `/melhorscore` - Ranking dos melhores usuários
- **Comando**: `/piorscore` - Ranking dos piores usuários
- **Comando**: `/score @usuario` - Ver pontuação de usuário específico
- **Funcionalidade**: Dar +1 ou -1 respondendo mensagens

### 2. Sistema de Avaliação P2P (Nova)
- **Comando**: `/avaliar @usuario positiva "motivo"` - Avaliação positiva
- **Comando**: `/avaliar @usuario negativa "motivo"` - Avaliação negativa
- **Funcionalidade**: Sistema de avaliação com justificativa obrigatória
- **Regras**: Cooldown de 24h entre avaliações do mesmo usuário

### 3. Sistema de Reputação (Nova)
- **Comando**: `/reputacao @usuario` - Ver reputação detalhada
- **Funcionalidade**: Cálculo baseado em:
  - Score total (karma)
  - Número de avaliações positivas/negativas
  - Tempo de atividade no grupo
  - Consistência das avaliações recebidas

### 4. Sistema de Confiança (Nova)
- **Comando**: `/confianca @usuario` - Ver nível de confiança
- **Funcionalidade**: Níveis de confiança:
  - 🔴 Baixa (0-25%): Usuário novo ou com avaliações negativas
  - 🟡 Média (26-60%): Usuário com histórico misto
  - 🟢 Alta (61-85%): Usuário confiável com bom histórico
  - 💎 Excelente (86-100%): Usuário exemplar da comunidade

### 5. Comandos de Histórico (Existente - Melhorado)
- **Comando**: `/historico` - Próprio histórico de avaliações
- **Comando**: `/verhistorico @usuario` - Histórico de outro usuário
- **Comando**: `/hoje`, `/mes`, `/ano` - Estatísticas por período

### 6. Sistema de Operações P2P (Implementada e Corrigida)
- **Comando**: `/criaroperacao` - Criar nova operação de compra/venda/troca
- **Comando**: `/aceitaroperacao [ID]` - Aceitar operação disponível
- **Comando**: `/concluiroperacao [ID]` - Marcar operação como concluída
- **Comando**: `/cancelaroperacao [ID]` - Cancelar operação própria
- **Comando**: `/minhasoperacoes` - Ver histórico de operações
- **Funcionalidade**: Interface com botões para:
  - Tipo: Compra, Venda, Anúncio ou **Troca** (novo)
  - Ativos: USDC, USDT, USDe, BTC, ETH, XRP, **EURO**, **DÓLAR**, **REAL** (expandido)
  - Redes: Arbitrum, Polygon, Ethereum, Base, Solana, BNB (completo)
  - Valor e preço personalizados com **formatação de moeda correta**
  - Sistema de cotação manual/Google com **cotações EUR/USD reais**
  - **ID da operação em todas as mensagens** para identificação
  - **Fluxo de mensagens correto**: Criada → Aceita → Concluída
  - Broadcast automático para grupos

### 7. Comandos Administrativos
- **Comando**: `/help` - Lista todos os comandos disponíveis
- **Comando**: `/transferir @usuario quantidade` - Transferir pontos
- **Funcionalidade**: Configurações por grupo (admin only)

## 🏗️ Arquitetura Técnica

### Stack Tecnológico
- **Backend**: Node.js + NestJS
- **Database**: MongoDB
- **Bot Framework**: Telegraf
- **API**: REST API para Mini App
- **Deploy**: VPS com PM2

### Estrutura de Dados

#### Usuário
```typescript
interface User {
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  karma: number;
  evaluationsGiven: number;
  evaluationsReceived: number;
  trustLevel: number; // 0-100
  reputation: number; // calculado
  joinedAt: Date;
  lastActive: Date;
}
```

#### Avaliação
```typescript
interface Evaluation {
  id: string;
  fromUser: number; // telegramId
  toUser: number; // telegramId
  groupId: number;
  type: 'positive' | 'negative';
  reason: string;
  karmaChange: number;
  createdAt: Date;
}
```

#### Grupo
```typescript
interface Group {
  telegramId: number;
  title: string;
  settings: {
    cooldownHours: number;
    maxKarmaPerDay: number;
    requireReason: boolean;
    minReasonLength: number;
  };
  createdAt: Date;
}
```

#### Operação P2P (Implementada e Corrigida)
```typescript
interface Operation {
  _id: ObjectId;
  type: 'buy' | 'sell' | 'announcement' | 'exchange'; // Expandido
  assets: AssetType[]; // Array para múltiplos ativos
  networks: NetworkType[]; // Array para múltiplas redes
  amount: number;
  price: number;
  quotationType: 'manual' | 'google'; // Simplificado
  description?: string;
  paymentMethods?: string[]; // PIX, Boleto, etc.
  creator: ObjectId; // referência ao usuário
  group: ObjectId; // referência ao grupo
  acceptor?: ObjectId; // usuário que aceitou
  status: 'pending' | 'accepted' | 'pending_completion' | 'completed' | 'cancelled'; // Estados corretos
  messageId?: number; // ID da mensagem no grupo
  privateEvaluationMessageId?: number; // ID da mensagem privada
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  transactionHash?: string; // Hash da transação blockchain
  transactionDetails?: string; // Detalhes fornecidos pelo usuário
}

// Enums expandidos
enum AssetType {
  USDC = 'USDC', USDT = 'USDT', USDE = 'USDe',
  BTC = 'BTC', ETH = 'ETH', XRP = 'XRP',
  DOLAR = 'DOLAR', EURO = 'EURO', REAL = 'REAL'
}

enum NetworkType {
  ARBITRUM = 'arbitrum', POLYGON = 'polygon', 
  ETHEREUM = 'ethereum', BASE = 'base', 
  SOLANA = 'solana', BNB = 'bnb'
}
```

## 🔒 Regras de Negócio

### Sistema de Pontuação
1. **Karma Básico**: +1/-1 por reação simples
2. **Avaliação P2P**: +3/-3 por avaliação com justificativa
3. **Bônus de Consistência**: +1 extra para usuários com alta reputação
4. **Penalidade de Spam**: -5 por tentativa de spam/abuso

### Cooldowns e Limites
1. **Cooldown de Karma**: 1 hora entre karmas para o mesmo usuário
2. **Cooldown de Avaliação**: 24 horas entre avaliações para o mesmo usuário
3. **Limite Diário**: Máximo 10 avaliações por usuário por dia
4. **Limite de Transferência**: Máximo 50 pontos por transferência

### Cálculo de Reputação
```
Reputação = (
  (karma * 0.4) + 
  (avaliaçõesPositivas * 0.3) + 
  (tempoAtividade * 0.2) + 
  (consistência * 0.1)
) / 100
```

### Cálculo de Confiança
```
Confiança = (
  (reputação * 0.5) + 
  (ratioPositivas * 0.3) + 
  (atividade * 0.2)
) * 100
```

## 🚀 Roadmap de Desenvolvimento

### Fase 1: Tradução e Adaptação (Concluída)
- [x] Tradução completa para português
- [x] Adaptação de comandos existentes
- [x] Documentação atualizada

### Fase 2: Funcionalidades P2P (Majoritariamente Concluída)
- [x] Sistema de Operações P2P implementado e corrigido
- [x] Comando `/criaroperacao` com interface completa
- [x] Comando `/aceitaroperacao` funcional
- [x] Comando `/concluiroperacao` implementado
- [x] Comando `/cancelaroperacao` implementado
- [x] Comando `/minhasoperacoes` para histórico
- [x] Sistema de broadcast automático para grupos
- [x] Interface com botões para tipos, ativos e redes expandidos
- [x] **Correções críticas implementadas**:
  - [x] ID da operação em todas as mensagens
  - [x] Fluxo de mensagens correto (Criada → Aceita → Concluída)
  - [x] Formatação consistente de moedas (EUR €, USD $, BRL R$)
  - [x] Cotações EUR/USD com API real
  - [x] Notificações adequadas para criador e aceitador
- [ ] Implementar comando `/avaliar`
- [ ] Implementar comando `/reputacao`
- [ ] Implementar comando `/confianca`
- [ ] Sistema de cooldowns avançado

### Fase 3: Melhorias e Otimizações
- [ ] Interface do Mini App
- [ ] Dashboard administrativo
- [ ] Relatórios e analytics
- [ ] Sistema de notificações

### Fase 4: Recursos Avançados
- [ ] Sistema de badges/conquistas
- [ ] Integração com outros bots
- [ ] API pública
- [ ] Sistema de moderação automática

## 📊 Métricas de Sucesso

### KPIs Principais
1. **Adoção**: Número de grupos ativos usando o bot
2. **Engajamento**: Avaliações por usuário por dia
3. **Retenção**: Usuários ativos mensalmente
4. **Qualidade**: Ratio de avaliações positivas vs negativas

### Métricas Técnicas
1. **Performance**: Tempo de resposta < 2s
2. **Disponibilidade**: Uptime > 99.5%
3. **Escalabilidade**: Suporte a 1000+ grupos simultâneos
4. **Segurança**: Zero incidentes de segurança

## 🔐 Considerações de Segurança

### Prevenção de Abuso
1. **Rate Limiting**: Limites por usuário e por grupo
2. **Detecção de Spam**: Algoritmos para detectar comportamento suspeito
3. **Moderação**: Ferramentas para administradores
4. **Auditoria**: Log completo de todas as ações

### Privacidade
1. **LGPD Compliance**: Conformidade com lei de proteção de dados
2. **Anonimização**: Opção de avaliações anônimas
3. **Retenção**: Política de retenção de dados
4. **Consentimento**: Opt-in explícito para participação

## 📝 Notas de Implementação

### Prioridades
1. **Alta**: Funcionalidades core de avaliação P2P
2. **Média**: Interface e usabilidade
3. **Baixa**: Recursos avançados e integrações

### Riscos e Mitigações
1. **Risco**: Abuso do sistema de avaliação
   - **Mitigação**: Cooldowns e detecção de padrões
2. **Risco**: Escalabilidade com muitos grupos
   - **Mitigação**: Otimização de banco de dados e cache
3. **Risco**: Manipulação de reputação
   - **Mitigação**: Algoritmos de detecção e moderação

---

**Versão**: 2.0  
**Data**: Janeiro 2025  
**Status**: Fase 2 Majoritariamente Concluída  
**Última Atualização**: Correções críticas de UX implementadas  
**Próxima Revisão**: Após implementação dos comandos de avaliação