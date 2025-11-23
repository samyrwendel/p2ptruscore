const { MongoClient } = require('mongodb');
require('dotenv').config();

async function verifyFix() {
  try {
    // Usar a URI do .env
    const uri = process.env.MONGODB_CNN;
    console.log('🔗 Conectando ao MongoDB...');
    
    const client = new MongoClient(uri);
    await client.connect();
    
    const db = client.db();
    
    console.log('\n🔍 Verificando se a correção foi aplicada...\n');
    
    // Buscar usuário samyralmeida
    const user = await db.collection('users').findOne({userId: 30289486});
    if (!user) {
      console.log('❌ Usuário não encontrado');
      await client.close();
      return;
    }
    
    console.log('👤 Usuário:', user.first_name, '(@' + user.username + ')');
    console.log('🏆 Total Karma:', (user.totalKarma || 0), 'pts');
    console.log('📈 Received Karma:', (user.receivedKarma || 0), 'pts');  
    console.log('📉 Given Karma:', (user.givenKarma || 0), 'pts');
    
    // Verificar se ainda tem o valor hardcoded de 1010
    if (user.totalKarma === 1010) {
      console.log('\n❌ PROBLEMA: Ainda existe o valor hardcoded de 1010 pontos!');
      console.log('   A correção não foi aplicada ou foi revertida.');
    } else {
      console.log('\n✅ SUCESSO: O valor hardcoded de 1010 foi corrigido!');
      console.log('   Agora o usuário tem a pontuação correta baseada no banco de dados.');
    }
    
    // Buscar transações de karma para confirmar o cálculo
    console.log('\n📊 Verificando transações de karma:');
    const karmaTransactions = await db.collection('karmas').find({
      $or: [
        {fromUserId: 30289486},
        {toUserId: 30289486}
      ]
    }).sort({createdAt: -1}).toArray();
    
    let receivedTotal = 0;
    let givenTotal = 0;
    
    karmaTransactions.forEach(transaction => {
      if (transaction.toUserId === 30289486) {
        receivedTotal += transaction.points || 0;
      }
      if (transaction.fromUserId === 30289486) {
        givenTotal += transaction.points || 0;
      }
    });
    
    console.log(`   Total de transações: ${karmaTransactions.length}`);
    console.log(`   Karma recebido calculado: ${receivedTotal} pts`);
    console.log(`   Karma dado calculado: ${givenTotal} pts`);
    console.log(`   Total calculado: ${receivedTotal - givenTotal} pts`);
    
    // Comparar com os valores no usuário
    const expectedTotal = receivedTotal - givenTotal;
    if (user.totalKarma === expectedTotal) {
      console.log('\n✅ VALIDAÇÃO: Os valores no banco estão corretos!');
    } else {
      console.log('\n⚠️  ATENÇÃO: Há discrepância entre o valor armazenado e o calculado');
      console.log(`   Armazenado: ${user.totalKarma} pts`);
      console.log(`   Calculado: ${expectedTotal} pts`);
    }
    
    await client.close();
    console.log('\n🔚 Verificação concluída.');
    
  } catch (error) {
    console.error('❌ Erro ao verificar:', error.message);
    process.exit(1);
  }
}

verifyFix();