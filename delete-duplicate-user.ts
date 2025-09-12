import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { UsersService } from './src/users/users.service';
import { KarmaService } from './src/karma/karma.service';
import { UsersRepository } from './src/users/users.repository';

async function deleteDuplicateUser() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const karmaService = app.get(KarmaService);
  const usersRepository = app.get(UsersRepository);

  try {
    console.log('🔧 Deletando usuário duplicado...');
    
    // Verificar transferência de karma
    console.log('\n🔍 Verificando transferência de karma...');
    const totalKarma = await karmaService.getTotalKarmaForUser('samyralmeida');
    
    if (totalKarma && totalKarma.totalKarma > 0) {
      console.log(`✅ Karma transferido com sucesso: ${totalKarma.totalKarma} pontos`);
    } else {
      console.log('⚠️ Karma ainda não aparece na busca total');
    }
    
    // Listar usuários antes da deleção
    console.log('\n📋 Usuários antes da deleção:');
    const usersBefore = await usersRepository.find({ userName: 'samyralmeida' });
    usersBefore.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user._id}, userId: ${user.userId}`);
    });
    
    // Deletar o usuário duplicado (ID: 68c1c449304628feca8eee85)
    console.log('\n🗑️ Deletando usuário duplicado...');
    const duplicateUserId = '68c1c449304628feca8eee85';
    
    try {
       // Usar o modelo diretamente para deletar
       const deleteResult = await usersRepository['model'].deleteOne({ _id: duplicateUserId });
       
       if (deleteResult.deletedCount && deleteResult.deletedCount > 0) {
         console.log('✅ Usuário duplicado deletado com sucesso!');
       } else {
         console.log('❌ Nenhum usuário foi deletado');
       }
     } catch (deleteError) {
       console.error('❌ Erro ao deletar usuário:', deleteError.message);
     }
    
    // Verificação final
    console.log('\n📋 Usuários após a deleção:');
    const usersAfter = await usersRepository.find({ userName: 'samyralmeida' });
    usersAfter.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user._id}, userId: ${user.userId}`);
    });
    
    console.log(`\n📊 Total de usuários restantes: ${usersAfter.length}`);
    
    // Verificar karma final
    console.log('\n🔍 Verificação final do karma...');
    const finalKarma = await karmaService.getTotalKarmaForUser('samyralmeida');
    
    if (finalKarma) {
      console.log(`✅ Karma final: ${finalKarma.totalKarma} pontos`);
      console.log(`✅ Positivas dadas: ${finalKarma.totalGiven}`);
      console.log(`✅ Negativas dadas: ${finalKarma.totalHate}`);
    } else {
      console.log('❌ Karma não encontrado após limpeza');
    }
    
    console.log('\n✅ Processo de limpeza concluído!');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  } finally {
    await app.close();
  }
}

deleteDuplicateUser();