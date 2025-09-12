import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { KarmaService } from './src/karma/karma.service';
import { UsersService } from './src/users/users.service';
import { KarmaRepository } from './src/karma/karma.repository';

async function checkKarmaDB() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const karmaService = app.get(KarmaService);
  const usersService = app.get(UsersService);
  const karmaRepository = app.get(KarmaRepository);

  try {
    console.log('🔍 Verificando karma no banco de dados...');
    
    // 1. Buscar usuário
    const user = await usersService.findOneByUsernameOrName('samyralmeida');
    if (!user) {
      console.log('❌ Usuário não encontrado!');
      return;
    }
    
    console.log(`✅ Usuário encontrado: ${user.userName} (ID: ${user._id})`);
    
    // 2. Buscar registros de karma diretamente
    console.log('\n🔍 Buscando registros de karma...');
    const karmaRecords = await karmaRepository.findByUserId(user._id);
    
    console.log(`📊 Total de registros encontrados: ${karmaRecords.length}`);
    
    if (karmaRecords.length === 0) {
      console.log('❌ Nenhum registro de karma encontrado!');
      return;
    }
    
    // 3. Mostrar cada registro
    let totalKarma = 0;
    let totalGiven = 0;
    let totalHate = 0;
    
    karmaRecords.forEach((record, index) => {
      console.log(`\n📋 Registro ${index + 1}:`);
      console.log(`   Karma: ${record.karma || 0}`);
      console.log(`   Given: ${record.givenKarma || 0}`);
      console.log(`   Hate: ${record.givenHate || 0}`);
      console.log(`   Group: ${record.group}`);
      
      totalKarma += record.karma || 0;
      totalGiven += record.givenKarma || 0;
      totalHate += record.givenHate || 0;
    });
    
    console.log(`\n📈 Totais calculados:`);
    console.log(`   ⭐ Total Karma: ${totalKarma}`);
    console.log(`   👍 Total Given: ${totalGiven}`);
    console.log(`   👎 Total Hate: ${totalHate}`);
    
    // 4. Comparar com getTotalKarmaForUser
    console.log('\n🔄 Comparando com getTotalKarmaForUser...');
    const serviceResult = await karmaService.getTotalKarmaForUser('samyralmeida');
    
    if (serviceResult) {
      console.log(`   Service Total Karma: ${serviceResult.totalKarma}`);
      console.log(`   Service Total Given: ${serviceResult.totalGiven}`);
      console.log(`   Service Total Hate: ${serviceResult.totalHate}`);
      
      if (serviceResult.totalKarma !== totalKarma) {
        console.log('❌ DISCREPÂNCIA ENCONTRADA!');
        console.log(`   Esperado: ${totalKarma}`);
        console.log(`   Retornado: ${serviceResult.totalKarma}`);
      } else {
        console.log('✅ Valores coincidem!');
      }
    } else {
      console.log('❌ Service retornou null!');
    }
    
    console.log('\n✅ Verificação completa!');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await app.close();
  }
}

checkKarmaDB();