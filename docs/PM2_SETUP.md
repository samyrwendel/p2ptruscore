# PM2 Setup - TrustP2PBot

Guia de configuração do PM2 para gerenciamento do bot em produção.

## Instalação

```bash
# Instalar PM2 globalmente
npm install -g pm2
```

## Configuração

O arquivo `ecosystem.config.js` na raiz do projeto contém toda a configuração necessária.

### Características

| Feature | Configuração |
|---------|-------------|
| Auto-restart | `autorestart: true` |
| Max restarts | 10 tentativas |
| Min uptime | 10 segundos |
| Restart delay | 5 segundos |
| Memory limit | 500MB |
| Kill timeout | 5 segundos |

### Parser Customizado de .env

O `ecosystem.config.js` inclui um parser customizado que lê o arquivo `.env` diretamente, ignorando variáveis de ambiente do sistema. Isso resolve o problema onde variáveis de sistema podem sobrescrever as configurações do `.env`.

```javascript
// Trecho do ecosystem.config.js
function loadEnvFile(filePath) {
  const envVars = {};
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach(line => {
    if (line.trim() && !line.trim().startsWith('#')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim();
      }
    }
  });
  return envVars;
}
```

### ⚠️ Aplicar mudança no `.env` (token, MONGODB_CNN, etc.) — NÃO basta `pm2 restart`

O parser acima roda **só quando o PM2 avalia o `ecosystem.config.js`** (no `pm2 start`/reload do
ecosystem). Um `pm2 restart trustp2pbot` comum **reusa o snapshot de env congelado** e **ignora o
`.env` novo** → o bot continua com o valor antigo. Sintoma clássico: token trocado no `.env`, mas o
boot dá `401: Unauthorized` em `getMe`/`setMyCommands` mesmo o `.env` estando certo (o processo usa
um token velho congelado pelo PM2).

**Sempre que trocar um valor no `.env`, reavalie o ecosystem E persista o dump:**

```bash
# 1) reparseia o .env e injeta os valores novos
pm2 restart /home/umbrel/TrustP2PBot/ecosystem.config.js --update-env

# 2) persiste no dump (senão o resurrect no boot volta com o valor VELHO)
pm2 save

# 3) confere: o processo novo NÃO pode ter "401: Unauthorized"
pm2 logs trustp2pbot --lines 20
```

> Validar um token direto na API (sem expor no histórico), forçando IPv4 (IPv6 do host é
> quebrado p/ `api.telegram.org`):
> `T=$(grep ^TELEGRAM_BOT_TOKEN= .env | cut -d= -f2-); curl -4 -s "https://api.telegram.org/bot$T/getMe"; unset T`
> — `"ok":true` = token válido. Runbook de rotação de segredos: `/home/umbrel/ROTACAO_CHAVES.md`.

## Comandos Básicos

### Iniciar o Bot

```bash
# Primeira vez
pm2 start ecosystem.config.js

# Verificar status
pm2 status
```

### Gerenciamento

```bash
# Ver logs em tempo real
pm2 logs trustp2pbot

# Ver últimas 100 linhas
pm2 logs trustp2pbot --lines 100

# Restart
pm2 restart trustp2pbot

# Stop
pm2 stop trustp2pbot

# Delete (remove do PM2)
pm2 delete trustp2pbot
```

### Monitoramento

```bash
# Dashboard interativo
pm2 monit

# Status detalhado
pm2 show trustp2pbot

# Listar todos os processos
pm2 list
```

## Auto-Start no Boot

### Configurar Startup

```bash
# Gera comando para configurar startup
pm2 startup

# Execute o comando sudo gerado, exemplo:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u umbrel --hp /home/umbrel

# Salvar lista atual de processos
pm2 save
```

### Verificar Configuração

```bash
# Verificar se o serviço está ativo
systemctl status pm2-umbrel

# Ver logs do systemd
journalctl -u pm2-umbrel -f
```

## Logs

### Localização dos Logs

| Tipo | Caminho |
|------|---------|
| Output | `/home/umbrel/TrustP2PBot/logs/out.log` |
| Error | `/home/umbrel/TrustP2PBot/logs/error.log` |

### Rotação de Logs

```bash
# Instalar módulo de rotação
pm2 install pm2-logrotate

# Configurar (opcional)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Troubleshooting

### Bot não inicia

1. Verificar logs:
   ```bash
   pm2 logs trustp2pbot --lines 200
   ```

2. Verificar se o build existe:
   ```bash
   ls -la dist/src/main.js
   ```

3. Rebuild se necessário:
   ```bash
   npm run build
   pm2 restart trustp2pbot
   ```

### Erro 401 Unauthorized

O token do Telegram está incorreto. Verificar:

1. Token no arquivo `.env`:
   ```bash
   cat .env | grep TELEGRAM_BOT_TOKEN
   ```

2. Testar token diretamente:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getMe"
   ```

3. Se o token estiver correto no `.env` mas ainda falhar, pode haver uma variável de ambiente do sistema sobrescrevendo. O `ecosystem.config.js` já resolve isso com o parser customizado.

### Memória Alta

```bash
# Verificar uso de memória
pm2 monit

# Restart para liberar memória
pm2 restart trustp2pbot
```

O limite de 500MB está configurado. Se exceder, o PM2 reinicia automaticamente.

### Muitos Restarts

```bash
# Verificar histórico de restarts
pm2 show trustp2pbot

# Ver logs de erro
pm2 logs trustp2pbot --err --lines 500
```

Se houver muitos restarts, investigar os logs de erro para encontrar a causa raiz.

## Atualização do Bot

```bash
# 1. Pull das alterações
git pull origin main

# 2. Instalar dependências (se necessário)
npm install

# 3. Build
npm run build

# 4. Restart
pm2 restart trustp2pbot

# 5. Verificar logs
pm2 logs trustp2pbot --lines 50
```

## Comandos Úteis

```bash
# Recarregar configuração sem downtime
pm2 reload trustp2pbot

# Resetar contadores de restart
pm2 reset trustp2pbot

# Flush logs
pm2 flush

# Ver variáveis de ambiente do processo
pm2 env 0  # onde 0 é o ID do processo
```

## Referências

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Ecosystem File](https://pm2.keymetrics.io/docs/usage/application-declaration/)
