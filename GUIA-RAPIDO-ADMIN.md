# ⚡ Guia Rápido - Comandos Admin

## 🚨 Ações Rápidas

### **Punições Imediatas**
```bash
/admin ban @usuario motivo          # Banir permanente
/admin kick @usuario motivo         # Remover temporário  
/admin warn @usuario motivo         # Advertir (-10 karma)
/admin mute @usuario 1h motivo      # Silenciar por tempo
```

### **Gestão de Karma**
```bash
/admin addkarma @usuario 50         # Adicionar karma
/admin removekarma @usuario 25      # Remover karma
/admin resetkarma @usuario          # Zerar karma
```

### **Informações**
```bash
/admin info @usuario                # Ver dados do usuário
/admin log 10                       # Ver últimas ações
/admin                              # Menu de ajuda
```

## 🎯 Cenários Comuns

| Problema | Comando | Efeito |
|----------|---------|--------|
| **Spam** | `/admin warn @user spam` | -10 karma + aviso |
| **Spam Persistente** | `/admin mute @user 2h spam` | Silenciado 2h |
| **Comportamento Tóxico** | `/admin kick @user toxico` | Removido (pode voltar) |
| **Fraude/Golpe** | `/admin ban @user fraude` | Banido + karma zerado |
| **Flood** | `/admin mute @user 30m flood` | Silenciado 30min |
| **Usuário Exemplar** | `/admin addkarma @user 30` | +30 karma |

## ⏰ Formatos de Tempo

| Formato | Significado |
|---------|-------------|
| `30s` | 30 segundos |
| `15m` | 15 minutos |
| `2h` | 2 horas |
| `1d` | 1 dia |

## 🛡️ Proteções

- ❌ Não funciona contra outros admins
- ✅ Apenas admins podem usar
- ✅ Log automático de todas as ações
- ✅ Notificações para usuários punidos

## 📱 Acesso Rápido

**Salve este comando nos favoritos:**
```
/admin
```
*Mostra menu completo de opções*