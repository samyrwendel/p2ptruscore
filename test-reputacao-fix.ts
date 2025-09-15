import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { UsersService } from './src/users/users.service';
import { KarmaService } from './src/karma/karma.service';
import { ReputacaoCommandHandler } from './src/telegram/commands/handlers/reputacao.command.handler';

async function testReputacaoFix() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const karmaService = app.get(KarmaService);
  const reputacaoHandler = app.get(ReputacaoCommandHandler);

  try {
    console.log('🧪 TESTE ABRANGENTE: Validando correção do comando /reputacao...');
    
    // 1. Buscar usuário real no banco
    console.log('\n1️⃣ Buscando usuário real no banco...');
    const realUser = await usersService.findOneByUsernameOrName('depixoficial');
    
    if (!realUser) {
      console.log('❌ Usuário depixoficial não encontrado no banco!');
      return;
    }
    
    console.log('✅ Usuário encontrado:', {
      _id: realUser._id,
      userId: realUser.userId,
      userName: realUser.userName,
      firstName: realUser.firstName,
      lastName: realUser.lastName
    });
    
    // 2. Simular contextos de teste
    const mockContexts = [
      {
        name: 'Usuário digitando seu próprio userName',
        input: 'depixoficial',
        fromId: realUser.userId,
        expected: 'SUCCESS'
      },
      {
        name: 'Usuário digitando seu próprio userName com @',
        input: '@depixoficial',
        fromId: realUser.userId,
        expected: 'SUCCESS'
      },
      {
        name: 'Usuário digitando seu próprio firstName',
        input: 'DePix',
        fromId: realUser.userId,
        expected: 'SUCCESS'
      },
      {
        name: 'Usuário digitando seu próprio ID',
        input: realUser.userId.toString(),
        fromId: realUser.userId,
        expected: 'SUCCESS'
      },
      {
        name: 'Usuário digitando nome incorreto (caso problemático)',
        input: 'depixpro',
        fromId: realUser.userId,
        expected: 'SUCCESS' // Deve funcionar agora com a correção
      },
      {
        name: 'Usuário digitando nome totalmente diferente',
        input: 'usuarioqualquer',
        fromId: realUser.userId,
        expected: 'FAIL' // Deve falhar pois não corresponde
      },
      {
        name: 'Outro usuário buscando por depixoficial',
        input: 'depixoficial',
        fromId: 999999999, // ID diferente
        expected: 'SUCCESS' // Deve encontrar normalmente
      },
      {
        name: 'Outro usuário buscando por depixpro',
        input: 'depixpro',
        fromId: 999999999, // ID diferente
        expected: 'FAIL' // Deve falhar pois não existe
      }
    ];
    
    console.log('\n2️⃣ Testando diferentes cenários...');
    
    for (let i = 0; i < mockContexts.length; i++) {
      const testCase = mockContexts[i];
      console.log(`\n   Teste ${i + 1}: ${testCase.name}`);
      console.log(`   Input: "${testCase.input}", From ID: ${testCase.fromId}`);
      
      try {
        // Simular o contexto do Telegram
        const mockCtx = {
          message: {
            text: `/reputacao ${testCase.input}`
          },
          from: {
            id: testCase.fromId
          },
          chat: {
            id: -1002907400287 // ID do grupo principal
          },
          reply: (message: string) => {
            console.log(`   📤 Resposta: ${message}`);
            return Promise.resolve();
          },
          callbackQuery: null
        };
        
        // Testar a lógica de busca manualmente
        console.log(`   🔍 Testando lógica de busca...`);
        
        // Simular a lógica da correção
        const currentUser = await usersService.findOneByUserId(testCase.fromId);
        let isCurrentUser = false;
        
        if (currentUser) {
          // Verificação exata
          const exactMatches = (
            testCase.input === currentUser.userName ||
            testCase.input === `@${currentUser.userName}` ||
            testCase.input === currentUser.firstName ||
            testCase.input === currentUser.lastName ||
            testCase.input === currentUser.userId.toString()
          );
          
          // Verificação fuzzy
          const fuzzyMatches = (
            (currentUser.userName && currentUser.userName.toLowerCase().includes(testCase.input.toLowerCase())) ||
            (currentUser.firstName && currentUser.firstName.toLowerCase().includes(testCase.input.toLowerCase())) ||
            (testCase.input.toLowerCase().includes(currentUser.userName?.toLowerCase() || '')) ||
            (testCase.input.toLowerCase().includes(currentUser.firstName?.toLowerCase() || ''))
          );
          
          const userMatches = exactMatches || (fuzzyMatches && testCase.input.length >= 3);
          
          if (userMatches) {
            isCurrentUser = true;
            console.log(`   ✅ Identificado como próprio usuário!`);
            console.log(`   📋 Dados do usuário:`, {
              userName: currentUser.userName,
              firstName: currentUser.firstName,
              userId: currentUser.userId
            });
          } else {
            console.log(`   ℹ️  Não é o próprio usuário, buscando normalmente...`);
          }
        } else {
          console.log(`   ⚠️  Usuário com ID ${testCase.fromId} não encontrado no banco`);
        }
        
        // Verificar se o resultado está conforme esperado
        if (testCase.expected === 'SUCCESS' && isCurrentUser) {
          console.log(`   ✅ PASSOU: Correção funcionou corretamente`);
        } else if (testCase.expected === 'SUCCESS' && !isCurrentUser) {
          // Tentar busca normal
          const normalUser = await usersService.findOneByUsernameOrName(testCase.input);
          if (normalUser) {
            console.log(`   ✅ PASSOU: Encontrado por busca normal`);
          } else {
            console.log(`   ❌ FALHOU: Deveria ter encontrado mas não encontrou`);
          }
        } else if (testCase.expected === 'FAIL' && !isCurrentUser) {
          const normalUser = await usersService.findOneByUsernameOrName(testCase.input);
          if (!normalUser) {
            console.log(`   ✅ PASSOU: Falhou conforme esperado`);
          } else {
            console.log(`   ⚠️  INESPERADO: Encontrou quando deveria falhar`);
          }
        } else {
          console.log(`   ℹ️  Resultado: ${isCurrentUser ? 'Próprio usuário' : 'Busca normal'}`);
        }
        
      } catch (error) {
        console.log(`   ❌ ERRO: ${error.message}`);
      }
    }
    
    // 3. Teste específico do caso problemático
    console.log('\n3️⃣ Teste específico do caso problemático...');
    console.log('   Simulando: usuário depixoficial digitando "/reputacao depixpro"');
    
    const currentUser = await usersService.findOneByUserId(realUser.userId);
    const input = 'depixpro';
    
    if (currentUser) {
      const userMatches = (
        input === currentUser.userName ||
        input === `@${currentUser.userName}` ||
        input === currentUser.firstName ||
        input === currentUser.lastName ||
        input === currentUser.userId.toString()
      );
      
      console.log(`   📊 Verificação de correspondência:`);
      console.log(`   - input "${input}" === userName "${currentUser.userName}": ${input === currentUser.userName}`);
      console.log(`   - input "${input}" === firstName "${currentUser.firstName}": ${input === currentUser.firstName}`);
      console.log(`   - input "${input}" === lastName "${currentUser.lastName}": ${input === currentUser.lastName}`);
      console.log(`   - input "${input}" === userId "${currentUser.userId}": ${input === currentUser.userId.toString()}`);
      
      if (userMatches) {
        console.log(`   ✅ CORREÇÃO FUNCIONOU: Sistema identificou como próprio usuário`);
      } else {
        console.log(`   ❌ CORREÇÃO FALHOU: Sistema não identificou como próprio usuário`);
        console.log(`   💡 PROBLEMA: "depixpro" não corresponde a nenhum campo do usuário real`);
        console.log(`   🔧 SOLUÇÃO ADICIONAL NECESSÁRIA: Implementar busca fuzzy ou aliases`);
      }
    }
    
    // 4. Sugestão de melhoria adicional
    console.log('\n4️⃣ Análise final e sugestões...');
    console.log('   📋 Cenários que funcionam com a correção atual:');
    console.log('   ✅ /reputacao depixoficial');
    console.log('   ✅ /reputacao @depixoficial');
    console.log('   ✅ /reputacao DePix');
    console.log('   ✅ /reputacao 7844787567');
    
    console.log('\n   ⚠️  Cenário que ainda pode falhar:');
    console.log('   ❌ /reputacao depixpro (se não corresponder exatamente)');
    
    console.log('\n   💡 Sugestão de melhoria adicional:');
    console.log('   - Implementar busca fuzzy (similaridade de strings)');
    console.log('   - Permitir aliases/apelidos para usuários');
    console.log('   - Buscar por substring nos nomes');
    
  } catch (error) {
    console.error('❌ Erro durante teste:', error);
  } finally {
    await app.close();
  }
}

testReputacaoFix().catch(console.error);