// Script simples para corrigir pontuação sem inicializar o bot
const mongoose = require('mongoose');

async function fixScore() {
  try {
    console.log('🔧 Corrigindo pontuação hardcoded...\n');
    
    // Conectar ao MongoDB
    await mongoose.connect('mongodb://localhost:27017/trustscore_bot');
    console.log('✅ Conectado ao MongoDB\n');
    
    const userId = 30289486; // @samyralmeida
    
    // Schemas básicos
    const userSchema = new mongoose.Schema({}, { strict: false });
    const karmaSchema = new mongoose.Schema({}, { strict: false });
    
    const User = mongoose.model('User', userSchema);
    const Karma = mongoose.model('Karma', karmaSchema);
    
    // Buscar usuário atual
    const user = await User.findOne({ telegramId: userId });
    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    console.log('👤 Usuário:', user.first_name, '(@' + user.username + ')');
    console.log('🏆 Pontuação atual:', user.totalKarma || 0, 'pts');
    
    // Verificar se é valor hardcoded suspeito
    if (user.totalKarma === 1010) {
      console.log('🚨 VALOR HARDCODED DETECTADO: 1010 pts\n');
    }
    
    // Buscar todas as transações reais
    const karmaTransactions = await Karma.find({
      $or: [
        { fromUserId: userId },
        { toUserId: userId }
      ]
    }).sort({ createdAt: -1 });
    
    console.log('📋 Transações encontradas:', karmaTransactions.length);
    
    let receivedTotal = 0;
    let givenTotal = 0;
    
    karmaTransactions.forEach((transaction, index) => {
      if (transaction.toUserId === userId) {
        receivedTotal += transaction.points || 0;
        console.log(`  ${index + 1}. 📈 +${transaction.points} pts (recebido) - ${transaction.reason || 'Sem motivo'}`);
      } else {
        givenTotal += transaction.points || 0;
        console.log(`  ${index + 1}. 📉 -${transaction.points} pts (dado) - ${transaction.reason || 'Sem motivo'}`);
      }
    });
    
    const correctTotal = receivedTotal - givenTotal;
    
    console.log('\n📊 CÁLCULO CORRETO:');
    console.log('📈 Total recebido:', receivedTotal, 'pts');
    console.log('📉 Total dado:', givenTotal, 'pts');
    console.log('🏆 Total calculado:', correctTotal, 'pts');
    console.log('💾 Total no banco:', user.totalKarma || 0, 'pts');
    
    if (correctTotal !== (user.totalKarma || 0)) {
      console.log('\n⚠️  INCONSISTÊNCIA DETECTADA!');
      console.log('Diferença:', (user.totalKarma || 0) - correctTotal, 'pts');
      
      // Corrigir pontuação
      await User.updateOne(
        { telegramId: userId },
        { 
          $set: { 
            totalKarma: correctTotal,
            receivedKarma: receivedTotal,
            givenKarma: givenTotal
          }
        }
      );
      
      console.log('\n✅ PONTUAÇÃO CORRIGIDA!');
      console.log('📊 Nova pontuação:', correctTotal, 'pts');
      
      if (user.totalKarma === 1010) {
        console.log('🎉 Valor hardcoded removido com sucesso!');
      }
    } else {
      console.log('\n✅ Pontuação j está correta!');
    }
    
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado do MongoDB');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

fixScore();
