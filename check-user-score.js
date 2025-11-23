// Script para verificar pontuação específica do usuário
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');

async function checkUserScore() {
  console.log('🔍 Verificando pontuação do usuário @samyralmeida...\n');
  
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const karmaService = app.get('KarmaService');
    const usersService = app.get('UsersService');
    
    const userId = 30289486; // ID do @samyralmeida
    
    console.log(`👤 Verificando usuário: ${userId} (@samyralmeida)\n`);
    
    // Buscar dados do usuário
    const user = await usersService.findByTelegramId(userId);
    if (!user) {
      console.log('❌ Usuário não encontrado no banco de dados');
      await app.close();
      return;
    }
    
    console.log(`✅ Usuário encontrado: ${user.first_name} (@${user.username})`);
    console.log(`📅 Criado em: ${user.createdAt}`);
    console.log(`🆔 ID interno: ${user._id}\n`);
    
    // Verificar karma atual
    const karmaData = await karmaService.getKarmaForUser(userId);
    console.log('📊 PONTUAÇÃO ATUAL:');
    console.log(`🏆 Total: ${karmaData.totalKarma} pontos`);
    console.log(`📈 Recebido: ${karmaData.receivedKarma} pontos`);
    console.log(`📉 Dado: ${karmaData.givenKarma} pontos`);
    console.log(`⭐ Avaliações: ${karmaData.totalEvaluations}\n`);
    
    // Verificar histórico de karma
    const history = await karmaService.getKarmaHistory(userId);
    console.log(`📋 HISTÓRICO: ${history.length} transações`);
    
    if (history.length > 0) {
      console.log('\n🔍 Últimas 5 transações:');
      history.slice(0, 5).forEach((transaction, index) => {
        const type = transaction.points > 0 ? '📈 RECEBEU' : '📉 DEU';
        console.log(`  ${index + 1}. ${type} ${Math.abs(transaction.points)} pts - ${transaction.reason || 'Sem motivo'} (${transaction.createdAt})`);
      });
    }
    
    // Verificar se há inconsistências
    const calculatedTotal = karmaData.receivedKarma - karmaData.givenKarma;
    if (calculatedTotal !== karmaData.totalKarma) {
      console.log(`\n⚠️  INCONSISTÊNCIA DETECTADA:`);
      console.log(`   Calculado: ${calculatedTotal} pts`);
      console.log(`   Armazenado: ${karmaData.totalKarma} pts`);
      console.log(`   Diferença: ${karmaData.totalKarma - calculatedTotal} pts`);
    } else {
      console.log(`\n✅ Pontuação consistente!`);
    }
    
    await app.close();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkUserScore();
