# 📋 Diretrizes de Desenvolvimento - P2P Score Bot

## 🎯 Princípios Fundamentais

### 1. **Identificação de Operações**
- **SEMPRE** incluir o ID da operação em todas as mensagens relacionadas
- **OBRIGATÓRIO** em: criação, aceitação, conclusão, cancelamento, solicitações
- **Formato padrão**: `🆔 **ID:** \`${operation._id}\``
- **Justificativa**: Evitar confusão com múltiplas operações simultâneas

### 2. **Fluxo de Mensagens Correto**
- **Criação**: `✅ Operação Criada com Sucesso!`
- **Aceitação**: `✅ Operação Aceita!` (com info do aceitador)
- **Conclusão**: `✅ Operação Concluída com Sucesso!` (apenas quando realmente concluída)
- **Cancelamento**: `❌ Operação Cancelada`
- **Solicitação**: `⏳ Solicitação de Conclusão`

### 3. **Consistência de Moedas**
- **EUR**: Sempre mostrar valores em `€` (Euro)
- **USD**: Sempre mostrar valores em `$` (Dólar)
- **BRL**: Sempre mostrar valores em `R$` (Real)
- **Aplicar em**: Preços, totais, cotações, resumos

## 🔧 Checklist de Implementação

### ✅ Ao Criar Nova Funcionalidade de Operação:

#### **Mensagens Obrigatórias:**
- [ ] Incluir ID da operação em todas as mensagens
- [ ] Usar títulos corretos conforme o estado da operação
- [ ] Aplicar formatação de moeda consistente
- [ ] Incluir informações dos participantes quando relevante

#### **Estados da Operação:**
- [ ] **PENDING**: Operação criada, aguardando aceitação
- [ ] **ACCEPTED**: Operação aceita, em andamento
- [ ] **PENDING_COMPLETION**: Aguardando confirmação de conclusão
- [ ] **COMPLETED**: Operação finalizada com sucesso
- [ ] **CANCELLED**: Operação cancelada

#### **Validações:**
- [ ] Verificar se usuário tem permissão para a ação
- [ ] Validar estado atual da operação
- [ ] Confirmar dados obrigatórios (amount, quotationType, etc.)

### ✅ Ao Modificar Mensagens Existentes:

#### **Verificar Consistência:**
- [ ] ID da operação está presente?
- [ ] Título da mensagem está correto para o estado?
- [ ] Moeda está formatada corretamente?
- [ ] Informações essenciais estão incluídas?

#### **Testar Cenários:**
- [ ] Operação única
- [ ] Múltiplas operações simultâneas
- [ ] Diferentes tipos de moeda (EUR, USD, BRL)
- [ ] Diferentes tipos de operação (compra, venda, troca)

## 📝 Padrões de Código

### **Formatação de Moeda:**
```typescript
// Para EUR
if (operation.assets.includes('EURO' as any)) {
  totalFormatted = `€ ${total.toFixed(2)}`;
  priceFormatted = `€ ${operation.price.toFixed(4)}`;
}
```

### **Inclusão de ID:**
```typescript
const message = `✅ **Operação Aceita!**\n\n` +
  `[...detalhes...]\n` +
  `🆔 **ID:** \`${operation._id}\`\n\n` +
  `[...resto da mensagem...]`;
```

### **Estrutura de Mensagem Padrão:**
```
[EMOJI] **[TÍTULO DA AÇÃO]**

[DETALHES DA OPERAÇÃO]
Ativos: [ASSETS]
Redes: [NETWORKS]
Quantidade: [AMOUNT]

[INFORMAÇÕES DOS PARTICIPANTES]
👤 **Criador:** [CREATOR]
🤝 **Negociador:** [ACCEPTOR]

🆔 **ID:** `[OPERATION_ID]`

[PRÓXIMOS PASSOS OU INSTRUÇÕES]
```

## 🚨 Pontos de Atenção Críticos

### **1. Nunca Esquecer:**
- ID da operação em TODAS as mensagens
- Formatação correta da moeda
- Título correto conforme o estado
- Validação de permissões
- Porta do serviço: FIXA em `3031`. Nunca alterar.
- Em caso de conflito (EADDRINUSE): encerrar a outra instância ocupando a porta:
  - `ss -ltnp | grep ':3031 '`
  - `kill <PID_encontrado>` (se persistir, `kill -9 <PID>`)
  - Nunca usar comandos globais perigosos (ex.: `pkill -f "node.*main"`).

### **2. Sempre Verificar:**
- Se a operação existe
- Se o usuário tem permissão
- Se o estado permite a ação
- Se todos os dados obrigatórios estão presentes

### **3. Testar Sempre:**
- Fluxo completo da operação
- Múltiplas operações simultâneas
- Diferentes tipos de moeda
- Cenários de erro

### **4. Segurança — Segredos e Rotação:**
- **Nunca versionar segredos.** `.env*` fica no `.gitignore` (exceto `.env.example`). Nada de
  token, senha ou chave hardcoded em `.ts`/`.js`, `docker-compose*`, `tasks.json` ou
  `ecosystem.config.js` — o ecosystem deve **ler do `.env`**, nunca embutir o valor.
- **Vazou no histórico do git? Rotacionar é obrigatório.** Remover do código não invalida o
  que já está no histórico — só a rotação (novo token/senha/chave) fecha de fato. Validar um
  token sem expor: `curl -4 -s "https://api.telegram.org/bot$TOKEN/getMe"` (IPv4 obrigatório).
- **Ao trocar um segredo no `.env`:** recarregar reavaliando o ecosystem + `pm2 save`, senão o
  PM2 mantém o valor congelado e dá `401`. Ver `docs/PM2_SETUP.md` › "Aplicar mudança no `.env`".
- **Runbook de rotação (todas as chaves do servidor):** `/home/umbrel/ROTACAO_CHAVES.md`.

## 📚 Arquivos de Referência

### **Para Consulta:**
- `tasks.json`: Histórico de tarefas e correções implementadas
- `prd.md`: Especificações do produto e funcionalidades
- `CHANGELOG.md`: Registro de mudanças por versão

### **Para Implementação:**
- `src/operations/operations-broadcast.service.ts`: Mensagens de broadcast
- `src/telegram/commands/handlers/`: Handlers de comandos
- `src/operations/schemas/operation.schema.ts`: Schema das operações
- `src/main.ts`: Porta derivada de `PORT` (fixada nos `.env` em 3031) e views.
- `.env.*`: Porta configurada como `3031` (não alterar).

## 🔄 Processo de Revisão

### **Antes de Implementar:**
1. Ler estas diretrizes
2. Verificar padrões existentes
3. Planejar a implementação

### **Durante a Implementação:**
1. Seguir os padrões estabelecidos
2. Incluir todos os elementos obrigatórios
3. Testar cenários básicos

### **Após a Implementação:**
1. Revisar checklist completo
2. Testar fluxo end-to-end
3. Verificar consistência com outras funcionalidades
4. Atualizar documentação se necessário

---

**💡 Lembre-se: Consistência é fundamental para uma boa experiência do usuário!**