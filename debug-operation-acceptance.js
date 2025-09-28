const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.development' });

async function debugOperationAcceptance() {
  const mongoUrl = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustp2pbot';
  console.log('🔗 Conectando ao MongoDB:', mongoUrl.replace(/\/\/.*@/, '//***@'));
  
  const client = new MongoClient(mongoUrl);
  
  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB');
    
    const db = client.db();
    const operations = db.collection('operations');
    
    // Buscar operações aceitas recentemente
    const recentAccepted = await operations.find({
      status: 'accepted',
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // últimas 24h
    }).sort({ updatedAt: -1 }).limit(5).toArray();
    
    console.log('\n📋 Operações aceitas nas últimas 24h:');
    
    for (const op of recentAccepted) {
      console.log(`\n🔍 Operação: ${op._id}`);
      console.log(`   Status: ${op.status}`);
      console.log(`   MessageId: ${op.messageId || 'NÃO DEFINIDO'}`);
      console.log(`   Grupo: ${op.group}`);
      console.log(`   Criador: ${op.creator}`);
      console.log(`   Aceitador: ${op.acceptor || 'NÃO DEFINIDO'}`);
      console.log(`   Criado em: ${op.createdAt}`);
      console.log(`   Atualizado em: ${op.updatedAt}`);
    }
    
    // Verificar se há operações sem messageId
    const withoutMessageId = await operations.countDocuments({
      messageId: { $exists: false }
    });
    
    console.log(`\n⚠️  Operações sem messageId: ${withoutMessageId}`);
    
    // Verificar operações pending recentes
    const recentPending = await operations.find({
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 }).limit(3).toArray();
    
    console.log('\n📋 Operações pending recentes:');
    for (const op of recentPending) {
      console.log(`\n🔍 Operação: ${op._id}`);
      console.log(`   MessageId: ${op.messageId || 'NÃO DEFINIDO'}`);
      console.log(`   Grupo: ${op.group}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

debugOperationAcceptance().catch(console.error);