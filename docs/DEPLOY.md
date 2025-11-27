# 🚀 Deploy para Produção - TrustP2PBot

## ✅ Pré-requisitos Verificados

- ✅ Build passando (100%)
- ✅ 15 commits prontos para deploy
- ✅ Zero breaking changes
- ✅ Backward compatible
- ✅ Working tree clean

---

## 📦 Commits Incluídos Neste Deploy

### Melhorias Críticas (8 commits principais)
1. `16dd82a` - Sistema de notificações admin e correções de UX
2. `eb6642c` - Correções críticas de memory leaks e race conditions
3. `92b7bdf` - Sistema de rate limiting por usuário
4. `10e0a78` - Rate limiting em comando /avaliar
5. `e2048de` - Sistema robusto de retry para Telegram API
6. `6c1dbb2` - Serviço de transações MongoDB para operações críticas
7. `a04d355` - Integração do TransactionService em serviços críticos
8. `91b2f13` - Aplicação de transações ACID em operações críticas

### Features Adicionais (7 commits)
9. `4c4425a` - Configurar projeto para usar MongoDB externo
10. `11e3ec3` - Validação rigorosa de termos e correções de segurança
11. `dccba18` - Sistema completo anti-fraude e comandos administrativos
12. `a5a86f2` - Correções definitivas do fluxo de operações
13. `7c289d8` - Configuração automática de comandos e menu button
14. `94ad8b8` - Comando /iniciar como alias de /criaroperacao
15. `767843f` - Checkpoint antes de refatoração

---

## 🔧 Variáveis de Ambiente (Opcionais)

### Retry Configuration (Defaults já otimizados)
```bash
# Máximo de tentativas (default: 5)
TELEGRAM_RETRY_MAX_ATTEMPTS=5

# Delay inicial em ms (default: 1000)
TELEGRAM_RETRY_INITIAL_DELAY_MS=1000

# Delay máximo em ms (default: 30000)
TELEGRAM_RETRY_MAX_DELAY_MS=30000

# Fator de backoff (default: 2)
TELEGRAM_RETRY_BACKOFF_FACTOR=2
```

### Admin Notifications (Recomendado)
```bash
# ID do canal/grupo para notificações admin
TELEGRAM_ADMIN_CHANNEL_ID=-1001234567890
```

**Nota:** Se não configurar, o sistema funciona normalmente, apenas sem notificações admin.

---

## 📋 Checklist de Deploy

### 1. Backup (IMPORTANTE)
```bash
# Backup do banco de dados
mongodump --uri="mongodb://..." --out=/backup/$(date +%Y%m%d_%H%M%S)

# Backup do código atual em produção
cd /path/to/production
git branch backup-$(date +%Y%m%d_%H%M%S)
```

### 2. Pull das Alterações
```bash
# No servidor de produção
cd /home/umbrel/TrustP2PBot

# Fetch e pull
git fetch origin
git pull origin main

# Verificar que está no commit correto
git log --oneline -1
# Deve mostrar: 91b2f13 feat: Aplicação de transações ACID em operações críticas
```

### 3. Instalar Dependências
```bash
# Instalar/atualizar packages (caso necessário)
npm install

# Build
npm run build
```

### 4. Verificar Configurações
```bash
# Verificar .env
cat .env | grep -E "(TELEGRAM_|MONGODB_|ADMIN_)"

# Testar conexão MongoDB
node -e "const mongoose = require('mongoose'); mongoose.connect(process.env.MONGODB_URI).then(() => console.log('✅ MongoDB OK')).catch(e => console.error('❌', e))"
```

### 5. Restart do Serviço
```bash
# Se usando PM2
pm2 restart trustp2pbot
pm2 logs trustp2pbot --lines 100

# Se usando systemd
sudo systemctl restart trustp2pbot
sudo journalctl -u trustp2pbot -f

# Se usando docker
docker-compose restart
docker-compose logs -f --tail=100
```

---

## 🔍 Verificações Pós-Deploy

### 1. Verificar Logs de Inicialização
Procure por estas mensagens de sucesso:

```
✅ MongoDB transactions supported (replica set detected)
# OU
⚠️ MongoDB transactions NOT supported (standalone mode)

[RateLimiterService] Rate limiter initialized
[TelegramRetryService] Retry service initialized
[TransactionService] Transaction service initialized
```

### 2. Testar Funcionalidades Principais

#### Rate Limiting
```bash
# Tentar criar 6 operações rapidamente (deve bloquear na 6ª)
# Mensagem esperada: "Você pode criar no máximo 5 operações por hora"
```

#### Retry Logic
```bash
# Verificar logs durante operação normal
# Deve ver tentativas de retry em caso de falhas transientes
grep "Retrying in" logs.txt
```

