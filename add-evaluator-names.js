// Script para adicionar nomes de avaliadores às avaliações existentes
require('dotenv').config({ path: '.env.development' });
const { MongoClient, ObjectId } = require('mongodb');

async function addEvaluatorNames() {
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
    
    // Buscar documentos de karma do usuário
    console.log('\n📊 Buscando documentos de karma...');
    const karmaDocuments = await karmaCollection.find({ user: user._id }).toArray();
    console.log(`📋 Encontrados ${karmaDocuments.length} documentos de karma`);
    
    // Lista de avaliadores para usar
    const evaluators = ['depixpro', 'raquelojk'];
    let evaluatorIndex = 0;
    
    // Atualizar cada documento de karma
    for (let i = 0; i < karmaDocuments.length; i++) {
      const karmaDoc = karmaDocuments[i];
      console.log(`\n📄 Processando documento ${i + 1}...`);
      console.log(`  Karma: ${karmaDoc.karma}`);
      console.log(`  Histórico: ${karmaDoc.history ? karmaDoc.history.length : 0} entradas`);
      
      if (karmaDoc.history && karmaDoc.history.length > 0) {
        let updated = false;
        
        // Atualizar entradas do histórico que não têm evaluatorName
        karmaDoc.history.forEach((entry, index) => {
          if (!entry.evaluatorName) {
            // Alternar entre os avaliadores
            entry.evaluatorName = evaluators[evaluatorIndex % evaluators.length];
            evaluatorIndex++;
            updated = true;
            console.log(`    Entrada ${index + 1}: Adicionado avaliador @${entry.evaluatorName}`);
          } else {
            console.log(`    Entrada ${index + 1}: Já tem avaliador @${entry.evaluatorName}`);
          }
        });
        
        if (updated) {
          // Salvar as alterações
          const result = await karmaCollection.updateOne(
            { _id: karmaDoc._id },
            { $set: { history: karmaDoc.history } }
          );
          
          if (result.modifiedCount > 0) {
            console.log(`  ✅ Documento atualizado com sucesso`);
          } else {
            console.log(`  ⚠️  Documento não foi modificado`);
          }
        } else {
          console.log(`  ℹ️  Nenhuma atualização necessária`);
        }
      } else {
        console.log(`  ℹ️  Sem histórico para atualizar`);
      }
    }
    
    console.log('\n✅ Processo concluído!');
    
    // Verificar resultado final
    console.log('\n🔍 Verificando resultado final...');
    const updatedKarmaDocuments = await karmaCollection.find({ user: user._id }).toArray();
    
    updatedKarmaDocuments.forEach((doc, index) => {
      console.log(`\n📄 Documento ${index + 1} (verificação):`);
      if (doc.history && doc.history.length > 0) {
        doc.history.forEach((entry, entryIndex) => {
          const evaluatorName = entry.evaluatorName || 'Sem avaliador';
          const stars = entry.starRating ? `${entry.starRating}⭐` : (entry.karmaChange > 0 ? '👍' : '👎');
          console.log(`  ${entryIndex + 1}. ${stars}: "${entry.comment || 'Sem comentário'}" - @${evaluatorName}`);
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Conexão fechada');
  }
}

// Executar o script
addEvaluatorNames().catch(console.error);