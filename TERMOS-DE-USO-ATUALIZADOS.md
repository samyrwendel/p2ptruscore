# 📜 Termos de Uso - TrustP2PBot (Versão 2.1)

**Data de Atualização:** Janeiro 2025  
**Versão Anterior:** 2.0  
**Principais Mudanças:** Sistema Anti-Fraude e Obrigatoriedade de Hash de Transação

---

## 🎯 1. ACEITAÇÃO DOS TERMOS

Ao utilizar o TrustP2PBot, você concorda integralmente com estes termos. O uso continuado do bot constitui aceitação automática de futuras atualizações.

## 🛡️ 2. SISTEMA DE PROTEÇÃO ANTI-FRAUDE

### 2.1 Contestações e Disputas
- Operações podem ser contestadas via `/contestar [ID] [motivo]`
- Contestações suspendem automaticamente a operação
- Motivos falsos resultam em penalidades progressivas
- Administradores têm decisão final em disputas

### 2.2 Status de Operações Protegidas
- `DISPUTED`: Operação em disputa (suspensa)
- `UNDER_REVIEW`: Sob análise administrativa
- `FRAUD_REPORTED`: Fraude reportada (suspensa)
- `COMPLETED`: Não pode ser cancelada (acordo final)

### 2.3 Penalidades por Fraude
- **1ª Ofensa**: Advertência + cancelamento da operação
- **2ª Ofensa**: Suspensão temporária (7 dias)
- **3ª Ofensa**: Banimento permanente do grupo
- **Fraude Comprovada**: Banimento imediato

## 🔐 3. OBRIGATORIEDADE DE HASH DE TRANSAÇÃO

### 3.1 Transações em Criptomoedas
**OBRIGATÓRIO**: Toda transação em criptomoeda DEVE incluir o hash da transação blockchain.

### 3.2 Redes Suportadas e Formatos
| Rede | Formato | Exemplo |
|------|---------|---------|
| **Bitcoin** | 64 caracteres hex | `a1b2c3d4e5f6...def123456` |
| **Ethereum** | 66 caracteres (0x + 64 hex) | `0xa1b2c3d4e5f6...def123456` |
| **Arbitrum** | 66 caracteres (0x + 64 hex) | `0xa1b2c3d4e5f6...def123456` |
| **Polygon** | 66 caracteres (0x + 64 hex) | `0xa1b2c3d4e5f6...def123456` |
| **Base** | 66 caracteres (0x + 64 hex) | `0xa1b2c3d4e5f6...def123456` |
| **Solana** | 88 caracteres base58 | `5VqB7K8R2nP9...Cy5Ez9` |
| **BNB Chain** | 66 caracteres (0x + 64 hex) | `0xa1b2c3d4e5f6...def123456` |

### 3.3 Quando Fornecer o Hash
- **Momento**: Imediatamente após enviar a transação
- **Local**: No chat da negociação ou mensagem privada
- **Formato**: Hash completo + link do explorer (opcional)

### 3.4 Exemplo de Fornecimento Correto
```
✅ Pagamento enviado!
Hash: 0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
Explorer: https://etherscan.io/tx/0xa1b2c3d4e5f6...
Rede: Ethereum
Valor: 1500 USDC
```

### 3.5 Consequências por Não Fornecer Hash
- ⚠️ **1ª Vez**: Advertência e solicitação do hash
- ⚠️ **2ª Vez**: Operação pode ser contestada legitimamente
- ⚠️ **3ª Vez**: Suspensão temporária para criar operações
- ⚠️ **Recorrente**: Banimento por práticas inseguras

## 📋 4. REGRAS DE OPERAÇÕES P2P

### 4.1 Criação de Operações
- Informações devem ser precisas e completas
- Preços devem refletir cotações realistas
- Descrições devem ser claras e objetivas
- Métodos de pagamento devem ser especificados

### 4.2 Aceitação de Operações
- Verificar reputação da contraparte
- Confirmar todos os detalhes antes de aceitar
- Comunicar-se claramente sobre prazos
- Solicitar hash de transação quando aplicável

### 4.3 Conclusão de Operações
- Ambas as partes devem confirmar a conclusão
- Hash de transação deve ser verificado
- Avaliações mútuas são encorajadas
- Operações concluídas não podem ser canceladas

## ⚖️ 5. SISTEMA DE CONTESTAÇÕES

### 5.1 Motivos Válidos para Contestação
- **Não Pagamento**: Contraparte não efetuou pagamento
- **Não Entrega**: Não entregou ativos/serviços
- **Valor Incorreto**: Quantidade diferente do acordado
- **Tentativa de Fraude**: Comportamento suspeito/golpe
- **Problemas de Comunicação**: Falta de resposta/clareza
- **Violação de Termos**: Descumprimento das regras

### 5.2 Como Contestar
```
/contestar [ID_DA_OPERACAO] [MOTIVO_DETALHADO]
```

### 5.3 Processo de Contestação
1. **Suspensão**: Operação fica suspensa imediatamente
2. **Notificação**: Ambas as partes são informadas
3. **Evidências**: Partes podem adicionar comprovantes
4. **Análise**: Administrador analisa o caso
5. **Decisão**: Resolução final com consequências

