const { MongoClient } = require('mongodb');

async function checkDB() {
  try {
    // Usar a URI do .env
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trustscore';
    console.log('🔗 Conectando ao MongoDB:', uri.replace(/\/\/.*@/, '//***:***@'));
    
    const client = new MongoClient(uri);
    await client.connect();
    
    const db = client.db();
    
    console.log('\n🔍 Verificando pontuação do usuário @samyralmeida...\n');
    
    // Buscar usuário
    const user = await db.collection('users').findOne({telegramId: 30289486});
    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    console.log('👤 Usuário:', user.first_name, '(@' + user.username + ')');
    console.log('🏆 Total Karma:', (user.totalKarma || 0), 'pts');
    console.log('📈 Received Karma:', (user.receivedKarma || 0), 'pts');  
    console.log('📉 Given Karma:', (user.givenKarma || 0), 'pts');
    console.log('📅 Criado em:', user.createdAt);
    console.log('🆔 ID interno:', user._id);
    console.log('');
    
    // Buscar transações de karma
    console.log('� Transações de karma:');
    const karmaTransactions = await db.collection('karmas').find({
      $or: [
        {fromUserId: 30289486},
        {toUserId: 30289486}
      ]
    }).sort({createdAt: -1}).toArray();
    
    let receivedTotal = 0;
    let givenTotal = 0;
    
    console.log('Total de transações encontradas:', karmaTransactions.length);
    
    karmaTransactions.forEach((transaction, index) => {
      if (transaction.toUserId === 30289486) {
        receivedTotal += transaction.points;
        console.log(`  ${index + 1}. 📈 +${transaction.points} pts (recebido) - ${transaction.reason || 'Sem motivo'}`);
      } else {
        givenTotal += transaction.points;
        console.log(`  ${index + 1}. 📉 -${transaction.points} pts (dado) - ${transaction.reason || 'Sem motivo'}`);
      }
    });
    
    console.log('\n📊 RESUMO CALCULADO:');
    console.log('📈 Total recebido:', receivedTotal, 'pts');
    console.log('📉 Total dado:', givenTotal, 'pts');
    console.log('� Total calculado:', (receivedTotal - givenTotal), 'pts');
    console.log('💾 Total no banco:', (user.totalKarma || 0), 'pts');
    
    if ((receivedTotal - givenTotal) !== (user.totalKarma || 0)) {
      console.log('\n⚠️  INCONSISTÊNCIA DETECTADA!');
      console.log('Diferença:', ((user.totalKarma || 0) - (receivedTotal - givenTotal)), 'pts');
      
      // Verificar se é hardcoded
      if (user.totalKarma === 1010) {
        console.log('🚨 VALOR HARDCODED DETECTADO: 1010 pts');
      }
    } else {
      console.log('\n✅ Pontuação consistente!');
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkDB();
