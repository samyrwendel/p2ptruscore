# 🚨 Manual do Sistema de Avisos de Disputa

## 🎯 Visão Geral

O sistema de avisos de disputa implementa **pesos diferentes** baseados no papel do usuário nas disputas, distinguindo entre quem contesta e quem está sendo contestado.

## ⚖️ Hierarquia de Gravidade

### 🚨 **ALTA GRAVIDADE - Usuário Sendo Contestado**
**Emoji:** 🚨  
**Significado:** O usuário está sendo acusado por outros usuários

### ⚠️ **MÉDIA GRAVIDADE - Usuário Contestando**
**Emoji:** ⚠️  
**Significado:** O usuário está contestando outros usuários

## 📊 Sistema de Análise de Disputas

### **Método `getDisputeAnalysis()`**
```typescript
{
  asComplainant: number,    // Quantas disputas o usuário abriu
  asDefendant: number,      // Quantas disputas foram abertas contra ele
  total: number            // Total de disputas envolvidas
}
```

### **Lógica de Priorização:**
1. **Prioridade 1:** Ser contestado (mais grave)
2. **Prioridade 2:** Contestar outros (menos grave)

## 🎨 Avisos Visuais por Cenário

### **Cenário 1: Apenas Sendo Contestado**
```
🚨 Este usuário está sendo contestado em 1 operação
🚨 Este usuário está sendo contestado em 3 operações
```

### **Cenário 2: Apenas Contestando**
```
⚠️ Este usuário contestou 1 operação
⚠️ Este usuário contestou 2 operações
```

### **Cenário 3: Ambos (Sendo Contestado + Contestando)**
```
🚨 Este usuário está sendo contestado em 1 operação (e contestou 2)
🚨 Este usuário está sendo contestado em 2 operações (e contestou 1)
```

## 🔍 Indicadores Visuais nas Operações

### **Operação de Usuário Sendo Contestado:**
```
🚀 Nova Operação P2P Disponível!

🟢 COMPRA USDC
Redes: POLYGON
⬅️ Quero comprar: 100 USDC
➡️ Quero pagar: R$ 532.00

👤 Criador: @usuario 🚨
🏆 Nível Confiança: 150 pts
```

### **Operação de Usuário que Contesta:**
```
🚀 Nova Operação P2P Disponível!

🟢 COMPRA USDC
Redes: POLYGON
⬅️ Quero comprar: 100 USDC
➡️ Quero pagar: R$ 532.00

👤 Criador: @usuario ⚠️
🏆 Nível Confiança: 150 pts
```

## 🎯 Impacto Psicológico dos Avisos

### **🚨 Vermelho (Sendo Contestado):**
- **Percepção:** "Este usuário pode ter problemas"
- **Reação:** Maior cautela, mais evidências necessárias
- **Impacto:** Redução significativa na confiança

### **⚠️ Amarelo (Contestando):**
- **Percepção:** "Este usuário é exigente/cuidadoso"
- **Reação:** Cautela moderada, pode ser positivo
- **Impacto:** Redução leve na confiança

## 📋 Exemplos Práticos

### **Usuário A: 2 Disputas Sendo Contestado**
```
Na Criação:
🚨 Este usuário está sendo contestado em 2 operações
⚠️ Aviso: Outros usuários verão que você tem disputas ativas.
Resolva suas disputas pendentes para melhorar sua reputação.

Na Aceitação:
🚨 Este usuário está sendo contestado em 2 operações
⚠️ Cuidado: O criador desta operação tem disputas pendentes.
Considere isso ao negociar e mantenha evidências da transação.

Na Operação:
👤 Criador: @usuarioA 🚨
```

### **Usuário B: 1 Disputa Contestando**
```
Na Criação:
⚠️ Este usuário contestou 1 operação
⚠️ Aviso: Outros usuários verão que você tem disputas ativas.
Resolva suas disputas pendentes para melhorar sua reputação.

Na Aceitação:
⚠️ Este usuário contestou 1 operação
⚠️ Cuidado: O criador desta operação tem disputas pendentes.
Considere isso ao negociar e mantenha evidências da transação.

Na Operação:
👤 Criador: @usuarioB ⚠️
```