### 5.4 Contestações Falsas
- Contestar sem motivo válido é violação grave
- Penalidades progressivas para contestações falsas
- Histórico de contestações é permanente
- Abuso pode resultar em banimento

## 🔍 6. EVIDÊNCIAS E COMPROVANTES

### 6.1 Tipos de Evidências Aceitas
- **Hash de Transação**: Obrigatório para crypto
- **Prints de Tela**: Conversas, confirmações
- **Recibos**: Comprovantes de pagamento
- **Links de Explorer**: Verificação blockchain
- **Timestamps**: Horários das ações

### 6.2 Como Adicionar Evidências
```
/adicionarevidencia [ID_DA_OPERACAO] [DESCRIÇÃO]
```
*Comando em desenvolvimento*

## 📊 7. SISTEMA DE REPUTAÇÃO

### 7.1 Fatores que Afetam Reputação
- ✅ **Positivos**: Operações concluídas, avaliações positivas, fornecimento de hash
- ❌ **Negativos**: Contestações recebidas, operações canceladas, falta de hash

### 7.2 Níveis de Confiança
- 🔴 **Baixa (0-25%)**: Usuário novo ou com problemas
- 🟡 **Média (26-60%)**: Histórico misto
- 🟢 **Alta (61-85%)**: Usuário confiável
- 💎 **Excelente (86-100%)**: Usuário exemplar

### 7.3 Impacto da Reputação
- Usuários com baixa reputação podem ter operações questionadas
- Alta reputação facilita aceitação de operações
- Histórico de fraudes impacta permanentemente

## 🚨 8. COMPORTAMENTOS PROIBIDOS

### 8.1 Fraudes e Golpes
- ❌ Não enviar pagamento após aceitar operação
- ❌ Fornecer hash falso ou de outra transação
- ❌ Criar múltiplas contas para burlar penalidades
- ❌ Coordenar ataques contra outros usuários

### 8.2 Spam e Abuso
- ❌ Criar operações falsas ou irreais
- ❌ Contestar operações sem motivo válido
- ❌ Flood de mensagens ou comandos
- ❌ Usar linguagem ofensiva ou ameaças

### 8.3 Manipulação do Sistema
- ❌ Tentar burlar validações de hash
- ❌ Criar operações para manipular preços
- ❌ Usar bots ou automação não autorizada
- ❌ Compartilhar informações privadas de outros usuários

## 🛠️ 9. RESPONSABILIDADES DOS USUÁRIOS

### 9.1 Verificação de Transações
- Verificar hash em explorer blockchain
- Confirmar endereços de recebimento
- Aguardar confirmações necessárias da rede
- Manter comprovantes das transações

### 9.2 Comunicação Responsável
- Ser claro sobre prazos e condições
- Responder mensagens em tempo hábil
- Informar problemas imediatamente
- Manter civilidade nas interações

### 9.3 Segurança Pessoal
- Não compartilhar chaves privadas
- Usar carteiras seguras e confiáveis
- Verificar endereços antes de enviar
- Manter backups de informações importantes

## 📞 10. SUPORTE E RESOLUÇÃO DE CONFLITOS

### 10.1 Canais de Suporte
- Administradores do grupo
- Comando `/help` para orientações
- Sistema de contestações integrado
- Documentação oficial do bot

### 10.2 Processo de Mediação
1. **Tentativa de Acordo**: Partes tentam resolver diretamente
2. **Contestação Formal**: Uso do sistema de disputas
3. **Análise Administrativa**: Revisão por moderadores
4. **Decisão Final**: Resolução com base em evidências

## 📝 11. ATUALIZAÇÕES DOS TERMOS

### 11.1 Notificação de Mudanças
- Usuários são notificados sobre atualizações importantes
- Mudanças críticas requerem nova aceitação
- Histórico de versões mantido para transparência

### 11.2 Período de Adaptação
- 7 dias para se adequar a novas regras
- Suporte durante período de transição
- Penalidades reduzidas para adaptação

## ⚖️ 12. JURISDIÇÃO E LEI APLICÁVEL

### 12.1 Legislação
- Termos regidos pela legislação brasileira
- Disputas resolvidas preferencialmente por mediação
- Foro da comarca de São Paulo para questões legais

### 12.2 Limitação de Responsabilidade
- Bot é ferramenta de facilitação, não garantia
- Usuários responsáveis por suas próprias transações
- Administradores não são responsáveis por perdas financeiras

---

## ✅ DECLARAÇÃO DE ACEITAÇÃO

**Ao usar o comando `/termos aceito`, você declara que:**

1. ✅ Leu e compreendeu todos os termos
2. ✅ Concorda com as regras de hash de transação
3. ✅ Aceita o sistema de contestações e penalidades
4. ✅ Compromete-se a usar o bot de forma responsável
5. ✅ Entende as consequências de violações

**Data de Aceitação:** Registrada automaticamente  
**Versão Aceita:** 2.1  
**IP/ID:** Registrado para auditoria

---

**⚠️ IMPORTANTE:** O descumprimento destes termos pode resultar em suspensão ou banimento permanente. Use o sistema com responsabilidade e contribua para uma comunidade P2P segura e confiável.

**📞 Dúvidas?** Entre em contato com os administradores ou use `/help` para mais informações.