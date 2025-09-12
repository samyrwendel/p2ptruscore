import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { KarmaService } from './src/karma/karma.service';
import { UsersService } from './src/users/users.service';

async function fixKarmaTotal() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const karmaService = app.get(KarmaService);
  const usersService = app.get(UsersService);

  try {
    console.log('🔧 Corrigindo karma total do usuário samyralmeida...');
    
    // 1. Buscar usuário por diferentes métodos
    console.log('\n1️⃣ Buscando usuário por userName...');
    let user = await usersService.findOneByUsernameOrName('samyralmeida');
    
    if (!user) {
      console.log('❌ Usuário não encontrado por userName');
    }
    
    if (!user) {
      console.log('❌ Usuário samyralmeida não encontrado em nenhum método!');
      return;
    }
    
    console.log(`✅ Usuário encontrado:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   userName: ${user.userName}`);
    console.log(`   firstName: ${user.firstName}`);
    console.log(`   userName: ${user.userName}`);
    
    // 2. Buscar karma total usando getTotalKarmaForUser
    console.log('\n2️⃣ Testando getTotalKarmaForUser...');
    const totalKarma1 = await karmaService.getTotalKarmaForUser('samyralmeida');
    console.log('Resultado com "samyralmeida":', totalKarma1);
    
    if (user.userName) {
      const totalKarma2 = await karmaService.getTotalKarmaForUser(user.userName);
      console.log(`Resultado com userName "${user.userName}":`, totalKarma2);
    }
    
    if (user.firstName) {
      const totalKarma3 = await karmaService.getTotalKarmaForUser(user.firstName);
      console.log(`Resultado com firstName "${user.firstName}":`, totalKarma3);
    }
    
    // 3. Buscar karma diretamente no repositório
    console.log('\n3️⃣ Buscando karma diretamente no repositório...');
    const karmaRepository = app.get('KarmaRepository');
    const karmaRecords = await karmaRepository.findByUserId(user._id);
    
    console.log(`📊 Registros de karma encontrados: ${karmaRecords.length}`);
    
    let totalKarmaSum = 0;
    let totalGivenSum = 0;
    let totalHateSum = 0;
    
    karmaRecords.forEach((record, index) => {
      console.log(`   ${index + 1}. Karma: ${record.karma}, Given: ${record.givenKarma}, Hate: ${record.givenHate}`);
      totalKarmaSum += record.karma || 0;
      totalGivenSum += record.givenKarma || 0;
      totalHateSum += record.givenHate || 0;
    });
    
    console.log(`\n📈 Totais calculados manualmente:`);
    console.log(`   ⭐ Karma total: ${totalKarmaSum}`);
    console.log(`   👍 Positivas dadas: ${totalGivenSum}`);
    console.log(`   👎 Negativas dadas: ${totalHateSum}`);
    
    // 4. Verificar se o problema está na função findOneByUsernameOrName
    console.log('\n4️⃣ Testando findOneByUsernameOrName...');
    const testUser = await usersService.findOneByUsernameOrName('samyralmeida');
    console.log('Resultado findOneByUsernameOrName:', testUser ? 'Encontrado' : 'Não encontrado');
    
    if (testUser) {
      console.log(`   ID: ${testUser._id}`);
      console.log(`   userName: ${testUser.userName}`);
      console.log(`   firstName: ${testUser.firstName}`);
    }
    
    console.log('\n✅ Diagnóstico completo!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await app.close();
  }
}

fixKarmaTotal();