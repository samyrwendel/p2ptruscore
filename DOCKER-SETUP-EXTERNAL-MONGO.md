# 🐳 Instalação Docker - TrustScore Bot (MongoDB Externo)

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Porta 3031 disponível
- Token do bot Telegram (obtenha em @BotFather)
- **MongoDB rodando em VPS externa ou MongoDB Atlas**

## 🚀 Instalação Rápida

### 1. Clone o repositório
```bash
git clone https://github.com/samyrwendel/p2ptruscore.git
cd p2ptruscore
```

### 2. Configure as variáveis de ambiente
```bash
cp .env.example .env
```

### 3. Edite o arquivo `.env` com suas configurações:
```bash
# Token do bot Telegram
TELEGRAM_BOT_TOKEN=seu_token_aqui

# Username do bot (sem @)
TELEGRAM_BOT_USERNAME=seu_bot_username

# MongoDB Externo - Configure com sua VPS MongoDB
# Exemplos:
# MongoDB com autenticação: mongodb://usuario:senha@ip_da_vps:27017/trustscore
# MongoDB Atlas: mongodb+srv://usuario:senha@cluster.mongodb.net/trustscore
MONGODB_CNN=mongodb://usuario:senha@ip_da_vps:27017/trustscore_bot

# Porta da aplicação
PORT=3031
```

### 4. Inicie o container
```bash
docker-compose up -d
```

## 🔧 Configuração do MongoDB Externo

### Opção 1: MongoDB em VPS Externa
```bash
# String de conexão básica
MONGODB_CNN=mongodb://ip_da_vps:27017/trustscore_bot

# Com autenticação
MONGODB_CNN=mongodb://usuario:senha@ip_da_vps:27017/trustscore_bot

# Com autenticação e authSource
MONGODB_CNN=mongodb://usuario:senha@ip_da_vps:27017/trustscore_bot?authSource=admin
```

### Opção 2: MongoDB Atlas (Cloud)
```bash
MONGODB_CNN=mongodb+srv://usuario:senha@cluster.mongodb.net/trustscore_bot
```

## 🌐 Acessos

| **Serviço** | **URL** | **Descrição** |
|-------------|---------|---------------|
| **Configuração** | http://localhost:3031/setup | Interface de configuração do bot |
| **Status** | http://localhost:3031/config/status | Status do sistema |
| **API** | http://localhost:3031 | API REST do sistema |

## 🔍 Verificação da Instalação

### 1. Verificar container
```bash
docker-compose ps
```

### 2. Verificar logs
```bash
docker-compose logs -f trustscore-bot
```

### 3. Testar conexão MongoDB
```bash
# Verificar se o bot consegue conectar ao MongoDB
curl http://localhost:3031/config/status
```

## 🔧 Solução de Problemas

### Problema: Erro de conexão MongoDB
**Possíveis causas:**
- String de conexão incorreta
- Firewall bloqueando a conexão
- Credenciais inválidas
- MongoDB não está rodando

**Soluções:**
1. Verifique a string de conexão no arquivo `.env`
2. Teste a conexão diretamente:
   ```bash
   # Teste com mongosh (se disponível)
   mongosh "sua_string_de_conexao"
   ```
3. Verifique se o MongoDB está acessível da sua rede
4. Confirme as credenciais de acesso

### Problema: Container não inicia
**Solução:**
```bash
# Verificar logs detalhados
docker-compose logs trustscore-bot

# Reiniciar o container
docker-compose restart trustscore-bot
```

### Problema: Porta já em uso
**Solução:**
Altere a porta no `docker-compose.yml`:
```yaml
ports:
  - "3032:3031"  # Mude para uma porta disponível
```

## 📊 Monitoramento

### Health Check
O container possui health check automático que verifica:
- Status da aplicação
- Conexão com MongoDB
- Funcionamento da API

### Logs
```bash
# Logs em tempo real
docker-compose logs -f

# Logs específicos do bot
docker-compose logs -f trustscore-bot
```

## 🔄 Atualizações

Para atualizar o bot:
```bash
# Parar o container
docker-compose down

# Atualizar o código
git pull

# Reconstruir e iniciar
docker-compose up -d --build
```

## 🛡️ Segurança

### Recomendações:
1. **Use credenciais fortes** para o MongoDB
2. **Configure firewall** para permitir apenas conexões necessárias
3. **Use SSL/TLS** para conexões MongoDB em produção
4. **Mantenha backups** regulares do banco de dados
5. **Monitore logs** regularmente

### Exemplo de string segura:
```bash
# Com SSL (recomendado para produção)
MONGODB_CNN=mongodb://usuario:senha@ip_da_vps:27017/trustscore_bot?ssl=true&authSource=admin
```