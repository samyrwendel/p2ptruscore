// Script para investigar os contadores de estrelas no banco de dados
require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

async function investigateStarCounters() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    const karmaCollection = db.collection('karmas');
    
    console.log('🔍 Investigando contadores de estrelas...');
    
    // Buscar todos os documentos de karma
    const karmaDocuments = await karmaCollection.find({}).toArray();
    console.log(`📊 Total de documentos de karma: ${karmaDocuments.length}`);
    
    // Analisar cada documento
    for (let i = 0; i < karmaDocuments.length; i++) {
      const doc = karmaDocuments[i];
      console.log(`\n📋 Documento ${i + 1}:`);
      console.log(`  User ID: ${doc.user}`);
      console.log(`  Karma Total: ${doc.karma || 0}`);
      console.log(`  Histórico: ${doc.history ? doc.history.length : 0} entradas`);
      
      // Verificar contadores de estrelas
      console.log(`  Contadores de estrelas:`);
      console.log(`    5⭐: ${doc.stars5 || 0}`);
      console.log(`    4⭐: ${doc.stars4 || 0}`);
      console.log(`    3⭐: ${doc.stars3 || 0}`);
      console.log(`    2⭐: ${doc.stars2 || 0}`);
      console.log(`    1⭐: ${doc.stars1 || 0}`);
      
      // Analisar histórico para ver se há avaliações com estrelas
      if (doc.history && doc.history.length > 0) {
        const starRatings = doc.history.filter(entry => entry.starRating);
        console.log(`  Avaliações com estrelas no histórico: ${starRatings.length}`);
        
        if (starRatings.length > 0) {
          const starCounts = {};
          starRatings.forEach(entry => {
            const stars = entry.starRating;
            starCounts[stars] = (starCounts[stars] || 0) + 1;
          });
          
          console.log(`  Distribuição real no histórico:`);
          for (let stars = 1; stars <= 5; stars++) {
            console.log(`    ${stars}⭐: ${starCounts[stars] || 0}`);
          }
        }
      }
    }
    
    // Verificar se há documentos sem os campos de contadores
    console.log('\n🔍 Verificando campos de contadores...');
    const docsWithoutStars5 = await karmaCollection.countDocuments({ stars5: { $exists: false } });
    const docsWithoutStars4 = await karmaCollection.countDocuments({ stars4: { $exists: false } });
    const docsWithoutStars3 = await karmaCollection.countDocuments({ stars3: { $exists: false } });
    const docsWithoutStars2 = await karmaCollection.countDocuments({ stars2: { $exists: false } });
    const docsWithoutStars1 = await karmaCollection.countDocuments({ stars1: { $exists: false } });
    
    console.log(`Documentos sem campo stars5: ${docsWithoutStars5}`);
    console.log(`Documentos sem campo stars4: ${docsWithoutStars4}`);
    console.log(`Documentos sem campo stars3: ${docsWithoutStars3}`);
    console.log(`Documentos sem campo stars2: ${docsWithoutStars2}`);
    console.log(`Documentos sem campo stars1: ${docsWithoutStars1}`);
    
    // Verificar total de avaliações com estrelas em todo o banco
    const totalStarRatings = await karmaCollection.aggregate([
      { $unwind: '$history' },
      { $match: { 'history.starRating': { $exists: true } } },
      { $group: { _id: '$history.starRating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    console.log('\n📊 Total de avaliações com estrelas no banco:');
    totalStarRatings.forEach(item => {
      console.log(`  ${item._id}⭐: ${item.count}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o script
investigateStarCounters().catch(console.error);