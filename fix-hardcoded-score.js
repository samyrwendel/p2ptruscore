// Script para corrigir pontuação hardcoded
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');

async function fixHardcodedScore() {
  console.log('🔧 Corrigindo pontuação hardcoded...\n');
  
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    
    // Usar os serviços do próprio bot
    const usersService = app.get('UsersService');
    const karmaService = app.get('KarmaService');
    
    const userId = 30289486; // @samyralmeida
    
    console.log('👤 Corrigindo pontuação para usuário:', userId);
    
    // Buscar usuário atual
    const user = await usersService.findByTelegramId(userId);
    if (!user) {
      console.log('❌ Usuário não encontrado');
      return;
    }
    
    console.log('📊 Pontuação atual no banco:', user.totalKarma || 0, 'pts');
    
    // Recalcular pontuação real baseada nas transações
    console.log('🧮 Recalculando pontuação real...');
    
    // Usar o método do próprio sistema para recalcular
    await karmaService.recalculateUserKarma(userId);
    
    // Buscar usuário atualizado
    const updatedUser = await usersService.findByTelegramId(userId);
    
    console.log('✅ Pontuação corrigida!');
    console.log('📊 Nova pontuação:', updatedUser.totalKarma || 0, 'pts');
    
    await app.close();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('\n🔧 Tentando correção manual...');
    
    // Se o método automático falhar, fazer correção manual
    try {
      const app = await NestFactory.createApplicationContext(AppModule);
      const mongoose = app.get('DatabaseConnection');
      
      // Buscar todas as transações do usuário
      const karmas = await mongoose.collection('karmas').find({
        $or: [
          { fromUserId: 30289486 },
          { toUserId: 30289486 }
        ]
      }).toArray();
      
      let received = 0;
      let given = 0;
      
      karmas.forEach(karma => {
        if (karma.toUserId === 30289486) {
          received += karma.points || 0;
        } else {
          given += karma.points || 0;
        }
      });
      
      const correctTotal = received - given;
      
      // Atualizar no banco
      await mongoose.collection('users').updateOne(
        { telegramId: 30289486 },
        { 
          $set: { 
            totalKarma: correctTotal,
            receivedKarma: received,
            givenKarma: given
          }
        }
      );
      
      console.log('✅ Correção manual concluída!');
      console.log('📈 Recebido:', received, 'pts');
      console.log('📉 Dado:', given, 'pts');
      console.log('� Total correto:', correctTotal, 'pts');
      
      await app.close();
      
    } catch (manualError) {
      console.error('❌ Erro na correção manual:', manualError.message);
    }
  }
}

fixHardcodedScore();
