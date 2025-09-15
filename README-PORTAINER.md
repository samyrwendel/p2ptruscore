# Deploy TrustScore Bot no Portainer

Este guia explica como fazer o deploy da aplicação TrustScore Bot usando Portainer.

## Pré-requisitos

- Docker e Docker Compose instalados
- Portainer instalado e configurado
- Token do bot Telegram (obtenha em @BotFather)

## Configuração

### 1. Preparar Arquivos

1. Faça upload de todos os arquivos do projeto para o servidor
2. Renomeie `.env.production` para `.env` ou configure as variáveis no Portainer
3. Configure as variáveis de ambiente necessárias:

```bash
TELEGRAM_BOT_TOKEN=seu_token_do_botfather
TELEGRAM_BOT_USERNAME=seu_bot_username
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=sua_senha_segura
MONGO_EXPRESS_USER=admin
MONGO_EXPRESS_PASS=sua_senha_interface
```

### 2. Deploy via Portainer

#### Opção A: Stack (Recomendado)

1. Acesse Portainer → Stacks → Add Stack
2. Nome: `trustscore-bot`
3. Cole o conteúdo do `docker-compose.yml`
4. Configure as variáveis de ambiente na seção "Environment variables"
5. Clique em "Deploy the stack"

#### Opção B: Upload do Compose

1. Acesse Portainer → Stacks → Add Stack
2. Escolha "Upload" e selecione o arquivo `docker-compose.yml`
3. Configure as variáveis de ambiente
4. Deploy

### 3. Verificar Deploy

Após o deploy, você terá:

- **Bot Telegram**: Rodando na porta 3001
- **MongoDB**: Banco de dados na porta 27017
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