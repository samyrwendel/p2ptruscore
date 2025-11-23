// Script para verificar o status dos termos do usuário atual
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');

async function checkMyTermsStatus() {
  console.log('🔍 Verificando status dos termos...\n');
  
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const termsAcceptanceService = app.get('TermsAcceptanceService');
    
    // Verificar versão atual dos termos
    const currentVersion = termsAcceptanceService.getCurrentTermsVersion();
    console.log(`📌 Versão atual dos termos: ${currentVersion}\n`);
    
    // Verificar todos os usuários que precisam aceitar
    const allUsersNeedingUpdate = await termsAcceptanceService.getAllUsersNeedingCurrentTermsAcceptance();
    
    console.log('📊 Usuários que precisam aceitar os termos por grupo:');
    for (const [groupId, userIds] of allUsersNeedingUpdate.entries()) {
      console.log(`  Grupo ${groupId}: ${userIds.length} usuários`);
      console.log(`    IDs: ${userIds.join(', ')}`);
    }
    
    console.log('\n💡 Para receber a notificação, você precisa:');
    console.log('1. Estar em um dos grupos listados acima');
    console.log('2. Seu ID de usuário deve estar na lista');
    console.log('3. Executar o comando /notificar_termos como administrador');
    
    await app.close();
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkMyTermsStatus();
