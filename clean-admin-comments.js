// Script para limpar comentários administrativos do banco de dados
require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

async function cleanAdminComments() {
  const uri = process.env.MONGODB_CNN || 'mongodb://localhost:27017/trustscore';
  console.log('🔗 Conectando ao MongoDB:', uri.replace(/:\/\/.*@/, '://***:***@'));
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('🔗 Conectado ao MongoDB');
    
    const db = client.db('trustscore');
    const karmaCollection = db.collection('karmas');
    
    console.log('🧹 Limpando comentários administrativos...');
    
    // Remover entradas do histórico que contenham comentários administrativos
    const result = await karmaCollection.updateMany(
      {
        'history.comment': {
          $regex: /pontos adicionados via comando administrativo/i
        }
      },
      {
        $pull: {
          history: {
            comment: {
              $regex: /pontos adicionados via comando administrativo/i
            }
          }
        }
      }
    );
    
    console.log(`✅ ${result.modifiedCount} documentos de karma atualizados`);
    
    // Verificar quantos comentários administrativos restam
    const remaining = await karmaCollection.countDocuments({
      'history.comment': {
        $regex: /pontos adicionados via comando administrativo/i
      }
    });
    
    console.log(`📊 Comentários administrativos restantes: ${remaining}`);
    
    if (remaining === 0) {
      console.log('🎉 Todos os comentários administrativos foram removidos!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('🔌 Conexão fechada');
  }
}

// Executar o script
cleanAdminComments().catch(console.error);