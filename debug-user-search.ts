import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { UsersService } from './src/users/users.service';
import { KarmaService } from './src/karma/karma.service';

async function debugUserSearch() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const karmaService = app.get(KarmaService);

  try {
    console.log('🔍 DEBUG: Analisando busca do usuário "depixpro"...');
    
    // 1. Verificar se o usuário existe no banco por diferentes métodos
    console.log('\n1️⃣ Buscando por findOneByUsernameOrName("depixpro")...');
    const userByName = await usersService.findOneByUsernameOrName('depixpro');
    console.log('Resultado:', userByName ? {
      _id: userByName._id,
      userId: userByName.userId,
      userName: userByName.userName,
      firstName: userByName.firstName,
      lastName: userByName.lastName
    } : 'null');
    
    // 2. Buscar por variações do nome
    console.log('\n2️⃣ Testando variações do nome...');
    const variations = ['depixpro', '@depixpro', 'depixoficial', '@depixoficial'];
    
    for (const variation of variations) {
      console.log(`\n   Testando "${variation}"...`);
      const user = await usersService.findOneByUsernameOrName(variation);
      if (user) {
        console.log(`   ✅ ENCONTRADO:`, {
          _id: user._id,
          userId: user.userId,
          userName: user.userName,
          firstName: user.firstName,
          lastName: user.lastName
        });
      } else {
        console.log(`   ❌ Não encontrado`);
      }
    }
    
    // 3. Buscar por ID específico (assumindo que é o usuário que está testando)
    console.log('\n3️⃣ Buscando usuários por IDs conhecidos...');
    const knownIds = [1234567890, 987654321]; // IDs de exemplo
    
    for (const id of knownIds) {
      console.log(`\n   Testando ID ${id}...`);
      const user = await usersService.findOneByUserId(id);
      if (user) {
        console.log(`   ✅ ENCONTRADO:`, {
          _id: user._id,
          userId: user.userId,
          userName: user.userName,
          firstName: user.firstName,
          lastName: user.lastName
        });
        
        // Testar getTotalKarmaForUser com os dados reais
        console.log(`\n   📊 Testando getTotalKarmaForUser com dados reais...`);
        if (user.userName) {
          const karmaByUserName = await karmaService.getTotalKarmaForUser(user.userName);
          console.log(`   Karma por userName "${user.userName}":`, karmaByUserName);
        }
        if (user.firstName) {
          const karmaByFirstName = await karmaService.getTotalKarmaForUser(user.firstName);
          console.log(`   Karma por firstName "${user.firstName}":`, karmaByFirstName);
        }
      } else {
        console.log(`   ❌ Não encontrado`);
      }
    }
    
    // 4. Listar todos os usuários para ver o que existe no banco
    console.log('\n4️⃣ Listando primeiros 10 usuários do banco...');
    const usersRepository = app.get('UsersRepository');
    const allUsers = await usersRepository.model.find({}).limit(10).exec();
    
    console.log(`\n   📋 Total de usuários encontrados: ${allUsers.length}`);
    allUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ID: ${user.userId}, userName: "${user.userName}", firstName: "${user.firstName}", lastName: "${user.lastName}"`);
    });
    
    // 5. Testar busca case-insensitive
    console.log('\n5️⃣ Testando busca case-insensitive...');
    const caseVariations = ['DEPIXPRO', 'DepixPro', 'depixPRO'];
    
    for (const variation of caseVariations) {
      console.log(`\n   Testando "${variation}"...`);
      const user = await usersService.findOneByUsernameOrName(variation);
      if (user) {
        console.log(`   ✅ ENCONTRADO:`, {
          userName: user.userName,
          firstName: user.firstName
        });
      } else {
        console.log(`   ❌ Não encontrado`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro durante debug:', error);
  } finally {
    await app.close();
  }
}

debugUserSearch().catch(console.error);