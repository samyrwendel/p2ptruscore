// Comando temporário para adicionar karma via sistema
// Execute: npx ts-node add-karma-command.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { KarmaService } from './src/karma/karma.service';
import { UsersService } from './src/users/users.service';

async function addKarmaToUser() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const karmaService = app.get(KarmaService);
    const usersService = app.get(UsersService);
    
    console.log('🔍 Procurando usuário samyralmeida...');
    
    // Buscar usuário por username ou nome
    const userData = {
      id: 123456789, // ID temporário
      username: 'samyralmeida',
      first_name: 'Samyr',
      last_name: 'Almeida'
    };
    
    // Criar ou encontrar usuário
    const user = await usersService.findOrCreate(userData);
    console.log('✅ Usuário encontrado/criado:', user.userName || user.firstName);
    
    // Dados do grupo (usar um grupo padrão)
    const groupData = {
      id: -1002907400287, // ID do grupo P2P
      title: 'Grupo P2P TrustScore',
      type: 'supergroup' as const
    };
    
    // Dados do avaliador (sistema)
    const evaluatorData = {
      id: 999999999, // ID único para sistema administrativo
      username: 'sistema',
      first_name: 'Sistema',
      last_name: 'Admin'
    };
    
    console.log('💎 Adicionando 501 pontos de karma...');
    
    // Registrar avaliação positiva de 501 pontos
    const result = await karmaService.registerEvaluation(
      evaluatorData,
      userData,
      groupData,
      501,
      'Pontos administrativos'
    );
    
    console.log('✅ Karma adicionado com sucesso!');
    console.log('📊 Karma total:', result.evaluatedKarma.karma);
    console.log('🏆 Novo nível: Mestre P2P (501+ pontos)');
    
  } catch (error) {
    console.error('❌ Erro ao adicionar karma:', error);
  } finally {
    await app.close();
  }
}

addKarmaToUser();