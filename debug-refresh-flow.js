// Script para debugar o fluxo completo do refreshReputation
require('dotenv').config({ path: '.env.development' });
const { MongoClient, ObjectId } = require('mongodb');

async function debugRefreshFlow() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const usersCollection = db.collection('users');
    const karmaCollection = db.collection('karmas');
    const groupsCollection = db.collection('groups');
    
    console.log('\n🔄 SIMULANDO FLUXO DO REFRESH REPUTATION');
    console.log('=' .repeat(60));
    
    // ETAPA 1: refreshReputation recebe userId (provavelmente numérico)
    const userId = '30289486'; // ID do samyralmeida
    console.log(`\n📝 ETAPA 1: refreshReputation recebeu userId: "${userId}"`);
    
    // ETAPA 2: Verificar se é numérico e buscar usuário
    console.log(`\n🔍 ETAPA 2: Verificando se userId é numérico...`);
    const isNumeric = /^\d+$/.test(userId);
    console.log(`   ✅ É numérico: ${isNumeric}`);
    
    if (isNumeric) {
      console.log(`   🔍 Buscando usuário pelo ID ${userId}...`);
      const user = await usersCollection.findOne({ userId: parseInt(userId) });
      
      if (user) {
        console.log(`   ✅ Usuário encontrado:`, {
          userId: user.userId,
          userName: user.userName,
          firstName: user.firstName
        });
        
        // ETAPA 3: Determinar userIdentifier
        const userIdentifier = user.userName || user.firstName || userId;
        console.log(`   📝 userIdentifier determinado: "${userIdentifier}"`);
        
        // ETAPA 4: Criar fakeCtx com comando simulado
        const fakeCommand = `/start reputacao_${userIdentifier}`;
        console.log(`\n📝 ETAPA 3: Comando simulado criado: "${fakeCommand}"`);
        
        // ETAPA 5: Simular o que handle() faria
        console.log(`\n🔄 ETAPA 4: Simulando método handle()...`);
        
        // Extrair parâmetro do comando
        const match = fakeCommand.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
        const startParam = match?.[1];
        console.log(`   📝 startParam extraído: "${startParam}"`);
        
        if (startParam && startParam.startsWith('reputacao_')) {
          const extractedUserId = startParam.replace('reputacao_', '');
          console.log(`   📝 userId extraído do parâmetro: "${extractedUserId}"`);
          
          // ETAPA 6: Verificar se é numérico novamente
          const isNumericAgain = /^\d+$/.test(extractedUserId);
          console.log(`   🔍 É numérico novamente: ${isNumericAgain}`);
          
          let karmaData, targetUser;
          
          if (isNumericAgain) {
            console.log(`   🔍 Buscando usuário pelo ID ${extractedUserId}...`);
            const userAgain = await usersCollection.findOne({ userId: parseInt(extractedUserId) });
            if (userAgain) {
              console.log(`   ✅ Usuário encontrado novamente`);
              const userIdentifierAgain = userAgain.userName || userAgain.firstName || extractedUserId;
              console.log(`   📝 userIdentifier para busca de karma: "${userIdentifierAgain}"`);
              
              // Simular getTotalKarmaForUser
              console.log(`\n📊 ETAPA 5: Simulando getTotalKarmaForUser("${userIdentifierAgain}")...`);
              
              // Buscar todos os karmas do usuário
              const allKarmas = await karmaCollection.find({ user: userAgain._id }).toArray();
              console.log(`   📋 Encontrados ${allKarmas.length} documentos de karma`);
              
              let totalKarma = 0, totalGiven = 0, totalHate = 0;
              allKarmas.forEach(karma => {
                totalKarma += karma.karma || 0;
                totalGiven += karma.givenKarma || 0;
                totalHate += karma.givenHate || 0;
              });
              
              karmaData = {
                totalKarma,
                totalGiven,
                totalHate,
                user: userAgain
              };
              
              console.log(`   ✅ Karma total calculado:`, {
                totalKarma: karmaData.totalKarma,
                totalGiven: karmaData.totalGiven,
                totalHate: karmaData.totalHate
              });
              
              targetUser = userAgain;
              
              // ETAPA 7: Simular getKarmaForUserWithFallback
              console.log(`\n🔄 ETAPA 6: Simulando getKarmaForUserWithFallback...`);
              
              // Primeiro tentar buscar no grupo principal
              console.log(`   🔍 Tentando buscar karma no grupo principal (-1002907400287)...`);
              
              // Buscar grupo principal
              const mainGroup = await groupsCollection.findOne({ groupId: -1002907400287 });
              if (mainGroup) {
                console.log(`   ✅ Grupo principal encontrado: ${mainGroup._id}`);
                
                const mainGroupKarma = await karmaCollection.findOne({
                  user: targetUser._id,
                  group: mainGroup._id
                });
                
                if (mainGroupKarma) {
                  console.log(`   ✅ Karma encontrado no grupo principal:`);
                  console.log(`      Karma: ${mainGroupKarma.karma}`);
                  console.log(`      Contadores: 5⭐:${mainGroupKarma.stars5 || 0}, 4⭐:${mainGroupKarma.stars4 || 0}, 3⭐:${mainGroupKarma.stars3 || 0}, 2⭐:${mainGroupKarma.stars2 || 0}, 1⭐:${mainGroupKarma.stars1 || 0}`);
                  console.log(`      Histórico: ${mainGroupKarma.history ? mainGroupKarma.history.length : 0} entradas`);
                  
                  // Verificar condição de fallback
                  const hasHistory = mainGroupKarma.history && mainGroupKarma.history.length > 0;
                  const hasAnyStars = (mainGroupKarma.stars5 || 0) > 0 || 
                                    (mainGroupKarma.stars4 || 0) > 0 || 
                                    (mainGroupKarma.stars3 || 0) > 0 || 
                                    (mainGroupKarma.stars2 || 0) > 0 || 
                                    (mainGroupKarma.stars1 || 0) > 0;
                  
                  console.log(`      ✅ Tem histórico: ${hasHistory}`);
                  console.log(`      ✅ Tem contadores: ${hasAnyStars}`);
                  
                  const shouldUseFallback = !mainGroupKarma || (!hasHistory && !hasAnyStars);
                  console.log(`      🎯 Deveria usar fallback: ${shouldUseFallback}`);
                  
                  if (!shouldUseFallback) {
                    console.log(`\n✅ RESULTADO FINAL: Usando dados do grupo principal`);
                    console.log(`   Distribuição que seria exibida:`);
                    console.log(`   5⭐️: ${mainGroupKarma.stars5 || 0}      2⭐️: ${mainGroupKarma.stars2 || 0}`);
                    console.log(`   4⭐️: ${mainGroupKarma.stars4 || 0}      1⭐️: ${mainGroupKarma.stars1 || 0}`);
                    console.log(`   3⭐️: ${mainGroupKarma.stars3 || 0}`);
                    
                    // Verificar se algum contador é zero
                    const allZero = (mainGroupKarma.stars5 || 0) === 0 && 
                                   (mainGroupKarma.stars4 || 0) === 0 && 
                                   (mainGroupKarma.stars3 || 0) === 0 && 
                                   (mainGroupKarma.stars2 || 0) === 0 && 
                                   (mainGroupKarma.stars1 || 0) === 0;
                    
                    if (allZero) {
                      console.log(`   ❌ PROBLEMA ENCONTRADO: Todos os contadores são ZERO!`);
                    } else {
                      console.log(`   ✅ Contadores válidos encontrados`);
                    }
                  } else {
                    console.log(`\n⚠️  Entraria no fallback (buscar outros grupos)`);
                  }
                } else {
                  console.log(`   ❌ Karma NÃO encontrado no grupo principal`);
                  console.log(`   ⚠️  Entraria no fallback (buscar outros grupos)`);
                }
              } else {
                console.log(`   ❌ Grupo principal NÃO encontrado`);
              }
            } else {
              console.log(`   ❌ Usuário NÃO encontrado na segunda busca`);
            }
          } else {
            console.log(`   🔍 Não é numérico, buscando diretamente por nome: "${extractedUserId}"`);
            
            // ETAPA 7: Simular getTotalKarmaForUser por nome
            console.log(`\n📊 ETAPA 7: Simulando getTotalKarmaForUser por nome("${extractedUserId}")...`);
            
            // Buscar usuário por nome primeiro
            const userByName = await usersCollection.findOne({
              $or: [
                { userName: extractedUserId },
                { firstName: extractedUserId }
              ]
            });
            
            if (userByName) {
              console.log(`   ✅ Usuário encontrado por nome:`, {
                userId: userByName.userId,
                userName: userByName.userName,
                firstName: userByName.firstName
              });
              
              // Buscar todos os karmas do usuário
              const allKarmas = await karmaCollection.find({ user: userByName._id }).toArray();
              console.log(`   📋 Encontrados ${allKarmas.length} documentos de karma`);
              
              let totalKarma = 0, totalGiven = 0, totalHate = 0;
              allKarmas.forEach(karma => {
                totalKarma += karma.karma || 0;
                totalGiven += karma.givenKarma || 0;
                totalHate += karma.givenHate || 0;
              });
              
              karmaData = {
                totalKarma,
                totalGiven,
                totalHate,
                user: userByName
              };
              
              console.log(`   ✅ Karma total calculado:`, {
                totalKarma: karmaData.totalKarma,
                totalGiven: karmaData.totalGiven,
                totalHate: karmaData.totalHate
              });
              
              targetUser = karmaData.user;
              
              // ETAPA 8: Simular getKarmaForUserWithFallback
              console.log(`\n🔄 ETAPA 8: Simulando getKarmaForUserWithFallback...`);
              console.log(`   📝 targetUser:`, {
                userId: targetUser.userId,
                userName: targetUser.userName,
                firstName: targetUser.firstName
              });
              
              // Simular chatId (chat privado seria positivo)
              const chatId = 12345; // Chat privado simulado
              console.log(`   📝 chatId simulado: ${chatId}`);
              
              // Primeiro tentar buscar karma no grupo atual (que não existe)
              console.log(`   🔍 Tentando buscar karma no chat ${chatId}...`);
              const chatGroup = await groupsCollection.findOne({ groupId: chatId });
              
              if (!chatGroup) {
                console.log(`   ❌ Grupo ${chatId} não encontrado (esperado para chat privado)`);
                console.log(`   🔄 Fazendo fallback para getTotalKarmaForUser...`);
                
                // Aqui está o problema! O fallback usa getTotalKarmaForUser que NÃO retorna contadores
                console.log(`   ⚠️  PROBLEMA: getTotalKarmaForUser NÃO retorna contadores de estrelas!`);
                
                // Simular busca do grupo principal para histórico
                console.log(`   🔍 Buscando histórico do grupo principal (-1002907400287)...`);
                
                const mainGroup = await groupsCollection.findOne({ groupId: -1002907400287 });
                if (mainGroup) {
                  console.log(`   ✅ Grupo principal encontrado: ${mainGroup._id}`);
                  
                  const karmaWithHistory = await karmaCollection.findOne({
                    user: targetUser._id,
                    group: mainGroup._id
                  });
                  
                  if (karmaWithHistory) {
                    console.log(`   ✅ Karma com histórico encontrado:`);
                    console.log(`      Karma: ${karmaWithHistory.karma}`);
                    console.log(`      Contadores: 5⭐:${karmaWithHistory.stars5 || 0}, 4⭐:${karmaWithHistory.stars4 || 0}, 3⭐:${karmaWithHistory.stars3 || 0}, 2⭐:${karmaWithHistory.stars2 || 0}, 1⭐:${karmaWithHistory.stars1 || 0}`);
                    console.log(`      Histórico: ${karmaWithHistory.history ? karmaWithHistory.history.length : 0} entradas`);
                    
                    // Verificar condição de fallback corrigida
                    const hasHistory = karmaWithHistory.history && karmaWithHistory.history.length > 0;
                    const hasAnyStars = (karmaWithHistory.stars5 || 0) > 0 || 
                                      (karmaWithHistory.stars4 || 0) > 0 || 
                                      (karmaWithHistory.stars3 || 0) > 0 || 
                                      (karmaWithHistory.stars2 || 0) > 0 || 
                                      (karmaWithHistory.stars1 || 0) > 0;
                    
                    console.log(`      ✅ Tem histórico: ${hasHistory}`);
                    console.log(`      ✅ Tem contadores: ${hasAnyStars}`);
                    
                    const shouldUseFallback = !karmaWithHistory || (!hasHistory && !hasAnyStars);
                    console.log(`      🎯 Deveria usar fallback: ${shouldUseFallback}`);
                    
                    if (!shouldUseFallback) {
                      console.log(`\n✅ RESULTADO FINAL: Usando dados do grupo principal`);
                      console.log(`   Distribuição que seria exibida:`);
                      console.log(`   5⭐️: ${karmaWithHistory.stars5 || 0}      2⭐️: ${karmaWithHistory.stars2 || 0}`);
                      console.log(`   4⭐️: ${karmaWithHistory.stars4 || 0}      1⭐️: ${karmaWithHistory.stars1 || 0}`);
                      console.log(`   3⭐️: ${karmaWithHistory.stars3 || 0}`);
                      
                      // Verificar se algum contador é zero
                      const allZero = (karmaWithHistory.stars5 || 0) === 0 && 
                                     (karmaWithHistory.stars4 || 0) === 0 && 
                                     (karmaWithHistory.stars3 || 0) === 0 && 
                                     (karmaWithHistory.stars2 || 0) === 0 && 
                                     (karmaWithHistory.stars1 || 0) === 0;
                      
                      if (allZero) {
                        console.log(`   ❌ PROBLEMA ENCONTRADO: Todos os contadores são ZERO!`);
                      } else {
                        console.log(`   ✅ Contadores válidos encontrados - DEVERIA FUNCIONAR!`);
                      }
                    } else {
                      console.log(`\n⚠️  Entraria no fallback (buscar outros grupos)`);
                    }
                  } else {
                    console.log(`   ❌ Karma com histórico NÃO encontrado no grupo principal`);
                  }
                } else {
                  console.log(`   ❌ Grupo principal NÃO encontrado`);
                }
              }
            } else {
              console.log(`   ❌ Usuário NÃO encontrado por nome`);
            }
          }
        }
      } else {
        console.log(`   ❌ Usuário NÃO encontrado`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar o debug
debugRefreshFlow().catch(console.error);