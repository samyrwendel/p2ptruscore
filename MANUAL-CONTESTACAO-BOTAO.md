# 📋 Manual do Sistema de Contestação via Botão

## 🎯 Visão Geral

O sistema de contestação via botão permite que usuários contestem operações de forma intuitiva através de uma interface gráfica, sem precisar digitar comandos complexos.

## 🔄 Fluxo Completo da Contestação

### 1. **Quando o Botão Aparece**

O botão **"⚠️ Contestar"** aparece automaticamente quando:
- A operação está no status `PENDING_COMPLETION` (aguardando confirmação de conclusão)
- O usuário é participante da operação (criador ou aceitador)
- A operação não foi concluída nem cancelada

### 2. **Clique no Botão**

Quando o usuário clica em **"⚠️ Contestar"**:

#### **Validações Automáticas:**
- ✅ Verifica se o usuário aceitou os termos de uso
- ✅ Confirma que é participante da operação
- ✅ Valida se a operação pode ser contestada
- ✅ Verifica se não está já em disputa

#### **Se Aprovado:**
- Interface de seleção de motivo é exibida

#### **Se Rejeitado:**
- Mensagem de erro específica é mostrada

### 3. **Seleção do Motivo**

Interface apresentada ao usuário:

```
⚖️ Contestar Operação

Selecione o motivo da contestação:

💰 Não efetuou pagamento
📦 Não entregou ativos/serviços  
💸 Valor incorreto
🚨 Tentativa de fraude
💬 Problema de comunicação
📋 Violação dos termos
❌ Cancelar
```

### 4. **Processamento da Contestação**

Após seleção do motivo:

#### **Validações Finais:**
- Revalida dados da operação
- Confirma identidade do usuário
- Verifica status atual

#### **Processamento:**
- Operação marcada como `DISPUTED`
- Registro criado no sistema de disputas
- Log de auditoria gerado

#### **Confirmação:**
```
✅ Operação Contestada com Sucesso!

Motivo: A outra parte não efetuou o pagamento

A operação foi marcada como em disputa e será analisada pelos administradores.

Você receberá uma notificação quando houver uma resolução.
```

## 🛡️ Validações de Segurança

### **Validação de Termos**
```typescript
const hasValidTerms = await validateUserTermsForCallback(ctx, this.termsAcceptanceService, 'contestar');
if (!hasValidTerms) {
  // Bloqueia contestação
  return true;
}
```

### **Validação de Participação**
```typescript
const isCreator = operation.creator.toString() === user._id.toString();
const isAcceptor = operation.acceptor?.toString() === user._id.toString();

if (!isCreator && !isAcceptor) {
  await ctx.editMessageText('❌ Você só pode contestar operações das quais participa.');
  return true;
}
```

### **Validação de Status**
```typescript
if (operation.status !== OperationStatus.ACCEPTED && 
    operation.status !== OperationStatus.PENDING_COMPLETION) {
  await ctx.editMessageText('❌ Esta operação não pode ser contestada no status atual.');
  return true;
}
```

## 🏗️ Arquitetura Técnica

### **Handler Principal**
- **Arquivo:** `disputar-operacao-callback.command.handler.ts`
- **Classe:** `DisputarOperacaoCallbackCommandHandler`
- **Callbacks processados:**
  - `dispute_operation_${operationId}` - Inicia contestação
  - `dispute_reason_${motivo}_${operationId}` - Processa motivo
  - `dispute_cancel` - Cancela contestação

### **Integração com Sistema Existente**
- **Service:** `OperationsService.disputeOperation()`
- **Repository:** `OperationsRepository.disputeOperation()`
- **Schema:** `DisputeType` enum para categorização

### **Mapeamento de Motivos**
```typescript
private categorizeDispute(reason: string): DisputeType {
  switch (reason) {
    case 'nao_pagou': return DisputeType.NON_PAYMENT;
    case 'nao_entregou': return DisputeType.NON_DELIVERY;
    case 'valor_incorreto': return DisputeType.WRONG_AMOUNT;
    case 'tentativa_fraude': return DisputeType.FRAUD_ATTEMPT;
    case 'problema_comunicacao': return DisputeType.COMMUNICATION_ISSUE;
    case 'violacao_termos': return DisputeType.TERMS_VIOLATION;
    default: return DisputeType.OTHER;
  }
}
```

## 📊 Estados da Operação

### **Status Válidos para Contestação:**
- `ACCEPTED` - Operação aceita, em negociação
- `PENDING_COMPLETION` - Aguardando confirmação de conclusão

### **Status Após Contestação:**
- `DISPUTED` - Operação em disputa, aguardando análise administrativa

### **Status que Impedem Contestação:**
- `PENDING` - Ainda não foi aceita
- `COMPLETED` - Já foi concluída
- `CANCELLED` - Foi cancelada
- `DISPUTED` - Já está em disputa

## 🔧 Gestão de Sessões

### **Sessão Temporária**
```typescript
interface DisputeSession {
  operationId: string;
  userId: number;
  step: 'awaiting_reason';
  messageId?: number;
}
```

### **Limpeza Automática**
- Sessões são removidas após processamento
- Cancelamento limpa todas as sessões do usuário
- Prevenção de vazamentos de memória

## 🚨 Tratamento de Erros

