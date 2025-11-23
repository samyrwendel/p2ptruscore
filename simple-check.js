// Verificação simples usando o mesmo método do bot
const mongoose = require('mongoose');

async function checkScore() {
  try {
    await mongoose.connect('mongodb://localhost:27017/trustscore_bot');
    
    console.log('🔍 Verificando pontuação diretamente no banco...\n');
    
    // Schema básico para consulta
    const userSchema = new mongoose.Schema({}, { strict: false });
    const karmaSchema = new mongoose.Schema({}, { strict: false });
    
    const User = mongoose.model('User', userSchema);
    const Karma = mongoose.model('Karma', karmaSchema);
    
    // Buscar usuário
    const user = await User.findOne({ telegramId: 30289486 });
    
    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    console.log('👤 Usuário:', user.first_name, '(@' + user.username + ')');
    console.log('🏆 Total Karma no banco:', user.totalKarma || 0, 'pts');
    console.log('� Received Karma:', user.receivedKarma || 0, 'pts');
    console.log('📉 Given Karma:', user.givenKarma || 0, 'pts');
    console.log('');
    
    // Buscar transações reais
    const karmaTransactions = await Karma.find({
      $or: [
        { fromUserId: 30289486 },
        { toUserId: 30289486 }
      ]
    }).sort({ createdAt: -1 });
    
    console.log('📋 Transações encontradas:', karmaTransactions.length);
    
    let realReceived = 0;
    let realGiven = 0;
    
    karmaTransactions.forEach((t, i) => {
      if (t.toUserId === 30289486) {
        realReceived += t.points || 0;
        console.log(`${i+1}. 📈 +${t.points} pts (recebido)`);
      } else {
        realGiven += t.points || 0;
        console.log(`${i+1}. 📉 -${t.points} pts (dado)`);
      }
    });
    
    const realTotal = realReceived - realGiven;
    
    console.log('\n📊 COMPARAÇÃO:');
    console.log('💾 No banco:', user.totalKarma || 0, 'pts');
    console.log('🧮 Calculado:', realTotal, 'pts');
    
    if (user.totalKarma === 1010) {
      console.log('🚨 VALOR HARDCODED DETECTADO: 1010 pts');
    }
    
    if (realTotal !== (user.totalKarma || 0)) {
      console.log('⚠️  INCONSISTÊNCIA!');
      console.log('Diferença:', (user.totalKarma || 0) - realTotal, 'pts');
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkScore();
