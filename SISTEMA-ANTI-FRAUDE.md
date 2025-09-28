# 🛡️ Sistema Anti-Fraude e Contestações - TrustP2PBot

## 📋 Visão Geral

O TrustP2PBot implementa um sistema robusto de proteção contra fraudes e resolução de disputas para garantir transações seguras entre os membros da comunidade P2P.

## 🔧 Componentes do Sistema

### 1. **Schema de Disputas** (`dispute.schema.ts`)

#### Tipos de Disputa:
- `NON_PAYMENT` - Não efetuou pagamento
- `NON_DELIVERY` - Não entregou ativos/serviços  
- `WRONG_AMOUNT` - Valor incorreto
- `FRAUD_ATTEMPT` - Tentativa de fraude
- `COMMUNICATION_ISSUE` - Problemas de comunicação
- `TERMS_VIOLATION` - Violação dos termos
- `OTHER` - Outros motivos

#### Status de Disputa:
- `OPEN` - Disputa aberta
- `UNDER_REVIEW` - Sob análise de administrador
- `RESOLVED` - Resolvida
- `DISMISSED` - Rejeitada (contestação inválida)
- `ESCALATED` - Escalada para moderação superior

#### Tipos de Resolução:
- `FAVOR_COMPLAINANT` - A favor do reclamante
- `FAVOR_DEFENDANT` - A favor do acusado
- `PARTIAL_REFUND` - Reembolso parcial
- `OPERATION_CANCELLED` - Operação cancelada
- `WARNING_ISSUED` - Advertência emitida
- `USER_BANNED` - Usuário banido
- `NO_ACTION` - Nenhuma ação necessária

### 2. **Novos Status de Operação**

- `DISPUTED` - Operação em disputa (suspensa)
- `UNDER_REVIEW` - Sob análise de administrador
- `FRAUD_REPORTED` - Fraude reportada (operação suspensa)

### 3. **Comando `/contestar`**

#### Sintaxe:
```
/contestar [ID_DA_OPERACAO] [MOTIVO_DETALHADO]
```

#### Exemplo:
```
/contestar 507f1f77bcf86cd799439011 Não recebi o pagamento conforme combinado no valor de R$ 1.500
```

#### Validações:
- ✅ Apenas participantes da operação podem contestar
- ✅ Operação deve estar em status `ACCEPTED` ou `PENDING_COMPLETION`
- ✅ Motivo deve ter entre 10-500 caracteres
- ✅ Não permite contestações duplicadas
- ✅ Categorização automática do tipo de disputa

## 🔒 Medidas de Proteção

### **Contra Golpistas:**
1. **Suspensão Imediata**: Operação fica suspensa durante disputa
2. **Histórico Permanente**: Registro de todas as disputas por usuário
3. **Sistema de Evidências**: Suporte para comprovantes
4. **Notificação Automática**: Administradores são alertados
5. **Rastreamento de Padrões**: Identificação de comportamentos suspeitos

### **Contra Contestações Falsas:**
1. **Motivo Obrigatório**: Mínimo 10 caracteres
2. **Aviso de Penalidades**: Usuários são alertados sobre consequências
3. **Registro de Contestador**: Histórico de quem contesta
4. **Sistema de Appeals**: Possibilidade de recurso
5. **Análise de Administradores**: Mediação humana

## 📊 Fluxo de Contestação

### **1. Usuário Contesta**
```
/contestar 507f1f77bcf86cd799439011 Não recebi o pagamento
```

### **2. Sistema Valida**
- Verifica se usuário pode contestar
- Categoriza automaticamente o tipo de disputa
- Valida tamanho e conteúdo do motivo

### **3. Operação Suspensa**
- Status muda para `DISPUTED`
- Operação fica indisponível para outras ações
- Ambas as partes são notificadas

### **4. Notificações Enviadas**
- **Reclamante**: Confirmação da contestação
- **Acusado**: Notificação da disputa
- **Administradores**: Alerta para análise

### **5. Análise Administrativa**
- Admin usa `/resolvercontestacao` (futuro)
- Análise de evidências
- Decisão final com consequências

## 🔐 Práticas de Segurança Obrigatórias

