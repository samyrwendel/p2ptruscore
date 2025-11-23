// Script para corrigir pontuação
const { MongoClient } = require('mongodb');

async function fixScore() {
  console.log('🔧 Verificando e corrigindo pontuação...\n');
  
  try {
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/trustscore');
    await client.connect();
    
    const db = client.db();
    const userId = 30289486;
    
    // Buscar usuário
    const user = await db.collection('users').findOne({ telegramId: userId });
    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    console.log(`👤 Usuário: ${user.first_name} (@${user.username})`);
    console.log(`🏆 Pontuação atual: ${user.totalKarma || 0} pts\n`);
    
    // Buscar todas as transações de karma
    const karmaTransactions = await db.collection('karmas').find({
      $or: [
        { fromUserId: userId },
        { toUserId: userId }
      ]
    }).toArray();
    
    console.log(`📋 Total de transações: ${karmaTransactions.length}\n`);
    
    // Calcular pontuação correta
    let receivedPoints = 0;
    let givenPoints = 0;
    
    karmaTransactions.forEach(transaction => {
      if (transaction.toUserId === userId) {
        receivedPoints += transaction.points;
        console.log(`📈 +${transaction.points} pts (recebido)`);
      } else if (transaction.fromUserId === userId) {
        givenPoints += transaction.points;
        console.log(`📉 -${transaction.points} pts (dado)`);
      }
    });
    
    const correctTotal = receivedPoints - givenPoints;
    
    console.log(`\n📊 CÁLCULO CORRETO:`);
    console.log(`📈 Recebido: ${receivedPoints} pts`);
    console.log(`📉 Dado: ${givenPoints} pts`);
    console.log(`🏆 Total correto: ${correctTotal} pts`);
    console.log(`💾 Total armazenado: ${user.totalKarma || 0} pts`);
    
    if (correctTotal !== (user.totalKarma || 0)) {
      console.log(`\n⚠️  INCONSISTÊNCIA DETECTADA!`);
      console.log(`Diferença: ${(user.totalKarma || 0) - correctTotal} pts`);
      
      // Corrigir pontuação
      await db.collection('users').updateOne(
        { telegramId: userId },
        { 
          $set: { 
            totalKarma: correctTotal,
            receivedKarma: receivedPoints,
            givenKarma: givenPoints
          }
        }
      );
      
      console.log(`✅ Pontuação corrigida para ${correctTotal} pts!`);
    } else {
      console.log(`\n✅ Pontuação já está correta!`);
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

fixScore();
