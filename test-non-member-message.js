const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./src/app.module');
const { TelegramService } = require('./src/telegram/telegram.service');

async function testNonMemberMessage() {
  console.log('🚀 Iniciando teste da mensagem de não-membro...');
  
  try {
    // Criar contexto da aplicação NestJS
    const app = await NestFactory.createApplicationContext(AppModule);
    console.log('✅ Contexto da aplicação criado');
    
    // Obter o serviço do Telegram
    const telegramService = app.get(TelegramService);
    console.log('✅ TelegramService obtido');
    
    // Mock de um usuário não-membro
    const mockUser = {
      id: 999999999,
      first_name: 'TestUser',
      username: 'testuser'
    };
    
    // Mock do contexto do Telegram
    const mockCtx = {
      from: mockUser,
      chat: { id: -1001234567890 }, // ID de grupo fictício
      reply: (message) => {
        console.log('📤 Mensagem enviada:', message);
        return Promise.resolve();
      }
    };
    
    console.log('🔍 Testando validação de membro...');
    
    // Testar a validação de membro
    const isValid = await telegramService.validateActiveMembershipGlobally(mockCtx);
    
    if (isValid) {
      console.log('❌ ERRO: Usuário não-membro foi incorretamente aprovado!');
      process.exit(1);
    } else {
      console.log('✅ SUCESSO: Usuário não-membro foi corretamente rejeitado!');
      console.log('✅ A mensagem de aviso deve ter sido enviada.');
    }
    
    await app.close();
    console.log('🎉 Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message);
    process.exit(1);
  }
}

testNonMemberMessage();