// Script para verificar se o usuário aceitou os termos no banco
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');

async function checkUserTermsInDB() {
  console.log('🔍 Verificando aceitação de termos no banco de dados...\n');
  
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const termsAcceptanceService = app.get('TermsAcceptanceService');
    
    const userId = 30289486; // Seu ID
    const groupId = -1002907400287; // ID do grupo
    const currentVersion = termsAcceptanceService.getCurrentTermsVersion();
    
    console.log(`👤 Usuário: ${userId}`);
    console.log(`📁 Grupo: ${groupId}`);
    console.log(`📋 Versão atual: ${currentVersion}\n`);
    
    // Verificar se aceitou os termos atuais
    const hasAccepted = await termsAcceptanceService.hasUserAcceptedCurrentTerms(userId, groupId);
    console.log(`✅ Aceitou termos atuais: ${hasAccepted ? 'SIM' : 'NÃO'}\n`);
    
    // Buscar histórico completo
    const history = await termsAcceptanceService.getUserAcceptanceHistory(userId);
    console.log(`📊 Total de aceitações no histórico: ${history.length}\n`);
    
    if (history.length > 0) {
      console.log('📋 Histórico de aceitações:');
      history.forEach((acceptance, index) => {
        console.log(`  ${index + 1}. Versão: ${acceptance.termsVersion} | Data: ${acceptance.acceptedAt} | Grupo: ${acceptance.groupTelegramId}`);
      });
    }
    
    await app.close();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkUserTermsInDB();