### **Callback Expirado**
```typescript
try {
  await ctx.answerCbQuery();
} catch (cbError: any) {
  if (cbError.description?.includes('query is too old')) {
    this.logger.warn('Callback query expirado');
  }
}
```

### **Operação Não Encontrada**
```typescript
if (!operation) {
  await ctx.editMessageText('❌ Operação não encontrada.');
  return true;
}
```

### **Erro de Processamento**
```typescript
try {
  await this.operationsService.disputeOperation(/*...*/);
} catch (error) {
  await ctx.editMessageText(`❌ ${error.message}`);
}
```

## 📝 Logs de Auditoria

### **Logs Gerados:**
- Início da contestação
- Validações realizadas
- Motivo selecionado
- Resultado do processamento
- Erros encontrados

### **Exemplo de Log:**
```
[DisputarOperacaoCallbackCommandHandler] Operação 507f1f77bcf86cd799439011 contestada por usuário 123456789 - Motivo: A outra parte não efetuou o pagamento
```

## 🔄 Comparação com Sistema Anterior

### **Antes (Comando de Texto):**
```
/contestar 507f1f77bcf86cd799439011 Não recebi o pagamento conforme combinado
```

### **Agora (Interface Gráfica):**
1. Clique no botão "⚠️ Contestar"
2. Seleção visual do motivo
3. Confirmação automática

### **Vantagens do Novo Sistema:**
- ✅ **Mais intuitivo** - Interface gráfica vs comando de texto
- ✅ **Menos erros** - Validações automáticas vs digitação manual
- ✅ **Motivos padronizados** - Seleção vs texto livre
- ✅ **Melhor UX** - Fluxo guiado vs memorização de sintaxe
- ✅ **Validações robustas** - Múltiplas camadas de segurança

## 🎯 Casos de Uso

### **Caso 1: Não Recebeu Pagamento**
1. Usuário clica "⚠️ Contestar"
2. Seleciona "💰 Não efetuou pagamento"
3. Sistema processa automaticamente
4. Operação marcada como disputada

### **Caso 2: Tentativa de Cancelamento**
1. Usuário clica "⚠️ Contestar"
2. Clica "❌ Cancelar"
3. Interface fecha sem processar
4. Operação mantém status original

### **Caso 3: Usuário Sem Permissão**
1. Usuário não participante clica botão
2. Sistema valida participação
3. Erro exibido: "Você só pode contestar operações das quais participa"
4. Contestação bloqueada

## 📢 Sistema de Notificações Implementado

### 🚨 **Notificações Automáticas**

Quando uma operação é contestada, o sistema **automaticamente notifica todas as partes**:

#### **1. Notificação para a Outra Parte (DM)**
```
🚨 Operação Contestada

Sua operação foi contestada por @usuario

Motivo: Não efetuou pagamento
ID da Operação: 507f1f77bcf86cd799439011

📊 Detalhes da Operação:
• Tipo: Compra
• Ativos: USDC
• Quantidade: 100
• Valor: R$ 5.32

⚠️ A operação está suspensa até resolução administrativa.

📞 Próximos Passos:
• Os administradores irão analisar a disputa
• Você pode ser contatado para esclarecimentos
• Aguarde a resolução oficial

🛡️ Importante: Mantenha evidências da transação

[📋 Ver Detalhes da Operação]
```

#### **2. Atualização da Mensagem no Grupo**
```
🚨 OPERAÇÃO EM DISPUTA

🟢 COMPRA - USDC
🌐 POLYGON | 📊 100 | 💵 R$ 5.32 | 💸 Total: R$ 532.00
🆔 507f1f77bcf86cd799439011

🚨 Status: Em Disputa
⚖️ Contestada por: @usuario
📝 Motivo: Não efetuou pagamento
🕐 Contestada em: 27/01/2025 15:30

⏸️ Operação suspensa até resolução administrativa.

👥 Administradores foram notificados e irão analisar a disputa.

[⚖️ Operação em Disputa]
```

#### **3. Notificação para Administradores**
```
⚖️ NOVA DISPUTA REGISTRADA

🆔 Operação: 507f1f77bcf86cd799439011
📊 Tipo: Compra de USDC
💰 Valor: 100 por R$ 5.32

👤 Contestante: @usuario1 (ID: 123456789)
👤 Contestado: @usuario2 (ID: 987654321)

📝 Motivo: Não efetuou pagamento
🕐 Data: 27/01/2025 15:30

⚠️ Ação Necessária: Análise administrativa requerida

[🔍 Analisar Disputa] [📊 Ver Histórico]
```

#### **4. Confirmação para o Contestante**
```
✅ Operação Contestada com Sucesso!

Motivo: Não efetuou pagamento

🚨 A operação foi marcada como em disputa e será analisada pelos administradores.

📢 Notificações enviadas:
• A outra parte foi notificada sobre a contestação
• Administradores foram alertados para análise
• Mensagem do grupo foi atualizada

📞 Próximos passos:
• Aguarde contato dos administradores
• Mantenha evidências da transação
• Você receberá notificação da resolução
```

### ⚙️ **Configuração de Administradores**

Para receber notificações de disputas, configure no arquivo `.env`:

```bash
# Canal/Grupo de Administradores (opcional)
TELEGRAM_ADMIN_CHANNEL_ID=-1001234567890
```

**Se não configurado:** Apenas logs serão gerados, sem notificações para admins.