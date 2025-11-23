// Script para debugar o sistema de notificação de termos
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');

async function debugTermsNotification() {
  console.log('🔍 Debugando sistema de notificação de termos...\n');
  
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const termsAcceptanceService = app.get('TermsAcceptanceService');
    const termsNotificationService = app.get('TermsNotificationService');
    
    console.log('📌 Versão atual dos termos:', termsAcceptanceService.getCurrentTermsVersion());
    
    // Verificar todos os usuários que precisam aceitar
    console.log('\n🔍 Verificando usuários que precisam aceitar os termos...');
    const allUsersNeedingUpdate = await termsAcceptanceService.getAllUsersNeedingCurrentTermsAcceptance();
    
    console.log(`\n📊 Encontrados ${allUsersNeedingUpdate.size} grupos com usuários pendentes:`);
    
    let totalUsers = 0;
    for (const [groupId, userIds] of allUsersNeedingUpdate.entries()) {
      console.log(`  📁 Grupo ${groupId}: ${userIds.length} usuários`);
      console.log(`     👥 IDs: ${userIds.join(', ')}`);
      totalUsers += userIds.length;
    }
    
    console.log(`\n📈 Total de usuários que precisam aceitar: ${totalUsers}`);
    
    if (totalUsers > 0) {
      console.log('\n🔔 Simulando envio de notificações...');
      console.log('ℹ️  (Este é apenas um teste - nenhuma mensagem será enviada)');
      
      // Simular o processo sem enviar mensagens reais
      for (const [groupId, userIds] of allUsersNeedingUpdate.entries()) {
        console.log(`\n📤 Processando grupo ${groupId}:`);
        for (const userId of userIds) {
          console.log(`  ✉️  Enviaria notificação para usuário ${userId}`);
        }
      }
    } else {
      console.log('\n✅ Todos os usuários já aceitaram os termos atuais!');
    }
    
    await app.close();
    console.log('\n� Debug concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante debug:', error.message);
  }
}

debugTermsNotification();
