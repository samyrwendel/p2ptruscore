# 🛡️ Comandos Administrativos - TrustP2PBot

## 📋 Visão Geral

O TrustP2PBot possui um sistema completo de comandos administrativos para moderação e gestão do grupo. Apenas **administradores** e **criadores** do grupo podem usar estes comandos.

## 🔑 Verificação de Permissões

O sistema verifica automaticamente se o usuário é administrador antes de executar qualquer comando. A verificação inclui:
- ✅ **Administrator** - Administradores do grupo
- ✅ **Creator** - Criador/dono do grupo
- ❌ **Member** - Membros comuns (bloqueados)

## 📚 Lista Completa de Comandos

### **🚫 Moderação e Punições**

#### **1. Banir Usuário**
```
/admin ban @usuario [motivo]
/admin banir @usuario [motivo]
```
**Função:** Bane o usuário permanentemente do grupo  
**Efeitos:**
- Remove o usuário do grupo permanentemente
- Zera o karma do usuário como punição adicional
- Registra a ação no log administrativo
- Não funciona contra outros administradores

**Exemplo:**
```
/admin ban @spammer Spam excessivo no grupo
```

#### **2. Remover Usuário (Kick)**
```
/admin kick @usuario [motivo]
/admin remover @usuario [motivo]
```
**Função:** Remove o usuário temporariamente (pode retornar)  
**Efeitos:**
- Remove o usuário do grupo
- Usuário pode retornar através de link de convite
- Registra a ação no log administrativo

**Exemplo:**
```
/admin kick @usuario_problema Comportamento inadequado
```

#### **3. Advertir Usuário**
```
/admin warn @usuario [motivo]
/admin advertir @usuario [motivo]
```
**Função:** Dá advertência oficial com penalidade de karma  
**Efeitos:**
- Remove 10 pontos de karma
- Envia notificação privada ao usuário
- Registra advertência no log
- Notifica o grupo sobre a advertência

**Exemplo:**
```
/admin warn @usuario_problema Linguagem inadequada
```

#### **4. Silenciar Usuário**
```
/admin mute @usuario [tempo] [motivo]
/admin silenciar @usuario [tempo] [motivo]
```
**Função:** Impede o usuário de enviar mensagens por um período  
**Formatos de tempo:**
- `30s` - 30 segundos
- `15m` - 15 minutos  
- `2h` - 2 horas
- `1d` - 1 dia

**Exemplo:**
```
/admin mute @usuario_problema 2h Flood de mensagens
```

#### **5. Desbanir Usuário**
```
/admin unban @usuario
/admin unban [ID_NUMERICO]
/admin desbanir @usuario
```
**Função:** Remove banimento de usuário  
**Nota:** Para usuários que não estão mais no grupo, use o ID numérico

**Exemplo:**
```
/admin unban @usuario_arrependido
/admin unban 123456789
```

### **💰 Gestão de Karma**

#### **6. Adicionar Karma**
```
/admin addkarma @usuario [quantidade] [motivo]
/admin adicionarkarma @usuario [quantidade] [motivo]
```
**Função:** Adiciona pontos de karma ao usuário  
**Limite:** Apenas valores positivos

**Exemplo:**
```
/admin addkarma @usuario_bom 50 Contribuição excepcional
```

#### **7. Remover Karma**
```
/admin removekarma @usuario [quantidade] [motivo]
/admin removerkarma @usuario [quantidade] [motivo]
```
**Função:** Remove pontos de karma do usuário  
**Limite:** Apenas valores positivos (serão subtraídos)

**Exemplo:**
```
/admin removekarma @usuario_problema 25 Comportamento inadequado
```

#### **8. Zerar Karma**
```
/admin resetkarma @usuario [motivo]
/admin zerarkarma @usuario [motivo]
```
**Função:** Define o karma do usuário como 0  
**Uso:** Punição severa ou reset completo

**Exemplo:**
```
/admin resetkarma @usuario_problema Reset por múltiplas infrações
```

### **📊 Informações e Logs**