### **Hash de Transação Blockchain**

#### **Obrigatoriedade:**
- Toda transação em criptomoeda DEVE incluir hash da transação
- Hash deve ser fornecido no momento da negociação
- Falha em fornecer hash pode resultar em contestação

#### **Redes Suportadas:**
- **Bitcoin**: Hash da transação BTC
- **Ethereum**: Hash da transação ETH
- **Arbitrum**: Hash da transação ARB
- **Polygon**: Hash da transação MATIC
- **Base**: Hash da transação BASE
- **Solana**: Signature da transação SOL
- **BNB Chain**: Hash da transação BNB

#### **Formato Esperado:**
```
Bitcoin: 64 caracteres hexadecimais
Ethereum/EVM: 66 caracteres (0x + 64 hex)
Solana: 88 caracteres base58
```

#### **Exemplos Válidos:**
```
BTC: a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
ETH: 0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
SOL: 5VqB7K8R2nP9QxM3Hy7L4Wz8Jf6Gd2Nt9Xc1Vb4Mn8Qp3Rs7Tg5Uh2Yk6Zl9Bm4Nq8Rt3Sw6Vx1Cy5Ez9
```

## 🚨 Penalidades e Consequências

### **Para Fraudadores:**
- ⛔ **Primeira Ofensa**: Advertência + operação cancelada
- ⛔ **Segunda Ofensa**: Suspensão temporária (7 dias)
- ⛔ **Terceira Ofensa**: Banimento permanente do grupo
- ⛔ **Fraude Comprovada**: Banimento imediato + alerta para outros grupos

### **Para Contestações Falsas:**
- ⚠️ **Primeira Falsa**: Advertência
- ⚠️ **Segunda Falsa**: Redução de karma (-50 pontos)
- ⚠️ **Terceira Falsa**: Cooldown de 30 dias para criar operações
- ⚠️ **Abuso Sistemático**: Banimento temporário

## 📈 Métricas e Monitoramento

### **Indicadores de Risco:**
- Usuários com múltiplas contestações recebidas
- Padrão de operações canceladas frequentemente
- Falta de hash em transações crypto
- Tempo excessivo entre aceitação e conclusão
- Reclamações de múltiplos usuários diferentes

### **Alertas Automáticos:**
- 🔴 **Alto Risco**: 3+ contestações em 30 dias
- 🟡 **Médio Risco**: 2 contestações em 15 dias
- 🟢 **Baixo Risco**: Histórico limpo

## 🔮 Roadmap Futuro

### **Fase 1 - Implementado:**
- ✅ Sistema de contestações
- ✅ Novos status de operação
- ✅ Validações básicas
- ✅ Notificações automáticas

### **Fase 2 - Em Desenvolvimento:**
- 🔄 Comando `/adicionarevidencia`
- 🔄 Comando `/resolvercontestacao`
- 🔄 Sistema de penalidades automáticas
- 🔄 Validação de hash de transação

### **Fase 3 - Planejado:**
- 📋 Integração com APIs de blockchain
- 📋 Verificação automática de transações
- 📋 Dashboard de disputas para admins
- 📋 Sistema de reputação avançado
- 📋 Machine Learning para detecção de fraudes

## 🛠️ Comandos Disponíveis

### **Para Usuários:**
- `/contestar [ID] [motivo]` - Contestar operação
- `/adicionarevidencia [ID]` - Adicionar comprovantes (futuro)
- `/minhasoperacoes` - Ver operações (inclui disputadas)

### **Para Administradores:**
- `/resolvercontestacao [ID] [decisao]` - Resolver disputa (futuro)
- `/banirfraudador [usuario] [motivo]` - Banir usuário (futuro)
- `/listardiputas` - Listar disputas pendentes (futuro)

## 📞 Suporte e Contato

Em caso de dúvidas sobre o sistema anti-fraude:
1. Consulte os termos de uso atualizados
2. Entre em contato com administradores
3. Use `/help` para comandos disponíveis
4. Reporte bugs via GitHub Issues

---

**⚠️ Lembrete Importante:** Este sistema visa proteger a comunidade. Use-o com responsabilidade e sempre forneça informações verdadeiras em contestações.