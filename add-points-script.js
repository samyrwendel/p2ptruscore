// Script para adicionar pontos ao usuário samyralmeida
const { MongoClient } = require('mongodb');

async function addPointsToUser() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trustscore';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('Conectado ao MongoDB');
    
    const db = client.db('trustscore');
    const karmaCollection = db.collection('karmas');
    const usersCollection = db.collection('users');
    
    // Buscar o usuário samyralmeida
    const user = await usersCollection.findOne({
      $or: [
        { userName: 'samyralmeida' },
        { firstName: /samyralmeida/i }
      ]
    });
    
    if (!user) {
      console.log('Usuário samyralmeida não encontrado');
      return;
    }
    
    console.log('Usuário encontrado:', user.userName || user.firstName);
    
    // Buscar ou criar karma para o usuário
    let karma = await karmaCollection.findOne({ user: user._id });
    
    if (!karma) {
      // Criar novo documento de karma
      karma = {
        user: user._id,
        karma: 501,
        givenKarma: 0,
        givenHate: 0,
        history: [{
          timestamp: new Date(),
          karmaChange: 501,
          comment: 'Pontos adicionados via script administrativo',
          evaluatorName: 'Sistema'
        }]
      };
      
      await karmaCollection.insertOne(karma);
      console.log('Novo karma criado com 501 pontos');
    } else {
      // Atualizar karma existente
      const newKarma = karma.karma + 501;
      
      await karmaCollection.updateOne(
        { _id: karma._id },
        {
          $set: { karma: newKarma },
          $push: {
            history: {
              timestamp: new Date(),
              karmaChange: 501,
              comment: 'Pontos adicionados via script administrativo',
              evaluatorName: 'Sistema'
            }
          }
        }
      );
      
      console.log(`Karma atualizado de ${karma.karma} para ${newKarma} pontos`);
    }
    
    console.log('✅ Pontos adicionados com sucesso!');
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await client.close();
  }
}

addPointsToUser();