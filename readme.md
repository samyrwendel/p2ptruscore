# ✨ P2P Score Bot: Bot Moderno de Score P2P para Telegram ✨

Um bot sofisticado do Telegram projetado para rastrear perfeitamente a reputação do usuário (score) em chats de grupo, agora reconstruído com o poder e estrutura do **NestJS**.

O P2P Score Bot permite que membros do grupo facilmente deem ou tirem pontos uns dos outros, promovendo interação da comunidade e fornecendo insights valiosos. Possui rankings abrangentes, rastreamento individual de score e expõe uma API robusta perfeita para seu **Telegram Mini App** acompanhante.

## 📖 Table of Contents

- [✨ KarmaBot: A Modern Telegram Karma Bot ✨](#-karmabot-a-modern-telegram-karma-bot-)
  - [📖 Table of Contents](#-table-of-contents)
  - [🚀 For Group Members](#-for-group-members)
    - [Key Features](#key-features)
    - [Getting Started](#getting-started)
  - [👨‍💻 For Developers](#-for-developers)
    - [Architectural Philosophy](#architectural-philosophy)
    - [💻 Technology Stack](#-technology-stack)
    - [🔧 Installation \& Setup](#-installation--setup)
    - [📂 Project Structure](#-project-structure)
    - [🙌 Contributing](#-contributing)
    - [📜 License](#-license)
    - [👤 Author](#-author)
    - [🙏 Acknowledgments](#-acknowledgments)

## 🚀 For Group Members

### Funcionalidades Principais

- 👍 **Dar Score:** Responda `+1` a uma mensagem para dar um ponto de score.
- 👎 **Dar Score Negativo:** Responda `-1` a uma mensagem para deduzir um ponto de score.
- ⏱️ **Sistema de Cooldown:** Um cooldown de 1 minuto previne spam de score.
- 👤 **Seu Status (`/me`):** Verifique seu próprio score e veja quanto score positivo e negativo você deu.
- 🏆 **Rankings:**
  - `/melhorscore`: Os 10 usuários com melhor score.
  - `/piorscore`: Os 10 usuários com pior score.
  - `/mostgivers`: Veja quem mais dá score positivo e negativo.
- 📅 **Rankings Periódicos:**
  - `/hoje`: Melhores usuários por score recebido nas últimas 24 horas.
  - `/mes`: Melhores usuários por score recebido nos últimos 30 dias.
  - `/ano`: Melhores usuários por score recebido nos últimos 365 dias.
- 💸 **Transferir Score (`/transferir <quantidade>`):** Responda à mensagem de um usuário para enviar alguns dos seus pontos de score.
- 📜 **Histórico de Score:**
  - `/history`: Veja suas últimas 10 mudanças de score.
  - `/gethistory <usuário>`: Veja o histórico de um usuário específico.
- 📱 **Integração Mini App:** A maioria dos comandos inclui um botão "Abrir Mini App" para uma experiência rica e interativa.

### Como Começar

1.  **Adicionar o Bot:** Um admin deve convidar o P2P Score Bot para seu grupo do Telegram.
2.  **Dar Score:** Simplesmente **responda** à mensagem de um usuário com `+1` ou `-1`.
3.  **Usar Comandos:** Digite comandos como `/meuscore`, `/melhorscore`, ou `/comandos` diretamente no chat para interagir com o bot.

---

## 👨‍💻 For Developers

This project is a complete migration of a classic Node.js bot to a modern, scalable, and type-safe NestJS architecture. It serves as a real-world example of applying enterprise-level software design principles to a Telegram bot.

### Architectural Philosophy

The codebase is structured following SOLID principles to ensure it is maintainable, testable, and easy to extend.

- **Modular & Scalable:** Built on the NestJS module system, each domain (`users`, `groups`, `karma`) is a self-contained module with its own repository and service, promoting low coupling.
- **SOLID Principles:**
  - **Single Responsibility:** Services are decoupled. `KarmaService` depends on `UsersService`, not `UsersRepository`, ensuring that each service is the single source of truth for its domain.
  - **Open/Closed:** The application is open for extension but closed for modification.
- **Command Pattern:** Adding a new command is as simple as creating a new `CommandHandler` class that implements a generic interface (`ICommandHandler`). The core `TelegramService` discovers and registers it without needing any modification.
- **Type Safety:** Fully written in TypeScript, using custom types (`TextCommandContext`), DTOs, and generics to prevent common runtime errors and ensure a reliable developer experience.

### 💻 Technology Stack

| Role                  | Technology                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**         | [**NestJS**](https://nestjs.com/) - A progressive Node.js framework for building efficient and scalable server-side applications.                   |
| **Language**          | [**TypeScript**](https://www.typescriptlang.org/) - For robust type safety and modern JavaScript features.                                          |
| **Telegram API**      | [**Telegraf**](https://telegraf.js.org/) - A modern and powerful framework for building Telegram bots.                                              |
| **Database**          | [**MongoDB**](https://www.mongodb.com/) with [**Mongoose**](https://mongoosejs.com/) - For flexible and persistent data storage.                    |
| **Configuration**     | [**@nestjs/config**](https://docs.nestjs.com/techniques/configuration) with **Joi** - For type-safe environment variable management and validation. |
| **API Rate Limiting** | [**@nestjs/throttler**](https://docs.nestjs.com/security/rate-limiting) - To protect API endpoints from abuse.                                      |

### 🔧 Instalação e Configuração

1.  **Pré-requisitos:**
    - Node.js (v18.x ou superior)
    - npm ou yarn
    - Uma instância MongoDB rodando (local ou na nuvem)
    - Um Token e Username do Bot do Telegram (do [@BotFather](https://t.me/BotFather))

2.  **Clonar o Repositório:**

    ```bash
    git clone https://github.com/WilliamsMata/karma_bot
    cd karma_bot
    ```

3.  **Instalar Dependências:**

    ```bash
    npm install
    ```

4.  **Configurar Variáveis de Ambiente:**
    Crie um arquivo `.env` na raiz do projeto copiando o exemplo: `cp .env.example .env`. Em seguida, preencha as variáveis necessárias:

    ```dotenv
    # .env

    # Seu token do bot do Telegram do @BotFather
    TELEGRAM_BOT_TOKEN=SEU_TOKEN_DO_BOT_AQUI

    # O username do seu bot
    TELEGRAM_BOT_USERNAME=SEU_USERNAME_DO_BOT_AQUI

    # String de conexão do MongoDB
    MONGODB_CNN=mongodb://localhost:27017/karma_bot

    # A porta para o servidor da API
    PORT=3000
    ```

5.  **Executar a Aplicação:**
    - **Modo de Desenvolvimento (com auto-reload):**
      ```bash
      npm run start:dev
      ```
    - **Modo de Produção:**
      ```bash
      npm run build
      npm run start:prod
      ```

### 📂 Estrutura do Projeto

```
src
├── api/                # Controladores e módulos da API (para o Mini App)
│   ├── karma/
│   └── users/
├── karma/              # Lógica de negócio principal para score
│   ├── dto/
│   ├── schemas/
│   ├── karma.module.ts
│   ├── karma.repository.ts
│   └── karma.service.ts
├── telegram/           # Toda a lógica específica do Telegram
│   ├── commands/       # Implementação do padrão Command
│   │   ├── handlers/   # Classes individuais para cada comando (/meuscore, /melhorscore, etc.)
│   │   └── commands.module.ts
│   ├── handlers/       # Handlers para eventos não-comando (ex: mensagens +1)
│   ├── shared/         # Utilitários compartilhados (ex: serviço de teclado)
│   ├── telegram.module.ts
│   └── telegram.service.ts # Serviço principal para conexão do bot e roteamento de eventos
├── users/              # Lógica de negócio para usuários
├── groups/             # Lógica de negócio para grupos
├── database/           # Configuração do repositório abstrato e módulo de banco de dados
├── app.module.ts       # Módulo raiz da aplicação
└── main.ts             # Ponto de entrada da aplicação
```

---

### 🙌 Contribuindo

Contribuições são muito bem-vindas! Se você tem ideias para melhorias ou encontrou um bug, sinta-se à vontade para:

1.  **Fazer Fork** do repositório.
2.  Criar uma nova **branch** para sua funcionalidade ou correção.
3.  Fazer suas alterações e **commit** com mensagens claras.
4.  Fazer push para sua branch e abrir um **Pull Request**.

### 📜 Licença

Este projeto está licenciado sob a **Licença ISC**.

### 👤 Autor

- **Williams Mata** - [GitHub](https://github.com/WilliamsMata)

### 🙏 Agradecimentos

Este projeto foi inspirado pelo [karma bot](https://github.com/hbourgeot/karmagobot) de [hbourgeot](https://github.com/hbourgeot).