#### **9. Informações do Usuário**
```
/admin info @usuario
/admin informacoes @usuario
```
**Função:** Exibe informações detalhadas sobre o usuário  
**Inclui:**
- Nome e ID do usuário
- Status no grupo (membro, admin, etc.)
- Karma total e estatísticas
- Histórico de ações administrativas recentes

**Exemplo:**
```
/admin info @usuario_suspeito
```

#### **10. Log de Ações**
```
/admin log [quantidade]
/admin historico [quantidade]
```
**Função:** Exibe histórico de ações administrativas  
**Padrão:** 10 ações mais recentes  
**Máximo:** 50 ações por consulta

**Exemplo:**
```
/admin log 20
```

### **❓ Ajuda**

#### **11. Menu de Ajuda**
```
/admin
/admin help
/admin ajuda
```
**Função:** Exibe lista completa de comandos disponíveis

## 🔍 Funcionalidades Especiais

### **📝 Log Automático**
- Todas as ações administrativas são registradas automaticamente
- Inclui: admin responsável, usuário alvo, ação, motivo, data/hora
- Mantém histórico das últimas 1000 ações
- Filtrado por grupo (cada grupo tem seu próprio log)

### **🛡️ Proteções de Segurança**
- **Anti-Admin**: Não é possível punir outros administradores
- **Verificação de Permissões**: Apenas admins podem usar comandos
- **Validação de Entrada**: Todos os parâmetros são validados
- **Tratamento de Erros**: Mensagens claras em caso de erro

### **📱 Notificações**
- **Usuário Punido**: Recebe notificação privada (quando possível)
- **Grupo**: Notificado sobre ações importantes (ban, warn, etc.)
- **Admin**: Confirmação de ação executada

### **🔄 Busca Inteligente de Usuários**
O sistema pode encontrar usuários por:
- **Username**: `@usuario` ou `usuario`
- **ID Numérico**: `123456789`
- **Nome**: `João Silva`

## 📋 Exemplos Práticos de Uso

### **Cenário 1: Usuário Fazendo Spam**
```
/admin warn @spammer Primeira advertência por spam
# Se continuar:
/admin mute @spammer 1h Continuou fazendo spam após advertência
# Se persistir:
/admin ban @spammer Spam persistente após múltiplas advertências
```

### **Cenário 2: Usuário com Comportamento Tóxico**
```
/admin warn @toxico Linguagem ofensiva
/admin removekarma @toxico 20 Comportamento tóxico
# Se não melhorar:
/admin kick @toxico Comportamento tóxico persistente
```

### **Cenário 3: Reconhecer Bom Comportamento**
```
/admin addkarma @usuario_exemplar 30 Ajudou novos membros
/admin info @usuario_exemplar
```

### **Cenário 4: Investigar Usuário Suspeito**
```
/admin info @suspeito
/admin log 15
```

## ⚠️ Boas Práticas

### **✅ Recomendações:**
1. **Sempre forneça motivos claros** para as ações
2. **Use advertências antes de punições severas**
3. **Documente ações importantes** no log
4. **Verifique informações do usuário** antes de punir
5. **Use punições graduais** (warn → mute → kick → ban)

### **❌ Evite:**
1. **Banir sem motivo claro**
2. **Punir outros administradores**
3. **Usar punições excessivas** para infrações leves
4. **Esquecer de verificar o histórico** do usuário
5. **Agir por impulso** sem investigar

## 🔧 Configuração e Manutenção

### **Requisitos:**
- Bot deve ter permissões de administrador no grupo
- Permissões necessárias:
  - `can_restrict_members` - Para mute/ban
  - `can_delete_messages` - Para moderação
  - `can_invite_users` - Para unban

### **Monitoramento:**
- Use `/admin log` regularmente para revisar ações
- Monitore karma dos usuários com `/admin info`
- Mantenha comunicação entre administradores

## 📞 Suporte

Em caso de problemas:
1. Verifique se o bot tem permissões adequadas
2. Confirme se você é administrador do grupo
3. Consulte os logs para investigar problemas
4. Entre em contato com o desenvolvedor se necessário

---

**🛡️ Lembre-se:** Com grandes poderes vêm grandes responsabilidades. Use os comandos administrativos de forma justa e consistente para manter um ambiente saudável no grupo.