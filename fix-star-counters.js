// Script para corrigir contadores de estrelas faltantes no banco de dados
require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

async function fixStarCounters() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const karmaCollection = db.collection('karmas');
    
    console.log('🔧 Corrigindo contadores de estrelas...');
    
    // Buscar todos os documentos de karma
    const karmaDocuments = await karmaCollection.find({}).toArray();
    console.log(`📊 Total de documentos de karma: ${karmaDocuments.length}`);
    
    let documentsFixed = 0;
    
    for (const doc of karmaDocuments) {
      console.log(`\n🔍 Processando documento: ${doc._id}`);
      
      // Calcular contadores reais baseados no histórico
      const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      
      if (doc.history && doc.history.length > 0) {
        doc.history.forEach(entry => {
          if (entry.starRating && entry.starRating >= 1 && entry.starRating <= 5) {
            starCounts[entry.starRating]++;
          }
        });
      }
      
      console.log(`  Contadores calculados: 5⭐:${starCounts[5]}, 4⭐:${starCounts[4]}, 3⭐:${starCounts[3]}, 2⭐:${starCounts[2]}, 1⭐:${starCounts[1]}`);
      
      // Verificar se precisa atualizar
      const needsUpdate = 
        (doc.stars5 || 0) !== starCounts[5] ||
        (doc.stars4 || 0) !== starCounts[4] ||
        (doc.stars3 || 0) !== starCounts[3] ||
        (doc.stars2 || 0) !== starCounts[2] ||
        (doc.stars1 || 0) !== starCounts[1] ||
        doc.stars5 === undefined ||
        doc.stars4 === undefined ||
        doc.stars3 === undefined ||
        doc.stars2 === undefined ||
        doc.stars1 === undefined;
      
      if (needsUpdate) {
        console.log(`  ✅ Atualizando contadores...`);
        
        await karmaCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              stars5: starCounts[5],
              stars4: starCounts[4],
              stars3: starCounts[3],
              stars2: starCounts[2],
              stars1: starCounts[1]
            }
          }
        );
        
        documentsFixed++;
      } else {
        console.log(`  ✅ Contadores já estão corretos`);
      }
    }
    
    console.log(`\n🎉 Correção concluída! ${documentsFixed} documentos foram atualizados.`);
    
    // Verificar resultado final
    console.log('\n📊 Verificação final dos contadores:');
    const finalDocs = await karmaCollection.find({}).toArray();
    
    finalDocs.forEach((doc, index) => {
      console.log(`  Documento ${index + 1}: 5⭐:${doc.stars5}, 4⭐:${doc.stars4}, 3⭐:${doc.stars3}, 2⭐:${doc.stars2}, 1⭐:${doc.stars1}`);
    });
    
    // Verificar se ainda há documentos sem campos
    const docsWithoutStars = await karmaCollection.countDocuments({
      $or: [
        { stars5: { $exists: false } },
        { stars4: { $exists: false } },
        { stars3: { $exists: false } },
        { stars2: { $exists: false } },
        { stars1: { $exists: false } }
      ]
    });
    
    console.log(`\n📋 Documentos ainda sem campos de estrelas: ${docsWithoutStars}`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o script
fixStarCounters().catch(console.error);