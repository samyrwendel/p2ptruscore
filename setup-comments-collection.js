// Script para criar coleção de comentários no banco de dados
require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

async function setupCommentsCollection() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore_bot');
    
    // Verificar se a coleção já existe
    const collections = await db.listCollections({ name: 'comments' }).toArray();
    
    if (collections.length > 0) {
      console.log('📋 Coleção "comments" já existe');
      
      // Verificar se há comentários na coleção
      const commentsCollection = db.collection('comments');
      const count = await commentsCollection.countDocuments();
      console.log(`📊 Comentários existentes: ${count}`);
      
      if (count > 0) {
        console.log('✅ Coleção já está configurada e populada');
        return;
      }
    } else {
      console.log('🆕 Criando nova coleção "comments"');
    }
    
    const commentsCollection = db.collection('comments');
    
    // Criar índices para otimizar consultas
    console.log('🔍 Criando índices...');
    await commentsCollection.createIndex({ starLevel: 1 });
    await commentsCollection.createIndex({ category: 1 });
    await commentsCollection.createIndex({ starLevel: 1, category: 1 });
    
    console.log('✅ Coleção "comments" configurada com sucesso!');
    console.log('📋 Estrutura do documento:');
    console.log('  - starLevel: number (1-5)');
    console.log('  - category: string ("positive", "neutral", "negative")');
    console.log('  - text: string (texto do comentário)');
    console.log('  - createdAt: Date');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o script
setupCommentsCollection().catch(console.error);