# 🐳 Instalação Docker - TrustScore Bot

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Porta 3000 e 8081 disponíveis
- Token do bot Telegram (obtenha em @BotFather)

## 🚀 Instalação Rápida

### 1. Clone o repositório
```bash
git clone https://github.com/samyrwendel/p2ptruscore.git
cd p2ptruscore
```

### 2. Inicie os containers
```bash
docker-compose up -d
```

### 3. Configure via interface web
Acesse: **http://localhost:3000/setup**

## 🔧 Configuração

### Interface Web de Configuração
1. Abra http://localhost:3000/setup no navegador
2. Preencha as informações:
   - **Token do Bot**: Obtido em @BotFather
   - **Username do Bot**: Nome do seu bot (sem @)
   - **IDs dos Grupos**: IDs dos grupos onde o bot atuará
3. Clique em "Salvar Configuração"
4. Reinicie o container: `docker-compose restart trustscore-bot`

### Configuração Manual (Alternativa)
Se preferir configurar manualmente:

1. Copie o arquivo de exemplo:
```bash
cp .env.production .env
```

2. Edite o arquivo `.env`:
```bash
# Token do bot Telegram
TELEGRAM_BOT_TOKEN=seu_token_aqui

# Username do bot (sem @)
TELEGRAM_BOT_USERNAME=seu_bot_username

# IDs dos grupos (separados por vírgula)
TELEGRAM_GROUPS=-1001234567890,-1009876543210
```

3. Reinicie o container:
```bash
docker-compose restart trustscore-bot
```

## 📊 Interfaces Disponíveis

| Serviço | URL | Descrição |
|---------|-----|-----------|
| **Configuração** | http://localhost:3000/setup | Interface de configuração do bot |
| **Status** | http://localhost:3000/config/status | Status do sistema |
| **MongoDB Express** | http://localhost:8081 | Interface do banco de dados |
| **API** | http://localhost:3000 | API REST do sistema |

### Credenciais MongoDB Express
- **Usuário**: admin
- **Senha**: admin123

## 🔍 Verificação da Instalação

### 1. Verificar containers
```bash
docker-compose ps
```

### 2. Verificar logs
```bash
# Logs da aplicação
docker-compose logs -f trustscore-bot

# Logs do MongoDB
docker-compose logs -f mongodb
```

### 3. Testar configuração
Acesse: http://localhost:3000/config/status

## 🛠️ Comandos Úteis

### Gerenciamento dos Containers
```bash
# Iniciar todos os serviços
docker-compose up -d

# Parar todos os serviços
docker-compose down

# Reiniciar apenas o bot
docker-compose restart trustscore-bot

# Ver logs em tempo real
docker-compose logs -f

# Reconstruir e iniciar
docker-compose up --build -d
```

### Backup do Banco de Dados
```bash
# Criar backup
docker exec trustscore-mongodb mongodump --uri="mongodb://admin:password123@localhost:27017/trustscore_bot?authSource=admin" --out=/backup

# Copiar backup para host
docker cp trustscore-mongodb:/backup ./backup
```

### Restaurar Banco de Dados
```bash
# Copiar backup para container
docker cp ./backup trustscore-mongodb:/backup

# Restaurar
docker exec trustscore-mongodb mongorestore --uri="mongodb://admin:password123@localhost:27017/trustscore_bot?authSource=admin" /backup/trustscore_bot
```

## 🔧 Solução de Problemas

### Problema: Container não inicia
**Solução:**
1. Verificar se as portas estão disponíveis:
   ```bash
   netstat -tulpn | grep :3000
   netstat -tulpn | grep :8081
   ```
2. Verificar logs de erro:
   ```bash
   docker-compose logs trustscore-bot
   ```

### Problema: Bot não responde
**Solução:**
1. Verificar configuração:
   - Acesse http://localhost:3000/setup
   - Verifique se o token está correto
   - Confirme se o bot foi adicionado aos grupos

2. Verificar logs:
   ```bash
   docker-compose logs -f trustscore-bot
   ```

### Problema: Erro de conexão MongoDB
**Solução:**
1. Verificar se o MongoDB está rodando:
   ```bash
   docker-compose ps mongodb
   ```
2. Reiniciar serviços:
   ```bash
   docker-compose restart mongodb
   docker-compose restart trustscore-bot
   ```

### Problema: Interface web não carrega
**Solução:**
1. Verificar se o container está rodando:
   ```bash
   docker-compose ps trustscore-bot
   ```
2. Verificar health check:
   ```bash
   docker inspect trustscore-bot | grep Health
   ```

## 📱 Configuração do Bot Telegram

### 1. Criar Bot
1. Acesse @BotFather no Telegram
2. Envie `/newbot`
3. Escolha um nome e username
4. Copie o token fornecido

### 2. Configurar Bot
1. Adicione o bot aos grupos desejados
2. Torne o bot administrador
3. Use `/start` no grupo para obter o ID
4. Configure os IDs na interface web

### 3. Obter ID do Grupo
1. Adicione o bot ao grupo
2. Envie `/start` no grupo
3. Verifique os logs para ver o ID:
   ```bash
   docker-compose logs trustscore-bot | grep "Group ID"
   ```

## 🔄 Atualizações

### Atualizar para nova versão
```bash
# Parar containers
docker-compose down

# Atualizar código
git pull origin main

# Reconstruir e iniciar
docker-compose up --build -d
```

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs: `docker-compose logs -f`
2. Acesse o status: http://localhost:3000/config/status
3. Consulte a documentação completa no repositório

---

**✅ Instalação Concluída!**

Após seguir estes passos, seu TrustScore Bot estará funcionando e pronto para uso nos grupos Telegram configurados.