### **Usuário C: Misto (1 Sendo Contestado + 2 Contestando)**
```
Na Criação:
🚨 Este usuário está sendo contestado em 1 operação (e contestou 2)
⚠️ Aviso: Outros usuários verão que você tem disputas ativas.
Resolva suas disputas pendentes para melhorar sua reputação.

Na Aceitação (quando alguém aceita operação do usuário C):
🚨 Este usuário está sendo contestado em 1 operação (e contestou 2)
⚠️ Cuidado: O criador desta operação tem disputas pendentes.
Considere isso ao negociar e mantenha evidências da transação.

🔄 IMPORTANTE: Se aceitar, VOCÊ TRANSFERE POR ÚLTIMO - a outra parte transfere primeiro (por estar sendo contestada)

#### **Cenário 1: Usuário Limpo vs Usuário Sendo Contestado**
```
Operação: @limpo aceita operação de @contestado

Aviso: 🚨 ATENÇÃO: O criador está sendo contestado em 1 operação
Confirmação: ⚠️ ALTO RISCO - você transfere POR ÚLTIMO (proteção)
Resultado: @contestado transfere primeiro → @limpo transfere por último
```

Na Operação:
👤 Criador: @usuarioC 🚨
```

## 🧠 Lógica de Decisão

### **Para Indicador Visual (Emoji na Operação):**
```typescript
if (analysis.asDefendant > 0) {
  return '🚨'; // Prioriza ser contestado
} else if (analysis.asComplainant > 0) {
  return '⚠️'; // Apenas contestou outros
}
```

### **Para Mensagem de Aviso:**
```typescript
// Priorizar avisos sobre ser contestado (mais grave)
if (analysis.asDefendant > 0) {
  if (analysis.asComplainant > 0) {
    return `🚨 Sendo contestado em ${asDefendant} (e contestou ${asComplainant})`;
  } else {
    return `🚨 Sendo contestado em ${asDefendant} operações`;
  }
}

// Se só contestou outros (menos grave)
return `⚠️ Contestou ${asComplainant} operações`;
```

## 🎯 Benefícios da Diferenciação

### **1. Justiça:**
- Usuários que contestam legitimamente não são penalizados igualmente
- Foco nos usuários que estão sendo acusados

### **2. Transparência:**
- Informação clara sobre o tipo de envolvimento em disputas
- Contexto completo para tomada de decisão

### **3. Incentivos Corretos:**
- Não desencoraja contestações legítimas
- Foca na resolução de problemas reais

### **4. Percepção Adequada:**
- 🚨 = "Cuidado, pode ter problemas"
- ⚠️ = "Usuário exigente, mas pode ser bom sinal"

## 🔧 Implementação Técnica

### **Arquivos Modificados:**
- `pending-evaluation.service.ts` - Análise de disputas
- `operations-broadcast.service.ts` - Indicadores visuais
- `criar-operacao.command.handler.ts` - Avisos na criação
- `aceitar-operacao.command.handler.ts` - Avisos na aceitação
- `confirm-accept-operation.command.handler.ts` - Sistema de confirmação

### **Novos Métodos:**
- `getDisputeAnalysis()` - Análise detalhada de disputas
- `getUserDisputeWarning()` - Mensagens contextuais
- `handleConfirmAcceptCallback()` - Confirmação de aceite com risco

### **Correções Implementadas:**
- ✅ Removida lógica duplicada de ordem de transferência
- ✅ Adicionado tratamento de erro robusto
- ✅ Corrigida mensagem de confirmação para proteção do usuário limpo
- ✅ Integração completa testada e funcionando

---

**📊 Sistema implementado com sucesso!**  
**🎯 Agora há distinção clara entre contestar e ser contestado**  
**⚖️ Pesos diferentes refletem a gravidade real de cada situação**  
**🛡️ Usuários limpos recebem proteção adequada**
- `getDisputeAnalysis()` - Análise detalhada
- `getUserDisputeWarning()` - Mensagens contextuais

---

**📊 Sistema implementado com sucesso!**  
**🎯 Agora há distinção clara entre contestar e ser contestado**  
**⚖️ Pesos diferentes refletem a gravidade real de cada situação**