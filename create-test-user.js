// Script para criar um usuário de teste que precisa aceitar os termos
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');

async function createTestUser() {
  console.log('🧪 Criando usuário de teste para notificação de termos...\n');
  
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const usersService = app.get('UsersService');
    const groupsService = app.get('GroupsService');
    
    // Criar um usuário de teste
    const testUserId = 999999999; // ID fictício
    const testGroupId = -1002907400287; // Grupo real
    
    console.log(`👤 Criando usuário de teste: ${testUserId}`);
    console.log(`📁 No grupo: ${testGroupId}`);
    
    // Criar usuário
    const user = await usersService.findOrCreate({
      id: testUserId,
      first_name: 'Usuário Teste',
      username: 'usuario_teste'
    });
    
    console.log(`✅ Usuário criado: ${user._id}`);
    
    // Criar grupo se não existir
    const group = await groupsService.findOrCreate({
      id: testGroupId,
      title: 'Grupo Teste'
    });
    
    console.log(`✅ Grupo verificado: ${group._id}`);
    
    console.log('\n🎯 Agora você pode testar o comando /notificar_termos');
        console.log('
    await app.close();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

createTestUser();
