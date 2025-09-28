const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.development' });

async function checkSpecificOperation() {
  const client = new MongoClient(process.env.MONGODB_CNN);
  
  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB');
    
    const db = client.db();
    const operations = db.collection('operations');
    
    // Verificar a operação específica da imagem
    const operationId = '68d99ea4b2870024b180c8da';
    const op = await operations.findOne({ _id: new ObjectId(operationId) });
    
    if (op) {
      console.log(`\n🔍 Operação ${operationId}:`);
      console.log(`   Status: ${op.status}`);
      console.log(`   MessageId: ${op.messageId || 'NÃO DEFINIDO'}`);
      console.log(`   Grupo: ${op.group}`);
      console.log(`   Criador: ${op.creator}`);
      console.log(`   Aceitador: ${op.acceptor || 'NÃO DEFINIDO'}`);
      console.log(`   Criado em: ${op.createdAt}`);
      console.log(`   Atualizado em: ${op.updatedAt}`);
      
      // Verificar se foi aceita recentemente
      if (op.acceptor) {
        const timeSinceUpdate = Date.now() - new Date(op.updatedAt).getTime();
        console.log(`   ⏰ Atualizada há: ${Math.round(timeSinceUpdate / 1000 / 60)} minutos`);
      }
    } else {
      console.log(`❌ Operação ${operationId} não encontrada`);
    }
    
    // Verificar operações aceitas mais recentes
    console.log('\n📋 Últimas 3 operações aceitas:');
    const recentAccepted = await operations.find({
      status: 'accepted'
    }).sort({ updatedAt: -1 }).limit(3).toArray();
    
    for (const op of recentAccepted) {
      console.log(`\n🔍 ${op._id}:`);
      console.log(`   MessageId: ${op.messageId || 'NÃO DEFINIDO'}`);
      console.log(`   Atualizada: ${op.updatedAt}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkSpecificOperation().catch(console.error);