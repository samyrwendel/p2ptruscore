// Script para verificar se os pontos foram salvos corretamente
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { KarmaService } from './src/karma/karma.service';
import { UsersService } from './src/users/users.service';

async function verifyKarma() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const karmaService = app.get(KarmaService);
    const usersService = app.get(UsersService);
    
    console.log('🔍 Verificando karma do usuário samyralmeida...');
    
    // Verificar karma diretamente por query
    console.log('🔍 Buscando usuário samyralmeida por query...');
    
    try {
      const totalKarma = await karmaService.getTotalKarmaForUser('samyralmeida');
      if (totalKarma) {
        console.log(`\n👤 Usuário encontrado: ${totalKarma.user.userName || totalKarma.user.firstName}`);
        console.log(`   ⭐ Karma total: ${totalKarma.totalKarma}`);
        console.log(`   👍 Positivas dadas: ${totalKarma.totalGiven}`);
        console.log(`   👎 Negativas dadas: ${totalKarma.totalHate}`);
      } else {
        console.log('❌ Usuário samyralmeida não encontrado');
      }
    } catch (error) {
      console.log(`❌ Erro ao buscar por query: ${error.message}`);
    }
    
    // Verificar karma no grupo P2P específico
    console.log('\n🏢 Verificando karma no grupo P2P (-1002907400287):');
    
    try {
      const groupKarma = await karmaService.getKarmaForUser(123456789, -1002907400287);
      if (groupKarma) {
        console.log(`\n👤 samyralmeida no grupo P2P:`);
        console.log(`   ⭐ Karma: ${groupKarma.karma}`);
        console.log(`   👍 Positivas dadas: ${groupKarma.givenKarma}`);
        console.log(`   👎 Negativas dadas: ${groupKarma.givenHate}`);
        
        if (groupKarma.history && groupKarma.history.length > 0) {
          console.log(`   📋 Últimas ${Math.min(3, groupKarma.history.length)} avaliações:`);
          groupKarma.history.slice(-3).forEach((entry, index) => {
            const date = new Date(entry.timestamp).toLocaleString('pt-BR');
            console.log(`     ${index + 1}. ${entry.karmaChange > 0 ? '+' : ''}${entry.karmaChange} pts - ${entry.evaluatorName || 'Anônimo'} (${date})`);
            if (entry.comment) {
              console.log(`        💬 "${entry.comment}"`);
            }
          });
        } else {
          console.log(`   📋 Nenhum histórico encontrado`);
        }
      } else {
        console.log(`\n👤 samyralmeida: Nenhum karma no grupo P2P`);
      }
    } catch (error) {
      console.log(`\n👤 samyralmeida: Erro - ${error.message}`);
    }
    
    // Testar comando de reputação
    console.log('\n🧪 Testando comando de reputação...');
    
    try {
      const karma = await karmaService.findKarmaByUserQuery('samyralmeida', -1002907400287);
      if (karma) {
        console.log('✅ Comando de reputação funcionaria corretamente');
        console.log(`   Karma encontrado: ${karma.karma} pontos`);
        
        // Determinar nível
        const scoreTotal = karma.karma || 0;
        let nivelConfianca = 'Iniciante';
        let nivelIcon = '🔰';
        
        if (scoreTotal < 0) {
          nivelConfianca = 'Problemático';
          nivelIcon = '🔴';
        } else if (scoreTotal < 50) {
          nivelConfianca = 'Iniciante';
          nivelIcon = '🔰';
        } else if (scoreTotal < 100) {
          nivelConfianca = 'Bronze';
          nivelIcon = '🥉';
        } else if (scoreTotal < 200) {
          nivelConfianca = 'Prata';
          nivelIcon = '🥈';
        } else if (scoreTotal < 500) {
          nivelConfianca = 'Ouro';
          nivelIcon = '🥇';
        } else {
          nivelConfianca = 'Mestre P2P';
          nivelIcon = '🏆';
        }
        
        console.log(`   Nível atual: ${nivelIcon} ${nivelConfianca}`);
      } else {
        console.log('❌ Comando de reputação não encontraria o usuário');
      }
    } catch (error) {
      console.log(`❌ Erro no teste de reputação: ${error.message}`);
    }
    
    console.log('\n✅ Verificação completa!');
    
  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  } finally {
    await app.close();
  }
}

verifyKarma();