#### Transações
```bash
# Verificar se transações estão ativas
grep "Transaction committed" logs.txt

# Ou se está em standalone (esperado em dev)
grep "Executing without transaction" logs.txt
```

### 3. Smoke Tests
Execute estes comandos no bot:

1. `/start` - Verificar boas-vindas
2. `/criaroperacao` - Testar wizard completo
3. `/avaliar` - Testar avaliação
4. `/meuresumo` - Verificar karma
5. `/operacoes` - Listar operações

---

## 🚨 Rollback (Em caso de problemas)

```bash
# Voltar para versão anterior
git log --oneline -20  # Identificar commit anterior
git reset --hard <commit-anterior>

# Rebuild
npm run build

# Restart
pm2 restart trustp2pbot
# ou
sudo systemctl restart trustp2pbot
```

---

## 📊 Monitoramento Recomendado

### Logs Importantes para Monitorar

#### 1. Rate Limiting
```bash
grep "Limite.*Atingido" logs.txt
# Alerta se muitos usuários atingindo limite
```

#### 2. Retry Logic
```bash
grep "Retryable error" logs.txt
# Monitorar quantidade de retries
# Se muito alto, pode indicar problema de rede/API
```

#### 3. Transações
```bash
grep "Transaction aborted" logs.txt
# Transações com rollback - investigar causa
```

#### 4. Memory Leaks
```bash
# Monitorar uso de memória ao longo do tempo
pm2 monit
# ou
docker stats
```

### Métricas Esperadas

| Métrica | Valor Esperado | Alerta se |
|---------|----------------|-----------|
| Memory usage | < 500MB | > 1GB |
| CPU usage | < 30% | > 80% |
| Response time | < 500ms | > 2s |
| Error rate | < 1% | > 5% |
| Retry rate | < 5% | > 20% |

---

## 🎯 Features Ativadas Neste Deploy

### ✅ Automáticas (Zero Config)
- Rate limiting (5 ops/hora, 10 avaliações/hora)
- Retry automático (429, 500-504, network errors)
- Memory leak prevention
- Race condition fixes
- Índices MongoDB otimizados

### 🔧 Requerem Configuração
- Transações ACID (requer MongoDB replica set)
- Notificações admin (requer TELEGRAM_ADMIN_CHANNEL_ID)

### 📝 Configurações de Retry (Opcional)
- Todas têm defaults otimizados
- Ajustar apenas se necessário para sua infraestrutura

---

## 🔐 Segurança

### Validações Adicionadas
- ✅ Rate limiting previne abuse
- ✅ Atomic updates previnem race conditions
- ✅ Transações garantem consistência
- ✅ Retry não expõe informações sensíveis

### Nenhuma Mudança Necessária
- Tokens e secrets continuam no .env
- Sem novas portas abertas
- Sem novos serviços externos

---

## 📚 Documentação Adicional

- [TELEGRAM_RETRY_CONFIGURATION.md](./TELEGRAM_RETRY_CONFIGURATION.md) - Configuração detalhada do retry
- Commits semânticos - Cada commit tem descrição completa

---

## ✅ Checklist Final

- [ ] Backup do banco de dados feito
- [ ] Backup do código atual feito
- [ ] Git pull executado com sucesso
- [ ] Build passou sem erros
- [ ] .env verificado e correto
- [ ] Serviço reiniciado
- [ ] Logs verificados (sem erros críticos)
- [ ] Smoke tests executados
- [ ] Monitoramento configurado

---

## 🎉 Sucesso!

Se todos os itens acima foram verificados, o deploy foi concluído com sucesso!

**TrustP2PBot está agora em produção com:**
- 🛡️ Resiliência enterprise-grade
- 🔒 Consistência de dados garantida
- ⚡ Performance otimizada
- 🚀 Zero downtime capability

---

## 📞 Suporte

Em caso de problemas:

1. **Verificar logs primeiro:**
   ```bash
   pm2 logs trustp2pbot --lines 500
   grep -i error logs.txt
   ```

2. **Problemas comuns e soluções:**

   **Erro: "MongoDB connection failed"**
   - Verificar MONGODB_URI no .env
   - Verificar se MongoDB está rodando
   - Verificar firewall/network

   **Erro: "Module not found"**
   - Executar `npm install`
   - Verificar se build foi feito

   **Rate limiting muito agressivo:**
   - Ajustar valores no código se necessário
   - Valores atuais: 5 ops/hora, 10 avaliações/hora

   **Transações não funcionando:**
   - Normal se MongoDB não estiver em replica set
   - Sistema funciona corretamente em standalone
   - Para ativar transações: configurar replica set

3. **Rollback se necessário** (veja seção acima)

---

**Data do Deploy:** $(date)
**Versão:** 2.1.0 (15 commits ahead)
**Build:** ✅ Passing
**Status:** 🚀 Ready for Production
