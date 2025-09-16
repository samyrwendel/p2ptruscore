# P2P Trust Bot - Deploy no Portainer ✅

## 📋 Pré-requisitos

- VPS com Docker e Portainer instalados
- MongoDB rodando (local ou Atlas)
- Token do Telegram Bot configurado
- Acesso ao Portainer Web UI

## 🚀 Deploy no Portainer

### 1. Acesso ao Portainer
- Acesse o Portainer da sua VPS: `http://SEU_IP:9000`
- Faça login com suas credenciais

### 2. Criar Stack
1. Navegue para **Stacks** no menu lateral
2. Clique em **Add stack**
3. Nome da stack: `trustp2p-production`
4. Método: **Web editor**

### 3. Configurar Variáveis de Ambiente
Antes de colar o docker-compose, configure as variáveis:

```env
# Telegram
TELEGRAM_BOT_TOKEN=seu_token_aqui

# MongoDB
MONGODB_URI=mongodb://localhost:27017/trustscore
# OU para MongoDB Atlas:
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/trustscore

# Aplicação
PORT=3001
NODE_ENV=production
```

### 4. Docker Compose
**IMPORTANTE**: Use o arquivo `docker-compose-portainer.yml` (corrigido)

✅ **Correções implementadas**:
- Erro TS1109 resolvido (heredoc no tsconfig.json)
- Dependências TypeScript fixadas (typescript@~5.6, ts-node@10.9.2)
- Comandos de build otimizados (npx nest build + fallbacks)
- Memória alinhada (NODE_OPTIONS=1024MB + Docker limits=1G)
- Healthcheck configurado

### 5. Deploy
1. Cole o conteúdo do `docker-compose-portainer.yml`
2. Clique em **Deploy the stack**
3. Aguarde o build e inicialização
4. Verifique os logs em **Containers**

## 🔍 Verificação de Saúde

### Endpoints de Monitoramento
- **Health Check**: `http://localhost:3001/api/karma/total`
- **API Status**: `http://localhost:3001/api/users/count`
- **Mongo Express**: Interface web na porta 8081

## Serviços Incluídos

### TrustScore Bot
- **Porta**: 3001
- **Health Check**: Verifica se a API está respondendo
- **Logs**: Disponíveis no volume `./logs`
- **Restart**: Automático em caso de falha

### MongoDB
- **Porta**: 27017
- **Autenticação**: Habilitada
- **Volume**: Dados persistentes em `mongodb_data`
- **Backup**: Configure backups regulares do volume

### Mongo Express
- **Porta**: 8081
- **Acesso**: http://seu-servidor:8081
- **Login**: Configurado via variáveis de ambiente

## Configurações Avançadas

### Variáveis de Ambiente

```yaml
# Bot Telegram
TELEGRAM_BOT_TOKEN=token_do_bot
TELEGRAM_BOT_USERNAME=username_do_bot

# Banco de dados
MONGODB_CNN=mongodb://admin:password@mongodb:27017/trustscore_bot?authSource=admin

# MongoDB Root
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=password_segura

# Mongo Express
MONGO_EXPRESS_USER=admin
MONGO_EXPRESS_PASS=password_interface

# Aplicação
PORT=3001
NODE_ENV=production
```

### Volumes

- `mongodb_data`: Dados do MongoDB (persistente)
- `./logs`: Logs da aplicação (opcional)

### Rede

- `trustscore-network`: Rede interna para comunicação entre serviços

## Monitoramento

### Health Checks

O bot possui health check configurado que verifica:
- Se a aplicação está respondendo
- Se a API está funcionando
- Intervalo: 30 segundos

### Logs

Para visualizar logs no Portainer:
1. Acesse Containers
2. Clique no container desejado
3. Vá para a aba "Logs"

### Métricas

Portainer mostra:
- CPU e memória utilizados
- Status dos containers
- Uptime dos serviços

## Backup e Restauração

### Backup do MongoDB

```bash
# Criar backup
docker exec trustscore-mongodb mongodump --authenticationDatabase admin -u admin -p password123 --out /backup

# Copiar backup
docker cp trustscore-mongodb:/backup ./backup-$(date +%Y%m%d)
```

### Restauração

```bash
# Restaurar backup
docker exec -i trustscore-mongodb mongorestore --authenticationDatabase admin -u admin -p password123 /backup
```

## Troubleshooting

### Bot não conecta ao Telegram
- Verifique se o token está correto
- Confirme se o bot foi criado no @BotFather
- Verifique logs do container

### Erro de conexão com MongoDB
- Verifique se o MongoDB está rodando
- Confirme as credenciais de acesso
- Verifique a string de conexão

### Aplicação não inicia
- Verifique os logs do container
- Confirme se todas as variáveis de ambiente estão configuradas
- Verifique se as portas não estão em conflito

## Atualizações

Para atualizar a aplicação:

1. Faça backup dos dados
2. No Portainer, vá para a Stack
3. Clique em "Editor" 
4. Atualize a imagem ou código
5. Clique em "Update the stack"

## Segurança

- Altere todas as senhas padrão
- Use senhas fortes para MongoDB
- Configure firewall para as portas necessárias
- Mantenha backups regulares
- Monitore logs regularmente

## Suporte

Em caso de problemas:
1. Verifique os logs dos containers
2. Confirme as configurações de rede
3. Teste a conectividade entre serviços
4. Verifique as variáveis de ambiente