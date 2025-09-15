// Script para testar o fluxo de reputação e identificar onde a distribuição está sumindo
require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

async function testReputationFlow() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const usersCollection = db.collection('users');
    const karmaCollection = db.collection('karmas');
    
    // Buscar usuário samyralmeida
    console.log('\n👤 Buscando usuário samyralmeida...');
    const user = await usersCollection.findOne({
      $or: [
        { userName: 'samyralmeida' },
        { firstName: 'samyralmeida' }
      ]
    });
    
    if (!user) {
      console.log('❌ Usuário samyralmeida não encontrado');
      return;
    }
    
    console.log('✅ Usuário encontrado:', {
      userId: user.userId,
      userName: user.userName,
      firstName: user.firstName
    });
    
    // Buscar karma do usuário no grupo principal
    console.log('\n📊 Buscando karma no grupo principal (-1002907400287)...');
    const karmaDoc = await karmaCollection.findOne({
      user: user._id,
      group: -1002907400287
    });
    
    if (!karmaDoc) {
      console.log('❌ Karma não encontrado no grupo principal');
      
      // Buscar em todos os grupos
      console.log('\n🔍 Buscando karma em todos os grupos...');
      const allKarma = await karmaCollection.find({ user: user._id }).toArray();
      console.log(`📋 Encontrados ${allKarma.length} documentos de karma`);
      
      allKarma.forEach((doc, index) => {
        console.log(`\n📄 Documento ${index + 1}:`);
        console.log(`  Group: ${doc.group}`);
        console.log(`  Karma: ${doc.karma}`);
        console.log(`  Contadores: 5⭐:${doc.stars5 || 0}, 4⭐:${doc.stars4 || 0}, 3⭐:${doc.stars3 || 0}, 2⭐:${doc.stars2 || 0}, 1⭐:${doc.stars1 || 0}`);
        console.log(`  Histórico: ${doc.history ? doc.history.length : 0} entradas`);
      });
      
      return;
    }
    
    console.log('✅ Karma encontrado no grupo principal:');
    console.log(`  Karma Total: ${karmaDoc.karma}`);
    console.log(`  Given Karma: ${karmaDoc.givenKarma || 0}`);
    console.log(`  Given Hate: ${karmaDoc.givenHate || 0}`);
    console.log(`  Contadores de estrelas:`);
    console.log(`    5⭐: ${karmaDoc.stars5 || 0}`);
    console.log(`    4⭐: ${karmaDoc.stars4 || 0}`);
    console.log(`    3⭐: ${karmaDoc.stars3 || 0}`);
    console.log(`    2⭐: ${karmaDoc.stars2 || 0}`);
    console.log(`    1⭐: ${karmaDoc.stars1 || 0}`);
    console.log(`  Histórico: ${karmaDoc.history ? karmaDoc.history.length : 0} entradas`);
    
    if (karmaDoc.history && karmaDoc.history.length > 0) {
      console.log('\n📋 Últimas 5 avaliações:');
      const recent = karmaDoc.history.slice(-5);
      recent.forEach((entry, index) => {
        console.log(`  ${index + 1}. ${entry.starRating ? entry.starRating + '⭐' : (entry.karmaChange > 0 ? '👍' : '👎')}: "${entry.comment || 'Sem comentário'}"`);
      });
    }
    
    // Simular o que o getKarmaForUserWithFallback faria
    console.log('\n🔄 Simulando getKarmaForUserWithFallback...');
    
    // Primeiro tentar buscar karma no grupo atual (chat privado seria positivo)
    const chatId = 12345; // Simular chat privado
    console.log(`Tentando buscar karma no chat ${chatId}...`);
    
    const groupKarma = await karmaCollection.findOne({
      user: user._id,
      group: chatId
    });
    
    if (!groupKarma) {
      console.log('❌ Não encontrado no chat atual, fazendo fallback...');
      
      // Simular busca de karma total (isso não retorna contadores)
      console.log('📊 Karma total seria buscado via KarmaService.getTotalKarmaForUser');
      console.log('⚠️  Esse método NÃO retorna contadores de estrelas!');
      
      // Simular busca do histórico do grupo principal
      console.log('🔍 Buscando histórico do grupo principal para contadores...');
      const karmaWithHistory = await karmaCollection.findOne({
        user: user._id,
        group: -1002907400287
      });
      
      if (karmaWithHistory) {
        console.log('✅ Histórico encontrado com contadores:');
        console.log(`  5⭐: ${karmaWithHistory.stars5 || 0}`);
        console.log(`  4⭐: ${karmaWithHistory.stars4 || 0}`);
        console.log(`  3⭐: ${karmaWithHistory.stars3 || 0}`);
        console.log(`  2⭐: ${karmaWithHistory.stars2 || 0}`);
        console.log(`  1⭐: ${karmaWithHistory.stars1 || 0}`);
        console.log(`  Histórico: ${karmaWithHistory.history ? karmaWithHistory.history.length : 0} entradas`);
      } else {
        console.log('❌ Histórico não encontrado no grupo principal!');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o teste
testReputationFlow().catch(console.error);