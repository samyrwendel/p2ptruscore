import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { KarmaService } from './src/karma/karma.service';
import { UsersService } from './src/users/users.service';

async function testKarmaFallback() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const karmaService = app.get(KarmaService);
  const usersService = app.get(UsersService);

  try {
    console.log('🧪 Testando função getKarmaForUserWithFallback...');
    
    // Simular a função getKarmaForUserWithFallback
    const getKarmaForUserWithFallback = async (user: any, chatId: number) => {
      try {
        console.log(`\n🔍 Testando usuário: ${user.userName || user.firstName}`);
        console.log(`   ID: ${user._id}`);
        console.log(`   userId: ${user.userId}`);
        console.log(`   chatId: ${chatId}`);
        
        // Primeiro tentar buscar karma no grupo atual
        console.log('\n1️⃣ Buscando karma no grupo atual...');
        const groupKarma = await karmaService.getKarmaForUser(user.userId, chatId);
        console.log('   Resultado getKarmaForUser:', groupKarma);
        
        if (groupKarma && groupKarma.karma !== undefined) {
          console.log('   ✅ Karma encontrado no grupo atual!');
          return groupKarma;
        }
        
        // Se não encontrar no grupo atual, buscar karma total
        console.log('\n2️⃣ Buscando karma total...');
        const totalKarma = await karmaService.getTotalKarmaForUser(user.userName || user.firstName);
        console.log('   Resultado getTotalKarmaForUser:', totalKarma);
        
        if (totalKarma) {
          console.log('   ✅ Karma total encontrado!');
          // Simular estrutura de karma do grupo para compatibilidade
          const fallbackKarma = {
            karma: totalKarma.totalKarma,
            givenKarma: totalKarma.totalGiven,
            givenHate: totalKarma.totalHate,
            user: totalKarma.user,
            history: []
          };
          console.log('   Estrutura de fallback:', fallbackKarma);
          return fallbackKarma;
        }
        
        console.log('   ❌ Nenhum karma encontrado!');
        return null;
      } catch (error) {
        console.error('   ❌ Erro ao buscar karma:', error.message);
        return null;
      }
    };
    
    // Testar com samyralmeida
    console.log('\n=== TESTE 1: samyralmeida ===');
    const samyr = await usersService.findOneByUsernameOrName('samyralmeida');
    if (samyr) {
      const samyrKarma = await getKarmaForUserWithFallback(samyr, -1002907400287);
      console.log('\n📊 Resultado final samyralmeida:', samyrKarma);
      
      if (samyrKarma) {
        const score = samyrKarma.karma || 0;
        let nivel = 'Iniciante';
        let icone = '🔰';
        
        if (score < 0) {
          nivel = 'Problemático';
          icone = '🔴';
        } else if (score < 50) {
          nivel = 'Iniciante';
          icone = '🔰';
        } else if (score < 100) {
          nivel = 'Bronze';
          icone = '🥉';
        } else if (score < 200) {
          nivel = 'Prata';
          icone = '🥈';
        } else if (score < 500) {
          nivel = 'Ouro';
          icone = '🥇';
        } else {
          nivel = 'Mestre P2P';
          icone = '🏆';
        }
        
        console.log(`\n🏆 Nível calculado: ${icone} ${nivel} (${score} pts)`);
      }
    }
    
    // Testar com depixoficial
    console.log('\n=== TESTE 2: depixoficial ===');
    const depix = await usersService.findOneByUsernameOrName('depixoficial');
    if (depix) {
      const depixKarma = await getKarmaForUserWithFallback(depix, -1002907400287);
      console.log('\n📊 Resultado final depixoficial:', depixKarma);
      
      if (depixKarma) {
        const score = depixKarma.karma || 0;
        let nivel = 'Iniciante';
        let icone = '🔰';
        
        if (score < 0) {
          nivel = 'Problemático';
          icone = '🔴';
        } else if (score < 50) {
          nivel = 'Iniciante';
          icone = '🔰';
        } else if (score < 100) {
          nivel = 'Bronze';
          icone = '🥉';
        } else if (score < 200) {
          nivel = 'Prata';
          icone = '🥈';
        } else if (score < 500) {
          nivel = 'Ouro';
          icone = '🥇';
        } else {
          nivel = 'Mestre P2P';
          icone = '🏆';
        }
        
        console.log(`\n🏆 Nível calculado: ${icone} ${nivel} (${score} pts)`);
      } else {
        console.log('\n🔰 Nível padrão: 🔰 Iniciante (0 pts)');
      }
    }
    
    console.log('\n✅ Teste completo!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await app.close();
  }
}

testKarmaFallback();