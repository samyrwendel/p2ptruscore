// Script para testar especificamente o método getKarmaForUser com grupos reais
require('dotenv').config({ path: '.env.development' });
const { MongoClient, ObjectId } = require('mongodb');

async function testGetKarmaForUser() {
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
      firstName: user.firstName,
      _id: user._id
    });
    
    // Buscar todos os karmas do usuário
    console.log('\n📊 Buscando todos os karmas do usuário...');
    const userKarmas = await karmaCollection.find({ user: user._id }).toArray();
    console.log(`📋 Encontrados ${userKarmas.length} documentos de karma`);
    
    // Para cada karma, buscar informações do grupo
    for (let i = 0; i < userKarmas.length; i++) {
      const karma = userKarmas[i];
      console.log(`\n📄 Documento ${i + 1}:`);
      console.log(`  Karma ID: ${karma._id}`);
      console.log(`  Group ID: ${karma.group}`);
      console.log(`  Karma: ${karma.karma}`);
      console.log(`  Contadores: 5⭐:${karma.stars5 || 0}, 4⭐:${karma.stars4 || 0}, 3⭐:${karma.stars3 || 0}, 2⭐:${karma.stars2 || 0}, 1⭐:${karma.stars1 || 0}`);
      console.log(`  Histórico: ${karma.history ? karma.history.length : 0} entradas`);
      
      // Buscar informações do grupo
      let groupInfo = null;
      if (ObjectId.isValid(karma.group)) {
        groupInfo = await groupsCollection.findOne({ _id: karma.group });
      } else {
        groupInfo = await groupsCollection.findOne({ groupId: karma.group });
      }
      
      if (groupInfo) {
        console.log(`  Grupo: ${groupInfo.title || 'Sem título'} (ID: ${groupInfo.groupId})`);
        
        // Simular o que getKarmaForUser faria
        console.log(`\n🔍 Simulando getKarmaForUser(${user.userId}, ${groupInfo.groupId})...`);
        
        const simulatedKarma = await karmaCollection.findOne({
          user: user._id,
          group: groupInfo._id
        });
        
        if (simulatedKarma) {
          console.log('✅ Resultado simulado do getKarmaForUser:');
          console.log(`    Karma: ${simulatedKarma.karma}`);
          console.log(`    Contadores: 5⭐:${simulatedKarma.stars5 || 0}, 4⭐:${simulatedKarma.stars4 || 0}, 3⭐:${simulatedKarma.stars3 || 0}, 2⭐:${simulatedKarma.stars2 || 0}, 1⭐:${simulatedKarma.stars1 || 0}`);
          console.log(`    Histórico: ${simulatedKarma.history ? simulatedKarma.history.length : 0} entradas`);
          
          // Verificar se tem contadores válidos
          const hasValidCounters = (simulatedKarma.stars5 || 0) > 0 || 
                                 (simulatedKarma.stars4 || 0) > 0 || 
                                 (simulatedKarma.stars3 || 0) > 0 || 
                                 (simulatedKarma.stars2 || 0) > 0 || 
                                 (simulatedKarma.stars1 || 0) > 0;
          
          const hasHistory = simulatedKarma.history && simulatedKarma.history.length > 0;
          
          console.log(`    ✅ Tem contadores válidos: ${hasValidCounters}`);
          console.log(`    ✅ Tem histórico: ${hasHistory}`);
          
          if (hasValidCounters || hasHistory) {
            console.log(`    🎯 Este grupo seria SELECIONADO pelo fallback!`);
          } else {
            console.log(`    ⚠️  Este grupo seria IGNORADO pelo fallback`);
          }
        } else {
          console.log('❌ Não encontrado na simulação (problema na busca)');
        }
      } else {
        console.log(`  ❌ Grupo não encontrado para ID: ${karma.group}`);
      }
    }
    
    // Testar o método getGroupsForUser simulado
    console.log('\n🔍 Simulando getGroupsForUser...');
    const userGroups = await karmaCollection.aggregate([
      { $match: { user: user._id } },
      { $lookup: {
          from: 'groups',
          localField: 'group',
          foreignField: '_id',
          as: 'groupInfo'
        }
      },
      { $unwind: '$groupInfo' },
      { $project: {
          groupId: '$groupInfo.groupId',
          title: '$groupInfo.title'
        }
      }
    ]).toArray();
    
    console.log(`📋 Grupos encontrados via aggregation: ${userGroups.length}`);
    userGroups.forEach((group, index) => {
      console.log(`  ${index + 1}. Group ID: ${group.groupId}, Título: ${group.title || 'Sem título'}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o teste
testGetKarmaForUser().catch(console.error);